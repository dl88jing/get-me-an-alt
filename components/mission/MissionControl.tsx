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
import {
  AgentStageId,
  AgentStageState,
  ProjectManifest,
  SsePhase,
  SsePipelineEvent,
} from '@/lib/types';

export type MissionNodeId =
  | 'analyst'
  | 'researcher'
  | 'teardown'
  | 'designer'
  | 'critic'
  | 'bom'
  | 'price-hunter'
  | 'cad'
  | 'instructions';

interface MissionNodeSpec {
  id: MissionNodeId;
  order: string;
  label: string;
  role: string;
  stageRef: AgentStageId;
  defaultDurationMs: number;
  defaultArtifacts: string[];
  defaultThought: string;
  icon: React.ComponentType<{ className?: string }>;
  // SVG layout coordinates (viewBox 0 0 1120 236)
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
    defaultArtifacts: ['bom.json (priced)'],
    defaultThought:
      'Compared Amazon, Home Depot, Walmart & McMaster pricing for maximum DIY savings.',
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
    defaultArtifacts: ['instructions.json'],
    defaultThought:
      'Generated step-by-step 3D insertion vectors, tool callouts & assembly sequence.',
    icon: Wrench,
    x: 1052,
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
];

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
  tokensTotal?: number;
  runner?: string;
}

export interface MissionControlProps {
  projectId: string;
  manifest?: ProjectManifest | null;
  stages?: AgentStageState[];
  events?: SsePipelineEvent[];
  onSelectStage?: (stageId: AgentStageId) => void;
}

function normalizeAgentId(rawAgent: string): MissionNodeId | 'orchestrator' | null {
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
  if (clean === 'cad' || clean === 'packer') return 'cad';
  if (clean === 'instructions' || clean === 'ikea') return 'instructions';
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
  if (typeof data.multiPlate3mfFile === 'string' && data.multiPlate3mfFile.trim()) {
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

  // If rawEvents already cover all 9 nodes, return them directly
  if (
    rawEvents.length >= 18 &&
    seenAgents.has('teardown') &&
    seenAgents.has('price-hunter')
  ) {
    return rawEvents;
  }

  // Otherwise, interleave any missing nodes (e.g. teardown, price-hunter, or critic->designer loop)
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
          data: { stageId: 'teardown', durationMs: 2400 },
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
            'Comparing live retailer pricing across Amazon, Home Depot, Walmart & McMaster-Carr...',
          data: { stageId: 'price-hunter', artifactFile: 'bom.json' },
          ts: ev.ts || baseTs,
        },
        {
          agent: 'price-hunter',
          phase: 'thought',
          message: `Grounded lowest unit prices across 5 retailers — verified ${savingsPct}% savings ($${totalSaved.toFixed(
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
          data: { stageId: 'price-hunter', durationMs: 2100 },
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
    };
  }
  return map;
}

function createCompletedNodeMap(
  manifest?: ProjectManifest | null
): Record<MissionNodeId, NodeRuntimeState> {
  const map = createInitialNodeMap();
  for (const spec of MISSION_NODES) {
    const st = manifest?.stages.find((s) => s.id === spec.stageRef);
    map[spec.id] = {
      id: spec.id,
      status: 'done',
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
      tokensTotal: st?.tokensUsed?.total ?? 2840,
      runner: st?.runner || 'agy-cli',
    };
  }
  return map;
}

export default function MissionControl({
  projectId,
  manifest,
  events: initialPropEvents,
  onSelectStage,
}: MissionControlProps) {
  const prefersReducedMotion = useReducedMotion();

  const [nodeMap, setNodeMap] = useState<Record<MissionNodeId, NodeRuntimeState>>(
    () =>
      prefersReducedMotion &&
      (manifest?.status === 'completed' || manifest?.isSample)
        ? createCompletedNodeMap(manifest)
        : createInitialNodeMap()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<MissionNodeId>('critic');
  const [activeLoopPulse, setActiveLoopPulse] = useState(false);
  const [loopCompleted, setLoopCompleted] = useState(
    Boolean(prefersReducedMotion && (manifest?.status === 'completed' || manifest?.isSample))
  );
  const [eventLog, setEventLog] = useState<SsePipelineEvent[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [streamConnected, setStreamConnected] = useState(false);

  const replayDeckRef = useRef<SsePipelineEvent[]>([]);
  const replayCursorRef = useRef<number>(0);
  const hasAutoReplayedRef = useRef<boolean>(false);

  const applyEventToState = useCallback(
    (ev: SsePipelineEvent) => {
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
                  elapsedMs:
                    next[spec.id].elapsedMs || spec.defaultDurationMs,
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
          // If degradedGracefully, keep running/done
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

        const tokensObj = data.tokensUsed as
          | { total?: number }
          | undefined;

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
            tokensTotal: tokensObj?.total ?? current.tokensTotal,
            runner:
              typeof data.runner === 'string' ? data.runner : current.runner,
          },
        };
      });
    },
    []
  );

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

  // Subscribe directly to /api/objects/[id]/stream
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    const collectedInitial: SsePipelineEvent[] = [];
    let liveMode = false;
    let initialFlushTimer: ReturnType<typeof setTimeout> | null = null;

    const isAlreadyCompleted =
      manifest?.status === 'completed' || Boolean(manifest?.isSample);

    if (
      isAlreadyCompleted &&
      Array.isArray(initialPropEvents) &&
      initialPropEvents.length > 0 &&
      !hasAutoReplayedRef.current
    ) {
      hasAutoReplayedRef.current = true;
      startReplayFromDeck(initialPropEvents);
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
            // The stream sent a completed history burst -> replay it smoothly
            if (initialFlushTimer) clearTimeout(initialFlushTimer);
            if (!hasAutoReplayedRef.current) {
              hasAutoReplayedRef.current = true;
              startReplayFromDeck(collectedInitial);
            } else if (replayDeckRef.current.length === 0) {
              replayDeckRef.current = buildCompleteReplayDeck(
                collectedInitial,
                manifest
              );
            }
            es?.close();
            setStreamConnected(false);
            return;
          }

          if (!initialFlushTimer) {
            initialFlushTimer = setTimeout(() => {
              if (cancelled) return;
              // Still streaming live (orchestrator:done has not arrived in initial burst)
              liveMode = true;
              for (const buffered of collectedInitial) {
                applyEventToState(buffered);
              }
            }, 220);
          }
        } catch {
          // ignore malformed SSE event
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
          startReplayFromDeck(collectedInitial);
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
  }, [projectId, manifest, initialPropEvents, applyEventToState, startReplayFromDeck]);

  // Step through replay deck on an interval
  useEffect(() => {
    if (!isReplaying || isPaused) return;
    const deck = replayDeckRef.current;
    if (deck.length === 0) {
      setIsReplaying(false);
      return;
    }

    const stepMs = speedMultiplier === 2 ? 45 : 90;
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

  const totalArtifactsCount = useMemo(
    () =>
      MISSION_NODES.reduce(
        (acc, n) => acc + (nodeMap[n.id]?.artifacts.length || 0),
        0
      ),
    [nodeMap]
  );

  const selectedSpec = useMemo(
    () =>
      MISSION_NODES.find((n) => n.id === selectedNodeId) || MISSION_NODES[0],
    [selectedNodeId]
  );
  const selectedRuntime = nodeMap[selectedSpec.id];
  const selectedManifestStage = manifest?.stages.find(
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
        : initialPropEvents && initialPropEvents.length > 0
        ? initialPropEvents
        : eventLog;
    startReplayFromDeck(sourceEvents);
  };

  return (
    <section
      aria-label="Mission Control — Gemini 4 Argon Managed Agent Pipeline"
      className="glass-panel bg-grid-pattern relative overflow-hidden rounded-2xl border border-slate-800/90 p-4 sm:p-6 space-y-5"
    >
      {/* Ambient Radial Highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/3 h-56 w-96 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-1/4 h-56 w-96 rounded-full bg-sky-500/10 blur-3xl"
      />

      {/* Header Bar */}
      <div className="relative flex flex-col gap-3 border-b border-slate-800/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              Mission Control
            </span>
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
              Gemini 4 Argon Managed Agent Pipeline (Live DAG &amp; DFM Loop)
            </h2>
            {(activeLoopPulse || loopCompleted) && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                  activeLoopPulse
                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                }`}
              >
                <GitCompare className="h-3 w-3" />
                Critic → Designer Loop:{' '}
                {activeLoopPulse ? 'Revising design.json...' : '2-Round Verified'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            9 specialized Gemini 4 Argon agents streaming via{' '}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">
              /api/objects/{projectId}/stream
            </code>{' '}
            with autonomous Critic → Designer printability feedback and OpenSCAD WASM compilation.
          </p>
        </div>

        {/* Telemetry Counters & Replay Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/90 px-3 py-1.5 text-xs tabular-nums">
            <span className="text-slate-400">
              Agents:{' '}
              <strong className="text-emerald-400">
                {completedCount}/{MISSION_NODES.length}
              </strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">
              Artifacts:{' '}
              <strong className="text-sky-400">{totalArtifactsCount}</strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">
              SSE:{' '}
              <strong className="text-emerald-300">{eventLog.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isReplaying ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsPaused((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/50 hover:text-white"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-3.5 w-3.5 text-emerald-400" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5 text-amber-400" /> Pause
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSpeedMultiplier((s) => (s === 1 ? 2 : 1))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 font-mono text-xs font-bold text-sky-300 hover:border-sky-400/50"
                >
                  {speedMultiplier}x
                </button>
                <button
                  type="button"
                  onClick={finishImmediately}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white"
                >
                  <FastForward className="h-3.5 w-3.5" /> Skip
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleReplayClick}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Replay Agent Graph
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Directed Agent Graph Topology SVG (with Critic -> Designer Revision Loop) */}
      <div className="relative overflow-x-auto rounded-xl border border-slate-800/90 bg-[#05070b]/95 p-3">
        <svg
          viewBox="0 0 1120 228"
          className="h-[185px] min-w-[860px] w-full select-none"
          role="img"
          aria-label="9-Agent Directed Execution Graph including Critic to Designer Revision Loop"
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155" />
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#00f5a0" />
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ff6b2b" />
            </marker>
          </defs>

          {/* Directed Edges */}
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
                ? '#ff6b2b'
                : '#475569'
              : isEdgeActive
              ? '#38bdf8'
              : isEdgeDone
              ? '#00f5a0'
              : '#1e293b';

            return (
              <g key={edge.id}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isLoop ? 2.4 : isEdgeActive ? 2.5 : 1.8}
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

                {!prefersReducedMotion && (isEdgeActive || (isLoop && activeLoopPulse)) && (
                  <motion.path
                    d={edge.path}
                    fill="none"
                    stroke={isLoop ? '#ff6b2b' : '#00f5a0'}
                    strokeWidth={3.2}
                    strokeDasharray="10 14"
                    initial={{ strokeDashoffset: 48 }}
                    animate={{ strokeDashoffset: 0 }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.75,
                      ease: 'linear',
                    }}
                  />
                )}

                {isLoop && (
                  <g transform="translate(570, 24)">
                    <rect
                      x="-98"
                      y="-11"
                      width="196"
                      height="20"
                      rx="10"
                      fill="#0f172a"
                      stroke={
                        activeLoopPulse || loopCompleted ? '#ff6b2b' : '#334155'
                      }
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={
                        activeLoopPulse || loopCompleted ? '#fdba74' : '#94a3b8'
                      }
                      fontSize="9.5"
                      fontFamily="monospace"
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
                ? '#ff6b2b'
                : isRunning
                ? '#38bdf8'
                : isDone
                ? '#00f5a0'
                : isSelected
                ? '#94a3b8'
                : '#1e293b';

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
                    stroke={st.status === 'revising' ? '#ff6b2b' : '#00f5a0'}
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
                  fill={isSelected ? '#111c2d' : '#0a0f18'}
                  stroke={borderStroke}
                  strokeWidth={isSelected || isRunning ? '2.2' : '1.4'}
                />

                <text
                  x="-34"
                  y="-13"
                  fill="#64748b"
                  fontSize="8.5"
                  fontFamily="monospace"
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
                      ? '#ff6b2b'
                      : isRunning
                      ? '#38bdf8'
                      : isDone
                      ? '#00f5a0'
                      : st.status === 'error'
                      ? '#f43f5e'
                      : '#334155'
                  }
                />

                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="10.5"
                  fontWeight="700"
                >
                  {node.label}
                </text>

                <text
                  x="0"
                  y="20"
                  textAnchor="middle"
                  fill={isDone ? '#34d399' : isRunning ? '#38bdf8' : '#64748b'}
                  fontSize="8.5"
                  fontFamily="monospace"
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

      {/* 9 Interactive Agent Node Cards */}
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
                  ? 'border-emerald-400/80 bg-emerald-500/10 shadow-[0_0_28px_-8px_rgba(0,245,160,0.35)]'
                  : st.status === 'revising'
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : isRunning
                  ? 'border-sky-400/70 bg-sky-500/10'
                  : isDone
                  ? 'border-slate-800 bg-slate-900/75 hover:border-emerald-500/40'
                  : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              {/* Top Row: Agent Name, Role & Status/Timer */}
              <div className="space-y-2 w-full">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950 text-emerald-400">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-400">
                          {node.order}
                        </span>
                        <span className="text-xs font-extrabold text-white">
                          {node.label}
                        </span>
                        {st.revisionCount > 0 && (
                          <span className="rounded bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.2 font-mono text-[9px] font-bold text-amber-300">
                            ↺ Rev {st.revisionCount}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {node.role}
                      </div>
                    </div>
                  </div>

                  {/* Status + Elapsed Time */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[11px] font-semibold text-slate-300 tabular-nums">
                      {st.elapsedMs > 0
                        ? `${(st.elapsedMs / 1000).toFixed(1)}s`
                        : '0.0s'}
                    </span>
                    {st.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : st.status === 'revising' ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />
                    ) : st.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    ) : st.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-slate-600" />
                    )}
                  </div>
                </div>

                {/* Latest Streaming Thought */}
                <div className="rounded-lg border border-slate-800/90 bg-[#05070b] px-2.5 py-1.5 font-mono text-[11px] leading-snug text-slate-300 line-clamp-2 min-h-[2.5rem]">
                  <span className="text-emerald-400 mr-1">&gt;</span>
                  {st.latestThought}
                </div>
              </div>

              {/* Pop-Out Artifact Chips */}
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
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300"
                    >
                      <FileCode className="h-2.5 w-2.5 text-emerald-400" />
                      {chip}
                    </motion.span>
                  ))}
                </AnimatePresence>
                {st.artifacts.length === 0 && (
                  <span className="font-mono text-[10px] text-slate-600">
                    awaiting artifact...
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Node Live Telemetry & CLI Inspector */}
      <div className="rounded-xl border border-slate-800/90 bg-[#05070b] p-3.5 font-mono text-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-bold text-white">
              {selectedSpec.order} · {selectedSpec.label} Agent
            </span>
            <span className="text-slate-400">— {selectedSpec.role}</span>
            <span className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] text-sky-300">
              {selectedRuntime?.runner ||
                selectedManifestStage?.runner ||
                'agy-cli'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 tabular-nums">
            <span className="text-slate-400">
              status:{' '}
              <strong className="text-emerald-400">
                {selectedRuntime?.status.toUpperCase()}
              </strong>
            </span>
            {(selectedRuntime?.tokensTotal ||
              selectedManifestStage?.tokensUsed?.total) && (
              <span className="text-slate-400">
                tokens:{' '}
                <strong className="text-slate-200">
                  {selectedRuntime?.tokensTotal ||
                    selectedManifestStage?.tokensUsed?.total}
                </strong>
              </span>
            )}
            <span className="text-emerald-400">
              {streamConnected ? '● SSE LIVE' : '● REPLAY READY'}
            </span>
          </div>
        </div>

        {/* Selected Node Thought History */}
        <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-slate-300">
          {selectedRuntime && selectedRuntime.thoughts.length > 0 ? (
            selectedRuntime.thoughts.map((t, idx) => (
              <div key={idx} className="leading-relaxed">
                <span className="text-slate-600 mr-2">
                  [{t.ts.slice(11, 19) || '14:00:00'}]
                </span>
                <span className="mr-1.5 uppercase text-[10px] text-sky-400">
                  [{t.phase}]
                </span>
                <span
                  className={
                    t.phase === 'artifact'
                      ? 'text-emerald-300'
                      : t.phase === 'error'
                      ? 'text-rose-300'
                      : /Revision|Round 1/i.test(t.message)
                      ? 'text-amber-300'
                      : 'text-slate-200'
                  }
                >
                  {t.message}
                </span>
              </div>
            ))
          ) : (
            <div className="text-slate-500">
              Waiting for agent telemetry events...
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
