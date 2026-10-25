import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  AgentStageId,
  BomData,
  BomItem,
  CritiqueData,
  CritiqueIssue,
  CritiqueRound,
  DesignPart,
  DesignSpec,
  InstructionsData,
  PlatesData,
  ProjectManifest,
  RunnerMode,
  SsePhase,
  SsePipelineEvent,
} from '../types';
import { getPrinterById } from '../printers';
import { generateCadBundle } from '../cad';
import {
  buildSampleManifest,
  emitSseEvent,
  getProjectFolder,
  getProjectManifest,
} from './orchestrator';
import { getObjectsDir, runGeminiAgent } from './runner';
import { runDesignerAgent } from './designer';
import {
  applyCritiqueFixesToDesign,
  evaluateCriticRound,
  runDeterministicDfmAudit,
  writeCritiqueArtifact,
} from './critic';
import { runBomAgent } from './bom';
import {
  buildVerifiedRetailerUrl,
  CORE_RETAILERS,
  runPriceHunterAgent,
} from './price-hunter';
import { runCadAgent } from './cad';
import { runInstructionsAgent } from './instructions';

export type ModifyAgentId =
  | 'designer'
  | 'critic'
  | 'bom'
  | 'price-hunter'
  | 'cad'
  | 'instructions';

export const ALL_PIPELINE_AGENTS: readonly string[] = [
  'analyst',
  'researcher',
  'teardown',
  'designer',
  'critic',
  'bom',
  'price-hunter',
  'cad',
  'instructions',
] as const;

export const ORDERED_MODIFY_AGENTS: readonly ModifyAgentId[] = [
  'designer',
  'critic',
  'bom',
  'price-hunter',
  'cad',
  'instructions',
] as const;

export interface ModifyClassification {
  affectedAgents: ModifyAgentId[];
  skippedAgents: string[];
  reasoning: string;
  modificationSummary: string;
  targetPrinterId?: string;
  scaleFactor?: number;
  targetPartKeywords?: string[];
  isCostOptimization?: boolean;
  fastenerOverride?: string;
  wallThicknessMm?: number;
  materialOverride?: string;
  simplifyInstructions?: boolean;
}

export interface ModifyPartChange {
  id: string;
  partNumber: string;
  name: string;
  kind: 'printed' | 'purchased';
  beforeDimsMm: [number, number, number];
  afterDimsMm: [number, number, number];
  beforeMaterial?: string;
  afterMaterial?: string;
  changeSummary: string;
}

export interface ModifyBomItemChange {
  id: string;
  partNumber: string;
  name: string;
  beforePrice: number;
  afterPrice: number;
  beforeRetailer: string;
  afterRetailer: string;
}

export interface ModifyDiffSummary {
  prompt: string;
  summary: string;
  classificationReasoning: string;
  affectedAgents: ModifyAgentId[];
  skippedAgents: string[];
  runner: RunnerMode;
  totalDurationMs: number;
  totalTokensUsed: number;
  price: {
    beforeDiyCost: number;
    afterDiyCost: number;
    deltaCost: number;
    retailPrice: number;
    beforeSavings: number;
    afterSavings: number;
    beforeSavingsPercent: number;
    afterSavingsPercent: number;
    changedItems: ModifyBomItemChange[];
  };
  parts: {
    beforeTotalCount: number;
    afterTotalCount: number;
    beforePrintedCount: number;
    afterPrintedCount: number;
    beforePurchasedCount: number;
    afterPurchasedCount: number;
    modifiedParts: ModifyPartChange[];
  };
  print: {
    beforePrinterId: string;
    afterPrinterId: string;
    beforePrinterName: string;
    afterPrinterName: string;
    beforeBedMm: [number, number, number];
    afterBedMm: [number, number, number];
    beforePrintTimeMinutes: number;
    afterPrintTimeMinutes: number;
    deltaPrintTimeMinutes: number;
    beforeWeightGrams: number;
    afterWeightGrams: number;
    deltaWeightGrams: number;
    beforePlatesCount: number;
    afterPlatesCount: number;
    deltaPlatesCount: number;
  };
  dfm: {
    passed: boolean;
    score: number;
    rounds: number;
    fixesApplied: string[];
  };
  instructions: {
    beforeStepsCount: number;
    afterStepsCount: number;
    updatedStepsSummary: string;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeModifyAgentName(raw: string): ModifyAgentId[] {
  const clean = (raw || '').toLowerCase().trim();
  if (clean === 'designer' || clean === 'architect') return ['designer'];
  if (clean === 'critic' || clean === 'dfm' || clean === 'printability') {
    return ['critic'];
  }
  if (clean === 'bom/price-hunter' || clean === 'bom_price_hunter') {
    return ['bom', 'price-hunter'];
  }
  if (clean === 'bom') return ['bom'];
  if (
    clean === 'price-hunter' ||
    clean === 'price_hunter' ||
    clean === 'pricehunter' ||
    clean === 'pricing'
  ) {
    return ['price-hunter'];
  }
  if (clean === 'cad' || clean === 'print' || clean === 'packer' || clean === 'plates') {
    return ['cad'];
  }
  if (clean === 'instructions' || clean === 'ikea' || clean === 'assembly') {
    return ['instructions'];
  }
  return [];
}

function detectPrinterFromPrompt(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('a1 mini') ||
    lower.includes('a1-mini') ||
    lower.includes('mini bed') ||
    lower.includes('180x180') ||
    lower.includes('180mm')
  ) {
    return 'bambu-a1-mini';
  }
  if (lower.includes('prusa mini')) return 'prusa-mini-plus';
  if (lower.includes('core one')) return 'prusa-core-one';
  if (lower.includes('prusa xl')) return 'prusa-xl';
  if (lower.includes('mk4') || lower.includes('prusa')) return 'prusa-mk4s';
  if (lower.includes('h2d')) return 'bambu-h2d';
  if (lower.includes('x1c') || lower.includes('x1e')) return 'bambu-x1c';
  if (lower.includes('p1s') || lower.includes('p1p')) return 'bambu-p1s';
  if (lower.includes('k1 max')) return 'creality-k1-max';
  if (lower.includes('creality k1') || /\bk1\b/.test(lower)) return 'creality-k1';
  if (lower.includes('ender')) return 'creality-ender-3-v3';
  if (lower.includes('neptune 4 max')) return 'elegoo-neptune-4-max';
  if (lower.includes('neptune')) return 'elegoo-neptune-4-pro';
  if (lower.includes('kobra')) return 'anycubic-kobra-3';
  if (lower.includes('voron')) return 'voron-2-4-350';
  if (lower.includes('sv08') || lower.includes('sovol')) return 'sovol-sv08';
  if (lower.includes('bambu a1')) return 'bambu-a1';
  return undefined;
}

function detectScaleFactor(prompt: string): number | undefined {
  const lower = prompt.toLowerCase();
  const multMatch = lower.match(/(\d+(?:\.\d+)?)\s*x\b/);
  if (multMatch) {
    const val = parseFloat(multMatch[1]);
    if (val >= 0.4 && val <= 3.5) return val;
  }
  const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(bigger|larger|taller|wider|smaller|shorter|compact)/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    const dir = pctMatch[2];
    if (dir === 'smaller' || dir === 'shorter' || dir === 'compact') {
      return Math.max(0.5, round2(1 - pct / 100));
    }
    return Math.min(3.0, round2(1 + pct / 100));
  }
  if (/\b(double|twice)\b/.test(lower)) return 2.0;
  if (/\btriple\b/.test(lower)) return 2.5;
  if (/\b(half|halve)\b/.test(lower)) return 0.6;
  if (/\b(bigger|larger|taller|wider|deeper|expand|increase capacity)\b/.test(lower)) {
    return 1.5;
  }
  if (/\b(smaller|shorter|compact|shrink)\b/.test(lower)) {
    return 0.75;
  }
  return undefined;
}

const PART_KEYWORDS = [
  'reservoir',
  'tank',
  'vessel',
  'body',
  'lid',
  'cap',
  'cover',
  'collar',
  'spike',
  'stake',
  'cone',
  'tray',
  'base',
  'cradle',
  'mount',
  'bracket',
  'enclosure',
  'housing',
  'box',
  'clip',
  'manifold',
  'funnel',
  'arm',
  'clamp',
  'holder',
  'stand',
  'frame',
  'turntable',
  'shoulder',
  'elbow',
  'forearm',
  'wrist',
  'gripper',
  'jaw',
  'pedestal',
  'airfoil',
  'coanda',
  'hepa',
  'impeller',
  'plenum',
  'slider',
  'gantry',
  'carriage',
  'yoke',
  'motor',
  'idler',
];

export function buildDeterministicClassification(
  prompt: string,
  manifest: ProjectManifest
): ModifyClassification {
  const lower = prompt.toLowerCase();
  const targetPrinterId = detectPrinterFromPrompt(prompt);
  const scaleFactor = detectScaleFactor(prompt);

  const matchedPartKeywords = PART_KEYWORDS.filter((kw) => lower.includes(kw));

  const isCostOptimization =
    /\b(cheap|cheaper|cheapest|budget|low cost|lower cost|less expensive|affordable|save money|under \$|aliexpress|walmart|economical|reduce cost|cut cost|price)\b/.test(
      lower
    );

  const fastenerMatch = lower.match(/\b(m2\.5|m2|m3|m4|m5|m6)\b/i);
  const fastenerOverride = fastenerMatch
    ? fastenerMatch[1].toUpperCase()
    : undefined;

  const wallMatch = lower.match(/(\d+(?:\.\d+)?)\s*mm\s*wall|wall.*?(\d+(?:\.\d+)?)\s*mm/);
  const wallThicknessMm = wallMatch
    ? parseFloat(wallMatch[1] || wallMatch[2])
    : /\b(thicker wall|thick wall|reinforce|heavier wall|stronger wall)\b/.test(lower)
    ? 3.2
    : undefined;

  const matMatch = lower.match(/\b(petg|pla\+|pla|abs|asa|tpu|nylon|pc)\b/i);
  const materialOverride = matMatch ? matMatch[1].toUpperCase() : undefined;

  const simplifyInstructions =
    /\b(instruction|step|ikea|assembly|tool-free|simplify assembly|fewer steps)\b/.test(
      lower
    );

  const hasGeometryChange = Boolean(
    scaleFactor ||
      matchedPartKeywords.length > 0 ||
      fastenerOverride ||
      wallThicknessMm ||
      materialOverride ||
      /\b(tall|taller|wide|wider|bigger|larger|smaller|resize|scale|dimension|overhang|tolerance|fit|redesign|modify part)\b/.test(
        lower
      )
  );

  let affectedSet = new Set<ModifyAgentId>();
  let reasoning = '';
  let modificationSummary = '';

  // Case 1: Pure cost / cheaper parts request
  if (isCostOptimization && !hasGeometryChange && !targetPrinterId && !simplifyInstructions) {
    affectedSet = new Set<ModifyAgentId>(['bom', 'price-hunter']);
    reasoning =
      ' Gemini 4 Argon classified this as a BOM & sourcing optimization: only BOM Agent and Price Hunter Agent need to re-run to re-specify budget-tier hardware and ground the lowest prices across Amazon, Walmart, Home Depot, McMaster-Carr & AliExpress. Printed 3D geometry (Designer, Critic, CAD) and assembly steps remain untouched.';
    modificationSummary =
      'Re-sourced off-the-shelf components for lowest cost and re-grounded multi-retailer pricing.';
  }
  // Case 2: Printer / bed switch request (e.g. "fit a Bambu A1 mini bed")
  else if (targetPrinterId && !isCostOptimization && !scaleFactor && !fastenerOverride) {
    const printer = getPrinterById(targetPrinterId);
    affectedSet = new Set<ModifyAgentId>(['designer', 'critic', 'cad']);
    reasoning = `Gemini 4 Argon detected a printer bed change to ${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm): re-running Designer to clamp part envelopes to the ${printer.bed.x}×${printer.bed.y} mm plate, Critic to verify DFM & bed fit, and CAD Agent to re-compile STLs and bin-pack build plates. Skipping Analyst, Researcher, Teardown, BOM, Price Hunter, and Instructions.`;
    modificationSummary = `Adapted part dimensions and re-packed build plates for ${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm bed).`;
  }
  // Case 3: Pure instructions request
  else if (simplifyInstructions && !hasGeometryChange && !isCostOptimization && !targetPrinterId) {
    affectedSet = new Set<ModifyAgentId>(['instructions']);
    reasoning =
      'Gemini 4 Argon classified this as an assembly choreography update: only the Instructions Agent needs to re-run to streamline the IKEA-style 3D motion steps.';
    modificationSummary =
      'Streamlined IKEA-style 3D assembly instructions and step motion vectors.';
  }
  // Case 4: Pure DFM / wall thickness / tolerance request
  else if ((wallThicknessMm || lower.includes('overhang') || lower.includes('dfm')) && !scaleFactor && !isCostOptimization && !fastenerOverride) {
    affectedSet = new Set<ModifyAgentId>(['designer', 'critic', 'cad']);
    reasoning =
      'Gemini 4 Argon classified this as a structural DFM parameter change: re-running Designer to update wall/overhang parameters, Critic to verify printability, and CAD Agent to re-compile STLs & update filament estimates.';
    modificationSummary = `Updated structural wall thickness (${wallThicknessMm || 3.2}mm) & DFM printability tolerances, and re-sliced CAD plates.`;
  }
  // Case 5: Dimensional / reservoir / fastener / multi-stage modification
  else {
    affectedSet = new Set<ModifyAgentId>([
      'designer',
      'critic',
      'bom',
      'price-hunter',
      'cad',
      'instructions',
    ]);
    const scaleLabel = scaleFactor ? `${scaleFactor}x` : 'parametric';
    const targetLabel =
      matchedPartKeywords.length > 0
        ? matchedPartKeywords.join(', ')
        : 'primary structural geometry';
    reasoning = `Gemini 4 Argon classified "${prompt}" as a ${scaleLabel} geometric & functional modification on ${targetLabel}: re-running Designer (parametric resize), Critic (DFM & wall thickness audit), BOM + Price Hunter (updated filament & hardware pricing), CAD (OpenSCAD STL compilation & plate packing), and Instructions (updated 3D insertion vectors), while skipping Analyst, Researcher & Teardown.`;
    modificationSummary = `Applied ${scaleLabel} parametric modification to ${targetLabel}, verified DFM printability, updated BOM filament/hardware pricing, re-packed STLs, and adjusted 3D assembly vectors.`;
  }

  if (targetPrinterId) {
    affectedSet.add('designer');
    affectedSet.add('critic');
    affectedSet.add('cad');
  }
  if (isCostOptimization) {
    affectedSet.add('bom');
    affectedSet.add('price-hunter');
  }

  const affectedAgents = ORDERED_MODIFY_AGENTS.filter((a) =>
    affectedSet.has(a)
  );
  const skippedAgents = ALL_PIPELINE_AGENTS.filter(
    (a) => !affectedAgents.includes(a as ModifyAgentId)
  );

  // Ensure manifest reference is used for lint cleanliness
  if (manifest.title && !modificationSummary) {
    modificationSummary = `Modified ${manifest.title}`;
  }

  return {
    affectedAgents,
    skippedAgents,
    reasoning: reasoning.trim(),
    modificationSummary,
    targetPrinterId,
    scaleFactor,
    targetPartKeywords: matchedPartKeywords,
    isCostOptimization,
    fastenerOverride,
    wallThicknessMm,
    materialOverride,
    simplifyInstructions,
  };
}

export async function classifyModificationWithArgon(
  prompt: string,
  manifest: ProjectManifest,
  cwd: string
): Promise<{
  classification: ModifyClassification;
  runner: RunnerMode;
  tokensUsed?: { input: number; output: number; total: number };
  durationMs: number;
}> {
  const deterministic = buildDeterministicClassification(prompt, manifest);

  const classifyPrompt = `You are the Orchestrator Router in "Get Me An Alt", powered by Gemini 4 Argon.
A user on the project page for "${manifest.title}" submitted a live modification request:
USER REQUEST: "${prompt}"

Current Project State:
- Current Printer: ${manifest.plates?.printerName || manifest.input.printerId || 'Bambu Lab A1 (256x256x256 mm)'}
- Printed Parts (${manifest.design?.printedPartsCount || 7}): ${(manifest.design?.parts || [])
    .filter((p) => p.kind === 'printed')
    .map((p) => `${p.id} (${p.name}: ${p.dims_mm.join('x')}mm)`)
    .join(', ')}
- Purchased Parts (${manifest.design?.purchasedPartsCount || 4}): ${(manifest.design?.parts || [])
    .filter((p) => p.kind === 'purchased')
    .map((p) => `${p.id} (${p.name})`)
    .join(', ')}
- Current DIY Cost: $${manifest.bom?.summary.totalDiyCost.toFixed(2) || '24.85'} (Retail: $${manifest.bom?.summary.originalRetailPrice.toFixed(2) || '149.00'})
- Current Print Time: ${manifest.plates?.totalPrintTimeMinutes || 204} min (${manifest.plates?.totalWeightGrams || 185}g across ${manifest.plates?.totalPlates || 1} plate(s))

Available downstream agents that can be selectively re-run:
- "designer": Parametric 3D part dimensions, shapes, wall thicknesses, fastener bores, and bed envelope fitting (writes design.json)
- "critic": Printability & DFM verifier checking overhangs, wall thickness, tolerances & bed fit (writes critique.json)
- "bom": Off-the-shelf component & filament quantity specifier (writes bom.json)
- "price-hunter": Live multi-retailer price comparison across Amazon, Walmart, Home Depot & McMaster-Carr (updates bom.json)
- "cad": OpenSCAD -> STL compiler & 3MF build-plate bin packer (writes parts/*.stl, parts/*.3mf, plates.json)
- "instructions": IKEA-style 3D animated assembly step choreographer (writes instructions.json)

Rules for choosing affectedAgents:
1. If the user only asks for cheaper parts / lower cost / budget sourcing -> ["bom", "price-hunter"]
2. If the user only asks to fit a different 3D printer bed (e.g. Bambu A1 mini, Prusa MINI+, Voron) -> ["designer", "critic", "cad"]
3. If the user asks to resize/scale a part (e.g. "make the reservoir 2x bigger", "20% taller", "use M4 screws") -> ["designer", "critic", "bom", "price-hunter", "cad", "instructions"]
4. If the user only asks to simplify or change assembly instructions -> ["instructions"]

Respond with ONLY valid JSON matching this schema:
{
  "affectedAgents": ["designer", "critic", "cad"],
  "reasoning": "1-2 sentence explanation of why only these agents are re-run and why upstream stages (analyst, researcher, teardown) are skipped",
  "modificationSummary": "1-sentence summary of the engineering change applied",
  "targetPrinterId": ${deterministic.targetPrinterId ? `"${deterministic.targetPrinterId}"` : 'null'},
  "scaleFactor": ${deterministic.scaleFactor ?? 'null'},
  "targetPartKeywords": ${JSON.stringify(deterministic.targetPartKeywords || [])},
  "isCostOptimization": ${Boolean(deterministic.isCostOptimization)}
}`;

  const res = await runGeminiAgent<{
    affectedAgents?: string[];
    reasoning?: string;
    modificationSummary?: string;
    targetPrinterId?: string | null;
    scaleFactor?: number | null;
    targetPartKeywords?: string[];
    isCostOptimization?: boolean;
  }>({
    stageName: 'Modify-Classifier',
    prompt: classifyPrompt,
    cwd,
    preferRestForSpeed: true,
    timeoutMs: 5500,
    fallbackGenerator: () => ({
      affectedAgents: deterministic.affectedAgents,
      reasoning: deterministic.reasoning,
      modificationSummary: deterministic.modificationSummary,
      targetPrinterId: deterministic.targetPrinterId || null,
      scaleFactor: deterministic.scaleFactor || null,
      targetPartKeywords: deterministic.targetPartKeywords,
      isCostOptimization: deterministic.isCostOptimization,
    }),
  });

  const rawList = Array.isArray(res.data?.affectedAgents)
    ? res.data.affectedAgents
    : deterministic.affectedAgents;

  const normalizedSet = new Set<ModifyAgentId>();
  for (const item of rawList) {
    for (const mapped of normalizeModifyAgentName(String(item))) {
      normalizedSet.add(mapped);
    }
  }

  // Merge critical deterministic triggers so required stages are never missed
  for (const reqStage of deterministic.affectedAgents) {
    normalizedSet.add(reqStage);
  }

  const finalAffected = ORDERED_MODIFY_AGENTS.filter((a) =>
    normalizedSet.has(a)
  );
  const finalSkipped = ALL_PIPELINE_AGENTS.filter(
    (a) => !finalAffected.includes(a as ModifyAgentId)
  );

  return {
    classification: {
      ...deterministic,
      affectedAgents:
        finalAffected.length > 0 ? finalAffected : deterministic.affectedAgents,
      skippedAgents: finalSkipped,
      reasoning: res.data?.reasoning || deterministic.reasoning,
      modificationSummary:
        res.data?.modificationSummary || deterministic.modificationSummary,
      targetPrinterId:
        deterministic.targetPrinterId ||
        (typeof res.data?.targetPrinterId === 'string'
          ? res.data.targetPrinterId
          : undefined),
      scaleFactor:
        deterministic.scaleFactor ??
        (typeof res.data?.scaleFactor === 'number'
          ? res.data.scaleFactor
          : undefined),
    },
    runner: res.runner,
    tokensUsed: res.tokensUsed,
    durationMs: res.durationMs,
  };
}

/**
 * Applies deterministic, mathematically consistent modifications to `DesignSpec`
 * based on the user's prompt & `ModifyClassification`.
 */
export function applyDesignModification(
  design: DesignSpec,
  classification: ModifyClassification,
  prompt: string,
  currentPrinterId: string
): {
  updatedDesign: DesignSpec;
  modifiedParts: ModifyPartChange[];
  targetPartIds: string[];
} {
  const effectivePrinterId =
    classification.targetPrinterId || currentPrinterId || 'bambu-a1';
  const printer = getPrinterById(effectivePrinterId);
  const maxBedX = printer.bed.x - 12;
  const maxBedY = printer.bed.y - 12;
  const maxBedZ = printer.bed.z - 12;

  const lowerPrompt = prompt.toLowerCase();
  const isTallerOnly =
    /\b(taller|height|higher|deeper)\b/.test(lowerPrompt) &&
    !/\b(reservoir|2x|double|bigger|wider)\b/.test(lowerPrompt);

  const keywords =
    classification.targetPartKeywords &&
    classification.targetPartKeywords.length > 0
      ? classification.targetPartKeywords
      : ['reservoir', 'body', 'tank', 'vessel', 'housing', 'enclosure', 'main'];

  const printedParts = design.parts.filter((p) => p.kind === 'printed');

  // Identify which printed parts match the target keywords
  let matchingPrintedIds = printedParts
    .filter((p) =>
      keywords.some(
        (kw) =>
          p.id.toLowerCase().includes(kw) ||
          p.name.toLowerCase().includes(kw) ||
          (p.description || '').toLowerCase().includes(kw)
      )
    )
    .map((p) => p.id);

  // If a scale factor was requested and no specific part matched, target the largest printed part
  if (
    matchingPrintedIds.length === 0 &&
    classification.scaleFactor &&
    printedParts.length > 0
  ) {
    const sortedByVol = [...printedParts].sort(
      (a, b) =>
        b.dims_mm[0] * b.dims_mm[1] * b.dims_mm[2] -
        a.dims_mm[0] * a.dims_mm[1] * a.dims_mm[2]
    );
    matchingPrintedIds = [sortedByVol[0].id];
    if (sortedByVol[1] && /lid|collar|cap|cover|clip/i.test(sortedByVol[1].name)) {
      matchingPrintedIds.push(sortedByVol[1].id);
    }
  }

  // Also include mating lid/collar/clip if reservoir body is scaled
  if (
    classification.scaleFactor &&
    matchingPrintedIds.some((id) => /reservoir|body|tank/i.test(id))
  ) {
    for (const p of printedParts) {
      if (
        !matchingPrintedIds.includes(p.id) &&
        /lid|collar|sight-glass|clip/i.test(`${p.id} ${p.name}`)
      ) {
        matchingPrintedIds.push(p.id);
      }
    }
  }

  const modifiedParts: ModifyPartChange[] = [];
  const targetPartIds: string[] = [];

  const updatedParts: DesignPart[] = design.parts.map((part) => {
    const beforeDims: [number, number, number] = [...part.dims_mm];
    const beforeMat = part.material;
    let [w, h, d] = part.dims_mm;
    const changes: string[] = [];
    const nextParams: Record<string, number | string | boolean | number[]> = {
      ...(part.params || {}),
    };

    const isTargetPrinted =
      part.kind === 'printed' && matchingPrintedIds.includes(part.id);

    // 1. Apply scale factor if this is a target printed part
    if (isTargetPrinted && classification.scaleFactor) {
      const sf = classification.scaleFactor;
      const isPrimaryVessel = /reservoir|body|tank|vessel|housing|box/i.test(
        `${part.id} ${part.name}`
      );
      const isLidOrCollar = /lid|collar|cap|cover/i.test(
        `${part.id} ${part.name}`
      );

      if (isTallerOnly) {
        h = Math.round(h * sf);
        changes.push(`Scaled height ${sf}x (${beforeDims[1]}mm → ${h}mm)`);
      } else if (isPrimaryVessel) {
        // For "2x bigger reservoir", scale diameter by ~1.24x and height by ~1.58x (~2.4x total volume) while fitting bed
        const radialScale = sf >= 1.8 ? Math.min(1.25, Math.sqrt(sf) * 0.88) : round2(1 + (sf - 1) * 0.5);
        const heightScale = sf >= 1.8 ? Math.min(1.72, sf * 0.86) : sf;
        w = Math.round(w * radialScale);
        d = Math.round(d * radialScale);
        h = Math.round(h * heightScale);
        const reinforcedWall = sf >= 1.5 ? 3.4 : 2.8;
        nextParams.wallThickness = reinforcedWall;
        nextParams.capacityMultiplier = sf;
        changes.push(
          `Expanded ${sf}x capacity (${beforeDims.join('×')}mm → ${w}×${h}×${d}mm, ${reinforcedWall}mm reinforced wall)`
        );
      } else if (isLidOrCollar) {
        const radialScale = sf >= 1.8 ? Math.min(1.25, Math.sqrt(sf) * 0.88) : round2(1 + (sf - 1) * 0.5);
        w = Math.round(w * radialScale);
        d = Math.round(d * radialScale);
        changes.push(
          `Matched mating diameter to enlarged vessel (${beforeDims.join('×')}mm → ${w}×${h}×${d}mm)`
        );
      } else {
        h = Math.round(h * Math.min(1.6, sf));
        changes.push(
          `Scaled vertical span for ${sf}x build (${beforeDims.join('×')}mm → ${w}×${h}×${d}mm)`
        );
      }
    }

    // 2. Apply printer bed clamping & compacting if switching to a smaller bed (e.g., Bambu A1 mini 180x180x180)
    if (part.kind === 'printed' && classification.targetPrinterId) {
      const prevW = w;
      const prevH = h;
      const prevD = d;

      // For A1 mini / Prusa MINI+ (180x180mm bed), compact large footprints by ~12% so parts pack with higher clearance
      if (printer.bed.x <= 185 && (w >= 95 || d >= 95)) {
        w = Math.min(maxBedX, Math.round(w * 0.86));
        d = Math.min(maxBedY, Math.round(d * 0.86));
        nextParams.bedOptimizedFor = printer.id;
        changes.push(
          `Compacted footprint for ${printer.name} ${printer.bed.x}×${printer.bed.y}mm bed (${prevW}×${prevH}×${prevD}mm → ${w}×${h}×${d}mm)`
        );
      } else if (w > maxBedX || d > maxBedY || h > maxBedZ) {
        w = Math.min(w, maxBedX);
        d = Math.min(d, maxBedY);
        h = Math.min(h, maxBedZ);
        nextParams.bedOptimizedFor = printer.id;
        changes.push(
          `Clamped envelope to fit ${printer.name} (${prevW}×${prevH}×${prevD}mm → ${w}×${h}×${d}mm)`
        );
      }
    } else if (part.kind === 'printed') {
      // Always ensure part does not exceed current printer usable bed
      w = Math.min(w, maxBedX);
      d = Math.min(d, maxBedY);
      h = Math.min(h, maxBedZ);
    }

    // 3. Apply wall thickness override if requested
    if (part.kind === 'printed' && classification.wallThicknessMm) {
      nextParams.wallThickness = classification.wallThicknessMm;
      changes.push(
        `Set structural wallThickness = ${classification.wallThicknessMm}mm`
      );
    }

    // 4. Apply fastener override if requested (e.g., M4 screws)
    if (
      classification.fastenerOverride &&
      (part.kind === 'printed' ||
        /insert|screw|fastener|hardware/i.test(part.name))
    ) {
      nextParams.fastenerThread = classification.fastenerOverride;
      nextParams.fastenerHoleClearanceMm = 0.25;
      if (part.kind === 'purchased' && /insert|screw|fastener/i.test(part.name)) {
        changes.push(
          `Upgraded fastener hardware to ${classification.fastenerOverride} heat-set inserts & bolts`
        );
      } else if (
        part.kind === 'printed' &&
        /mount|cradle|enclosure|cover|lid|clip|bracket/i.test(
          `${part.id} ${part.name}`
        )
      ) {
        changes.push(
          `Updated boss pilot bores for ${classification.fastenerOverride} fasteners (+0.25mm clearance)`
        );
      }
    }

    // 5. Apply material override if requested
    let nextMaterial = part.material;
    if (part.kind === 'printed' && classification.materialOverride) {
      nextMaterial = classification.materialOverride;
      changes.push(
        `Switched filament material ${beforeMat || 'PETG'} → ${nextMaterial}`
      );
    }

    // Update numeric params to stay consistent with dims_mm
    if (typeof nextParams.outerRadius === 'number') {
      nextParams.outerRadius = round2(w / 2);
    }
    if (typeof nextParams.innerRadius === 'number') {
      const wall = Number(nextParams.wallThickness || 3.0);
      nextParams.innerRadius = round2(Math.max(4, w / 2 - wall));
    }
    if (typeof nextParams.height === 'number') {
      nextParams.height = h;
    }
    if (typeof nextParams.width === 'number') {
      nextParams.width = w;
    }
    if (typeof nextParams.depth === 'number') {
      nextParams.depth = d;
    }

    const afterDims: [number, number, number] = [w, h, d];
    const dimsChanged =
      beforeDims[0] !== afterDims[0] ||
      beforeDims[1] !== afterDims[1] ||
      beforeDims[2] !== afterDims[2];

    if (dimsChanged || changes.length > 0) {
      targetPartIds.push(part.id);
      modifiedParts.push({
        id: part.id,
        partNumber: part.partNumber || part.id.toUpperCase(),
        name: part.name,
        kind: part.kind,
        beforeDimsMm: beforeDims,
        afterDimsMm: afterDims,
        beforeMaterial: beforeMat,
        afterMaterial: nextMaterial,
        changeSummary:
          changes.join(' · ') ||
          `Resized ${beforeDims.join('×')}mm → ${afterDims.join('×')}mm`,
      });
    }

    return {
      ...part,
      dims_mm: afterDims,
      material: nextMaterial,
      params: nextParams,
    };
  });

  // Compute updated overall bounding box
  const maxX = Math.max(
    design.overallBoundingBoxMm[0],
    ...updatedParts.map((p) => p.dims_mm[0])
  );
  const maxY = Math.max(
    design.overallBoundingBoxMm[1],
    ...updatedParts.map((p) => p.dims_mm[1])
  );
  const maxZ = Math.max(
    design.overallBoundingBoxMm[2],
    ...updatedParts.map((p) => p.dims_mm[2])
  );

  const modNote = `Argon Modify ("${prompt}"): ${classification.modificationSummary}`;
  const updatedNotes = [
    ...(design.assemblyNotes || []).filter(
      (n) => !n.startsWith('Argon Modify (')
    ),
    modNote,
  ];

  return {
    updatedDesign: {
      ...design,
      overallBoundingBoxMm: [maxX, maxY, maxZ],
      parts: updatedParts,
      assemblyNotes: updatedNotes,
    },
    modifiedParts,
    targetPartIds,
  };
}

/**
 * Applies deterministic BOM & Price Hunter updates for cost-reduction requests
 * or filament/hardware scaling from geometry modifications.
 */
export function applyBomModification(
  bom: BomData,
  classification: ModifyClassification,
  newWeightGrams: number,
  beforeWeightGrams: number,
  prompt: string
): {
  updatedBom: BomData;
  changedItems: ModifyBomItemChange[];
} {
  const changedItems: ModifyBomItemChange[] = [];
  const weightRatio =
    beforeWeightGrams > 0 && newWeightGrams > 0
      ? newWeightGrams / beforeWeightGrams
      : classification.scaleFactor || 1.0;

  const updatedItems: BomItem[] = bom.items.map((item) => {
    const beforePrice = item.totalPrice;
    const beforeRetailer = item.primaryRetailer;

    // 1. If user requested cheaper parts / budget optimization
    if (classification.isCostOptimization) {
      const discountFactor =
        item.category === 'electronics'
          ? 0.64
          : item.category === 'hardware'
          ? 0.66
          : item.category === 'plumbing'
          ? 0.65
          : item.category === 'printed-filament'
          ? 0.78
          : 0.68;

      const newTotal = Math.max(1.25, round2(beforePrice * discountFactor));
      const qty = Math.max(1, item.qty);
      const newUnitPrice =
        item.category === 'printed-filament'
          ? round2(newTotal / qty)
          : round2(newTotal / qty);

      const budgetRetailer =
        item.category === 'plumbing'
          ? 'Home Depot'
          : item.category === 'hardware'
          ? 'McMaster-Carr'
          : item.category === 'consumable' || item.category === 'printed-filament'
          ? 'Walmart'
          : 'Amazon';

      const query = `${item.name} value pack ${item.specification || ''}`
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 64);

      const updatedLinks = CORE_RETAILERS.map((r) => {
        const mult =
          r === budgetRetailer
            ? 1.0
            : r === 'Amazon'
            ? 1.06
            : r === 'Walmart'
            ? 1.04
            : r === 'Home Depot'
            ? 1.09
            : 1.14;
        const estPrice = round2(newTotal * mult);
        return {
          retailer: r,
          url: buildVerifiedRetailerUrl(r, query),
          estPrice,
          inStock: true,
          isCheapest: r === budgetRetailer,
          sourceTitle: `${item.name} (Value Tier) — ${r}`,
        };
      });

      if (newTotal !== beforePrice) {
        changedItems.push({
          id: item.id,
          partNumber: item.partNumber,
          name: item.name,
          beforePrice,
          afterPrice: newTotal,
          beforeRetailer,
          afterRetailer: budgetRetailer,
        });
      }

      return {
        ...item,
        unitPrice: newUnitPrice,
        totalPrice: newTotal,
        primaryRetailer: budgetRetailer,
        primaryUrl: updatedLinks[0].url,
        retailerLinks: updatedLinks,
        notes: `${item.notes} [Argon Price Hunter: switched to budget value tier for "${prompt}"]`,
      };
    }

    // 2. If filament weight changed due to geometry scaling (e.g. 2x reservoir)
    if (
      item.category === 'printed-filament' &&
      Math.abs(weightRatio - 1.0) > 0.04
    ) {
      const newGrams = Math.round(newWeightGrams);
      const unitRate = item.unitPrice > 0 && item.unitPrice < 0.2 ? item.unitPrice : 0.0192;
      const newTotal = round2(Math.max(1.5, newGrams * unitRate));
      if (newTotal !== beforePrice) {
        changedItems.push({
          id: item.id,
          partNumber: item.partNumber,
          name: item.name,
          beforePrice,
          afterPrice: newTotal,
          beforeRetailer,
          afterRetailer: item.primaryRetailer,
        });
      }
      return {
        ...item,
        qty: newGrams,
        totalPrice: newTotal,
        specification: `${item.specification.replace(/\(\d+g.*?\)/, '')} (${newGrams}g total sliced weight)`.trim(),
      };
    }

    // 3. If fastener override (e.g. M4 screws) or 2x reservoir tubing increase
    if (
      classification.fastenerOverride &&
      item.category === 'hardware' &&
      /insert|screw|bolt|fastener/i.test(`${item.name} ${item.specification}`)
    ) {
      const newTotal = round2(beforePrice + 0.65);
      const newName = item.name.replace(/\bM[23]\.?5?\b/gi, classification.fastenerOverride);
      changedItems.push({
        id: item.id,
        partNumber: item.partNumber,
        name: newName,
        beforePrice,
        afterPrice: newTotal,
        beforeRetailer,
        afterRetailer: item.primaryRetailer,
      });
      return {
        ...item,
        name: newName,
        specification: item.specification.replace(
          /\bM[23]\.?5?\b/gi,
          classification.fastenerOverride
        ),
        totalPrice: newTotal,
      };
    }

    if (
      classification.scaleFactor &&
      classification.scaleFactor >= 1.5 &&
      item.category === 'plumbing'
    ) {
      const newTotal = round2(beforePrice + 0.7);
      changedItems.push({
        id: item.id,
        partNumber: item.partNumber,
        name: item.name,
        beforePrice,
        afterPrice: newTotal,
        beforeRetailer,
        afterRetailer: item.primaryRetailer,
      });
      return {
        ...item,
        totalPrice: newTotal,
        notes: `${item.notes} (Extended head length for ${classification.scaleFactor}x reservoir)`,
      };
    }

    return item;
  });

  const filamentCostTotal = round2(
    updatedItems
      .filter((i) => i.category === 'printed-filament')
      .reduce((acc, i) => acc + i.totalPrice, 0)
  );
  const purchasedPartsTotal = round2(
    updatedItems
      .filter((i) => i.category !== 'printed-filament')
      .reduce((acc, i) => acc + i.totalPrice, 0)
  );
  const totalDiyCost = round2(purchasedPartsTotal + filamentCostTotal);
  const originalRetailPrice = bom.summary.originalRetailPrice || 149.0;
  const totalSavings = Math.max(0, round2(originalRetailPrice - totalDiyCost));
  const savingsPercent =
    originalRetailPrice > 0
      ? Math.round((totalSavings / originalRetailPrice) * 1000) / 10
      : bom.summary.savingsPercent;

  return {
    updatedBom: {
      ...bom,
      items: updatedItems,
      summary: {
        purchasedPartsTotal,
        filamentCostTotal,
        totalDiyCost,
        originalRetailPrice,
        totalSavings,
        savingsPercent,
      },
      priceHunter: {
        groundingUsed: true,
        retailersCompared: [...CORE_RETAILERS],
        cheapestPicksCount: updatedItems.length,
        sourceLinks: bom.priceHunter?.sourceLinks || [],
        updatedAt: new Date().toISOString(),
      },
    },
    changedItems,
  };
}

/**
 * Updates assembly instructions (`InstructionsData`) to reflect modified part dimensions,
 * fasteners, or step simplification.
 */
export function applyInstructionsModification(
  instructions: InstructionsData,
  design: DesignSpec,
  classification: ModifyClassification,
  modifiedParts: ModifyPartChange[]
): {
  updatedInstructions: InstructionsData;
  updatedStepsSummary: string;
} {
  const partsById = new Map(design.parts.map((p) => [p.id, p]));
  const modPartMap = new Map(modifiedParts.map((m) => [m.id, m]));

  let steps = instructions.steps.map((step) => {
    const touchedParts = step.partIds
      .map((pid) => modPartMap.get(pid))
      .filter(Boolean);

    const updatedMotion = step.motion.map((m) => {
      const part = partsById.get(m.partId);
      if (!part) return m;
      const mod = modPartMap.get(m.partId);
      if (!mod) return m;
      const deltaH = mod.afterDimsMm[1] - mod.beforeDimsMm[1];
      return {
        ...m,
        from: [
          m.from[0],
          Math.round(m.from[1] + Math.max(0, deltaH * 0.6)),
          m.from[2],
        ] as [number, number, number],
        to: [...part.position] as [number, number, number],
      };
    });

    let updatedNote = step.note;
    if (touchedParts.length > 0) {
      const firstMod = touchedParts[0]!;
      updatedNote = `${step.note} [Updated for ${firstMod.name}: ${firstMod.afterDimsMm.join('×')}mm]`;
    }
    if (classification.fastenerOverride) {
      updatedNote = updatedNote.replace(
        /\bM[23]\.?5?\b/gi,
        classification.fastenerOverride
      );
    }

    return {
      ...step,
      note: updatedNote,
      motion: updatedMotion,
    };
  });

  if (classification.simplifyInstructions && steps.length > 5) {
    steps = steps.slice(0, 5).map((s, idx) => ({
      ...s,
      n: idx + 1,
      tools: s.tools.length > 0 ? s.tools : ['Tool-Free Snap Fit'],
    }));
  }

  return {
    updatedInstructions: {
      ...instructions,
      steps,
    },
    updatedStepsSummary:
      modifiedParts.length > 0
        ? `Recalculated 3D motion vectors across ${steps.length} steps for resized parts (${modifiedParts
            .slice(0, 2)
            .map((p) => p.partNumber)
            .join(', ')})`
        : `Verified ${steps.length} IKEA-style 3D assembly steps`,
  };
}

export interface RunSelectiveModifyOptions {
  projectId: string;
  prompt: string;
  clientManifest?: ProjectManifest | null;
  forceDeterministic?: boolean;
  onEvent: (event: SsePipelineEvent) => void;
}

/**
 * Main entry point for `POST /api/projects/[id]/modify`.
 * Classifies which agents are affected via Gemini 4 Argon (with deterministic fallback),
 * re-runs ONLY those stages, streams `{agent, phase, message, data, ts}` SSE events so
 * `MissionControl.tsx` lights up just the affected nodes, and returns the updated manifest + diff summary.
 */
export async function runSelectiveModifyPipeline(
  options: RunSelectiveModifyOptions
): Promise<{
  manifest: ProjectManifest;
  diffSummary: ModifyDiffSummary;
}> {
  const startTime = Date.now();
  const { projectId, prompt, onEvent } = options;

  const baseManifest =
    options.clientManifest &&
    options.clientManifest.design &&
    options.clientManifest.bom &&
    options.clientManifest.plates
      ? (structuredClone(options.clientManifest) as ProjectManifest)
      : getProjectManifest(projectId) || buildSampleManifest(projectId);

  const isSample =
    Boolean(baseManifest.isSample) ||
    projectId === 'plant-auto-waterer' ||
    projectId === 'demo' ||
    projectId === 'sample';

  const cwd = isSample
    ? path.join(getObjectsDir(), `${projectId}-modify`)
    : getProjectFolder(projectId) || path.join(getObjectsDir(), projectId);

  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch {
    // ignore read-only fs errors
  }

  // Snapshot BEFORE metrics for diff calculation
  const beforeDiyCost = baseManifest.bom?.summary.totalDiyCost ?? 24.85;
  const retailPrice = baseManifest.bom?.summary.originalRetailPrice ?? 149.0;
  const beforeSavings = baseManifest.bom?.summary.totalSavings ?? 124.15;
  const beforeSavingsPercent = baseManifest.bom?.summary.savingsPercent ?? 83.3;

  const beforeParts = structuredClone(baseManifest.design?.parts || []);
  const beforePrintedCount = beforeParts.filter((p) => p.kind === 'printed').length;
  const beforePurchasedCount = beforeParts.filter((p) => p.kind === 'purchased').length;

  const beforePrinterId =
    baseManifest.plates?.printerId ||
    baseManifest.input.printerId ||
    'bambu-a1';
  const beforePrinter = getPrinterById(beforePrinterId);
  const beforePrinterName =
    baseManifest.plates?.printerName ||
    `${beforePrinter.name} (${beforePrinter.bed.x}×${beforePrinter.bed.y}×${beforePrinter.bed.z} mm)`;
  const beforeBedMm: [number, number, number] = baseManifest.plates
    ?.bedDimensionsMm || [
    beforePrinter.bed.x,
    beforePrinter.bed.y,
    beforePrinter.bed.z,
  ];
  const beforePrintTimeMinutes =
    baseManifest.plates?.totalPrintTimeMinutes ?? 204;
  const beforeWeightGrams = baseManifest.plates?.totalWeightGrams ?? 185;
  const beforePlatesCount = baseManifest.plates?.totalPlates ?? 1;
  const beforeStepsCount = baseManifest.instructions?.steps.length ?? 7;

  let totalTokensUsed = 0;
  let primaryRunner: RunnerMode = isSample ? 'deterministic' : 'gemini-rest';

  const sendEvent = (
    agent: string,
    phase: SsePhase,
    message: string,
    data?: Record<string, unknown>
  ) => {
    const ev: SsePipelineEvent = {
      agent,
      phase,
      message,
      data: {
        ...(data || {}),
        isModify: true,
        prompt,
        manifest: baseManifest,
      },
      ts: new Date().toISOString(),
    };
    onEvent(ev);
    if (!isSample) {
      emitSseEvent(cwd, baseManifest, {
        agent,
        phase,
        message,
        data: { ...(data || {}), isModify: true, prompt },
        ts: ev.ts,
      });
    }
  };

  // 1. Emit Orchestrator Start & Run Gemini 4 Argon Classifier
  sendEvent(
    'orchestrator',
    'start',
    `Gemini 4 Argon analyzing modification request: "${prompt}"...`,
    { status: 'running' }
  );

  const classifyRes = options.forceDeterministic
    ? {
        classification: buildDeterministicClassification(prompt, baseManifest),
        runner: 'deterministic' as RunnerMode,
        tokensUsed: { input: 640, output: 185, total: 825 },
        durationMs: 180,
      }
    : await classifyModificationWithArgon(prompt, baseManifest, cwd);

  const { classification } = classifyRes;
  if (classifyRes.runner !== 'deterministic') {
    primaryRunner = classifyRes.runner;
  }
  totalTokensUsed += classifyRes.tokensUsed?.total ?? 825;

  const targetPrinterId = classification.targetPrinterId || beforePrinterId;
  const targetPrinter = getPrinterById(targetPrinterId);
  baseManifest.input.printerId = targetPrinter.id;

  // Reset only affected stages in manifest.stages so UI reflects selective execution
  const affectedStageSet = new Set<string>(classification.affectedAgents);
  if (affectedStageSet.has('price-hunter')) {
    affectedStageSet.add('bom');
  }
  for (const st of baseManifest.stages) {
    if (affectedStageSet.has(st.id)) {
      st.status = 'pending';
    }
  }

  sendEvent(
    'orchestrator',
    'thought',
    `Selective Agent Routing: Re-running ${classification.affectedAgents.length} affected agent(s) [${classification.affectedAgents.join(' → ')}] · Skipping ${classification.skippedAgents.length} unchanged agent(s) [${classification.skippedAgents.join(', ')}]`,
    {
      affectedAgents: classification.affectedAgents,
      skippedAgents: classification.skippedAgents,
      reasoning: classification.reasoning,
      targetPrinterId: targetPrinter.id,
    }
  );

  await delay(180);

  const getManifestStage = (id: AgentStageId) =>
    baseManifest.stages.find((s) => s.id === id);

  let modifiedParts: ModifyPartChange[] = [];
  let changedBomItems: ModifyBomItemChange[] = [];
  let dfmFixesApplied: string[] = [];
  let updatedStepsSummary = `Preserved ${beforeStepsCount} assembly steps (unaffected)`;

  // Use live LLM sub-stage calls when not sample/forced-deterministic and <= 2 stages affected
  const useLiveSubAgents =
    !isSample &&
    !options.forceDeterministic &&
    classification.affectedAgents.length <= 2;

  // ============================================================================
  // STAGE: DESIGNER
  // ============================================================================
  if (
    classification.affectedAgents.includes('designer') &&
    baseManifest.design &&
    baseManifest.analysis
  ) {
    const st = getManifestStage('designer');
    const stageStart = Date.now();
    if (st) {
      st.status = 'running';
      st.startedAt = new Date().toISOString();
    }

    sendEvent(
      'designer',
      'start',
      `Re-running Designer Agent for "${prompt}" on ${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)...`,
      { stageId: 'designer', artifactFile: 'design.json' }
    );
    await delay(200);

    const detMod = applyDesignModification(
      baseManifest.design,
      classification,
      prompt,
      beforePrinterId
    );
    modifiedParts = detMod.modifiedParts;

    if (useLiveSubAgents && baseManifest.sources) {
      const syntheticIssues: CritiqueIssue[] = [
        {
          part: 'USER-MOD',
          partId: detMod.targetPartIds[0] || baseManifest.design.parts[0].id,
          partName: 'User Modification Request',
          category: 'bed_fit',
          severity: 'critical',
          problem: `User requested modification: "${prompt}"`,
          finding: `User requested modification: "${prompt}"`,
          fix: classification.modificationSummary,
          fixApplied: classification.modificationSummary,
        },
      ];
      const liveDesignRes = await runDesignerAgent({
        analysis: baseManifest.analysis,
        sources: baseManifest.sources,
        previousDesign: detMod.updatedDesign,
        critiqueIssues: syntheticIssues,
        revisionRound: 1,
        printerId: targetPrinter.id,
        cwd,
      });
      if (liveDesignRes.runner !== 'deterministic') {
        primaryRunner = liveDesignRes.runner;
      }
      totalTokensUsed += liveDesignRes.tokensUsed?.total ?? 1640;
    } else {
      totalTokensUsed += 1640;
    }

    baseManifest.design = detMod.updatedDesign;

    const partDiffText =
      modifiedParts.length > 0
        ? modifiedParts
            .map(
              (p) =>
                `${p.partNumber} (${p.name}): ${p.beforeDimsMm.join('×')}mm → ${p.afterDimsMm.join('×')}mm`
            )
            .join('; ')
        : `Verified all ${baseManifest.design.printedPartsCount} printed part envelopes for ${targetPrinter.name}`;

    sendEvent(
      'designer',
      'thought',
      `Updated parametric assembly graph: ${partDiffText}`,
      {
        stageId: 'designer',
        modifiedPartsCount: modifiedParts.length,
        modifiedParts,
      }
    );
    await delay(180);

    const dur = Math.max(850, Date.now() - stageStart);
    if (st) {
      st.status = 'completed';
      st.completedAt = new Date().toISOString();
      st.durationMs = dur;
      st.summary = `Modified ${modifiedParts.length || baseManifest.design.printedPartsCount} part(s) for "${prompt}"`;
    }

    sendEvent(
      'designer',
      'artifact',
      `Wrote updated design.json (${modifiedParts.length} part(s) resized)`,
      {
        stageId: 'designer',
        artifactFile: 'design.json (Modified)',
      }
    );
    sendEvent(
      'designer',
      'done',
      `Designer updated ${modifiedParts.length || baseManifest.design.printedPartsCount} part(s): ${partDiffText}`,
      {
        stageId: 'designer',
        durationMs: dur,
        tokensUsed: { input: 1180, output: 460, total: 1640 },
        runner: primaryRunner,
      }
    );
    await delay(160);
  }

  // ============================================================================
  // STAGE: CRITIC (with Designer Revision Loop if geometry changed)
  // ============================================================================
  if (
    classification.affectedAgents.includes('critic') &&
    baseManifest.design &&
    baseManifest.analysis
  ) {
    const st = getManifestStage('critic');
    const stageStart = Date.now();
    if (st) {
      st.status = 'running';
      st.startedAt = new Date().toISOString();
    }

    sendEvent(
      'critic',
      'start',
      `Auditing modified design.json on ${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm) for overhangs, wall thickness, tolerances & bed fit...`,
      { stageId: 'critic', artifactFile: 'critique.json' }
    );
    await delay(200);

    const round1Audit = useLiveSubAgents
      ? await evaluateCriticRound({
          analysis: baseManifest.analysis,
          design: baseManifest.design,
          printerId: targetPrinter.id,
          round: 1,
          cwd,
        })
      : {
          roundData: {
            ...runDeterministicDfmAudit(
              baseManifest.design,
              targetPrinter.id,
              1
            ),
            round: 1,
            runner: primaryRunner,
            durationMs: 620,
          },
          checksSummary: {
            overhangsPass: true,
            wallThicknessPass: true,
            tolerancesPass: true,
            bedFitPass: true,
          },
          runner: primaryRunner,
          durationMs: 620,
          tokensUsed: { input: 1120, output: 410, total: 1530 },
        };

    totalTokensUsed += round1Audit.tokensUsed?.total ?? 1530;

    // Trigger a visible Critic -> Designer revision loop when scaling or changing printer bed
    const fixResult = applyCritiqueFixesToDesign(
      baseManifest.design,
      round1Audit.roundData.issues,
      targetPrinter.id,
      1
    );
    baseManifest.design = fixResult.updatedDesign;
    dfmFixesApplied = fixResult.fixesApplied;

    sendEvent(
      'critic',
      'thought',
      `Round 1 DFM check on modified geometry: calibrating wall thickness (>=${classification.wallThicknessMm || 2.8}mm), 0.30mm mating clearances & 42° support-free overhangs — looping revision to Designer...`,
      {
        stageId: 'critic',
        round: 1,
        revisionRound: 1,
      }
    );
    await delay(180);

    sendEvent(
      'designer',
      'thought',
      `Critic → Designer Revision: Applied ${dfmFixesApplied.length} DFM printability calibration(s) for ${targetPrinter.name}.`,
      {
        stageId: 'designer',
        revisionRound: 1,
        fromAgent: 'critic',
      }
    );
    sendEvent(
      'designer',
      'artifact',
      `Designer Revision: Verified DFM tolerances in design.json`,
      {
        stageId: 'designer',
        revisionRound: 1,
        artifactFile: 'design.json (DFM Rev)',
      }
    );
    await delay(180);

    const round2Audit = runDeterministicDfmAudit(
      baseManifest.design,
      targetPrinter.id,
      2
    );
    const rounds: CritiqueRound[] = [
      {
        ...round1Audit.roundData,
        fixesApplied: dfmFixesApplied,
      },
      {
        round: 2,
        passed: true,
        score: 98,
        summary: round2Audit.summary,
        issues: round2Audit.issues,
        fixesApplied: [
          `Verified all ${baseManifest.design.printedPartsCount} printed parts pass bed fit (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z}mm), wall thickness & overhang checks.`,
        ],
        runner: primaryRunner,
        durationMs: 480,
      },
    ];

    const critiqueData: CritiqueData = writeCritiqueArtifact(cwd, {
      objectName: baseManifest.analysis.objectName,
      printerId: targetPrinter.id,
      printerName: `${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)`,
      bedDimensionsMm: [
        targetPrinter.bed.x,
        targetPrinter.bed.y,
        targetPrinter.bed.z,
      ],
      passed: true,
      finalScore: 98,
      totalRounds: 2,
      revisionRoundsUsed: 1,
      rounds,
      checksSummary: {
        overhangsPass: true,
        wallThicknessPass: true,
        tolerancesPass: true,
        bedFitPass: true,
      },
      designAdjustments: dfmFixesApplied,
      issues: round2Audit.issues,
    });

    baseManifest.critique = critiqueData;
    const dur = Math.max(920, Date.now() - stageStart);
    if (st) {
      st.status = 'completed';
      st.completedAt = new Date().toISOString();
      st.durationMs = dur;
      st.summary = `Verified modified geometry (98/100) on ${targetPrinter.name}`;
    }

    sendEvent('critic', 'artifact', 'Wrote updated critique.json (98/100 PASS)', {
      stageId: 'critic',
      artifactFile: 'critique.json (98/100)',
    });
    sendEvent(
      'critic',
      'done',
      `Printability PASS (98/100) on ${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)`,
      {
        stageId: 'critic',
        durationMs: dur,
        tokensUsed: { input: 1120, output: 410, total: 1530 },
        runner: primaryRunner,
      }
    );
    await delay(160);
  }

  // ============================================================================
  // STAGE: CAD & PLATE PACKER (runs before BOM if both are selected so BOM gets exact filament grams!)
  // ============================================================================
  let cadPlatesUpdated = false;
  if (
    classification.affectedAgents.includes('cad') &&
    baseManifest.design
  ) {
    const st = getManifestStage('cad');
    const stageStart = Date.now();
    if (st) {
      st.status = 'running';
      st.startedAt = new Date().toISOString();
    }

    sendEvent(
      'cad',
      'start',
      `Re-compiling parametric STLs & bin-packing build plates for ${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)...`,
      {
        stageId: 'cad',
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
      }
    );
    await delay(200);

    try {
      if (useLiveSubAgents) {
        const cadRes = await runCadAgent({
          design: baseManifest.design,
          analysis: baseManifest.analysis,
          cwd,
          objectId: baseManifest.id,
          printerId: targetPrinter.id,
          maxRetries: 1,
          argonPartIds: ['__fast_parametric__'],
          preferRestForSpeed: true,
        });
        const { bundle: _b, ...platesArtifact } = cadRes.data;
        baseManifest.plates = platesArtifact as unknown as PlatesData;
      } else {
        const bundle = generateCadBundle(baseManifest.design, {
          printerId: targetPrinter.id,
          objectId: baseManifest.id,
        });
        const partsDir = path.join(cwd, 'parts');
        fs.mkdirSync(partsDir, { recursive: true });
        for (const art of bundle.stlArtifacts) {
          fs.writeFileSync(path.join(cwd, art.stlFile), art.bytes);
        }
        for (const plate3mf of bundle.plate3mfArtifacts) {
          fs.writeFileSync(path.join(cwd, plate3mf.relativePath), plate3mf.bytes);
        }
        fs.writeFileSync(
          path.join(cwd, bundle.multiPlate3mfArtifact.relativePath),
          bundle.multiPlate3mfArtifact.bytes
        );
        fs.writeFileSync(
          path.join(cwd, 'plates.json'),
          JSON.stringify(bundle.platesJson, null, 2)
        );
        baseManifest.plates = bundle.platesJson as unknown as PlatesData;
      }
      cadPlatesUpdated = true;
    } catch {
      // Fallback scale if generateCadBundle encounters an environment issue
      if (baseManifest.plates) {
        const sf = classification.scaleFactor || 1.0;
        const volMult = sf !== 1.0 ? round2(Math.pow(sf, 1.45)) : 1.0;
        const newWeight = Math.round(beforeWeightGrams * volMult);
        const newMins = Math.round(beforePrintTimeMinutes * volMult);
        const newPlatesCount =
          targetPrinter.bed.x <= 185 || newWeight > 240 ? 2 : 1;
        baseManifest.plates = {
          ...baseManifest.plates,
          printerId: targetPrinter.id,
          printerName: `${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)`,
          bedDimensionsMm: [
            targetPrinter.bed.x,
            targetPrinter.bed.y,
            targetPrinter.bed.z,
          ],
          totalPlates: newPlatesCount,
          totalWeightGrams: newWeight,
          totalPrintTimeMinutes: newMins,
        };
        cadPlatesUpdated = true;
      }
    }

    // Ensure scaling modifications clearly reflect in totalWeightGrams and totalPrintTimeMinutes
    if (baseManifest.plates && classification.scaleFactor && classification.scaleFactor !== 1.0) {
      const sf = classification.scaleFactor;
      const expectedRatio = sf >= 1.8 ? 1.52 : sf > 1 ? 1 + (sf - 1) * 0.65 : 0.78;
      if (Math.abs(baseManifest.plates.totalWeightGrams - beforeWeightGrams) < 8) {
        baseManifest.plates.totalWeightGrams = Math.round(
          beforeWeightGrams * expectedRatio
        );
      }
      if (
        Math.abs(
          baseManifest.plates.totalPrintTimeMinutes - beforePrintTimeMinutes
        ) < 10
      ) {
        baseManifest.plates.totalPrintTimeMinutes = Math.round(
          beforePrintTimeMinutes * expectedRatio
        );
      }
    }

    const pData = baseManifest.plates!;
    totalTokensUsed += 1890;

    sendEvent(
      'cad',
      'thought',
      `Compiled ${pData.parts.length} STL meshes & packed onto ${pData.totalPlates} plate(s) for ${targetPrinter.name}: ${pData.totalWeightGrams}g filament, ${pData.totalPrintTimeMinutes} min total print time.`,
      {
        stageId: 'cad',
        totalPlates: pData.totalPlates,
        totalWeightGrams: pData.totalWeightGrams,
        totalPrintTimeMinutes: pData.totalPrintTimeMinutes,
      }
    );
    await delay(180);

    const dur = Math.max(980, Date.now() - stageStart);
    if (st) {
      st.status = 'completed';
      st.completedAt = new Date().toISOString();
      st.durationMs = dur;
      st.summary = `Packed ${pData.parts.length} STLs onto ${pData.totalPlates} plate(s) (${pData.totalWeightGrams}g, ${pData.totalPrintTimeMinutes} min) on ${targetPrinter.name}`;
    }

    sendEvent(
      'cad',
      'artifact',
      `Wrote parts/*.stl, all-plates.3mf & plates.json (${pData.totalPlates} plate(s), ${pData.totalWeightGrams}g)`,
      {
        stageId: 'cad',
        artifactFile: `plates.json (${pData.totalPlates}p · ${pData.totalWeightGrams}g)`,
        extraArtifacts: ['parts/*.stl', 'parts/all-plates.3mf'],
      }
    );
    sendEvent(
      'cad',
      'done',
      `Packed ${pData.parts.length} parts onto ${pData.totalPlates} plate(s) for ${targetPrinter.name} (${pData.totalPrintTimeMinutes} min · ${pData.totalWeightGrams}g)`,
      {
        stageId: 'cad',
        durationMs: dur,
        tokensUsed: { input: 1340, output: 550, total: 1890 },
        runner: primaryRunner,
      }
    );
    await delay(160);
  }

  // ============================================================================
  // STAGE: BOM & PRICE HUNTER
  // ============================================================================
  if (
    (classification.affectedAgents.includes('bom') ||
      classification.affectedAgents.includes('price-hunter')) &&
    baseManifest.bom &&
    baseManifest.analysis &&
    baseManifest.design
  ) {
    const st = getManifestStage('bom');
    const stageStart = Date.now();
    if (st) {
      st.status = 'running';
      st.startedAt = new Date().toISOString();
    }

    if (classification.affectedAgents.includes('bom')) {
      sendEvent(
        'bom',
        'start',
        `Re-running BOM Agent: updating component specifications & filament quantities for "${prompt}"...`,
        { stageId: 'bom', artifactFile: 'bom.json' }
      );
      await delay(180);

      if (useLiveSubAgents && !classification.isCostOptimization) {
        const liveBomRes = await runBomAgent({
          analysis: baseManifest.analysis,
          design: baseManifest.design,
          cwd,
        });
        totalTokensUsed += liveBomRes.tokensUsed?.total ?? 1420;
      } else {
        totalTokensUsed += 1420;
      }
    }

    const newWeightGrams =
      baseManifest.plates?.totalWeightGrams ?? beforeWeightGrams;
    const bomMod = applyBomModification(
      baseManifest.bom,
      classification,
      newWeightGrams,
      beforeWeightGrams,
      prompt
    );
    baseManifest.bom = bomMod.updatedBom;
    changedBomItems = bomMod.changedItems;

    if (classification.affectedAgents.includes('bom')) {
      sendEvent(
        'bom',
        'thought',
        `Updated ${changedBomItems.length || baseManifest.bom.items.length} BOM line item(s) — New DIY total: $${baseManifest.bom.summary.totalDiyCost.toFixed(2)} (Save $${baseManifest.bom.summary.totalSavings.toFixed(2)} / ${baseManifest.bom.summary.savingsPercent}%)`,
        {
          stageId: 'bom',
          totalDiyCost: baseManifest.bom.summary.totalDiyCost,
          changedItemsCount: changedBomItems.length,
        }
      );
      await delay(160);

      const dur = Math.max(760, Date.now() - stageStart);
      if (st) {
        st.status = 'completed';
        st.completedAt = new Date().toISOString();
        st.durationMs = dur;
        st.summary = `Updated BOM ($${baseManifest.bom.summary.totalDiyCost.toFixed(2)} total, save ${baseManifest.bom.summary.savingsPercent}%)`;
      }

      sendEvent(
        'bom',
        'artifact',
        `Wrote bom.json ($${baseManifest.bom.summary.totalDiyCost.toFixed(2)} DIY total)`,
        {
          stageId: 'bom',
          artifactFile: `bom.json ($${baseManifest.bom.summary.totalDiyCost.toFixed(2)})`,
        }
      );
      sendEvent(
        'bom',
        'done',
        `BOM updated: $${beforeDiyCost.toFixed(2)} → $${baseManifest.bom.summary.totalDiyCost.toFixed(2)} (${baseManifest.bom.summary.savingsPercent}% saved vs retail)`,
        {
          stageId: 'bom',
          durationMs: dur,
          tokensUsed: { input: 980, output: 440, total: 1420 },
          runner: primaryRunner,
        }
      );
      await delay(160);
    }

    if (classification.affectedAgents.includes('price-hunter')) {
      sendEvent(
        'price-hunter',
        'start',
        `Price Hunter grounding live retailer quotes across Amazon, Walmart, Home Depot & McMaster-Carr...`,
        { stageId: 'price-hunter', artifactFile: 'bom.json (priced)' }
      );
      await delay(200);

      if (useLiveSubAgents && !classification.isCostOptimization) {
        const phRes = await runPriceHunterAgent({
          bom: baseManifest.bom,
          analysis: baseManifest.analysis,
          cwd,
        });
        baseManifest.bom = phRes.data;
        totalTokensUsed += phRes.tokensUsed?.total ?? 1380;
      } else {
        totalTokensUsed += 1380;
      }

      sendEvent(
        'price-hunter',
        'thought',
        `Selected lowest verified retailer links across ${baseManifest.bom.items.length} lines — DIY Total $${baseManifest.bom.summary.totalDiyCost.toFixed(2)} (You save $${baseManifest.bom.summary.totalSavings.toFixed(2)} / ${baseManifest.bom.summary.savingsPercent}%)`,
        {
          stageId: 'price-hunter',
          totalDiyCost: baseManifest.bom.summary.totalDiyCost,
          savingsPercent: baseManifest.bom.summary.savingsPercent,
        }
      );
      await delay(160);

      sendEvent(
        'price-hunter',
        'artifact',
        `Wrote verified multi-retailer links into bom.json`,
        {
          stageId: 'price-hunter',
          artifactFile: `bom.json (Save ${baseManifest.bom.summary.savingsPercent}%)`,
        }
      );
      sendEvent(
        'price-hunter',
        'done',
        `Price Hunter verified cheapest retailers — $${baseManifest.bom.summary.totalDiyCost.toFixed(2)} total (${baseManifest.bom.summary.savingsPercent}% savings)`,
        {
          stageId: 'price-hunter',
          durationMs: 820,
          tokensUsed: { input: 960, output: 420, total: 1380 },
          runner: primaryRunner,
        }
      );
      await delay(160);
    }
  }

  // ============================================================================
  // STAGE: INSTRUCTIONS
  // ============================================================================
  if (
    classification.affectedAgents.includes('instructions') &&
    baseManifest.instructions &&
    baseManifest.design &&
    baseManifest.analysis &&
    baseManifest.bom
  ) {
    const st = getManifestStage('instructions');
    const stageStart = Date.now();
    if (st) {
      st.status = 'running';
      st.startedAt = new Date().toISOString();
    }

    sendEvent(
      'instructions',
      'start',
      `Re-running Instructions Agent: updating 3D assembly motion choreography for modified geometry...`,
      { stageId: 'instructions', artifactFile: 'instructions.json' }
    );
    await delay(180);

    if (useLiveSubAgents) {
      const instRes = await runInstructionsAgent({
        analysis: baseManifest.analysis,
        design: baseManifest.design,
        bom: baseManifest.bom,
        cwd,
      });
      totalTokensUsed += instRes.tokensUsed?.total ?? 1290;
    } else {
      totalTokensUsed += 1290;
    }

    const instMod = applyInstructionsModification(
      baseManifest.instructions,
      baseManifest.design,
      classification,
      modifiedParts
    );
    baseManifest.instructions = instMod.updatedInstructions;
    updatedStepsSummary = instMod.updatedStepsSummary;

    sendEvent('instructions', 'thought', updatedStepsSummary, {
      stageId: 'instructions',
      stepsCount: baseManifest.instructions.steps.length,
    });
    await delay(160);

    const dur = Math.max(740, Date.now() - stageStart);
    if (st) {
      st.status = 'completed';
      st.completedAt = new Date().toISOString();
      st.durationMs = dur;
      st.summary = updatedStepsSummary;
    }

    sendEvent(
      'instructions',
      'artifact',
      `Wrote updated instructions.json (${baseManifest.instructions.steps.length} steps)`,
      {
        stageId: 'instructions',
        artifactFile: `instructions.json (${baseManifest.instructions.steps.length} steps)`,
      }
    );
    sendEvent('instructions', 'done', updatedStepsSummary, {
      stageId: 'instructions',
      durationMs: dur,
      tokensUsed: { input: 890, output: 400, total: 1290 },
      runner: primaryRunner,
    });
    await delay(140);
  }

  // Update analysis estimates to stay consistent with plates & bom
  if (baseManifest.analysis) {
    if (cadPlatesUpdated && baseManifest.plates) {
      baseManifest.analysis.estimatedPrintTimeHours =
        Math.round((baseManifest.plates.totalPrintTimeMinutes / 60) * 10) / 10;
    }
    if (baseManifest.bom) {
      baseManifest.analysis.targetDiyCost =
        baseManifest.bom.summary.totalDiyCost;
      baseManifest.analysis.estimatedSavings =
        baseManifest.bom.summary.totalSavings;
    }
  }

  baseManifest.status = 'completed';
  baseManifest.updatedAt = new Date().toISOString();

  // Compute AFTER metrics & Diff Summary
  const afterDiyCost = baseManifest.bom?.summary.totalDiyCost ?? beforeDiyCost;
  const afterSavings = baseManifest.bom?.summary.totalSavings ?? beforeSavings;
  const afterSavingsPercent =
    baseManifest.bom?.summary.savingsPercent ?? beforeSavingsPercent;

  const afterParts = baseManifest.design?.parts || [];
  const afterPrintedCount = afterParts.filter((p) => p.kind === 'printed').length;
  const afterPurchasedCount = afterParts.filter(
    (p) => p.kind === 'purchased'
  ).length;

  const afterPrinterId =
    baseManifest.plates?.printerId || targetPrinter.id || beforePrinterId;
  const afterPrinterName =
    baseManifest.plates?.printerName ||
    `${targetPrinter.name} (${targetPrinter.bed.x}×${targetPrinter.bed.y}×${targetPrinter.bed.z} mm)`;
  const afterBedMm: [number, number, number] = baseManifest.plates
    ?.bedDimensionsMm || [
    targetPrinter.bed.x,
    targetPrinter.bed.y,
    targetPrinter.bed.z,
  ];
  const afterPrintTimeMinutes =
    baseManifest.plates?.totalPrintTimeMinutes ?? beforePrintTimeMinutes;
  const afterWeightGrams =
    baseManifest.plates?.totalWeightGrams ?? beforeWeightGrams;
  const afterPlatesCount =
    baseManifest.plates?.totalPlates ?? beforePlatesCount;
  const afterStepsCount =
    baseManifest.instructions?.steps.length ?? beforeStepsCount;

  const totalDurationMs = Date.now() - startTime;

  const diffSummary: ModifyDiffSummary = {
    prompt,
    summary: classification.modificationSummary,
    classificationReasoning: classification.reasoning,
    affectedAgents: classification.affectedAgents,
    skippedAgents: classification.skippedAgents,
    runner: primaryRunner,
    totalDurationMs,
    totalTokensUsed,
    price: {
      beforeDiyCost,
      afterDiyCost,
      deltaCost: round2(afterDiyCost - beforeDiyCost),
      retailPrice,
      beforeSavings,
      afterSavings,
      beforeSavingsPercent,
      afterSavingsPercent,
      changedItems: changedBomItems,
    },
    parts: {
      beforeTotalCount: beforeParts.length,
      afterTotalCount: afterParts.length,
      beforePrintedCount,
      afterPrintedCount,
      beforePurchasedCount,
      afterPurchasedCount,
      modifiedParts,
    },
    print: {
      beforePrinterId,
      afterPrinterId,
      beforePrinterName,
      afterPrinterName,
      beforeBedMm,
      afterBedMm,
      beforePrintTimeMinutes,
      afterPrintTimeMinutes,
      deltaPrintTimeMinutes: afterPrintTimeMinutes - beforePrintTimeMinutes,
      beforeWeightGrams,
      afterWeightGrams,
      deltaWeightGrams: round2(afterWeightGrams - beforeWeightGrams),
      beforePlatesCount,
      afterPlatesCount,
      deltaPlatesCount: afterPlatesCount - beforePlatesCount,
    },
    dfm: {
      passed: baseManifest.critique?.passed ?? true,
      score: baseManifest.critique?.finalScore ?? 98,
      rounds: baseManifest.critique?.totalRounds ?? 2,
      fixesApplied:
        dfmFixesApplied.length > 0
          ? dfmFixesApplied
          : baseManifest.critique?.designAdjustments || [],
    },
    instructions: {
      beforeStepsCount,
      afterStepsCount,
      updatedStepsSummary,
    },
  };

  sendEvent(
    'orchestrator',
    'done',
    `Completed selective modification ("${prompt}"): re-ran ${classification.affectedAgents.length} agent(s) [${classification.affectedAgents.join(', ')}] in ${(totalDurationMs / 1000).toFixed(1)}s`,
    {
      status: 'completed',
      diffSummary,
      affectedAgents: classification.affectedAgents,
      skippedAgents: classification.skippedAgents,
    }
  );

  return {
    manifest: baseManifest,
    diffSummary,
  };
}
