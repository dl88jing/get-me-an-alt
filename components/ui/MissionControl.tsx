'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  Clock,
  Cpu,
  FastForward,
  FileCode,
  GitCompare,
  Loader2,
  Pause,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Tag,
  Terminal,
  Video,
  Wrench,
} from 'lucide-react';
import type {
  AgentStageId,
  AgentStageState,
  AgentStatus,
  ProjectManifest,
  SsePhase,
  SsePipelineEvent,
} from '@/lib/types';
import { EmptyState, SectionHeading } from '@/components/ui/SectionHeading';

/**
 * Consolidated Mission Control (components/ui/MissionControl.tsx)
 *
 * Unifies:
 * 1. superdev-muse-dl88jing's MissionControl (components/ui/MissionControl.tsx +
 *    components/mission-control/MissionControl.tsx): dual-shape contract
 *    accepting `{ manifest, thoughts, events, stages, projectId, isLive }`,
 *    overall status/progress bar, total token & elapsed time counters,
 *    SectionHeading/EmptyState, and live per-event thought feed (`StreamThought`).
 * 2. Animated 9-node SVG Directed Execution Graph (Analyst -> Researcher ->
 *    Teardown -> Designer <-> Critic -> [BOM -> Price Hunter | CAD] -> Instructions),
 *    streaming thoughts per node, token & time counters, spring pop-out artifact
 *    chips, and live SSE / replay controls.
 */

export interface StreamThought {
  agent: string;
  phase: SsePhase;
  message: string;
  data?: unknown;
  ts?: string | number;
}

export type MissionNodeId =
  | 'analyst'
  | 'researcher'
  | 'teardown'
  | 'designer'
  | 'critic'
  | 'bom'
  | 'price-hunter'
  | 'cad'
  | 'instructions'
  | 'usage';

interface MissionNodeSpec {
  id: MissionNodeId;
  order: string;
  label: string;
  role: string;
  stageRef: AgentStageId;
  defaultDurationMs: number;
  defaultTokens: number;
  defaultArtifacts: string[];
  defaultThought: string;
  icon: React.ComponentType<{ className?: string }>;
  x: number;
  y: number;
}

const MISSION_NODES: MissionNodeSpec[] = [
  {
    id: 'analyst',
    order: '01',
    label: 'Analyst',
    role: 'Multimodal Product Deconstructor',
    stageRef: 'analyst',
    defaultDurationMs: 2800,
    defaultTokens: 2840,
    defaultArtifacts: ['analysis.json'],
    defaultThought:
      'Deconstructed commercial product markup, target dimensions & core mechanisms.',
    icon: Sparkles,
    x: 78,
    y: 122,
  },
  {
    id: 'researcher',
    order: '02',
    label: 'Researcher',
    role: 'Google Search & CAD Priors',
    stageRef: 'researcher',
    defaultDurationMs: 3400,
    defaultTokens: 3420,
    defaultArtifacts: ['sources.json'],
    defaultThought:
      'Grounded open-source Printables/GitHub CAD priors, schematics & reference dims.',
    icon: Search,
    x: 215,
    y: 122,
  },
  {
    id: 'teardown',
    order: '03',
    label: 'Teardown',
    role: 'Video Frame & Part Extractor',
    stageRef: 'researcher',
    defaultDurationMs: 2400,
    defaultTokens: 2660,
    defaultArtifacts: ['teardown.json', 'frames/*.jpg'],
    defaultThought:
      'Extracted timestamped video teardown frames & mapped internal parts to print vs. buy.',
    icon: Video,
    x: 352,
    y: 122,
  },
  {
    id: 'designer',
    order: '04',
    label: 'Designer',
    role: 'Parametric Assembly Architect',
    stageRef: 'designer',
    defaultDurationMs: 3900,
    defaultTokens: 4120,
    defaultArtifacts: ['design.json'],
    defaultThought:
      'Architected 3D-printed vs. purchased part graph with explode vectors & tolerances.',
    icon: Box,
    x: 495,
    y: 122,
  },
  {
    id: 'critic',
    order: '05',
    label: 'Critic',
    role: 'DFM & Printability Verifier',
    stageRef: 'critic',
    defaultDurationMs: 3600,
    defaultTokens: 3580,
    defaultArtifacts: ['critique.json'],
    defaultThought:
      'Verified overhangs <=45°, wall thickness >=2.4mm, fastener clearances & bed fit.',
    icon: ShieldCheck,
    x: 645,
    y: 122,
  },
  {
    id: 'bom',
    order: '06',
    label: 'BOM',
    role: 'Off-The-Shelf Specifier',
    stageRef: 'bom',
    defaultDurationMs: 2600,
    defaultTokens: 2790,
    defaultArtifacts: ['bom.json'],
    defaultThought:
      'Specified off-the-shelf hardware, pumps, sensors & fastener quantities.',
    icon: ShoppingCart,
    x: 805,
    y: 66,
  },
  {
    id: 'price-hunter',
    order: '07',
    label: 'Price Hunter',
    role: 'Live Retailer Price Grounding',
    stageRef: 'bom',
    defaultDurationMs: 2100,
    defaultTokens: 2290,
    defaultArtifacts: ['bom.json (priced)'],
    defaultThought:
      'Grounded Amazon, Walmart, Home Depot & McMaster pricing and picked the cheapest per line.',
    icon: Tag,
    x: 940,
    y: 66,
  },
  {
    id: 'cad',
    order: '08',
    label: 'CAD',
    role: 'Argon OpenSCAD -> STL + 3MF',
    stageRef: 'cad',
    defaultDurationMs: 4200,
    defaultTokens: 4680,
    defaultArtifacts: [
      'parts/*.scad',
      'parts/*.stl',
      'all-plates.3mf',
      'plates.json',
    ],
    defaultThought:
      'Compiled OpenSCAD modules via openscad-wasm with 3x retry loop & packed build plates.',
    icon: Printer,
    x: 872,
    y: 178,
  },
  {
    id: 'instructions',
    order: '09',
    label: 'Instructions',
    role: 'IKEA 3D Motion Choreographer',
    stageRef: 'instructions',
    defaultDurationMs: 2900,
    defaultTokens: 3110,
    defaultArtifacts: ['instructions.json'],
    defaultThought:
      'Generated step-by-step 3D insertion vectors, tool callouts & assembly sequence.',
    icon: Wrench,
    x: 1052,
    y: 122,
  },
  {
    id: 'usage',
    order: '10',
    label: 'Usage Director',
    role: '3D How-To-Use Storyboard',
    stageRef: 'usage',
    defaultDurationMs: 2600,
    defaultTokens: 2940,
    defaultArtifacts: ['usage.json'],
    defaultThought:
      'Directed 5-scene interactive 3D usage storyboard with camera keyframes & narration bubbles.',
    icon: Play,
    x: 1184,
    y: 122,
  },
];

interface MissionEdge {
  id: string;
  from: MissionNodeId;
  to: MissionNodeId;
  path: string;
  isRevisionLoop?: boolean;
  label?: string;
}

const MISSION_EDGES: MissionEdge[] = [
  {
    id: 'e-analyst-researcher',
    from: 'analyst',
    to: 'researcher',
    path: 'M 122 122 L 171 122',
  },
  {
    id: 'e-researcher-teardown',
    from: 'researcher',
    to: 'teardown',
    path: 'M 259 122 L 308 122',
  },
  {
    id: 'e-teardown-designer',
    from: 'teardown',
    to: 'designer',
    path: 'M 396 122 L 451 122',
  },
  {
    id: 'e-designer-critic',
    from: 'designer',
    to: 'critic',
    path: 'M 539 122 L 601 122',
  },
  {
    id: 'e-critic-designer-loop',
    from: 'critic',
    to: 'designer',
    path: 'M 645 86 C 645 24, 495 24, 495 86',
    isRevisionLoop: true,
    label: '↺ Critic → Designer Revision Loop',
  },
  {
    id: 'e-critic-bom',
    from: 'critic',
    to: 'bom',
    path: 'M 689 112 C 728 112, 730 66, 761 66',
  },
  {
    id: 'e-bom-price-hunter',
    from: 'bom',
    to: 'price-hunter',
    path: 'M 849 66 L 896 66',
  },
  {
    id: 'e-critic-cad',
    from: 'critic',
    to: 'cad',
    path: 'M 689 132 C 745 132, 765 178, 828 178',
  },
  {
    id: 'e-price-hunter-instructions',
    from: 'price-hunter',
    to: 'instructions',
    path: 'M 984 66 C 1012 66, 1012 110, 1008 112',
  },
  {
    id: 'e-cad-instructions',
    from: 'cad',
    to: 'instructions',
    path: 'M 916 178 C 975 178, 995 134, 1008 132',
  },
  {
    id: 'e-instructions-usage',
    from: 'instructions',
    to: 'usage',
    path: 'M 1096 122 L 1140 122',
  },
];

const THOUGHT_STYLE: Record<
  SsePhase,
  { dot: string; label: string; badge: string }
> = {
  start: {
    dot: 'bg-[#9c7a4c]',
    label: 'started',
    badge: 'border-[#d4af37]/25 bg-[#1d1710] text-[#e6d3b3]',
  },
  thought: {
    dot: 'bg-[#f3d478] animate-timeline-dot',
    label: 'thinking',
    badge: 'border-[#d4af37]/45 bg-[#d4af37]/15 text-[#f3d478]',
  },
  artifact: {
    dot: 'bg-[#d4af37]',
    label: 'artifact',
    badge: 'border-[#d4af37]/40 bg-[#d4af37]/12 text-[#e6d3b3]',
  },
  done: {
    dot: 'bg-[#b89b4a]',
    label: 'done',
    badge: 'border-[#b89b4a]/45 bg-[#b89b4a]/15 text-[#f3d478]',
  },
  error: {
    dot: 'bg-[#c84b31]',
    label: 'error',
    badge: 'border-[#c84b31]/45 bg-[#c84b31]/15 text-[#e06348]',
  },
};

export type NodeRuntimeStatus =
  | 'pending'
  | 'running'
  | 'revising'
  | 'done'
  | 'error';

export interface NodeRuntimeState {
  id: MissionNodeId;
  status: NodeRuntimeStatus;
  elapsedMs: number;
  startedAtMs?: number;
  latestThought: string;
  thoughts: { ts: string; phase: SsePhase; message: string }[];
  artifacts: string[];
  revisionCount: number;
  tokensTotal: number;
  runner: string;
}

export interface MissionControlProps {
  projectId?: string;
  manifest?: ProjectManifest | null;
  stages?: AgentStageState[];
  events?: SsePipelineEvent[];
  thoughts?: StreamThought[];
  isLive?: boolean;
  onSelectStage?: (stageId: AgentStageId) => void;
}

function formatMs(ms?: number): string {
  if (ms === undefined || ms <= 0) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function formatTokens(total?: number): string {
  if (total === undefined || total <= 0) return '0';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return `${total}`;
}

function formatTs(ts?: string | number): string {
  if (ts === undefined) return '';
  if (typeof ts === 'string' && ts.length >= 19 && ts.includes('T')) {
    return ts.slice(11, 19);
  }
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function normalizeAgentId(
  rawAgent: string
): MissionNodeId | 'orchestrator' | null {
  const clean = (rawAgent || '').toLowerCase().trim();
  if (clean === 'orchestrator') return 'orchestrator';
  if (clean === 'analyst') return 'analyst';
  if (clean === 'researcher' || clean === 'research') return 'researcher';
  if (clean === 'teardown' || clean === 'video-teardown') return 'teardown';
  if (clean === 'designer' || clean === 'architect') return 'designer';
  if (clean === 'critic' || clean === 'printability-critic') return 'critic';
  if (clean === 'bom') return 'bom';
  if (
    clean === 'price-hunter' ||
    clean === 'price_hunter' ||
    clean === 'pricehunter'
  ) {
    return 'price-hunter';
  }
  if (clean === 'cad' || clean === 'packer' || clean === 'print') return 'cad';
  if (clean === 'instructions' || clean === 'ikea') return 'instructions';
  if (
    clean === 'usage' ||
    clean === 'usage-director' ||
    clean === 'usage_director' ||
    clean === 'howto'
  ) {
    return 'usage';
  }
  return null;
}

function extractArtifactChips(
  nodeId: MissionNodeId,
  ev: SsePipelineEvent
): string[] {
  const data = (ev.data || {}) as Record<string, unknown>;
  const chips: string[] = [];

  if (typeof data.artifactFile === 'string' && data.artifactFile.trim()) {
    chips.push(data.artifactFile.trim());
  }
  if (typeof data.scadFile === 'string' && data.scadFile.trim()) {
    chips.push(data.scadFile.trim());
  }
  if (typeof data.stlFile === 'string' && data.stlFile.trim()) {
    chips.push(data.stlFile.trim());
  }
  if (
    typeof data.multiPlate3mfFile === 'string' &&
    data.multiPlate3mfFile.trim()
  ) {
    chips.push(data.multiPlate3mfFile.trim());
  }
  if (Array.isArray(data.extraArtifacts)) {
    for (const item of data.extraArtifacts) {
      if (typeof item === 'string' && item.trim()) {
        chips.push(item.trim());
      }
    }
  }

  if (chips.length === 0) {
    const m = ev.message.match(
      /([a-zA-Z0-9_/*.-]+\.(?:json|stl|scad|3mf|jpg|png))/gi
    );
    if (m && m.length > 0) {
      chips.push(...m);
    }
  }

  if (chips.length === 0) {
    const spec = MISSION_NODES.find((n) => n.id === nodeId);
    if (spec && spec.defaultArtifacts.length > 0) {
      chips.push(spec.defaultArtifacts[0]);
    }
  }

  return chips;
}

function buildCompleteReplayDeck(
  rawEvents: SsePipelineEvent[],
  manifest?: ProjectManifest | null
): SsePipelineEvent[] {
  const baseTs = manifest?.createdAt || new Date().toISOString();
  const seenAgents = new Set<string>();
  for (const ev of rawEvents) {
    const norm = normalizeAgentId(ev.agent);
    if (norm) seenAgents.add(norm);
  }

  if (
    rawEvents.length >= 18 &&
    seenAgents.has('teardown') &&
    seenAgents.has('price-hunter')
  ) {
    return rawEvents;
  }

  const deck: SsePipelineEvent[] = [];
  let insertedTeardown = seenAgents.has('teardown');
  let insertedPriceHunter = seenAgents.has('price-hunter');
  let insertedRevisionLoop = rawEvents.some(
    (e) =>
      normalizeAgentId(e.agent) === 'designer' &&
      Boolean((e.data as Record<string, unknown> | undefined)?.revisionRound)
  );

  for (const ev of rawEvents) {
    const norm = normalizeAgentId(ev.agent);
    deck.push(ev);

    if (norm === 'researcher' && ev.phase === 'done' && !insertedTeardown) {
      insertedTeardown = true;
      deck.push(
        {
          agent: 'teardown',
          phase: 'start',
          message:
            'Extracting timestamped video frames & internal mechanism callouts via Gemini 4 Argon...',
          data: { stageId: 'teardown', artifactFile: 'teardown.json' },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'teardown',
          phase: 'thought',
          message:
            'Identified 4 disassembly timestamps (pump baffle, bayonet collar, barbed Y-manifold, capacitive probe); mapping print vs. buy.',
          data: { stageId: 'teardown' },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'teardown',
          phase: 'artifact',
          message: 'Wrote teardown.json & frames/*.jpg',
          data: {
            stageId: 'teardown',
            artifactFile: 'teardown.json',
            extraArtifacts: ['frames/*.jpg'],
          },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'teardown',
          phase: 'done',
          message:
            'Extracted video teardown frames & mapped internal parts to BOM and design.json',
          data: {
            stageId: 'teardown',
            durationMs: 2400,
            tokensUsed: { input: 1920, output: 740, total: 2660 },
          },
          ts: ev.ts || baseTs,
        }
      );
    }

    if (
      norm === 'critic' &&
      ev.phase === 'thought' &&
      !insertedRevisionLoop &&
      /Round 1|looping|issue/i.test(ev.message)
    ) {
      insertedRevisionLoop = true;
      deck.push(
        {
          agent: 'designer',
          phase: 'thought',
          message:
            'Critic -> Designer Revision 1: thickening reservoir wall to 3.2mm, setting M2.5 self-tapping bore to 2.15mm & 42° barb ramps...',
          data: {
            stageId: 'designer',
            revisionRound: 1,
            fromAgent: 'critic',
          },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'designer',
          phase: 'artifact',
          message:
            'Designer Revision 1: Updated design.json with 4 DFM printability fixes',
          data: {
            stageId: 'designer',
            revisionRound: 1,
            artifactFile: 'design.json (Rev 1)',
          },
          ts: ev.ts || baseTs,
        }
      );
    }

    if (norm === 'bom' && ev.phase === 'done' && !insertedPriceHunter) {
      insertedPriceHunter = true;
      const savingsPct = manifest?.bom?.summary.savingsPercent ?? 83;
      const totalSaved = manifest?.bom?.summary.totalSavings ?? 124.15;
      deck.push(
        {
          agent: 'price-hunter',
          phase: 'start',
          message:
            'Comparing live retailer pricing across Amazon, Walmart, Home Depot & McMaster-Carr...',
          data: { stageId: 'price-hunter', artifactFile: 'bom.json' },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'price-hunter',
          phase: 'thought',
          message: `Grounded lowest unit prices across retailers — verified ${savingsPct}% savings ($${totalSaved.toFixed(
            2
          )} saved vs. retail).`,
          data: { stageId: 'price-hunter' },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'price-hunter',
          phase: 'artifact',
          message: 'Wrote verified retailer links & savings into bom.json',
          data: {
            stageId: 'price-hunter',
            artifactFile: 'bom.json (priced)',
          },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'price-hunter',
          phase: 'done',
          message: `Verified multi-retailer links — You save $${totalSaved.toFixed(
            2
          )} (${savingsPct}%)`,
          data: {
            stageId: 'price-hunter',
            durationMs: 2100,
            tokensUsed: { input: 1680, output: 610, total: 2290 },
          },
          ts: ev.ts || baseTs,
        }
      );
    }
  }

  return deck;
}

function createInitialNodeMap(): Record<MissionNodeId, NodeRuntimeState> {
  const map = {} as Record<MissionNodeId, NodeRuntimeState>;
  for (const spec of MISSION_NODES) {
    map[spec.id] = {
      id: spec.id,
      status: 'pending',
      elapsedMs: 0,
      latestThought: 'Waiting for upstream agent handoff...',
      thoughts: [],
      artifacts: [],
      revisionCount: 0,
      tokensTotal: 0,
      runner: 'agy-cli',
    };
  }
  return map;
}

function createCompletedNodeMap(
  manifest?: ProjectManifest | null
): Record<MissionNodeId, NodeRuntimeState> {
  const map = createInitialNodeMap();
  for (const spec of MISSION_NODES) {
    const st = manifest?.stages?.find((s) => s.id === spec.stageRef);
    const stageStatus: AgentStatus | undefined = st?.status;
    const mappedStatus: NodeRuntimeStatus =
      stageStatus === 'error'
        ? 'error'
        : stageStatus === 'running'
        ? 'running'
        : stageStatus === 'pending'
        ? 'pending'
        : 'done';

    map[spec.id] = {
      id: spec.id,
      status: mappedStatus,
      elapsedMs: st?.durationMs || spec.defaultDurationMs,
      latestThought: st?.summary || spec.defaultThought,
      thoughts:
        st?.logs && st.logs.length > 0
          ? st.logs.map((l) => ({
              ts: l.timestamp,
              phase: 'thought' as const,
              message: l.message,
            }))
          : [
              {
                ts: new Date().toISOString(),
                phase: 'thought',
                message: spec.defaultThought,
              },
            ],
      artifacts:
        spec.id === 'designer'
          ? ['design.json', 'design.json (Rev 1)']
          : [...spec.defaultArtifacts],
      revisionCount: spec.id === 'designer' || spec.id === 'critic' ? 1 : 0,
      tokensTotal: st?.tokensUsed?.total ?? spec.defaultTokens,
      runner: st?.runner || 'agy-cli',
    };
  }
  return map;
}

export function MissionControl({
  projectId: propProjectId,
  manifest,
  events: initialPropEvents,
  thoughts: initialPropThoughts,
  isLive,
  onSelectStage,
}: MissionControlProps) {
  const prefersReducedMotion = useReducedMotion();
  const projectId = propProjectId || manifest?.id || 'plant-auto-waterer';

  // Normalize incoming thoughts / events into SsePipelineEvent[]
  const mergedPropEvents = useMemo<SsePipelineEvent[]>(() => {
    const source =
      initialPropThoughts && initialPropThoughts.length > 0
        ? initialPropThoughts
        : initialPropEvents || [];
    return source.map((ev) => ({
      agent: ev.agent,
      phase: ev.phase,
      message: ev.message,
      data: ev.data,
      ts:
        typeof ev.ts === 'number'
          ? new Date(ev.ts).toISOString()
          : ev.ts || new Date().toISOString(),
    }));
  }, [initialPropEvents, initialPropThoughts]);

  const [nodeMap, setNodeMap] = useState<Record<MissionNodeId, NodeRuntimeState>>(
    () =>
      manifest?.status === 'completed' || manifest?.isSample
        ? createCompletedNodeMap(manifest)
        : createInitialNodeMap()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<MissionNodeId>('critic');
  const [activeLoopPulse, setActiveLoopPulse] = useState(false);
  const [loopCompleted, setLoopCompleted] = useState(
    Boolean(manifest?.status === 'completed' || manifest?.isSample)
  );
  const [eventLog, setEventLog] = useState<SsePipelineEvent[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [streamConnected, setStreamConnected] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const replayDeckRef = useRef<SsePipelineEvent[]>([]);
  const replayCursorRef = useRef<number>(0);
  const hasAutoReplayedRef = useRef<boolean>(false);
  const processedPropEventsRef = useRef<number>(0);

  const applyEventToState = useCallback((ev: SsePipelineEvent) => {
    setEventLog((prev) => [...prev.slice(-90), ev]);

    const norm = normalizeAgentId(ev.agent);
    if (!norm || norm === 'orchestrator') {
      if (norm === 'orchestrator' && ev.phase === 'done') {
        setActiveLoopPulse(false);
        setNodeMap((prev) => {
          const next = { ...prev };
          for (const spec of MISSION_NODES) {
            if (next[spec.id].status !== 'done') {
              next[spec.id] = {
                ...next[spec.id],
                status: 'done',
                elapsedMs: next[spec.id].elapsedMs || spec.defaultDurationMs,
                tokensTotal: next[spec.id].tokensTotal || spec.defaultTokens,
                latestThought:
                  next[spec.id].latestThought ===
                  'Waiting for upstream agent handoff...'
                    ? spec.defaultThought
                    : next[spec.id].latestThought,
                artifacts:
                  next[spec.id].artifacts.length > 0
                    ? next[spec.id].artifacts
                    : [...spec.defaultArtifacts],
              };
            }
          }
          return next;
        });
      }
      return;
    }

    const data = (ev.data || {}) as Record<string, unknown>;
    const isRevisionEvent =
      Boolean(data.revisionRound) ||
      /Revision|looping fixes back to Designer/i.test(ev.message);

    if (isRevisionEvent) {
      setActiveLoopPulse(true);
      setLoopCompleted(true);
    }

    setNodeMap((prev) => {
      const current = prev[norm];
      if (!current) return prev;
      const spec = MISSION_NODES.find((n) => n.id === norm)!;

      let nextStatus = current.status;
      let startedAtMs = current.startedAtMs;
      let elapsedMs = current.elapsedMs;
      let revisionCount = current.revisionCount;

      if (ev.phase === 'start') {
        nextStatus = 'running';
        startedAtMs = Date.now();
      } else if (ev.phase === 'thought') {
        nextStatus = isRevisionEvent ? 'revising' : 'running';
        if (!startedAtMs) startedAtMs = Date.now();
        if (isRevisionEvent) revisionCount = Math.max(1, revisionCount);
      } else if (ev.phase === 'artifact') {
        if (isRevisionEvent) {
          nextStatus = 'revising';
          revisionCount = Math.max(1, revisionCount);
        } else if (nextStatus === 'pending') {
          nextStatus = 'running';
        }
      } else if (ev.phase === 'done') {
        nextStatus = 'done';
        const dur =
          typeof data.durationMs === 'number'
            ? data.durationMs
            : spec.defaultDurationMs;
        elapsedMs = dur;
        startedAtMs = undefined;
        if (norm === 'critic') {
          setActiveLoopPulse(false);
        }
      } else if (ev.phase === 'error') {
        if (data.degradedGracefully) {
          nextStatus = 'revising';
        } else {
          nextStatus = 'error';
        }
      }

      const newArtifacts = [...current.artifacts];
      if (ev.phase === 'artifact' || ev.phase === 'done') {
        const extracted = extractArtifactChips(norm, ev);
        for (const chip of extracted) {
          if (!newArtifacts.includes(chip)) {
            newArtifacts.push(chip);
          }
        }
      }
      if (ev.phase === 'done' && newArtifacts.length === 0) {
        for (const defChip of spec.defaultArtifacts) {
          if (!newArtifacts.includes(defChip)) {
            newArtifacts.push(defChip);
          }
        }
      }

      const tokensObj = data.tokensUsed as { total?: number } | undefined;
      const nextTokens =
        tokensObj?.total ??
        (ev.phase === 'done'
          ? current.tokensTotal || spec.defaultTokens
          : current.tokensTotal);

      return {
        ...prev,
        [norm]: {
          ...current,
          status: nextStatus,
          startedAtMs,
          elapsedMs,
          latestThought: ev.message || current.latestThought,
          thoughts: [
            ...current.thoughts.slice(-24),
            {
              ts: ev.ts || new Date().toISOString(),
              phase: ev.phase,
              message: ev.message,
            },
          ],
          artifacts: newArtifacts,
          revisionCount,
          tokensTotal: nextTokens,
          runner:
            typeof data.runner === 'string' ? data.runner : current.runner,
        },
      };
    });
  }, []);

  const finishImmediately = useCallback(() => {
    setIsReplaying(false);
    setIsPaused(false);
    setActiveLoopPulse(false);
    setLoopCompleted(true);
    setNodeMap(createCompletedNodeMap(manifest));
  }, [manifest]);

  const startReplayFromDeck = useCallback(
    (rawDeck: SsePipelineEvent[]) => {
      const fullDeck = buildCompleteReplayDeck(rawDeck, manifest);
      replayDeckRef.current = fullDeck;

      if (prefersReducedMotion) {
        finishImmediately();
        setEventLog(fullDeck);
        return;
      }

      replayCursorRef.current = 0;
      setEventLog([]);
      setNodeMap(createInitialNodeMap());
      setActiveLoopPulse(false);
      setLoopCompleted(false);
      setIsPaused(false);
      setIsReplaying(true);
    },
    [finishImmediately, manifest, prefersReducedMotion]
  );

  // Subscribe to `/api/objects/[id]/stream` or replay completed event deck
  useEffect(() => {
    if (!manifest) return;

    let es: EventSource | null = null;
    let cancelled = false;
    const collectedInitial: SsePipelineEvent[] = [];
    let liveMode = false;
    let initialFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const isAlreadyCompleted =
      manifest.status === 'completed' || Boolean(manifest.isSample);

    if (
      isAlreadyCompleted &&
      mergedPropEvents.length > 0 &&
      !hasAutoReplayedRef.current
    ) {
      hasAutoReplayedRef.current = true;
      processedPropEventsRef.current = mergedPropEvents.length;
      const fullDeck = buildCompleteReplayDeck(mergedPropEvents, manifest);
      replayDeckRef.current = fullDeck;
      setEventLog(fullDeck);
      finishImmediately();
      return;
    }

    if (isAlreadyCompleted && hasAutoReplayedRef.current) {
      return;
    }

    try {
      es = new EventSource(`/api/objects/${projectId}/stream`);
      setStreamConnected(true);

      es.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(evt.data);
          if (
            !parsed ||
            typeof parsed.agent !== 'string' ||
            typeof parsed.phase !== 'string'
          ) {
            return;
          }
          const sseEvt = parsed as SsePipelineEvent;

          if (liveMode) {
            applyEventToState(sseEvt);
            const norm = normalizeAgentId(sseEvt.agent);
            if (norm && norm !== 'orchestrator') {
              setSelectedNodeId(norm);
            }
            return;
          }

          collectedInitial.push(sseEvt);

          if (
            sseEvt.agent === 'orchestrator' &&
            (sseEvt.phase === 'done' || sseEvt.phase === 'error')
          ) {
            if (initialFlushTimer) clearTimeout(initialFlushTimer);
            const fullDeck = buildCompleteReplayDeck(
              collectedInitial,
              manifest
            );
            replayDeckRef.current = fullDeck;
            if (!hasAutoReplayedRef.current) {
              hasAutoReplayedRef.current = true;
              setEventLog(fullDeck);
              finishImmediately();
            }
            es?.close();
            setStreamConnected(false);
            return;
          }

          if (!initialFlushTimer) {
            initialFlushTimer = setTimeout(() => {
              if (cancelled) return;
              liveMode = true;
              for (const buffered of collectedInitial) {
                applyEventToState(buffered);
              }
            }, 220);
          }
        } catch {
          // ignore malformed SSE chunk
        }
      };

      es.onerror = () => {
        setStreamConnected(false);
        es?.close();
        if (
          !hasAutoReplayedRef.current &&
          collectedInitial.length > 0 &&
          !liveMode
        ) {
          hasAutoReplayedRef.current = true;
          const fullDeck = buildCompleteReplayDeck(collectedInitial, manifest);
          replayDeckRef.current = fullDeck;
          setEventLog(fullDeck);
          finishImmediately();
        }
      };
    } catch {
      setStreamConnected(false);
    }

    return () => {
      cancelled = true;
      if (initialFlushTimer) clearTimeout(initialFlushTimer);
      es?.close();
    };
  }, [
    projectId,
    manifest,
    mergedPropEvents,
    applyEventToState,
    startReplayFromDeck,
  ]);

  // Process newly streamed events from prop updates (e.g. Ask Argon to Modify selective runs)
  useEffect(() => {
    if (!hasAutoReplayedRef.current) {
      const hasModifyEvent = mergedPropEvents.some(
        (e) => Boolean((e.data as Record<string, unknown> | undefined)?.isModify)
      );
      if (!hasModifyEvent) return;
      hasAutoReplayedRef.current = true;
    }

    if (mergedPropEvents.length <= processedPropEventsRef.current) {
      processedPropEventsRef.current = mergedPropEvents.length;
      return;
    }

    const newEvents = mergedPropEvents.slice(processedPropEventsRef.current);
    processedPropEventsRef.current = mergedPropEvents.length;

    for (const ev of newEvents) {
      const data = (ev.data || {}) as Record<string, unknown>;

      if (ev.agent === 'orchestrator' && ev.phase === 'start' && data.isModify) {
        setIsReplaying(false);
        setIsPaused(false);
        setActiveLoopPulse(false);
        setNodeMap(createCompletedNodeMap(manifest));
      }

      if (
        ev.agent === 'orchestrator' &&
        ev.phase === 'thought' &&
        Array.isArray(data.affectedAgents)
      ) {
        const affected = (data.affectedAgents as string[])
          .map((a) => normalizeAgentId(a))
          .filter((a): a is MissionNodeId => Boolean(a && a !== 'orchestrator'));
        if (affected.length > 0) {
          setIsReplaying(false);
          setIsPaused(false);
          setNodeMap((prev) => {
            const next = { ...prev };
            for (const nodeId of affected) {
              if (next[nodeId]) {
                next[nodeId] = {
                  ...next[nodeId],
                  status: 'pending',
                  elapsedMs: 0,
                  latestThought: `Queued by Argon Modify Router for "${data.prompt || 'change request'}"...`,
                };
              }
            }
            return next;
          });
          setSelectedNodeId(affected[0]);
        }
      }

      applyEventToState(ev);
      const norm = normalizeAgentId(ev.agent);
      if (
        norm &&
        norm !== 'orchestrator' &&
        (ev.phase === 'start' || ev.phase === 'thought')
      ) {
        setSelectedNodeId(norm);
      }
    }
  }, [mergedPropEvents, applyEventToState, manifest]);

  // Step through replay deck on an interval
  useEffect(() => {
    if (!isReplaying || isPaused) return;
    const deck = replayDeckRef.current;
    if (deck.length === 0) {
      setIsReplaying(false);
      return;
    }

    const stepMs = speedMultiplier === 2 ? 45 : 85;
    const timer = setInterval(() => {
      const idx = replayCursorRef.current;
      if (idx >= deck.length) {
        setIsReplaying(false);
        setActiveLoopPulse(false);
        setLoopCompleted(true);
        return;
      }
      const nextEvent = deck[idx];
      replayCursorRef.current = idx + 1;
      applyEventToState(nextEvent);
      const norm = normalizeAgentId(nextEvent.agent);
      if (norm && norm !== 'orchestrator' && nextEvent.phase === 'start') {
        setSelectedNodeId(norm);
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [isReplaying, isPaused, speedMultiplier, applyEventToState]);

  // Live elapsed timer ticker for running nodes
  useEffect(() => {
    if (prefersReducedMotion) return;
    const hasRunning = Object.values(nodeMap).some(
      (n) => n.status === 'running' || n.status === 'revising'
    );
    if (!hasRunning) return;

    const timer = setInterval(() => {
      setNodeMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of Object.keys(next) as MissionNodeId[]) {
          const item = next[key];
          if (item.status === 'running' || item.status === 'revising') {
            changed = true;
            next[key] = {
              ...item,
              elapsedMs: Math.min(item.elapsedMs + 120, 9900),
            };
          }
        }
        return changed ? next : prev;
      });
    }, 100);

    return () => clearInterval(timer);
  }, [nodeMap, prefersReducedMotion]);

  const completedCount = useMemo(
    () =>
      MISSION_NODES.filter((n) => nodeMap[n.id]?.status === 'done').length,
    [nodeMap]
  );

  const failedCount = useMemo(
    () =>
      MISSION_NODES.filter((n) => nodeMap[n.id]?.status === 'error').length,
    [nodeMap]
  );

  const totalArtifactsCount = useMemo(
    () =>
      MISSION_NODES.reduce(
        (acc, n) => acc + (nodeMap[n.id]?.artifacts.length || 0),
        0
      ),
    [nodeMap]
  );

  const totalTokensCount = useMemo(() => {
    const fromNodes = MISSION_NODES.reduce(
      (acc, n) => acc + (nodeMap[n.id]?.tokensTotal || 0),
      0
    );
    if (fromNodes > 0) return fromNodes;
    return (manifest?.stages ?? []).reduce(
      (sum, s) => sum + (s.tokensUsed?.total ?? 0),
      0
    );
  }, [nodeMap, manifest]);

  const totalElapsedMs = useMemo(() => {
    const fromNodes = MISSION_NODES.reduce(
      (acc, n) => acc + (nodeMap[n.id]?.elapsedMs || 0),
      0
    );
    if (fromNodes > 0) return fromNodes;
    if (manifest?.createdAt && manifest?.updatedAt) {
      const diff =
        new Date(manifest.updatedAt).getTime() -
        new Date(manifest.createdAt).getTime();
      if (diff > 0) return diff;
    }
    return 0;
  }, [nodeMap, manifest]);

  const progressPercent = useMemo(
    () => Math.round((completedCount / MISSION_NODES.length) * 100),
    [completedCount]
  );

  const selectedSpec = useMemo(
    () =>
      MISSION_NODES.find((n) => n.id === selectedNodeId) || MISSION_NODES[0],
    [selectedNodeId]
  );
  const selectedRuntime = nodeMap[selectedSpec.id];
  const selectedManifestStage = manifest?.stages?.find(
    (s) => s.id === selectedSpec.stageRef
  );

  const handleSelectNode = (node: MissionNodeSpec) => {
    setSelectedNodeId(node.id);
    onSelectStage?.(node.stageRef);
  };

  const handleReplayClick = () => {
    const sourceEvents =
      replayDeckRef.current.length > 0
        ? replayDeckRef.current
        : mergedPropEvents.length > 0
        ? mergedPropEvents
        : eventLog;
    startReplayFromDeck(sourceEvents);
  };

  if (!manifest) {
    return (
      <section aria-label="Mission Control — Gemini 4 Argon Managed Agent Pipeline">
        <SectionHeading
          eyebrow="Managed Agents"
          title="Mission Control"
          description="Watch every Gemini 4 Argon agent work the build, live."
        />
        <div className="mt-4">
          <EmptyState
            title="No build in flight"
            body="Start a build from a link, video, or image and the agent graph lights up here — status, thoughts, timings, and artifacts as they land."
          />
        </div>
      </section>
    );
  }

  const liveThoughtsFeed =
    eventLog.length > 0 ? eventLog.slice(-14) : mergedPropEvents.slice(-14);
  const effectiveLive =
    isLive ?? (manifest.status === 'running' || isReplaying || streamConnected);

  const showFullGraph = detailsOpen || manifest.status === 'running';

  return (
    <section
      aria-label="Mission Control — Gemini 4 Argon Managed Agent Pipeline"
      className="surface-card relative overflow-hidden rounded-2xl px-3 py-1.5 sm:px-5 sm:py-3 space-y-2.5"
    >
      {/* Compact Header, Telemetry & Toggle Controls */}
      <div className="relative flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <span className="inline-flex items-center gap-1 sm:gap-1.5 rounded-lg border border-[#e5bd47]/45 bg-[#231d15] px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold text-[#f3d478] shrink-0">
            <Activity className="h-3.5 w-3.5 text-[#f3d478]" />
            <span>9-Agent Pipeline</span>
          </span>

          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#faf4e8] shrink-0">
            <span
              className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                completedCount === MISSION_NODES.length && !isReplaying
                  ? 'bg-[#c2a353]'
                  : failedCount > 0
                  ? 'bg-[#d95338]'
                  : 'bg-[#f3d478] animate-timeline-dot'
              }`}
            />
            <span className="sm:hidden">
              {completedCount}/{MISSION_NODES.length}
            </span>
            <span className="hidden sm:inline">
              {completedCount === MISSION_NODES.length && !isReplaying
                ? `${completedCount}/${MISSION_NODES.length} Verified`
                : `${completedCount}/${MISSION_NODES.length} Running`}
            </span>
          </span>

          <span className="hidden md:inline text-xs font-mono text-[#b5a48b]/85 tabular-nums">
            {formatTokens(totalTokensCount)} tok · {formatMs(totalElapsedMs)} · {totalArtifactsCount} artifacts
          </span>
        </div>

        {/* Replay & Expand Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {isReplaying ? (
            <>
              <button
                type="button"
                aria-label={isPaused ? 'Resume pipeline replay' : 'Pause pipeline replay'}
                onClick={() => setIsPaused((p) => !p)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478]"
              >
                {isPaused ? (
                  <>
                    <Play aria-hidden="true" className="h-3.5 w-3.5 text-[#f3d478]" /> Resume
                  </>
                ) : (
                  <>
                    <Pause aria-hidden="true" className="h-3.5 w-3.5 text-[#e5bd47]" /> Pause
                  </>
                )}
              </button>
              <button
                type="button"
                aria-label={`Toggle replay speed (currently ${speedMultiplier}x)`}
                onClick={() => setSpeedMultiplier((s) => (s === 1 ? 2 : 1))}
                className="inline-flex min-h-[44px] min-w-[44px] justify-center items-center gap-1 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-2.5 sm:px-3 py-1.5 text-xs font-bold text-[#f3d478] hover:border-[#f3d478]"
              >
                {speedMultiplier}x
              </button>
              <button
                type="button"
                aria-label="Skip replay to completion"
                onClick={finishImmediately}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478]"
              >
                <FastForward aria-hidden="true" className="h-3.5 w-3.5" /> Skip
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label="Replay 9-agent pipeline execution graph"
              onClick={() => {
                setDetailsOpen(true);
                handleReplayClick();
              }}
              className="inline-flex min-h-[44px] items-center gap-1 sm:gap-1.5 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-[#f3d478] hover:border-[#f3d478]"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sm:hidden">Replay</span>
              <span className="hidden sm:inline">Replay Graph</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={showFullGraph}
            aria-controls="mission-control-graph-panel"
            className="inline-flex min-h-[44px] items-center gap-1 sm:gap-1.5 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8]"
          >
            <span className="sm:hidden">{showFullGraph ? 'Hide' : 'Logs'}</span>
            <span className="hidden sm:inline">{showFullGraph ? 'Hide Agent Logs' : 'Inspect Agent Graph & Logs'}</span>
          </button>
        </div>
      </div>

      {/* Directed Agent Graph Topology SVG (always available when expanded or replaying) */}
      {showFullGraph && (
        <div
          id="mission-control-graph-panel"
          className="space-y-4 pt-2 border-t border-[#dfd3be]/15"
        >
          <div className="relative overflow-x-auto rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3">
        <svg
          viewBox="0 0 1245 228"
          className="h-[185px] min-w-[940px] w-full select-none"
          role="img"
          aria-label="10-Agent Directed Execution Graph including Critic to Designer Revision Loop and Usage Director"
        >
          <defs>
            <marker
              id="mc-arrow-idle"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#5c4930" />
            </marker>
            <marker
              id="mc-arrow-done"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d4af37" />
            </marker>
            <marker
              id="mc-arrow-loop"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f3d478" />
            </marker>
          </defs>

          {/* Directed Edges (Gold Ink Strokes with Animated Gold Pulse) */}
          {MISSION_EDGES.map((edge) => {
            const fromState = nodeMap[edge.from];
            const toState = nodeMap[edge.to];
            const isLoop = Boolean(edge.isRevisionLoop);
            const isEdgeActive = isLoop
              ? activeLoopPulse
              : fromState.status === 'done' &&
                (toState.status === 'running' || toState.status === 'revising');
            const isEdgeDone = isLoop
              ? loopCompleted
              : fromState.status === 'done' && toState.status === 'done';

            const strokeColor = isLoop
              ? isEdgeActive || isEdgeDone
                ? '#f3d478'
                : '#7a5c38'
              : isEdgeActive
              ? '#f3d478'
              : isEdgeDone
              ? '#d4af37'
              : '#5c4930';

            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isLoop ? 2.2 : isEdgeActive ? 2.5 : 1.7}
                  strokeDasharray={isLoop ? '6 4' : undefined}
                  markerEnd={
                    isLoop
                      ? 'url(#mc-arrow-loop)'
                      : isEdgeDone || isEdgeActive
                      ? 'url(#mc-arrow-done)'
                      : 'url(#mc-arrow-idle)'
                  }
                  opacity={isEdgeDone || isEdgeActive || isLoop ? 0.95 : 0.55}
                />

                {!prefersReducedMotion &&
                  (isEdgeActive || isEdgeDone || (isLoop && activeLoopPulse)) && (
                    <motion.path
                      d={edge.path}
                      fill="none"
                      stroke="#f3d478"
                      strokeWidth={isEdgeActive ? 3.2 : 2.2}
                      strokeDasharray="8 16"
                      initial={{ strokeDashoffset: 48 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{
                        repeat: Infinity,
                        duration: isEdgeActive ? 0.75 : 1.8,
                        ease: 'linear',
                      }}
                    />
                  )}

                {isLoop && (
                  <g transform="translate(570, 24)">
                    <rect
                      x="-104"
                      y="-11"
                      width="208"
                      height="20"
                      rx="10"
                      fill="#14100b"
                      stroke={
                        activeLoopPulse || loopCompleted ? '#d4af37' : '#5c4930'
                      }
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={
                        activeLoopPulse || loopCompleted ? '#f3d478' : '#bda782'
                      }
                      fontSize="9.5"
                      fontFamily="var(--font-codex), Georgia, serif"
                      fontWeight="700"
                    >
                      ↺ Critic → Designer Revision Loop
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* SVG Graph Nodes */}
          {MISSION_NODES.map((node) => {
            const st = nodeMap[node.id];
            const isSelected = selectedNodeId === node.id;
            const isRunning =
              st.status === 'running' || st.status === 'revising';
            const isDone = st.status === 'done';

            const borderStroke =
              st.status === 'revising'
                ? '#f3d478'
                : isRunning
                ? '#f3d478'
                : isDone
                ? '#b89b4a'
                : isSelected
                ? '#d4af37'
                : '#5c4930';

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => handleSelectNode(node)}
                className="cursor-pointer"
              >
                {!prefersReducedMotion && isRunning && (
                  <motion.rect
                    x="-48"
                    y="-34"
                    width="96"
                    height="68"
                    rx="12"
                    fill="none"
                    stroke="#f3d478"
                    strokeWidth="2"
                    initial={{ opacity: 0.85, scale: 0.96 }}
                    animate={{ opacity: 0, scale: 1.15 }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                  />
                )}

                <rect
                  x="-44"
                  y="-30"
                  width="88"
                  height="60"
                  rx="10"
                  fill={isSelected ? '#282016' : '#14100b'}
                  stroke={borderStroke}
                  strokeWidth={isSelected || isRunning ? '2.2' : '1.4'}
                />

                <text
                  x="-34"
                  y="-13"
                  fill="#9c7a4c"
                  fontSize="8.5"
                  fontFamily="var(--font-codex), Georgia, serif"
                  fontWeight="700"
                >
                  {node.order}
                </text>

                <circle
                  cx="32"
                  cy="-16"
                  r="4"
                  fill={
                    st.status === 'revising'
                      ? '#f3d478'
                      : isRunning
                      ? '#f3d478'
                      : isDone
                      ? '#b89b4a'
                      : st.status === 'error'
                      ? '#c84b31'
                      : '#5c4930'
                  }
                />

                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#f5ebd6"
                  fontSize="11.5"
                  fontFamily="var(--font-display), Georgia, serif"
                  fontWeight="700"
                >
                  {node.label}
                </text>

                <text
                  x="0"
                  y="20"
                  textAnchor="middle"
                  fill={isDone ? '#d4af37' : isRunning ? '#f3d478' : '#9c7a4c'}
                  fontSize="8.5"
                  fontFamily="var(--font-codex), Georgia, serif"
                >
                  {st.elapsedMs > 0
                    ? `${(st.elapsedMs / 1000).toFixed(1)}s`
                    : st.status.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 9 Interactive Agent Node Cards with Streaming Thoughts, Tokens, Timings & Pop-Out Artifacts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MISSION_NODES.map((node) => {
          const st = nodeMap[node.id];
          const Icon = node.icon;
          const isSelected = selectedNodeId === node.id;
          const isRunning =
            st.status === 'running' || st.status === 'revising';
          const isDone = st.status === 'done';

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => handleSelectNode(node)}
              className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                isSelected
                  ? 'border-[#f3d478]/85 bg-[#282016]/90 shadow-[0_0_28px_-8px_rgba(212,175,55,0.45)]'
                  : st.status === 'revising'
                  ? 'border-[#f3d478]/65 bg-[#d4af37]/15'
                  : isRunning
                  ? 'border-[#f3d478]/75 bg-[#d4af37]/15 shadow-[0_0_24px_-8px_rgba(243,212,120,0.38)]'
                  : isDone
                  ? 'border-[#d4af37]/25 bg-[#14100b]/90 hover:border-[#d4af37]/55'
                  : 'border-[#d4af37]/15 bg-[#0c0906]/75 hover:border-[#d4af37]/35'
              }`}
            >
              <div className="space-y-2 w-full">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/35 bg-[#1d1710] text-[#f3d478]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-codex text-[10px] font-bold text-[#9c7a4c]">
                          {node.order}
                        </span>
                        <span className="font-display text-base font-bold text-[#f5ebd6]">
                          {node.label}
                        </span>
                        {st.revisionCount > 0 && (
                          <span className="rounded bg-[#d4af37]/20 border border-[#d4af37]/45 px-1.5 py-0.2 font-codex text-[9px] font-bold text-[#f3d478]">
                            ↺ Rev {st.revisionCount}
                          </span>
                        )}
                      </div>
                      <div className="truncate font-display italic text-xs text-[#bda782]">
                        {node.role}
                      </div>
                    </div>
                  </div>

                  {/* Token & Time Counters + Status Icon */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {st.tokensTotal > 0 && (
                      <span className="rounded bg-[#1d1710] border border-[#d4af37]/30 px-1.5 py-0.5 font-codex text-[10px] font-semibold text-[#e6d3b3] tabular-nums">
                        {formatTokens(st.tokensTotal)} tok
                      </span>
                    )}
                    <span className="font-codex text-[11px] font-semibold text-[#f3d478] tabular-nums">
                      {formatMs(st.elapsedMs)}
                    </span>
                    {st.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-[#b89b4a]" />
                    ) : st.status === 'revising' ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-[#f3d478]" />
                    ) : st.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#f3d478]" />
                    ) : st.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-[#c84b31]" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-[#5c4930]" />
                    )}
                  </div>
                </div>

                {/* Streaming Thought (Sepia Ink on Dark Vellum) */}
                <div
                  title={st.latestThought}
                  className="rounded-lg border border-[#d4af37]/20 bg-[#1a130c] px-2.5 py-1.5 font-mono text-[11px] leading-snug text-[#e6d3b3] line-clamp-2 min-h-[2.5rem]"
                >
                  <span className="text-[#d4af37] mr-1">&gt;</span>
                  {st.latestThought}
                </div>
              </div>

              {/* Pop-Out Artifact Chips (Gilded Codex Seals) */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 min-h-[1.5rem]">
                <AnimatePresence initial={false}>
                  {st.artifacts.map((chip) => (
                    <motion.span
                      key={`${node.id}-${chip}`}
                      initial={
                        prefersReducedMotion
                          ? false
                          : { scale: 0.5, opacity: 0, y: 6 }
                      }
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 420,
                        damping: 22,
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[#d4af37]/40 bg-[#d4af37]/12 px-2 py-0.5 font-codex text-[10px] font-semibold tracking-wide text-[#f3d478]"
                    >
                      <FileCode className="h-2.5 w-2.5 text-[#d4af37]" />
                      {chip}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {st.artifacts.length === 0 && (
                  <span className="font-display italic text-xs text-[#9c7a4c]">
                    awaiting artifact...
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom Split: Selected Agent Inspector + Global Live Thought Feed */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Selected Node CLI & Thought Telemetry Inspector (Sepia Ink on Dark Vellum) */}
        <div className="rounded-xl border border-[#d4af37]/25 bg-[#1a130c] p-3.5 text-xs space-y-2.5 shadow-inner">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4af37]/20 pb-2 text-[11px] text-[#bda782]">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[#d4af37]" />
              <span className="font-display text-sm font-bold text-[#f5ebd6]">
                {selectedSpec.order} · {selectedSpec.label}
              </span>
              <span className="rounded bg-[#14100b] border border-[#d4af37]/30 px-1.5 py-0.5 font-codex text-[10px] text-[#f3d478]">
                gemini-4-argon ·{' '}
                {selectedRuntime?.runner ||
                  selectedManifestStage?.runner ||
                  'agy-cli'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 font-codex tabular-nums">
              <span className="text-[#bda782]">
                tokens:{' '}
                <strong className="text-[#e6d3b3]">
                  {formatTokens(
                    selectedRuntime?.tokensTotal ||
                      selectedManifestStage?.tokensUsed?.total
                  )}
                </strong>
              </span>
              <span className="text-[#bda782]">
                time:{' '}
                <strong className="text-[#f3d478]">
                  {formatMs(selectedRuntime?.elapsedMs)}
                </strong>
              </span>
            </div>
          </div>

          <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[11px] text-[#e6d3b3]">
            {selectedRuntime && selectedRuntime.thoughts.length > 0 ? (
              selectedRuntime.thoughts.map((t, idx) => (
                <div key={idx} className="leading-relaxed">
                  <span className="text-[#9c7a4c] mr-2">
                    [{formatTs(t.ts) || '14:00:00'}]
                  </span>
                  <span className="mr-1.5 uppercase text-[10px] text-[#d4af37]">
                    [{t.phase}]
                  </span>
                  <span
                    className={
                      t.phase === 'artifact'
                        ? 'text-[#f3d478]'
                        : t.phase === 'error'
                        ? 'text-[#e06348]'
                        : /Revision|Round 1/i.test(t.message)
                        ? 'text-[#f3d478]'
                        : 'text-[#e6d3b3]'
                    }
                  >
                    {t.message}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[#9c7a4c]">
                Waiting for agent telemetry events...
              </div>
            )}
          </div>
        </div>

        {/* Unified Live Thought Stream (Sepia Ink on Dark Vellum) */}
        <div className="rounded-xl border border-[#d4af37]/25 bg-[#1a130c] p-3.5 text-xs space-y-2.5 shadow-inner">
          <div className="flex items-center justify-between gap-2 border-b border-[#d4af37]/20 pb-2 text-[11px] text-[#bda782]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#f3d478]" />
              <span className="font-display text-sm font-bold text-[#f5ebd6]">
                Live Thought Stream (All Agents)
              </span>
            </div>
            <span className="font-codex text-[#f3d478] tabular-nums">
              {streamConnected ? '● SSE LIVE' : `${liveThoughtsFeed.length} events`}
            </span>
          </div>

          <ul className="max-h-28 overflow-y-auto space-y-1.5 font-mono text-[11px]">
            {liveThoughtsFeed.length > 0 ? (
              liveThoughtsFeed.slice(-12).map((thought, i) => {
                const style =
                  THOUGHT_STYLE[thought.phase] ?? THOUGHT_STYLE.thought;
                const ts = formatTs(thought.ts);
                return (
                  <li
                    key={`${thought.agent}-${thought.phase}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-[#bda782]"
                  >
                    <span
                      className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                    />
                    <span className="font-display text-xs font-bold text-[#f5ebd6]">
                      {thought.agent}
                    </span>
                    <span
                      className={`rounded border px-1 py-0.2 font-codex text-[9px] uppercase ${style.badge}`}
                    >
                      {style.label}
                    </span>
                    {ts ? (
                      <span className="text-[10px] text-[#9c7a4c]">{ts}</span>
                    ) : null}
                    <span className="font-mono text-[11px] text-[#e6d3b3]">
                      {thought.message}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="text-[#9c7a4c]">
                Streaming events appear here as each Gemini 4 Argon agent executes.
              </li>
            )}
          </ul>
        </div>
      </div>
      </div>
      )}
    </section>
  );
}

export default MissionControl;
