import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  AgentLogEntry,
  BomData,
  DesignPart,
  DesignSpec,
  InstructionsData,
  ObjectAnalysis,
  SsePhase,
  UsageAnimationType,
  UsageCameraKeyframe,
  UsageEffect,
  UsageEffectType,
  UsageNarration,
  UsagePartAnimation,
  UsageScene,
  UsageStoryboard,
} from '../types';
import { isCadZUpDesign, toThreeVec3 } from '../../components/three/adapters';
import { runGeminiAgent, RunAgentResult } from './runner';

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const UsageAnimationTypeSchema = z.enum([
  'translate',
  'rotate',
  'pulse',
  'press',
  'spin',
  'glow',
  'tilt',
  'slide',
]);

export const UsagePartAnimationSchema = z.object({
  partId: z.string().min(1),
  type: UsageAnimationTypeSchema,
  fromOffset: Vec3Schema.optional(),
  toOffset: Vec3Schema.optional(),
  fromRotationDelta: Vec3Schema.optional(),
  toRotationDelta: Vec3Schema.optional(),
  spinAxis: z.enum(['x', 'y', 'z']).optional(),
  spinSpeed: z.number().optional(),
  glowColor: z.string().optional(),
  glowIntensity: z.number().optional(),
  oscillate: z.boolean().optional(),
});

export const UsageEffectTypeSchema = z.enum([
  'water_flow',
  'air_stream',
  'light_beam',
  'led_indicator',
  'hand_proxy',
  'target_prop',
  'motion_arc',
]);

export const UsageEffectSchema = z.object({
  type: UsageEffectTypeSchema,
  partId: z.string().optional(),
  targetPartId: z.string().optional(),
  from: Vec3Schema.optional(),
  to: Vec3Schema.optional(),
  color: z.string().optional(),
  label: z.string().optional(),
});

export const UsageCameraKeyframeSchema = z.object({
  fromPosition: Vec3Schema,
  toPosition: Vec3Schema,
  fromTarget: Vec3Schema,
  toTarget: Vec3Schema,
  fov: z.number().min(20).max(75).optional(),
});

export const UsageNarrationSchema = z.object({
  text: z
    .string()
    .min(1)
    .refine((s) => s.trim().split(/\s+/).length <= 14, {
      message: 'Narration bubble must be concise (~12 words max)',
    }),
  subtext: z.string().optional(),
  anchor: z.enum(['part', 'screen']),
  partId: z.string().optional(),
  offset: Vec3Schema.optional(),
});

export const UsageSceneSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(1),
  title: z.string().min(1),
  durationSeconds: z.number().min(2).max(12),
  camera: UsageCameraKeyframeSchema,
  narration: UsageNarrationSchema,
  partAnimations: z.array(UsagePartAnimationSchema).min(1),
  effects: z.array(UsageEffectSchema).optional(),
});

export const UsageStoryboardSchema = z.object({
  objectName: z.string().min(1),
  summary: z.string().optional(),
  totalDurationSeconds: z.number().positive(),
  scenes: z.array(UsageSceneSchema).min(4).max(7),
});

export interface UsageAgentInput {
  analysis: ObjectAnalysis;
  design: DesignSpec;
  bom?: BomData;
  instructions?: InstructionsData;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
  onEvent?: (ev: {
    agent: 'usage';
    phase: SsePhase;
    message: string;
    data?: Record<string, unknown>;
    ts: string;
  }) => void;
}

function clampWords(text: string, maxWords = 12): string {
  const cleaned = String(text || '')
    .replace(/\b(Da Vinci|Leonardo|Codex|Bottega|Folio|MMXXVI)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Operate mechanism smoothly and verify alignment.';
  const words = cleaned.split(' ');
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ').replace(/[.,;:!?-]+$/, '') + '.';
}

function sanitizeCopy(text: string): string {
  return String(text || '')
    .replace(/\b(Da Vinci|Leonardo|Codex|Bottega|Folio|MMXXVI)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toVec3Tuple(
  val: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    const z = Number(val[2]);
    return [
      Number.isFinite(x) ? Math.round(x * 10) / 10 : fallback[0],
      Number.isFinite(y) ? Math.round(y * 10) / 10 : fallback[1],
      Number.isFinite(z) ? Math.round(z * 10) / 10 : fallback[2],
    ];
  }
  return [...fallback];
}

function findMatchingPartId(
  parts: DesignPart[],
  candidates: string[],
  fallbackIdx = 0
): string {
  if (!parts || parts.length === 0) return candidates[0] || 'part-1';
  const byId = new Set(parts.map((p) => p.id));
  for (const c of candidates) {
    if (byId.has(c)) return c;
  }
  for (const c of candidates) {
    const lower = c.toLowerCase();
    const matched = parts.find(
      (p) =>
        p.id.toLowerCase().includes(lower) ||
        p.name.toLowerCase().includes(lower)
    );
    if (matched) return matched.id;
  }
  return parts[Math.min(fallbackIdx, parts.length - 1)].id;
}

function getPartWorldYUpPos(
  parts: DesignPart[],
  partId: string,
  zUp: boolean
): [number, number, number] {
  const part = parts.find((p) => p.id === partId) || parts[0];
  if (!part) return [0, 32, 0];
  const threePos = toThreeVec3(part.position || [0, 40, 0], zUp);
  // In ExplodedView / HowToUseScene, parts sit inside <group position={[0, -32, 0]}>
  return [
    Math.round(threePos[0]),
    Math.round(threePos[1] - 32),
    Math.round(threePos[2]),
  ];
}

function buildPresetShowcaseStoryboard(
  presetKey: string,
  analysis: ObjectAnalysis,
  design: DesignSpec
): UsageStoryboard | null {
  const parts = design.parts || [];
  if (parts.length === 0) return null;

  if (presetKey === 'plant-auto-waterer') {
    const lidId = findMatchingPartId(parts, ['reservoir-lid'], 1);
    const funnelId = findMatchingPartId(
      parts,
      ['refill-funnel', 'reservoir-lid'],
      1
    );
    const tankId = findMatchingPartId(parts, ['reservoir-tank'], 0);
    const sensorId = findMatchingPartId(
      parts,
      ['moisture-sensor', 'soil-sensor'],
      2
    );
    const stakeId = findMatchingPartId(
      parts,
      ['drip-stake', 'emitter-spike'],
      3
    );
    const ctrlId = findMatchingPartId(
      parts,
      ['controller-box', 'controller-enclosure', 'esp32-mcu', 'mcu-board'],
      4
    );
    const powerId = findMatchingPartId(
      parts,
      ['usbc-power', 'mcu-board', 'controller-enclosure'],
      4
    );
    const wheelId = findMatchingPartId(
      parts,
      ['flow-wheel', 'drip-manifold'],
      3
    );
    const pumpId = findMatchingPartId(parts, ['pump-5v', 'pump-mount'], 2);
    const tubeId = findMatchingPartId(
      parts,
      ['silicone-tubing', 'drip-manifold'],
      3
    );

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Top-Fill Water Reservoir',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [215, 175, 245],
          toPosition: [148, 168, 178],
          fromTarget: [8, 42, 0],
          toTarget: [-14, 76, -12],
          fov: 40,
        },
        narration: {
          text: 'Lift the lid and pour clean water into the funnel.',
          subtext: '1.4L watertight PETG tank (~14 days supply)',
          anchor: 'part',
          partId: funnelId,
          offset: [0, 34, 0],
        },
        partAnimations: [
          {
            partId: lidId,
            type: 'translate',
            fromOffset: [0, 0, 0],
            toOffset: [0, 22, 0],
            fromRotationDelta: [0, 0, 0],
            toRotationDelta: [-8, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.45,
          },
          {
            partId: funnelId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: funnelId,
            label: 'Refill Pitcher',
            color: '#f3d478',
          },
          {
            type: 'water_flow',
            partId: funnelId,
            targetPartId: tankId,
            color: '#e5bd47',
            label: 'Water Fill Stream',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Insert Soil Probe & Drip Stake',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [148, 168, 178],
          toPosition: [-195, 118, 210],
          fromTarget: [-14, 76, -12],
          toTarget: [-76, 22, 12],
          fov: 40,
        },
        narration: {
          text: 'Push capacitive moisture probe and emitter stake into soil.',
          subtext: 'Corrosion-free dielectric root-zone sensing',
          anchor: 'part',
          partId: sensorId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: sensorId,
            type: 'translate',
            fromOffset: [0, 36, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.5,
          },
          {
            partId: stakeId,
            type: 'translate',
            fromOffset: [0, 28, 0],
            toOffset: [0, 0, 0],
            glowColor: '#d4af37',
            glowIntensity: 0.4,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: sensorId,
            label: 'Insert Probe',
            color: '#f3d478',
          },
          {
            type: 'target_prop',
            partId: stakeId,
            label: 'Plant Root Zone',
            color: '#c86d51',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Connect 5V USB-C & Arm ESP32',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [-195, 118, 210],
          toPosition: [225, 112, 165],
          fromTarget: [-76, 22, 12],
          toTarget: [82, 24, 0],
          fov: 40,
        },
        narration: {
          text: 'Plug in 5V USB-C power to arm the ESP32 controller.',
          subtext: 'Samples soil dielectric reading every 60s',
          anchor: 'part',
          partId: ctrlId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: powerId,
            type: 'slide',
            fromOffset: [32, 0, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.5,
          },
          {
            partId: ctrlId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.65,
            oscillate: true,
          },
        ],
        effects: [
          {
            type: 'led_indicator',
            partId: ctrlId,
            color: '#f3d478',
            label: 'ESP32 Armed',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Calibrate Drip Flow Restrictor',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [225, 112, 165],
          toPosition: [125, 152, 205],
          fromTarget: [82, 24, 0],
          toTarget: [16, 74, 34],
          fov: 40,
        },
        narration: {
          text: 'Turn the rotary pinch wheel to balance branch drip rate.',
          subtext: 'Anti-siphon rim mount prevents gravity backflow',
          anchor: 'part',
          partId: wheelId,
          offset: [0, 28, 0],
        },
        partAnimations: [
          {
            partId: wheelId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 1.2,
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: wheelId,
            label: 'Dial Flow Rate',
            color: '#f3d478',
          },
          {
            type: 'motion_arc',
            partId: wheelId,
            color: '#e5bd47',
            label: 'Pinch Trim',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Autonomous Root-Zone Watering Pulse',
        durationSeconds: 4.8,
        camera: {
          fromPosition: [125, 152, 205],
          toPosition: [215, 155, 255],
          fromTarget: [16, 74, 34],
          toTarget: [-12, 34, 8],
          fov: 40,
        },
        narration: {
          text: 'Submersible pump pulses metered water directly to plant roots.',
          subtext: '4-second silent burst at 120 L/h flow',
          anchor: 'part',
          partId: stakeId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: pumpId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 3.0,
            glowColor: '#f3d478',
            glowIntensity: 0.7,
          },
          {
            partId: tubeId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
          {
            partId: stakeId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.6,
            oscillate: true,
          },
        ],
        effects: [
          {
            type: 'water_flow',
            partId: pumpId,
            targetPartId: stakeId,
            color: '#f3d478',
            label: '120 L/h Root Drip',
          },
          {
            type: 'target_prop',
            partId: stakeId,
            color: '#c86d51',
            label: 'Hydrated Soil',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step operational walkthrough: top-fill the 1.4L reservoir, insert the capacitive probe and emitter stake into soil, connect 5V USB-C power, dial the pinch restrictor wheel, and watch automated root-zone irrigation.',
      totalDurationSeconds: 21.4,
      scenes,
    };
  }

  if (presetKey === 'art-easel') {
    const baseId = findMatchingPartId(parts, ['easel-base-hub'], 0);
    const padsId = findMatchingPartId(parts, ['silicone-grip-pads'], 9);
    const trayId = findMatchingPartId(parts, ['lower-canvas-tray'], 2);
    const clampId = findMatchingPartId(parts, ['upper-canvas-clamp'], 3);
    const hingeId = findMatchingPartId(parts, ['ratchet-tilt-hinge'], 1);
    const collarId = findMatchingPartId(parts, ['rear-strut-collar'], 4);
    const knobsId = findMatchingPartId(parts, ['knurled-lock-knobs'], 5);
    const nutsId = findMatchingPartId(parts, ['brass-knurled-nuts'], 7);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Plant Weighted H-Frame Base',
        durationSeconds: 3.8,
        camera: {
          fromPosition: [335, 220, 410],
          toPosition: [250, 145, 310],
          fromTarget: [0, 80, 0],
          toTarget: [0, -18, 10],
          fov: 40,
        },
        narration: {
          text: 'Set the weighted H-frame base flat on your tabletop.',
          subtext: 'EPDM grip pads prevent studio slip',
          anchor: 'part',
          partId: baseId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: baseId,
            type: 'press',
            fromOffset: [0, 12, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.45,
          },
          {
            partId: padsId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: baseId,
            label: 'Seat Base',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Slide Lower Canvas Ledge to Height',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [250, 145, 310],
          toPosition: [265, 175, 325],
          fromTarget: [0, -18, 10],
          toTarget: [0, 48, 22],
          fov: 40,
        },
        narration: {
          text: 'Slide the lower canvas tray along the aluminum spine.',
          subtext: 'Integrated brush groove holds studio tools',
          anchor: 'part',
          partId: trayId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: trayId,
            type: 'translate',
            fromOffset: [0, -28, 0],
            toOffset: [0, 10, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: trayId,
            label: 'Set Ledge Height',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Seat & Clamp Canvas Panel',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [265, 175, 325],
          toPosition: [240, 255, 315],
          fromTarget: [0, 48, 22],
          toTarget: [0, 165, 18],
          fov: 40,
        },
        narration: {
          text: 'Lower the top clamp jaw to lock your canvas.',
          subtext: 'Holds canvases up to 620mm tall',
          anchor: 'part',
          partId: clampId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: clampId,
            type: 'translate',
            fromOffset: [0, 32, 0],
            toOffset: [0, -6, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
        ],
        effects: [
          {
            type: 'target_prop',
            partId: trayId,
            targetPartId: clampId,
            label: 'Stretched Canvas',
            color: '#e6d3b3',
          },
          {
            type: 'hand_proxy',
            partId: clampId,
            label: 'Clamp Top Jaw',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Dial In Ratcheting Rake Angle',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [240, 255, 315],
          toPosition: [-285, 160, 275],
          fromTarget: [0, 165, 18],
          toTarget: [0, 35, -8],
          fov: 40,
        },
        narration: {
          text: 'Pivot the spring detent hinge to set painting tilt.',
          subtext: '15°-step positive ratchet from 0° to 75°',
          anchor: 'part',
          partId: hingeId,
          offset: [0, 34, 0],
        },
        partAnimations: [
          {
            partId: hingeId,
            type: 'tilt',
            fromRotationDelta: [0, 0, 0],
            toRotationDelta: [-15, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: collarId,
            type: 'translate',
            fromOffset: [0, 18, 0],
            toOffset: [0, 0, 0],
            glowColor: '#d4af37',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'motion_arc',
            partId: hingeId,
            color: '#f3d478',
            label: '15° Detent Tilt',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Lock Rosette Knobs & Paint',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [-285, 160, 275],
          toPosition: [330, 235, 395],
          fromTarget: [0, 35, -8],
          toTarget: [0, 95, 0],
          fov: 40,
        },
        narration: {
          text: 'Tighten the brass rosette knobs for zero-wobble brushwork.',
          subtext: 'M5 T-nut compression locks rigid frame',
          anchor: 'part',
          partId: knobsId,
          offset: [0, 30, 0],
        },
        partAnimations: [
          {
            partId: knobsId,
            type: 'spin',
            spinAxis: 'z',
            spinSpeed: 1.5,
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
          {
            partId: nutsId,
            type: 'spin',
            spinAxis: 'z',
            spinSpeed: -1.5,
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: knobsId,
            label: 'Lock Rosette Knob',
            color: '#f3d478',
          },
          {
            type: 'target_prop',
            partId: trayId,
            targetPartId: clampId,
            label: 'Locked Studio Canvas',
            color: '#e6d3b3',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step studio setup: plant the weighted H-frame base, slide the lower tray to working height, clamp the top canvas jaw, pivot the 15°-step ratchet hinge, and lock the M5 rosette knobs.',
      totalDurationSeconds: 20.8,
      scenes,
    };
  }

  if (presetKey === 'iphone-magnifier') {
    const sledId = findMatchingPartId(parts, ['xyz-focus-sled'], 0);
    const slideId = findMatchingPartId(parts, ['glass-slides-clips'], 1);
    const screwId = findMatchingPartId(parts, ['m3-focus-screw'], 2);
    const ledId = findMatchingPartId(parts, ['usb-led-ring-5v'], 3);
    const diffId = findMatchingPartId(parts, ['led-ring-diffuser'], 4);
    const barrelId = findMatchingPartId(parts, ['doublet-lens-barrel'], 5);
    const lensId = findMatchingPartId(parts, ['achromatic-lens-100x'], 6);
    const clampId = findMatchingPartId(parts, ['phone-clamp-chassis'], 7);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Clip Specimen Slide onto Stage',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [185, 130, 225],
          toPosition: [145, 92, 185],
          fromTarget: [0, 22, 4],
          toTarget: [0, -10, 6],
          fov: 40,
        },
        narration: {
          text: 'Slide your glass specimen under the spring stage clips.',
          subtext: 'Standard 25×75mm borosilicate microscope slide',
          anchor: 'part',
          partId: slideId,
          offset: [0, 28, 0],
        },
        partAnimations: [
          {
            partId: slideId,
            type: 'slide',
            fromOffset: [-34, 0, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: sledId,
            type: 'glow',
            glowColor: '#d4af37',
            glowIntensity: 0.35,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: slideId,
            label: 'Load Slide',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Snap iPhone into Alignment Saddle',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [145, 92, 185],
          toPosition: [165, 165, 205],
          fromTarget: [0, -10, 6],
          toTarget: [0, 62, 4],
          fov: 40,
        },
        narration: {
          text: 'Seat your iPhone into the top camera alignment saddle.',
          subtext: 'Centers main camera over 100× optical axis',
          anchor: 'part',
          partId: clampId,
          offset: [0, 30, 0],
        },
        partAnimations: [
          {
            partId: clampId,
            type: 'translate',
            fromOffset: [0, 20, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
        ],
        effects: [
          {
            type: 'target_prop',
            partId: clampId,
            label: 'iPhone Camera',
            color: '#e6d3b3',
          },
          {
            type: 'hand_proxy',
            partId: clampId,
            label: 'Mount Phone',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Switch On Coaxial Ring Illumination',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [165, 165, 205],
          toPosition: [-160, 108, 190],
          fromTarget: [0, 62, 4],
          toTarget: [0, 10, 4],
          fov: 40,
        },
        narration: {
          text: 'Power on the 5V LED ring for uniform specimen lighting.',
          subtext: 'Snap-fit diffuser eliminates glare hotspots',
          anchor: 'part',
          partId: diffId,
          offset: [0, 28, 0],
        },
        partAnimations: [
          {
            partId: ledId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.85,
            oscillate: true,
          },
          {
            partId: diffId,
            type: 'glow',
            glowColor: '#f3d478',
            glowIntensity: 0.7,
          },
        ],
        effects: [
          {
            type: 'light_beam',
            partId: diffId,
            targetPartId: slideId,
            color: '#f3d478',
            label: 'Coaxial Illumination',
          },
          {
            type: 'led_indicator',
            partId: ledId,
            color: '#f3d478',
            label: '5V LED Ring On',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Dial Fine-Pitch Z-Focus Thumbscrew',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [-160, 108, 190],
          toPosition: [175, 105, -165],
          fromTarget: [0, 10, 4],
          toTarget: [32, -4, -22],
          fov: 40,
        },
        narration: {
          text: 'Turn the brass M3 thumbscrew for micrometer Z-axis focus.',
          subtext: '0.5mm thread pitch with anti-backlash spring',
          anchor: 'part',
          partId: screwId,
          offset: [0, 30, 0],
        },
        partAnimations: [
          {
            partId: screwId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 2.0,
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
          {
            partId: barrelId,
            type: 'translate',
            fromOffset: [0, -6, 0],
            toOffset: [0, 4, 0],
            oscillate: true,
            glowColor: '#e5bd47',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: screwId,
            label: 'Fine Focus Dial',
            color: '#f3d478',
          },
          {
            type: 'motion_arc',
            partId: screwId,
            color: '#e5bd47',
            label: '0.5mm/rev Z-Focus',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Capture 100× Cellular Micrograph',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [175, 105, -165],
          toPosition: [185, 138, 220],
          fromTarget: [32, -4, -22],
          toTarget: [0, 32, 4],
          fov: 40,
        },
        narration: {
          text: 'Tap shutter on iPhone to capture crisp 100× macro detail.',
          subtext: 'Achromatic glass doublet resolves cellular walls',
          anchor: 'part',
          partId: lensId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: lensId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.75,
            oscillate: true,
          },
          {
            partId: clampId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'light_beam',
            partId: lensId,
            targetPartId: slideId,
            color: '#f3d478',
            label: '100× Optical Path',
          },
          {
            type: 'target_prop',
            partId: clampId,
            label: '100× Image Captured',
            color: '#f3d478',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step microscopy workflow: clip the glass slide onto the XY stage, snap the iPhone into the optical saddle, turn on the 5V coaxial LED diffuser ring, dial the fine M3 focus screw, and capture 100× micrographs.',
      totalDurationSeconds: 20.8,
      scenes,
    };
  }

  if (presetKey === 'liquid-handler') {
    const deckId = findMatchingPartId(parts, ['deck-base-96well'], 0);
    const plateId = findMatchingPartId(parts, ['pipette-96well-plate'], 1);
    const endstopId = findMatchingPartId(parts, ['optical-endstops'], 12);
    const boardId = findMatchingPartId(parts, ['grbl-esp32-board'], 15);
    const shuttleId = findMatchingPartId(parts, ['x-carriage-shuttle'], 7);
    const cradleId = findMatchingPartId(parts, ['z-pipette-cradle'], 8);
    const screwId = findMatchingPartId(parts, ['t8-leadscrew-nut'], 9);
    const plungerId = findMatchingPartId(parts, ['plunger-escapement-arm'], 10);
    const ejectorId = findMatchingPartId(parts, ['tip-ejector-fork'], 11);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Load 96-Well Microplates & Tip Rack',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [295, 240, 350],
          toPosition: [215, 148, 265],
          fromTarget: [-4, 65, -10],
          toTarget: [0, -14, 0],
          fov: 40,
        },
        narration: {
          text: 'Snap two 96-well microplates and tip rack into deck bays.',
          subtext: 'Registered SBS footprint with ±0.15mm repeatability',
          anchor: 'part',
          partId: plateId,
          offset: [0, 34, 0],
        },
        partAnimations: [
          {
            partId: plateId,
            type: 'translate',
            fromOffset: [0, 26, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: deckId,
            type: 'glow',
            glowColor: '#d4af37',
            glowIntensity: 0.4,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: plateId,
            label: 'Seat SBS Plates',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Optical Homing Across X-Y-Z Gantry',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [215, 148, 265],
          toPosition: [-235, 210, 255],
          fromTarget: [0, -14, 0],
          toTarget: [-65, 118, -8],
          fov: 40,
        },
        narration: {
          text: 'Home the carriage against optical switches for zero reference.',
          subtext: 'GRBL-ESP32 TMC2209 silent microstepping',
          anchor: 'part',
          partId: endstopId,
          offset: [0, 30, 0],
        },
        partAnimations: [
          {
            partId: shuttleId,
            type: 'slide',
            fromOffset: [-48, 0, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.5,
          },
          {
            partId: endstopId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.75,
            oscillate: true,
          },
          {
            partId: boardId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'led_indicator',
            partId: endstopId,
            color: '#f3d478',
            label: 'XYZ Zeroed',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Seat Tip & Aspirate Reagent Volume',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [-235, 210, 255],
          toPosition: [195, 225, 250],
          fromTarget: [-65, 118, -8],
          toTarget: [0, 125, 20],
          fov: 40,
        },
        narration: {
          text: 'Leadscrew escapement lifts plunger to aspirate 50µL reagent.',
          subtext: 'T8×2mm anti-backlash nut meters microliter volume',
          anchor: 'part',
          partId: plungerId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: screwId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 2.5,
            glowColor: '#d4af37',
            glowIntensity: 0.5,
          },
          {
            partId: plungerId,
            type: 'translate',
            fromOffset: [0, -14, 0],
            toOffset: [0, 14, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
          {
            partId: cradleId,
            type: 'translate',
            fromOffset: [0, -18, 0],
            toOffset: [0, 0, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'water_flow',
            partId: plateId,
            targetPartId: cradleId,
            color: '#f3d478',
            label: 'Aspirate 50µL',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Traverse MGN9H Rail & Dispense Array',
        durationSeconds: 4.6,
        camera: {
          fromPosition: [195, 225, 250],
          toPosition: [230, 185, 285],
          fromTarget: [0, 125, 20],
          toTarget: [18, 55, 12],
          fov: 40,
        },
        narration: {
          text: 'Shuttle glides across linear rail and dispenses into target wells.',
          subtext: 'Automated serial dilution across 96-well columns',
          anchor: 'part',
          partId: shuttleId,
          offset: [0, 34, 0],
        },
        partAnimations: [
          {
            partId: shuttleId,
            type: 'translate',
            fromOffset: [-42, 0, 0],
            toOffset: [42, 0, 0],
            oscillate: true,
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: cradleId,
            type: 'translate',
            fromOffset: [-42, 0, 0],
            toOffset: [42, 0, 0],
            oscillate: true,
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
          {
            partId: plungerId,
            type: 'press',
            fromOffset: [0, 12, 0],
            toOffset: [0, -10, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
        ],
        effects: [
          {
            type: 'water_flow',
            partId: cradleId,
            targetPartId: plateId,
            color: '#e5bd47',
            label: 'Dispense Well Array',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Eject Disposable Tip via Stripping Fork',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [230, 185, 285],
          toPosition: [295, 235, 345],
          fromTarget: [18, 55, 12],
          toTarget: [0, 42, 16],
          fov: 40,
        },
        narration: {
          text: 'Stripping fork ejects the used tip before the next sample.',
          subtext: 'Zero cross-contamination between assay rows',
          anchor: 'part',
          partId: ejectorId,
          offset: [0, 30, 0],
        },
        partAnimations: [
          {
            partId: ejectorId,
            type: 'press',
            fromOffset: [0, 10, 0],
            toOffset: [0, -14, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
        ],
        effects: [
          {
            type: 'motion_arc',
            partId: ejectorId,
            color: '#f3d478',
            label: 'Strip Used Tip',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step automated pipetting cycle: snap 96-well plates into the SBS deck, home X-Y-Z axes against optical endstops, aspirate 50µL reagent via the T8 leadscrew escapement, shuttle across the MGN9H rail to dispense, and strip the used tip.',
      totalDurationSeconds: 21.2,
      scenes,
    };
  }

  if (presetKey === 'desktop-robot-arm') {
    const baseId = findMatchingPartId(parts, ['base-pedestal'], 0);
    const tableId = findMatchingPartId(parts, ['turntable-plate'], 2);
    const shoulderId = findMatchingPartId(parts, ['shoulder-yoke'], 3);
    const lowerArmId = findMatchingPartId(parts, ['lower-arm-link'], 6);
    const elbowId = findMatchingPartId(parts, ['elbow-housing'], 7);
    const forearmId = findMatchingPartId(parts, ['forearm-tube'], 8);
    const wristId = findMatchingPartId(parts, ['wrist-pitch-clevis'], 9);
    const gripperBodyId = findMatchingPartId(parts, ['gripper-body'], 11);
    const gripperJawId = findMatchingPartId(parts, ['gripper-jaw'], 12);
    const mcuId = findMatchingPartId(parts, ['esp32-controller'], 14);
    const driverId = findMatchingPartId(parts, ['pca9685-driver'], 13);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Energize 6V Servo Bus & Home Joints',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [490, 355, 580],
          toPosition: [340, 210, 420],
          fromTarget: [10, 145, 0],
          toTarget: [-45, -18, 0],
          fov: 40,
        },
        narration: {
          text: 'Power on the 6V bus; ESP32-S3 homes all six joints.',
          subtext: '16-channel PCA9685 12-bit PWM controller',
          anchor: 'part',
          partId: mcuId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: mcuId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.7,
            oscillate: true,
          },
          {
            partId: driverId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
          {
            partId: baseId,
            type: 'glow',
            glowColor: '#d4af37',
            glowIntensity: 0.35,
          },
        ],
        effects: [
          {
            type: 'led_indicator',
            partId: mcuId,
            color: '#f3d478',
            label: 'IK Solver Ready',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Slew J1 Azimuth Turntable Deck',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [340, 210, 420],
          toPosition: [380, 245, 440],
          fromTarget: [-45, -18, 0],
          toTarget: [0, 35, 0],
          fov: 40,
        },
        narration: {
          text: 'Azimuth ring gear slews smoothly on the 6808 ball bearing.',
          subtext: '360° continuous J1 waist rotation',
          anchor: 'part',
          partId: tableId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: tableId,
            type: 'rotate',
            fromRotationDelta: [0, -35, 0],
            toRotationDelta: [0, 35, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: shoulderId,
            type: 'rotate',
            fromRotationDelta: [0, -35, 0],
            toRotationDelta: [0, 35, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'motion_arc',
            partId: tableId,
            color: '#f3d478',
            label: 'J1 Azimuth Slew',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Articulate Shoulder & Elbow Truss Links',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [380, 245, 440],
          toPosition: [395, 310, 465],
          fromTarget: [0, 35, 0],
          toTarget: [0, 165, 0],
          fov: 40,
        },
        narration: {
          text: 'Shoulder and elbow servos pitch the forearm toward the target.',
          subtext: 'Dual MG996R metal-gear torque joints',
          anchor: 'part',
          partId: elbowId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: lowerArmId,
            type: 'tilt',
            fromRotationDelta: [-12, 0, 0],
            toRotationDelta: [16, 0, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.45,
          },
          {
            partId: elbowId,
            type: 'tilt',
            fromRotationDelta: [-10, 0, 0],
            toRotationDelta: [22, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: forearmId,
            type: 'translate',
            fromOffset: [0, 0, -15],
            toOffset: [0, -12, 22],
            glowColor: '#d4af37',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'motion_arc',
            partId: elbowId,
            color: '#f3d478',
            label: 'J2/J3 Reach Extension',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Engage Geared Parallel Gripper Jaws',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [395, 310, 465],
          toPosition: [295, 415, 355],
          fromTarget: [0, 165, 0],
          toTarget: [0, 330, 0],
          fov: 40,
        },
        narration: {
          text: 'Spur-gear parallel jaws close symmetrically around the workpiece.',
          subtext: 'Compliant TPU grip pads hold 250g payload',
          anchor: 'part',
          partId: gripperJawId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: gripperJawId,
            type: 'press',
            fromOffset: [0, 12, 0],
            toOffset: [0, -6, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.7,
          },
          {
            partId: gripperBodyId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
        ],
        effects: [
          {
            type: 'target_prop',
            partId: gripperJawId,
            label: '250g Test Cube',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Execute Pick-and-Place Trajectory',
        durationSeconds: 4.6,
        camera: {
          fromPosition: [295, 415, 355],
          toPosition: [510, 375, 610],
          fromTarget: [0, 330, 0],
          toTarget: [0, 185, 0],
          fov: 40,
        },
        narration: {
          text: 'Six-axis inverse kinematics lifts and places payload on target.',
          subtext: 'Smooth cosine velocity profiling via Web UI',
          anchor: 'part',
          partId: wristId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: wristId,
            type: 'rotate',
            fromRotationDelta: [0, -25, 0],
            toRotationDelta: [0, 25, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: gripperBodyId,
            type: 'translate',
            fromOffset: [-18, -10, 0],
            toOffset: [18, 16, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
          {
            partId: gripperJawId,
            type: 'translate',
            fromOffset: [-18, -10, 0],
            toOffset: [18, 16, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
        ],
        effects: [
          {
            type: 'target_prop',
            partId: gripperJawId,
            label: 'Placed Payload',
            color: '#f3d478',
          },
          {
            type: 'motion_arc',
            partId: gripperBodyId,
            color: '#e5bd47',
            label: '6-DOF IK Path',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step 6-DOF robotic manipulation sequence: energize the 6V PCA9685 servo bus, slew the J1 azimuth turntable, articulate the J2/J3 shoulder and elbow links, close the geared parallel gripper jaws, and execute a pick-and-place trajectory.',
      totalDurationSeconds: 21.4,
      scenes,
    };
  }

  if (presetKey === 'bladeless-air-purifier') {
    const hepaId = findMatchingPartId(parts, ['hepa-h13-cylinder'], 1);
    const shellId = findMatchingPartId(parts, ['hepa-intake-shell'], 2);
    const retainerId = findMatchingPartId(parts, ['hepa-filter-frame'], 3);
    const blowerId = findMatchingPartId(parts, ['blower-120mm-24v'], 6);
    const coneId = findMatchingPartId(parts, ['diffuser-stator-cone'], 7);
    const lowerLoopId = findMatchingPartId(parts, ['coanda-airfoil-lower'], 9);
    const upperLoopId = findMatchingPartId(parts, ['coanda-airfoil-upper'], 10);
    const bezelId = findMatchingPartId(parts, ['control-bezel-pod'], 11);
    const pwmId = findMatchingPartId(parts, ['pwm-speed-controller'], 12);
    const sensorId = findMatchingPartId(parts, ['pm25-air-sensor'], 13);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Twist-Lock True HEPA H13 Filter',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [580, 440, 680],
          toPosition: [390, 185, 460],
          fromTarget: [20, 210, 0],
          toTarget: [0, 55, 0],
          fov: 40,
        },
        narration: {
          text: 'Twist-lock the HEPA H13 cartridge inside the intake drum.',
          subtext: 'EPDM gasket seals 99.97% of 0.3µm particles',
          anchor: 'part',
          partId: hepaId,
          offset: [0, 42, 0],
        },
        partAnimations: [
          {
            partId: hepaId,
            type: 'rotate',
            fromRotationDelta: [0, -40, 0],
            toRotationDelta: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: retainerId,
            type: 'translate',
            fromOffset: [0, 16, 0],
            toOffset: [0, 0, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: retainerId,
            label: 'Lock HEPA Seal',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Laser PM2.5 Air Quality Auto-Sense',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [390, 185, 460],
          toPosition: [340, 285, 420],
          fromTarget: [0, 55, 0],
          toTarget: [18, 236, 36],
          fov: 40,
        },
        narration: {
          text: 'Laser PM2.5 sensor samples room particulates in real time.',
          subtext: 'ESP32-C3 auto-scales fan speed on dust spikes',
          anchor: 'part',
          partId: sensorId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: sensorId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.75,
            oscillate: true,
          },
          {
            partId: bezelId,
            type: 'glow',
            glowColor: '#d4af37',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'led_indicator',
            partId: sensorId,
            color: '#f3d478',
            label: 'PM2.5 Auto-Mode',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Dial 25kHz PWM Airflow Speed',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [340, 285, 420],
          toPosition: [-330, 290, 420],
          fromTarget: [18, 236, 36],
          toTarget: [-18, 236, 36],
          fov: 40,
        },
        narration: {
          text: 'Turn the rotary encoder knob to set silent blower speed.',
          subtext: '25kHz ultrasonic PWM eliminates motor whine',
          anchor: 'part',
          partId: pwmId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: pwmId,
            type: 'rotate',
            fromRotationDelta: [0, 0, -35],
            toRotationDelta: [0, 0, 35],
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: pwmId,
            label: 'Turn PWM Dial',
            color: '#f3d478',
          },
          {
            type: 'motion_arc',
            partId: pwmId,
            color: '#e5bd47',
            label: 'Speed Trim',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: '360° HEPA Suction & Stator Diffuser',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [-330, 290, 420],
          toPosition: [420, 250, 490],
          fromTarget: [-18, 236, 36],
          toTarget: [0, 146, 0],
          fov: 40,
        },
        narration: {
          text: 'Centrifugal impeller draws room air through 360° HEPA perforations.',
          subtext: 'Stator vanes convert swirl into static pressure',
          anchor: 'part',
          partId: blowerId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: blowerId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 3.5,
            glowColor: '#f3d478',
            glowIntensity: 0.7,
          },
          {
            partId: shellId,
            type: 'glow',
            glowColor: '#d4af37',
            glowIntensity: 0.4,
          },
          {
            partId: coneId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'air_stream',
            partId: shellId,
            targetPartId: coneId,
            color: '#e5bd47',
            label: '360° HEPA Intake',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Coanda Airfoil Loop Jet Projection',
        durationSeconds: 4.8,
        camera: {
          fromPosition: [420, 250, 490],
          toPosition: [560, 450, 660],
          fromTarget: [0, 146, 0],
          toTarget: [0, 355, 0],
          fov: 40,
        },
        narration: {
          text: 'Coanda nozzle slot entrains and projects purified laminar airflow.',
          subtext: '1.8mm perimeter slot multiplies airflow 15×',
          anchor: 'part',
          partId: upperLoopId,
          offset: [0, 42, 0],
        },
        partAnimations: [
          {
            partId: lowerLoopId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
          {
            partId: upperLoopId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.7,
            oscillate: true,
          },
          {
            partId: blowerId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 3.5,
            glowColor: '#d4af37',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'air_stream',
            partId: upperLoopId,
            color: '#f3d478',
            label: '15× Coanda Laminar Jet',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step operation: twist-lock the HEPA H13 filter cartridge, monitor PM2.5 particulates via laser sensor, dial the 25kHz PWM speed knob, draw dusty air through the 360° intake shell, and project purified laminar airflow from the Coanda airfoil loop.',
      totalDurationSeconds: 21.4,
      scenes,
    };
  }

  if (presetKey === 'camera-slider-3axis') {
    const legId = findMatchingPartId(parts, ['outTrigger-leg'], 3);
    const idlerId = findMatchingPartId(parts, ['idler-end-block'], 2);
    const mountId = findMatchingPartId(parts, ['ball-head-mount'], 12);
    const cradleId = findMatchingPartId(parts, ['camera-arca-cradle'], 11);
    const oledId = findMatchingPartId(parts, ['esp32-oled-controller'], 15);
    const carriageId = findMatchingPartId(parts, ['gantry-carriage-plate'], 6);
    const panHousingId = findMatchingPartId(
      parts,
      ['pan-turntable-housing'],
      7
    );
    const panGearId = findMatchingPartId(parts, ['pan-ring-gear'], 8);
    const yokeId = findMatchingPartId(parts, ['tilt-u-yoke'], 10);

    const scenes: UsageScene[] = [
      {
        id: 'scene-1',
        index: 1,
        title: 'Deploy Outrigger Legs & Tension Belt',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [292, 240, 365],
          toPosition: [255, 145, 310],
          fromTarget: [0, 65, 0],
          toTarget: [45, -12, 0],
          fov: 40,
        },
        narration: {
          text: 'Fold out the all-terrain outrigger legs and tension belt.',
          subtext: 'Levels the 1000mm dual 2020 V-slot rails',
          anchor: 'part',
          partId: legId,
          offset: [0, 34, 0],
        },
        partAnimations: [
          {
            partId: legId,
            type: 'rotate',
            fromRotationDelta: [0, -14, 0],
            toRotationDelta: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: idlerId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.5,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: idlerId,
            label: 'Tension GT2 Belt',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-2',
        index: 2,
        title: 'Clamp Camera into Arca-Swiss Saddle',
        durationSeconds: 4.2,
        camera: {
          fromPosition: [255, 145, 310],
          toPosition: [210, 245, 275],
          fromTarget: [45, -12, 0],
          toTarget: [0, 145, 0],
          fov: 40,
        },
        narration: {
          text: 'Lock your camera plate into the quick-release Arca-Swiss clamp.',
          subtext: 'Centered over 3:1 pan/tilt reduction axes',
          anchor: 'part',
          partId: mountId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: mountId,
            type: 'translate',
            fromOffset: [0, 22, 0],
            toOffset: [0, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: cradleId,
            type: 'glow',
            glowColor: '#e5bd47',
            glowIntensity: 0.45,
          },
        ],
        effects: [
          {
            type: 'target_prop',
            partId: mountId,
            label: 'Cinema Camera',
            color: '#e6d3b3',
          },
          {
            type: 'hand_proxy',
            partId: mountId,
            label: 'Lock Arca Plate',
            color: '#f3d478',
          },
        ],
      },
      {
        id: 'scene-3',
        index: 3,
        title: 'Set Start & End Keyframes on OLED',
        durationSeconds: 4.0,
        camera: {
          fromPosition: [210, 245, 275],
          toPosition: [-240, 165, 260],
          fromTarget: [0, 145, 0],
          toTarget: [-110, 18, -52],
          fov: 40,
        },
        narration: {
          text: 'Program start and end keyframes on the OLED controller.',
          subtext: 'TMC2209 UART drivers calculate S-curve ramp',
          anchor: 'part',
          partId: oledId,
          offset: [0, 32, 0],
        },
        partAnimations: [
          {
            partId: oledId,
            type: 'pulse',
            glowColor: '#f3d478',
            glowIntensity: 0.75,
            oscillate: true,
          },
        ],
        effects: [
          {
            type: 'hand_proxy',
            partId: oledId,
            label: 'Set Keyframes',
            color: '#f3d478',
          },
          {
            type: 'led_indicator',
            partId: oledId,
            color: '#f3d478',
            label: 'Keyframes Locked',
          },
        ],
      },
      {
        id: 'scene-4',
        index: 4,
        title: 'Synchronized Dolly & 3:1 Pan Sweep',
        durationSeconds: 4.8,
        camera: {
          fromPosition: [-240, 165, 260],
          toPosition: [265, 225, 340],
          fromTarget: [-110, 18, -52],
          toTarget: [0, 62, 0],
          fov: 40,
        },
        narration: {
          text: 'Carriage glides along V-slot rails while pan ring tracks subject.',
          subtext: 'Delrin wheels + 60T ring gear keep target centered',
          anchor: 'part',
          partId: carriageId,
          offset: [0, 38, 0],
        },
        partAnimations: [
          {
            partId: carriageId,
            type: 'translate',
            fromOffset: [-48, 0, 0],
            toOffset: [48, 0, 0],
            oscillate: true,
            glowColor: '#f3d478',
            glowIntensity: 0.55,
          },
          {
            partId: panHousingId,
            type: 'translate',
            fromOffset: [-48, 0, 0],
            toOffset: [48, 0, 0],
            oscillate: true,
            glowColor: '#d4af37',
            glowIntensity: 0.45,
          },
          {
            partId: panGearId,
            type: 'spin',
            spinAxis: 'y',
            spinSpeed: 0.8,
            glowColor: '#f3d478',
            glowIntensity: 0.65,
          },
        ],
        effects: [
          {
            type: 'motion_arc',
            partId: panGearId,
            color: '#f3d478',
            label: 'Dolly + Pan Sync',
          },
        ],
      },
      {
        id: 'scene-5',
        index: 5,
        title: 'Tilt U-Yoke & Trigger Time-Lapse Shutter',
        durationSeconds: 4.4,
        camera: {
          fromPosition: [265, 225, 340],
          toPosition: [292, 249, 368],
          fromTarget: [0, 62, 0],
          toTarget: [0, 118, 0],
          fov: 40,
        },
        narration: {
          text: 'U-yoke tilts smoothly while shutter cable triggers time-lapse exposures.',
          subtext: '2.5mm opto-isolated intervalometer trigger',
          anchor: 'part',
          partId: yokeId,
          offset: [0, 36, 0],
        },
        partAnimations: [
          {
            partId: yokeId,
            type: 'tilt',
            fromRotationDelta: [-14, 0, 0],
            toRotationDelta: [16, 0, 0],
            glowColor: '#f3d478',
            glowIntensity: 0.6,
          },
          {
            partId: mountId,
            type: 'tilt',
            fromRotationDelta: [-14, 0, 0],
            toRotationDelta: [16, 0, 0],
            glowColor: '#e5bd47',
            glowIntensity: 0.55,
          },
        ],
        effects: [
          {
            type: 'light_beam',
            partId: mountId,
            color: '#f3d478',
            label: 'Shutter Triggered',
          },
          {
            type: 'target_prop',
            partId: mountId,
            label: 'Cinema Camera',
            color: '#e6d3b3',
          },
        ],
      },
    ];

    return {
      objectName: analysis.objectName,
      summary:
        'Five-step motion-control sequence: deploy the outrigger legs and tension the GT2 belt, clamp the camera onto the Arca-Swiss cradle, program keyframes on the OLED controller, run a synchronized dolly + pan sweep, and tilt the U-yoke for time-lapse capture.',
      totalDurationSeconds: 21.4,
      scenes,
    };
  }

  return null;
}

function detectPresetKey(analysis: ObjectAnalysis, design: DesignSpec): string | null {
  const text = `${analysis.slug || ''} ${analysis.objectName || ''} ${design.objectName || ''}`.toLowerCase();
  const partIds = new Set((design.parts || []).map((p) => p.id));

  if (
    partIds.has('reservoir-tank') ||
    /\b(plant|waterer|auto-waterer|hydropulse|blumat|sustee)\b/.test(text)
  ) {
    return 'plant-auto-waterer';
  }
  if (
    partIds.has('easel-base-hub') ||
    /\b(art-easel|studio\s+art\s+easel|painting\s+easel)\b/.test(text)
  ) {
    return 'art-easel';
  }
  if (
    partIds.has('xyz-focus-sled') ||
    partIds.has('doublet-lens-barrel') ||
    /\b(iphone-magnifier|microscope|magnifier\s+adapter)\b/.test(text)
  ) {
    return 'iphone-magnifier';
  }
  if (
    partIds.has('deck-base-96well') ||
    partIds.has('z-pipette-cradle') ||
    /\b(liquid-handler|liquid\s+handling|pipette)\b/.test(text)
  ) {
    return 'liquid-handler';
  }
  if (
    partIds.has('wrist-pitch-clevis') ||
    partIds.has('gripper-jaw') ||
    /\b(desktop-robot-arm|6-axis.*robot\s+arm|argobot)\b/.test(text)
  ) {
    return 'desktop-robot-arm';
  }
  if (
    partIds.has('coanda-airfoil-upper') ||
    partIds.has('hepa-h13-cylinder') ||
    /\b(bladeless-air-purifier|zephyrcoanda|coanda)\b/.test(text)
  ) {
    return 'bladeless-air-purifier';
  }
  if (
    partIds.has('pan-turntable-housing') ||
    partIds.has('camera-arca-cradle') ||
    /\b(camera-slider-3axis|cineglide|camera\s+slider)\b/.test(text)
  ) {
    return 'camera-slider-3axis';
  }
  return null;
}

export function buildDeterministicUsageStoryboard(input: {
  analysis: ObjectAnalysis;
  design: DesignSpec;
  bom?: BomData;
  instructions?: InstructionsData;
}): UsageStoryboard {
  const { analysis, design } = input;
  const presetKey = detectPresetKey(analysis, design);
  if (presetKey) {
    const presetStoryboard = buildPresetShowcaseStoryboard(
      presetKey,
      analysis,
      design
    );
    if (presetStoryboard) {
      return UsageStoryboardSchema.parse(presetStoryboard);
    }
  }

  const parts =
    Array.isArray(design?.parts) && design.parts.length > 0
      ? design.parts
      : [
          {
            id: 'base-housing',
            name: 'Primary Base Housing',
            kind: 'printed' as const,
            dims_mm: [120, 40, 120] as [number, number, number],
            shape: 'box' as const,
            params: {},
            position: [0, 20, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            explode: [0, -40, 0] as [number, number, number],
            color: '#d4af37',
          },
        ];

  const zUp = isCadZUpDesign(parts);
  const fullText = `${analysis.objectName} ${analysis.category} ${analysis.functionSummary}`.toLowerCase();

  // Classify parts for logical 5-scene usage story
  const basePart =
    parts.find((p) =>
      /\b(base|chassis|frame|stand|pedestal|mount|body|tank|deck|housing)\b/i.test(
        p.name
      )
    ) || parts[0];

  const mountOrLoadPart =
    parts.find(
      (p) =>
        p.id !== basePart.id &&
        /\b(clamp|cradle|holder|tray|lid|cover|plate|stage|jaw|saddle|funnel)\b/i.test(
          p.name
        )
    ) || parts[Math.min(1, parts.length - 1)];

  const controlOrPowerPart =
    parts.find(
      (p) =>
        p.kind === 'purchased' ||
        /\b(switch|button|knob|dial|controller|esp32|pcb|board|power|usb|sensor|motor|servo)\b/i.test(
          p.name
        )
    ) || parts[Math.min(2, parts.length - 1)];

  const actuatorPart =
    parts.find(
      (p) =>
        p.id !== basePart.id &&
        /\b(hinge|joint|gear|wheel|carriage|arm|fan|impeller|pump|lens|nozzle|head|rotary|slider)\b/i.test(
          p.name
        )
    ) || parts[Math.min(3, parts.length - 1)];

  const outputPart =
    parts[parts.length - 1] || actuatorPart || mountOrLoadPart || basePart;

  const primaryEffectType: UsageEffectType = /\b(water|pump|drip|fluid|liquid|irrigat)\b/.test(
    fullText
  )
    ? 'water_flow'
    : /\b(fan|air|purif|blower|coanda|hepa|vent)\b/.test(fullText)
    ? 'air_stream'
    : /\b(light|lamp|led|lens|microscope|magnif|camera|optic)\b/.test(fullText)
    ? 'light_beam'
    : 'motion_arc';

  const basePos = getPartWorldYUpPos(parts, basePart.id, zUp);
  const mountPos = getPartWorldYUpPos(parts, mountOrLoadPart.id, zUp);
  const ctrlPos = getPartWorldYUpPos(parts, controlOrPowerPart.id, zUp);
  const actPos = getPartWorldYUpPos(parts, actuatorPart.id, zUp);
  const outPos = getPartWorldYUpPos(parts, outputPart.id, zUp);

  const bbox = design.overallBoundingBoxMm ||
    analysis.overallDimensionsMm || [140, 140, 140];
  const dist = Math.max(220, Math.min(620, Math.hypot(...bbox) * 1.35));

  const scenes: UsageScene[] = [
    {
      id: 'scene-1',
      index: 1,
      title: `Position & Stabilize ${basePart.name}`,
      durationSeconds: 3.8,
      camera: {
        fromPosition: [
          Math.round(basePos[0] + dist * 0.72),
          Math.round(basePos[1] + dist * 0.52),
          Math.round(basePos[2] + dist * 0.78),
        ],
        toPosition: [
          Math.round(basePos[0] + dist * 0.56),
          Math.round(basePos[1] + dist * 0.38),
          Math.round(basePos[2] + dist * 0.64),
        ],
        fromTarget: [0, Math.round(basePos[1] + 20), 0],
        toTarget: basePos,
        fov: 40,
      },
      narration: {
        text: clampWords(
          `Place ${basePart.name} flat on your work surface to begin.`
        ),
        subtext: sanitizeCopy(analysis.tagline || analysis.category),
        anchor: 'part',
        partId: basePart.id,
        offset: [0, 32, 0],
      },
      partAnimations: [
        {
          partId: basePart.id,
          type: 'press',
          fromOffset: [0, 12, 0],
          toOffset: [0, 0, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.45,
        },
      ],
      effects: [
        {
          type: 'hand_proxy',
          partId: basePart.id,
          label: 'Position Base',
          color: '#f3d478',
        },
      ],
    },
    {
      id: 'scene-2',
      index: 2,
      title: `Open & Engage ${mountOrLoadPart.name}`,
      durationSeconds: 4.2,
      camera: {
        fromPosition: [
          Math.round(basePos[0] + dist * 0.56),
          Math.round(basePos[1] + dist * 0.38),
          Math.round(basePos[2] + dist * 0.64),
        ],
        toPosition: [
          Math.round(mountPos[0] - dist * 0.54),
          Math.round(mountPos[1] + dist * 0.46),
          Math.round(mountPos[2] + dist * 0.62),
        ],
        fromTarget: basePos,
        toTarget: mountPos,
        fov: 40,
      },
      narration: {
        text: clampWords(
          `Engage ${mountOrLoadPart.name} and secure your payload in place.`
        ),
        subtext: sanitizeCopy(
          mountOrLoadPart.roleInAssembly || mountOrLoadPart.description || ''
        ).slice(0, 64),
        anchor: 'part',
        partId: mountOrLoadPart.id,
        offset: [0, 32, 0],
      },
      partAnimations: [
        {
          partId: mountOrLoadPart.id,
          type: 'translate',
          fromOffset: [0, 22, 0],
          toOffset: [0, 0, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.55,
        },
      ],
      effects: [
        {
          type: 'hand_proxy',
          partId: mountOrLoadPart.id,
          label: 'Engage Mechanism',
          color: '#f3d478',
        },
        {
          type: 'target_prop',
          partId: mountOrLoadPart.id,
          label: 'Active Workpiece',
          color: '#e6d3b3',
        },
      ],
    },
    {
      id: 'scene-3',
      index: 3,
      title: `Activate ${controlOrPowerPart.name}`,
      durationSeconds: 4.0,
      camera: {
        fromPosition: [
          Math.round(mountPos[0] - dist * 0.54),
          Math.round(mountPos[1] + dist * 0.46),
          Math.round(mountPos[2] + dist * 0.62),
        ],
        toPosition: [
          Math.round(ctrlPos[0] + dist * 0.58),
          Math.round(ctrlPos[1] + dist * 0.42),
          Math.round(ctrlPos[2] + dist * 0.55),
        ],
        fromTarget: mountPos,
        toTarget: ctrlPos,
        fov: 40,
      },
      narration: {
        text: clampWords(
          `Trigger ${controlOrPowerPart.name} to energize the core mechanism.`
        ),
        subtext: 'Off-the-shelf hardware integration',
        anchor: 'part',
        partId: controlOrPowerPart.id,
        offset: [0, 30, 0],
      },
      partAnimations: [
        {
          partId: controlOrPowerPart.id,
          type: 'pulse',
          glowColor: '#f3d478',
          glowIntensity: 0.7,
          oscillate: true,
        },
      ],
      effects: [
        {
          type: 'led_indicator',
          partId: controlOrPowerPart.id,
          color: '#f3d478',
          label: 'Active & Ready',
        },
      ],
    },
    {
      id: 'scene-4',
      index: 4,
      title: `Adjust ${actuatorPart.name}`,
      durationSeconds: 4.4,
      camera: {
        fromPosition: [
          Math.round(ctrlPos[0] + dist * 0.58),
          Math.round(ctrlPos[1] + dist * 0.42),
          Math.round(ctrlPos[2] + dist * 0.55),
        ],
        toPosition: [
          Math.round(actPos[0] + dist * 0.48),
          Math.round(actPos[1] + dist * 0.54),
          Math.round(actPos[2] - dist * 0.52),
        ],
        fromTarget: ctrlPos,
        toTarget: actPos,
        fov: 40,
      },
      narration: {
        text: clampWords(
          `Articulate ${actuatorPart.name} smoothly through its operating range.`
        ),
        subtext: sanitizeCopy(analysis.keyMechanisms?.[0] || '').slice(0, 64),
        anchor: 'part',
        partId: actuatorPart.id,
        offset: [0, 34, 0],
      },
      partAnimations: [
        {
          partId: actuatorPart.id,
          type: 'rotate',
          fromRotationDelta: [0, -22, 0],
          toRotationDelta: [0, 22, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.6,
        },
      ],
      effects: [
        {
          type: 'motion_arc',
          partId: actuatorPart.id,
          color: '#f3d478',
          label: 'Primary Articulation',
        },
      ],
    },
    {
      id: 'scene-5',
      index: 5,
      title: `Full Operation: ${analysis.objectName}`,
      durationSeconds: 4.6,
      camera: {
        fromPosition: [
          Math.round(actPos[0] + dist * 0.48),
          Math.round(actPos[1] + dist * 0.54),
          Math.round(actPos[2] - dist * 0.52),
        ],
        toPosition: [
          Math.round(outPos[0] + dist * 0.68),
          Math.round(outPos[1] + dist * 0.5),
          Math.round(outPos[2] + dist * 0.72),
        ],
        fromTarget: actPos,
        toTarget: outPos,
        fov: 40,
      },
      narration: {
        text: clampWords(
          `${analysis.objectName} operates at full capacity for $${analysis.targetDiyCost.toFixed(2)}.`
        ),
        subtext: `Saves $${analysis.estimatedSavings.toFixed(2)} vs. $${analysis.originalProduct.retailPrice.toFixed(2)} commercial unit`,
        anchor: 'part',
        partId: outputPart.id,
        offset: [0, 36, 0],
      },
      partAnimations: [
        {
          partId: outputPart.id,
          type: 'pulse',
          glowColor: '#f3d478',
          glowIntensity: 0.65,
          oscillate: true,
        },
        {
          partId: actuatorPart.id,
          type: 'spin',
          spinAxis: 'y',
          spinSpeed: 1.4,
          glowColor: '#e5bd47',
          glowIntensity: 0.5,
        },
      ],
      effects: [
        {
          type: primaryEffectType,
          partId: actuatorPart.id,
          targetPartId: outputPart.id,
          color: '#f3d478',
          label: 'Full Operation',
        },
      ],
    },
  ];

  const totalDurationSeconds =
    Math.round(scenes.reduce((acc, s) => acc + s.durationSeconds, 0) * 10) / 10;

  return UsageStoryboardSchema.parse({
    objectName: sanitizeCopy(analysis.objectName),
    summary: sanitizeCopy(analysis.functionSummary || analysis.tagline),
    totalDurationSeconds,
    scenes,
  });
}

export function normalizeAndValidateUsageStoryboard(
  raw: unknown,
  fallbackInput: {
    analysis: ObjectAnalysis;
    design: DesignSpec;
    bom?: BomData;
    instructions?: InstructionsData;
  }
): UsageStoryboard {
  const fallback = buildDeterministicUsageStoryboard(fallbackInput);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const r = raw as Record<string, unknown>;
  const rawScenes = Array.isArray(r.scenes) ? r.scenes : [];
  if (rawScenes.length < 4) {
    return fallback;
  }

  const parts = fallbackInput.design.parts || [];
  const validPartIds = new Set(parts.map((p) => p.id));
  const defaultPartId = parts[0]?.id || 'part-1';

  const allowedAnimTypes = new Set<UsageAnimationType>([
    'translate',
    'rotate',
    'pulse',
    'press',
    'spin',
    'glow',
    'tilt',
    'slide',
  ]);
  const allowedEffectTypes = new Set<UsageEffectType>([
    'water_flow',
    'air_stream',
    'light_beam',
    'led_indicator',
    'hand_proxy',
    'target_prop',
    'motion_arc',
  ]);

  const normalizedScenes: UsageScene[] = rawScenes
    .slice(0, 7)
    .map((rawScene, idx) => {
      const s = (rawScene || {}) as Record<string, unknown>;
      const fbScene =
        fallback.scenes[idx % fallback.scenes.length] || fallback.scenes[0];

      const durationSeconds = Math.min(
        10,
        Math.max(2.5, Number(s.durationSeconds ?? s.duration ?? fbScene.durationSeconds) || 4.2)
      );

      const rawCam = (s.camera || {}) as Record<string, unknown>;
      const camera: UsageCameraKeyframe = {
        fromPosition: toVec3Tuple(
          rawCam.fromPosition ?? rawCam.from,
          fbScene.camera.fromPosition
        ),
        toPosition: toVec3Tuple(
          rawCam.toPosition ?? rawCam.to ?? rawCam.position,
          fbScene.camera.toPosition
        ),
        fromTarget: toVec3Tuple(
          rawCam.fromTarget ?? rawCam.target,
          fbScene.camera.fromTarget
        ),
        toTarget: toVec3Tuple(
          rawCam.toTarget ?? rawCam.target,
          fbScene.camera.toTarget
        ),
        fov: 40,
      };

      const rawNarration =
        typeof s.narration === 'string'
          ? { text: s.narration }
          : ((s.narration || {}) as Record<string, unknown>);
      const requestedAnchorPart = String(
        rawNarration.partId || fbScene.narration.partId || defaultPartId
      );
      const resolvedAnchorPart = validPartIds.has(requestedAnchorPart)
        ? requestedAnchorPart
        : findMatchingPartId(parts, [requestedAnchorPart], idx);

      const narration: UsageNarration = {
        text: clampWords(
          String(rawNarration.text || s.caption || fbScene.narration.text),
          12
        ),
        subtext: rawNarration.subtext
          ? sanitizeCopy(String(rawNarration.subtext)).slice(0, 80)
          : fbScene.narration.subtext,
        anchor: rawNarration.anchor === 'screen' ? 'screen' : 'part',
        partId: resolvedAnchorPart,
        offset: toVec3Tuple(
          rawNarration.offset,
          fbScene.narration.offset || [0, 32, 0]
        ),
      };

      const rawAnims = Array.isArray(s.partAnimations)
        ? s.partAnimations
        : Array.isArray(s.animations)
        ? s.animations
        : [];

      const partAnimations: UsagePartAnimation[] =
        rawAnims.length > 0
          ? rawAnims.slice(0, 5).map((rawAnim: unknown) => {
              const a = (rawAnim || {}) as Record<string, unknown>;
              const reqPid = String(a.partId || resolvedAnchorPart);
              const pid = validPartIds.has(reqPid)
                ? reqPid
                : findMatchingPartId(parts, [reqPid], idx);
              const rawType = String(a.type || 'pulse') as UsageAnimationType;
              const type: UsageAnimationType = allowedAnimTypes.has(rawType)
                ? rawType
                : 'pulse';
              return {
                partId: pid,
                type,
                fromOffset: a.fromOffset
                  ? toVec3Tuple(a.fromOffset, [0, 0, 0])
                  : undefined,
                toOffset: a.toOffset
                  ? toVec3Tuple(a.toOffset, [0, 15, 0])
                  : undefined,
                fromRotationDelta: a.fromRotationDelta
                  ? toVec3Tuple(a.fromRotationDelta, [0, 0, 0])
                  : undefined,
                toRotationDelta: a.toRotationDelta
                  ? toVec3Tuple(a.toRotationDelta, [0, 20, 0])
                  : undefined,
                spinAxis:
                  a.spinAxis === 'x' || a.spinAxis === 'y' || a.spinAxis === 'z'
                    ? a.spinAxis
                    : 'y',
                spinSpeed: Number(a.spinSpeed) || 1.5,
                glowColor: '#f3d478',
                glowIntensity: Math.min(
                  1,
                  Math.max(0.2, Number(a.glowIntensity) || 0.55)
                ),
                oscillate: Boolean(a.oscillate),
              };
            })
          : fbScene.partAnimations;

      const rawEffects = Array.isArray(s.effects) ? s.effects : [];
      const effects: UsageEffect[] =
        rawEffects.length > 0
          ? rawEffects.slice(0, 3).map((rawEff: unknown) => {
              const ef = (rawEff || {}) as Record<string, unknown>;
              const rawEType = String(
                ef.type || 'hand_proxy'
              ) as UsageEffectType;
              const eType: UsageEffectType = allowedEffectTypes.has(rawEType)
                ? rawEType
                : 'hand_proxy';
              const reqPid = ef.partId ? String(ef.partId) : resolvedAnchorPart;
              const pid = validPartIds.has(reqPid)
                ? reqPid
                : findMatchingPartId(parts, [reqPid], idx);
              return {
                type: eType,
                partId: pid,
                targetPartId: ef.targetPartId
                  ? findMatchingPartId(parts, [String(ef.targetPartId)], 0)
                  : undefined,
                color: '#f3d478',
                label: ef.label
                  ? sanitizeCopy(String(ef.label)).slice(0, 32)
                  : undefined,
              };
            })
          : fbScene.effects || [];

      return {
        id: String(s.id || `scene-${idx + 1}`),
        index: idx + 1,
        title: sanitizeCopy(String(s.title || fbScene.title)),
        durationSeconds,
        camera,
        narration,
        partAnimations,
        effects,
      };
    });

  const totalDurationSeconds =
    Math.round(
      normalizedScenes.reduce((acc, s) => acc + s.durationSeconds, 0) * 10
    ) / 10;

  const candidate: UsageStoryboard = {
    objectName: sanitizeCopy(
      String(r.objectName || fallbackInput.analysis.objectName)
    ),
    summary: sanitizeCopy(
      String(r.summary || fallback.summary || fallbackInput.analysis.tagline)
    ),
    totalDurationSeconds,
    scenes: normalizedScenes,
  };

  const parsed = UsageStoryboardSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }
  return fallback;
}

export async function runUsageAgent(
  input: UsageAgentInput
): Promise<RunAgentResult<UsageStoryboard>> {
  const { analysis, design, bom, instructions } = input;
  const fallback = buildDeterministicUsageStoryboard({
    analysis,
    design,
    bom,
    instructions,
  });

  const partSummary = (design.parts || []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    position: p.position,
    dims_mm: p.dims_mm,
    role: p.roleInAssembly || p.description,
  }));

  const bomSummary = (bom?.items || []).slice(0, 8).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
  }));

  const prompt = `You are the "Usage Director" Agent in "Get Me An Alt", powered by Gemini 4 Argon.
Create a 5-scene interactive 3D "How to Use" storyboard demonstrating how a user operates the ASSEMBLED "${analysis.objectName}".

Product Function: ${analysis.functionSummary}
Key Mechanisms: ${(analysis.keyMechanisms || []).join(' | ')}
BOM Components: ${JSON.stringify(bomSummary)}
Assembled Parts (use these exact partId values):
${JSON.stringify(partSummary)}

Return ONLY valid JSON matching this exact schema:
{
  "objectName": "${analysis.objectName}",
  "summary": "1 sentence overview of how the user operates the finished build",
  "totalDurationSeconds": 21.0,
  "scenes": [
    {
      "id": "scene-1",
      "index": 1,
      "title": "Short 3-5 word scene title",
      "durationSeconds": 4.2,
      "camera": {
        "fromPosition": [220, 165, 250],
        "toPosition": [160, 140, 190],
        "fromTarget": [0, 40, 0],
        "toTarget": [0, 60, 0],
        "fov": 40
      },
      "narration": {
        "text": "Short narration bubble under 12 words explaining this usage action.",
        "subtext": "Optional short technical metric or cue",
        "anchor": "part",
        "partId": "${partSummary[0]?.id || 'part-1'}",
        "offset": [0, 32, 0]
      },
      "partAnimations": [
        {
          "partId": "${partSummary[0]?.id || 'part-1'}",
          "type": "translate",
          "fromOffset": [0, 0, 0],
          "toOffset": [0, 18, 0],
          "glowColor": "#f3d478",
          "glowIntensity": 0.55
        }
      ],
      "effects": [
        {
          "type": "hand_proxy",
          "partId": "${partSummary[0]?.id || 'part-1'}",
          "color": "#f3d478",
          "label": "Operator Action"
        }
      ]
    }
  ]
}
Rules:
- Include 5 scenes (4 to 7 allowed).
- Every narration.text MUST be 12 words or fewer.
- Animation type must be one of: "translate", "rotate", "pulse", "press", "spin", "glow", "tilt", "slide".
- Effect type must be one of: "water_flow", "air_stream", "light_beam", "led_indicator", "hand_proxy", "target_prop", "motion_arc".
- Use only hex colors from the gilded palette (#f3d478, #e5bd47, #d4af37, #c86d51, #e6d3b3).`;

  const retryPrompt = `Create a 5-scene JSON usage storyboard for "${analysis.objectName}" using part IDs ${JSON.stringify(partSummary.map((p) => p.id))}. Each scene needs id, index, title, durationSeconds, camera:{fromPosition,toPosition,fromTarget,toTarget}, narration:{text (max 12 words), anchor:"part", partId}, partAnimations:[{partId, type}], effects:[{type, partId, label}]. Return ONLY raw JSON.`;

  input.onEvent?.({
    agent: 'usage',
    phase: 'start',
    message: `Choreographing 3D "How to Use" storyboard & camera keyframes for ${analysis.objectName}...`,
    data: { stageId: 'usage', artifactFile: 'usage.json' },
    ts: new Date().toISOString(),
  });

  const result = await runGeminiAgent<UsageStoryboard>({
    stageName: 'Usage',
    prompt,
    retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'usage.json',
    preferRestForSpeed: true,
    timeoutMs: 28000,
    onLog: input.onLog,
    fallbackGenerator: () => fallback,
  });

  const validated = normalizeAndValidateUsageStoryboard(result.data, {
    analysis,
    design,
    bom,
    instructions,
  });

  try {
    fs.mkdirSync(input.cwd, { recursive: true });
    fs.writeFileSync(
      path.join(input.cwd, 'usage.json'),
      JSON.stringify(validated, null, 2)
    );
  } catch {
    // ignore read-only fs errors
  }

  input.onEvent?.({
    agent: 'usage',
    phase: 'artifact',
    message: 'Wrote usage.json (Zod-validated 3D usage storyboard)',
    data: {
      stageId: 'usage',
      artifactFile: 'usage.json',
      scenesCount: validated.scenes.length,
    },
    ts: new Date().toISOString(),
  });

  input.onEvent?.({
    agent: 'usage',
    phase: 'done',
    message: `Directed ${validated.scenes.length} interactive 3D usage scenes (${validated.totalDurationSeconds}s total)`,
    data: {
      stageId: 'usage',
      durationMs: result.durationMs,
      tokensUsed: result.tokensUsed,
      runner: result.runner,
    },
    ts: new Date().toISOString(),
  });

  return {
    ...result,
    data: validated,
  };
}
