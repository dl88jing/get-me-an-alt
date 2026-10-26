'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  isPresetManifest,
  isPresetProjectSlug,
  manifestToRecentBuild,
  readLocalCachedManifest,
  readLocalRecentBuilds,
  saveLocalRecentBuild,
} from '@/lib/recent-builds';
import {
  AlertCircle,
  ArrowLeft,
  Box,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FileCode,
  Layers,
  Loader2,
  Package,
  Play,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Terminal,
  Truck,
  Wrench,
} from 'lucide-react';
import {
  AgentStageId,
  DesignPart,
  ProjectManifest,
  SsePipelineEvent,
} from '@/lib/types';
import CritiquePanel from './CritiquePanel';
import MissionControl from '@/components/ui/MissionControl';
import ModifyChat from '@/components/ui/ModifyChat';

type TabId =
  | 'overview'
  | 'sources'
  | 'bom'
  | 'print'
  | 'instructions'
  | 'exploded';

function formatSlugTitle(slug: string): string {
  const cleaned = decodeURIComponent(slug || 'diy-build')
    .replace(/-[a-z0-9]*\d[a-z0-9]*$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!cleaned) return 'DIY Alternative Build';
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDurationSec(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`;
}

interface TabStageMeta {
  stageId: AgentStageId;
  stageShort: string;
  stageLabel: string;
  headline: string;
  artifact: string;
  estRange: string;
  estSeconds: number;
  deliverables: string[];
}

const TAB_STAGE_META: Record<TabId, TabStageMeta> = {
  overview: {
    stageId: 'analyst',
    stageShort: 'Stage 01',
    stageLabel: 'Stage 01 · Product Analyst',
    headline: 'Deconstructing Commercial Product & Core Mechanisms',
    artifact: 'analysis.json',
    estRange: '~15–25s',
    estSeconds: 22,
    deliverables: [
      'Retail vs. DIY cost breakdown',
      '3D-printed vs. purchased split',
      'Key mechanisms & DFM notes',
    ],
  },
  sources: {
    stageId: 'researcher',
    stageShort: 'Stage 02',
    stageLabel: 'Stage 02 · Web Researcher & Video Teardown',
    headline: 'Searching Schematics, Open-Source CAD & Teardown Frames',
    artifact: 'sources.json + teardown.json',
    estRange: '~35–60s',
    estSeconds: 50,
    deliverables: [
      'Grounded web & CAD references',
      'Timestamped YouTube teardown frames',
      'Part callouts & dimensions',
    ],
  },
  exploded: {
    stageId: 'designer',
    stageShort: 'Stage 03',
    stageLabel: 'Stage 03–04 · Parametric Designer & DFM Critic',
    headline: 'Synthesizing 3D Assembly Graph & Explode Vectors',
    artifact: 'design.json + critique.json',
    estRange: '~60–90s',
    estSeconds: 80,
    deliverables: [
      'Interactive 3D Exploded View',
      'Parametric part bounding boxes',
      'Part-to-BOM cross-references',
    ],
  },
  bom: {
    stageId: 'bom',
    stageShort: 'Stage 05',
    stageLabel: 'Stage 05 · BOM & Price Hunter',
    headline: 'Comparing Live Retailer Prices & Computing Total Savings',
    artifact: 'bom.json',
    estRange: '~90–130s',
    estSeconds: 115,
    deliverables: [
      'Amazon / McMaster / Walmart links',
      'Unit × quantity cost math',
      'Cheapest retailer auto-selection',
    ],
  },
  print: {
    stageId: 'cad',
    stageShort: 'Stage 06',
    stageLabel: 'Stage 06 · OpenSCAD CAD & Plate Packer',
    headline: 'Compiling Printable STL Geometry & Packing Build Plates',
    artifact: 'plates.json + parts/*.stl',
    estRange: '~2–3 min',
    estSeconds: 155,
    deliverables: [
      'Watertight .STL & multi-plate .3MF',
      '22-printer build plate bin-packing',
      'On-demand print bureau quotes',
    ],
  },
  instructions: {
    stageId: 'instructions',
    stageShort: 'Stage 07',
    stageLabel: 'Stage 07 · Assembly Instructions Choreographer',
    headline: 'Sequencing Step-by-Step 3D Motion & Fastener Callouts',
    artifact: 'instructions.json',
    estRange: '~3–3.5 min',
    estSeconds: 190,
    deliverables: [
      'IKEA-style animated 3D player',
      'Ordered step-by-step tool list',
      '3D part insertion trajectories',
    ],
  },
};
/**
 * Dynamically resolves optional peer components from `components/` (hark-superdev,
 * superdev-muse-solana, superdev-muse-dl88jing) when present in the repo,
 * without failing the build when those files have not been merged yet.
 */
function resolveOptionalPeerComponent(
  candidatePatterns: string[]
): React.ComponentType<Record<string, unknown>> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (require as any).context(
      '../../../components',
      true,
      /\.(tsx|jsx)$/
    );
    const availableKeys: string[] = ctx.keys();
    for (const pattern of candidatePatterns) {
      const matchedKey = availableKeys.find((k) =>
        k.toLowerCase().includes(pattern.toLowerCase())
      );
      if (matchedKey) {
        const mod = ctx(matchedKey);
        const comp =
          (mod?.default as React.ComponentType<Record<string, unknown>>) ||
          (Object.values(mod || {}).find(
            (v) => typeof v === 'function'
          ) as React.ComponentType<Record<string, unknown>>);
        if (comp) return comp;
      }
    }
  } catch {
    // Peer component not present yet
  }
  return null;
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params?.id || 'plant-auto-waterer';

  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [streamEvents, setStreamEvents] = useState<SsePipelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedStageId, setSelectedStageId] =
    useState<AgentStageId>('analyst');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedService, setSelectedService] = useState('craftcloud');
  const [shippingZip, setShippingZip] = useState('94107');
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [stepNoteExpanded, setStepNoteExpanded] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const syncedBuildRef = useRef<string>('');

  // Live 1s elapsed timer during active pipeline builds
  useEffect(() => {
    if (!manifest || manifest.status !== 'running') return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [manifest?.status]);

  // Persist non-preset project to localStorage when page loads and on live run completion
  useEffect(() => {
    if (!manifest || isPresetManifest(manifest)) return;

    const entry = manifestToRecentBuild(manifest);
    saveLocalRecentBuild(
      entry,
      manifest.status === 'completed' ? manifest : undefined
    );

    if (
      manifest.status === 'completed' ||
      Boolean(manifest.analysis && manifest.bom)
    ) {
      const syncKey = `${entry.slug}:${manifest.status}:${entry.altPrice}:${entry.originalPrice}`;
      if (syncedBuildRef.current !== syncKey) {
        syncedBuildRef.current = syncKey;
        void fetch('/api/my-builds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            build: entry,
            manifest: manifest.status === 'completed' ? manifest : undefined,
          }),
        }).catch(() => {});
      }
    }
  }, [manifest]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    async function loadInitial() {
      setStreamError(null);
      const cachedManifest = !isPresetProjectSlug(projectId)
        ? readLocalCachedManifest(projectId)
        : null;
      const localEntry = !isPresetProjectSlug(projectId)
        ? readLocalRecentBuilds().find((b) => b.slug === projectId)
        : null;

      if (cachedManifest && cachedManifest.status === 'completed') {
        setManifest(cachedManifest);
        setLoading(false);
      }

      if (localEntry && !cachedManifest) {
        await fetch('/api/my-builds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ build: localEntry }),
        }).catch(() => {});
      }

      const searchParams =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
      const fallbackUrl =
        searchParams.get('url')?.trim() ||
        cachedManifest?.input?.url ||
        (localEntry && /^https?:\/\//i.test(localEntry.input)
          ? localEntry.input
          : undefined);
      const fallbackPrompt =
        searchParams.get('prompt')?.trim() || cachedManifest?.input?.prompt;
      const fallbackPrinterId =
        searchParams.get('printerId')?.trim() ||
        cachedManifest?.input?.printerId;

      const apiQuery = new URLSearchParams();
      if (fallbackUrl) apiQuery.set('url', fallbackUrl);
      if (fallbackPrompt) apiQuery.set('prompt', fallbackPrompt);
      if (fallbackPrinterId) apiQuery.set('printerId', fallbackPrinterId);
      const qsSuffix = apiQuery.toString() ? `?${apiQuery.toString()}` : '';

      try {
        const res = await fetch(`/api/objects/${projectId}${qsSuffix}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.manifest) {
            const serverManifest = data.manifest as ProjectManifest;
            if (
              cachedManifest &&
              cachedManifest.status === 'completed' &&
              serverManifest.status === 'running' &&
              serverManifest.stages.every((s) => s.status === 'pending' || s.status === 'running') &&
              !serverManifest.analysis
            ) {
              // Cold container reconstructed a stub; restore our completed manifest
              setManifest(cachedManifest);
              void fetch('/api/my-builds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  build: manifestToRecentBuild(cachedManifest),
                  manifest: cachedManifest,
                }),
              }).catch(() => {});
              setLoading(false);
              return;
            }
            setManifest(serverManifest);
            if (Array.isArray(data.events)) {
              setStreamEvents(data.events);
            }
            setLoading(false);
            if (
              serverManifest.status === 'completed' ||
              serverManifest.status === 'error'
            ) {
              return;
            }
          }
        }
      } catch {
        // continue to SSE
      }

      es = new EventSource(`/api/objects/${projectId}/stream${qsSuffix}`);
      es.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(evt.data);
          if (
            parsed &&
            typeof parsed.agent === 'string' &&
            typeof parsed.phase === 'string'
          ) {
            const sseEvt = parsed as SsePipelineEvent;
            setStreamEvents((prev) => [...prev.slice(-120), sseEvt]);
            if (sseEvt.phase === 'error' && sseEvt.message) {
              setStreamError(sseEvt.message);
            }
            const evtData = (sseEvt.data || {}) as Record<string, unknown>;
            const updated = evtData.manifest as ProjectManifest | undefined;
            if (updated && Array.isArray(updated.stages)) {
              setManifest(updated);
              setLoading(false);
              if (updated.status === 'completed') {
                setStreamError(null);
              }
              const running = updated.stages.find(
                (s) => s.status === 'running'
              );
              if (running) {
                setSelectedStageId(running.id);
              }
              if (
                updated.status === 'completed' ||
                updated.status === 'error'
              ) {
                es?.close();
              }
            } else if (
              sseEvt.agent === 'orchestrator' &&
              (sseEvt.phase === 'done' || sseEvt.phase === 'error')
            ) {
              es?.close();
            }
          } else if (parsed && Array.isArray(parsed.stages)) {
            const updated = parsed as ProjectManifest;
            setManifest(updated);
            setLoading(false);
            if (updated.status === 'completed') {
              setStreamError(null);
            }
            const running = updated.stages.find((s) => s.status === 'running');
            if (running) {
              setSelectedStageId(running.id);
            }
            if (updated.status === 'completed' || updated.status === 'error') {
              es?.close();
            }
          }
        } catch {
          // ignore malformed chunk
        }
      };
      es.onerror = () => {
        setLoading(false);
        setManifest((cur) => {
          if (!cur) {
            setStreamError(
              'Connection to the live build stream was interrupted before artifacts arrived.'
            );
          }
          return cur;
        });
        es?.close();
      };
    }

    loadInitial();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [projectId, retryCount]);

  const handleRetryProject = () => {
    setStreamError(null);
    setLoading(true);
    setRetryCount((c) => c + 1);
  };

  const PeerSourcesComp = useMemo(
    () => resolveOptionalPeerComponent(['sources/Sources', 'sources/index']),
    []
  );
  const PeerBomComp = useMemo(
    () => resolveOptionalPeerComponent(['bom/Bom', 'bom/index']),
    []
  );
  const PeerPrintComp = useMemo(
    () =>
      resolveOptionalPeerComponent([
        'print/Print',
        'print/Plate',
        'print/index',
      ]),
    []
  );
  const PeerInstructionsComp = useMemo(
    () =>
      resolveOptionalPeerComponent([
        'three/Instructions',
        'three/Assembly',
        'three/Ikea',
      ]),
    []
  );
  const PeerExplodedComp = useMemo(
    () =>
      resolveOptionalPeerComponent(['three/Exploded', 'three/Viewer']),
    []
  );

  if (typeof window !== 'undefined' && manifest) {
    (window as unknown as { __ALT_MANIFEST__?: ProjectManifest }).__ALT_MANIFEST__ =
      manifest;
  }

  if (loading && !manifest) {
    const skeletonTitle = formatSlugTitle(projectId);
    const skeletonTabs: {
      id: TabId;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
    }[] = [
      { id: 'overview', label: 'Overview', icon: Sparkles },
      { id: 'sources', label: 'Sources', icon: Search },
      { id: 'bom', label: 'BOM', icon: ShoppingCart },
      { id: 'print', label: 'Print Files', icon: Printer },
      { id: 'instructions', label: 'Instructions', icon: Wrench },
      { id: 'exploded', label: 'Exploded View', icon: Layers },
    ];

    return (
      <div
        className="space-y-2.5 sm:space-y-4 pb-24 sm:pb-16"
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading DIY alternative build workspace"
      >
        {/* Layout-Preserving Sticky Project Header Skeleton */}
        <div className="sticky top-14 sm:top-16 z-40 -mx-1.5 sm:-mx-2 rounded-2xl border border-[#dfd3be]/25 bg-[#17130e]/95 backdrop-blur-md px-2.5 py-2 sm:px-6 sm:py-3 shadow-glass space-y-1.5 sm:space-y-2.5">
          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-[#b5a48b]">
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <Link
                    href="/"
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1.5 font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors shrink-0"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> All Builds
                  </Link>
                  <span className="hidden sm:inline text-[#b5a48b]/50">/</span>
                  <span className="hidden sm:inline-block h-4 w-28 rounded-md skeleton-shimmer" />
                </div>

                {/* Mobile Price & Savings Pill Skeleton */}
                <div className="flex sm:hidden items-center gap-1.5 rounded-xl border border-[#e5bd47]/35 bg-[#0c0a08] px-2.5 py-1.5 shrink-0">
                  <span className="h-3.5 w-8 rounded skeleton-shimmer" />
                  <span className="text-[11px] text-[#b5a48b]">→</span>
                  <span className="h-5 w-14 rounded skeleton-shimmer" />
                  <span className="h-4 w-10 rounded-md bg-[#e5bd47]/25 animate-pulse" />
                </div>
              </div>

              <div className="flex items-center gap-2.5 min-w-0">
                <h1 className="font-display text-lg sm:text-3xl font-bold tracking-tight text-[#faf4e8] truncate">
                  {skeletonTitle}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5bd47]/35 bg-[#e5bd47]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#f3d478] shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading Build
                </span>
              </div>
              <div className="hidden sm:block h-4 w-96 max-w-full rounded-md skeleton-shimmer" />
            </div>

            {/* Desktop Price Comparison & Savings Skeleton */}
            <div className="hidden sm:flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-xl border border-[#e5bd47]/35 bg-[#0c0a08] px-3 py-1.5 sm:px-4 sm:py-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <span className="h-4 w-14 rounded skeleton-shimmer" />
                <span className="text-xs sm:text-sm text-[#b5a48b]">→</span>
                <span className="h-7 w-20 rounded-md skeleton-shimmer" />
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#dfd3be]">
                  DIY
                </span>
              </div>
              <div className="h-7 w-28 rounded-lg bg-[#e5bd47]/25 border border-[#e5bd47]/35 animate-pulse" />
            </div>
          </div>

          {/* Interactive Layout-Preserving Segmented Tab Bar */}
          <div
            role="tablist"
            aria-label="Project Sections"
            className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-1 sm:p-1.5"
          >
            {skeletonTabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  data-tab-id={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`relative inline-flex min-h-[44px] snap-start shrink-0 lg:flex-1 whitespace-nowrap items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[#e5bd47] text-[#140e07] font-bold shadow-md'
                      : 'bg-transparent text-[#dfd3be] hover:bg-[#231d15] hover:text-[#faf4e8]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span>{t.label}</span>
                  {t.id !== 'overview' && (
                    <span
                      className={`h-4 w-10 rounded-md ${
                        active ? 'bg-[#140e07]/20' : 'skeleton-shimmer'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Layout-Preserving Compact Agent Bars (Ask Argon + Pipeline Telemetry) */}
        <div className="space-y-2.5">
          <div className="rounded-2xl border border-[#dfd3be]/20 bg-[#17130e]/95 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5bd47]/35 bg-[#e5bd47]/15 text-[#f3d478] shrink-0">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-[#faf4e8] truncate">
                  Ask Argon to Modify Build
                </div>
                <div className="h-3 w-48 sm:w-72 max-w-full rounded skeleton-shimmer" />
              </div>
            </div>
            <div className="h-8 w-20 rounded-lg skeleton-shimmer shrink-0" />
          </div>

          <div className="rounded-2xl border border-[#dfd3be]/20 bg-[#17130e]/95 px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="h-4 w-4 animate-spin text-[#f3d478] shrink-0" />
              <span className="text-xs font-semibold text-[#dfd3be] truncate">
                Hydrating 9-Agent Pipeline Telemetry &amp; Build Artifacts...
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span className="h-5 w-24 rounded-md skeleton-shimmer" />
              <span className="h-5 w-16 rounded-md skeleton-shimmer" />
            </div>
          </div>
        </div>

        {/* Layout-Preserving 3-Column Overview & Card Grid Skeleton */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl surface-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="h-6 w-28 rounded-md skeleton-shimmer" />
                <span className="h-4 w-56 rounded skeleton-shimmer" />
              </div>
              <div className="space-y-2">
                <div className="h-7 w-11/12 rounded-md skeleton-shimmer" />
                <div className="h-7 w-3/5 rounded-md skeleton-shimmer" />
              </div>
              <div className="space-y-2 pt-1">
                <div className="h-4 w-full rounded skeleton-shimmer" />
                <div className="h-4 w-5/6 rounded skeleton-shimmer" />
              </div>
              <div className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#f3d478]/80">
                  Core Engineering Function
                </div>
                <div className="h-4 w-full rounded skeleton-shimmer" />
                <div className="h-4 w-4/5 rounded skeleton-shimmer" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: '3D-Printed Parts', Icon: Printer },
                { label: 'Off-the-Shelf Hardware', Icon: ShoppingCart },
              ].map(({ label, Icon }) => (
                <div
                  key={label}
                  className="rounded-2xl surface-card p-5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                    <Icon className="h-4 w-4 text-[#e5bd47]" />
                    <span>{label}</span>
                  </div>
                  <div className="space-y-2.5 pt-1">
                    <div className="h-4 w-11/12 rounded skeleton-shimmer" />
                    <div className="h-4 w-4/5 rounded skeleton-shimmer" />
                    <div className="h-4 w-5/6 rounded skeleton-shimmer" />
                    <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl surface-card p-5 space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Key Mechanisms
              </h3>
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 space-y-2"
                  >
                    <div className="h-3.5 w-full rounded skeleton-shimmer" />
                    <div className="h-3.5 w-3/4 rounded skeleton-shimmer" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl surface-card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                DFM &amp; Slicer Notes
              </h3>
              <div className="space-y-2.5">
                <div className="h-4 w-full rounded skeleton-shimmer" />
                <div className="h-4 w-5/6 rounded skeleton-shimmer" />
                <div className="h-4 w-4/5 rounded skeleton-shimmer" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom-Safe Mobile Sticky Action Bar Skeleton */}
        <div
          role="region"
          aria-label="Quick Mobile Project Actions"
          className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#dfd3be]/25 bg-[#17130e]/95 backdrop-blur-md px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_32px_rgba(0,0,0,0.85)]"
        >
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <div className="btn-secondary-surface min-h-[44px] px-3 py-2 text-xs font-semibold shrink-0 opacity-75">
              <Layers className="h-3.5 w-3.5 text-[#f3d478]" />
              <span>3D Exploded</span>
            </div>
            <div className="btn-primary-gold min-h-[44px] flex-1 px-3.5 py-2 text-xs font-bold opacity-85">
              <Printer className="h-3.5 w-3.5" />
              <span>Get Print Files (STL/3MF)</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded-2xl border border-[#e06348]/50 bg-[#2a0f0a]/85 p-6 sm:p-8 text-center space-y-4 max-w-xl mx-auto my-6"
      >
        <AlertCircle className="mx-auto h-9 w-9 text-[#e06348]" />
        <div className="space-y-1.5">
          <h2 className="font-display text-2xl font-bold text-[#faf4e8]">
            Project Not Found
          </h2>
          <p className="text-xs sm:text-sm text-[#dfd3be] max-w-md mx-auto leading-relaxed">
            {streamError ||
              `We couldn't load or stream build artifacts for "${projectId}". Retry loading this build or open an instant verified demo.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleRetryProject}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#f3d478]/50 bg-[#231d15] px-4 py-2 text-xs sm:text-sm font-bold text-[#f3d478] hover:border-[#f3d478] hover:bg-[#2e261c] transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </button>
          <Link
            href="/projects/plant-auto-waterer"
            className="btn-primary-gold min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold"
          >
            <Sparkles className="h-4 w-4" />
            Open Instant Demo
          </Link>
          <Link
            href="/"
            className="btn-secondary-surface min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const {
    analysis,
    sources,
    teardown,
    design,
    critique,
    bom,
    plates,
    instructions,
  } = manifest;
  const activeStage =
    manifest.stages.find((s) => s.id === selectedStageId) ||
    manifest.stages[0];

  const selectedPart: DesignPart | undefined =
    design?.parts.find((p) => p.id === selectedPartId) || design?.parts[0];

  const TABS: {
    id: TabId;
    label: string;
    badge?: string;
    isPending?: boolean;
    isStageRunning?: boolean;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'overview',
      label: 'Overview',
      badge: !analysis ? TAB_STAGE_META.overview.stageShort : undefined,
      isPending: !analysis,
      isStageRunning:
        !analysis &&
        manifest.stages.find((s) => s.id === 'analyst')?.status === 'running',
      icon: Sparkles,
    },
    {
      id: 'sources',
      label: 'Sources',
      badge: sources
        ? String(sources.sources.length)
        : TAB_STAGE_META.sources.stageShort,
      isPending: !sources,
      isStageRunning:
        !sources &&
        manifest.stages.find((s) => s.id === 'researcher')?.status ===
          'running',
      icon: Search,
    },
    {
      id: 'bom',
      label: 'BOM',
      badge: bom
        ? `$${bom.summary.totalDiyCost.toFixed(2)}`
        : TAB_STAGE_META.bom.stageShort,
      isPending: !bom,
      isStageRunning:
        !bom &&
        manifest.stages.find((s) => s.id === 'bom')?.status === 'running',
      icon: ShoppingCart,
    },
    {
      id: 'print',
      label: 'Print Files',
      badge: plates
        ? `${plates.totalPlates} ${plates.totalPlates === 1 ? 'plate' : 'plates'}`
        : TAB_STAGE_META.print.stageShort,
      isPending: !plates,
      isStageRunning:
        !plates &&
        manifest.stages.find((s) => s.id === 'cad')?.status === 'running',
      icon: Printer,
    },
    {
      id: 'instructions',
      label: 'Instructions',
      badge: instructions
        ? `${instructions.steps.length} steps`
        : TAB_STAGE_META.instructions.stageShort,
      isPending: !instructions,
      isStageRunning:
        !instructions &&
        manifest.stages.find((s) => s.id === 'instructions')?.status ===
          'running',
      icon: Wrench,
    },
    {
      id: 'exploded',
      label: 'Exploded View',
      badge: design
        ? `${design.parts.length} parts`
        : TAB_STAGE_META.exploded.stageShort,
      isPending: !design,
      isStageRunning:
        !design &&
        manifest.stages.some(
          (s) =>
            (s.id === 'designer' || s.id === 'critic') &&
            s.status === 'running'
        ),
      icon: Layers,
    },
  ];

  const isCanvasTab =
    activeTab === 'exploded' || activeTab === 'instructions';

  const agentBars = (
    <div className="space-y-2.5">
      {/* Compact Collapsible Ask Argon to Modify Panel */}
      <ModifyChat
        projectId={manifest.id}
        manifest={manifest}
        onEvent={(ev) => setStreamEvents((prev) => [...prev.slice(-150), ev])}
        onManifestUpdate={(updated) => setManifest(updated)}
      />

      {/* Compact Collapsible Mission Control Telemetry Bar */}
      <MissionControl
        projectId={manifest.id}
        manifest={manifest}
        stages={manifest.stages}
        events={streamEvents}
        onSelectStage={(id) => setSelectedStageId(id)}
      />
    </div>
  );

  return (
    <div className="space-y-2.5 sm:space-y-4 pb-24 sm:pb-16">
      {/* Sticky Project Header: Object Name, Dominant Price -> Alt Price + Savings, and Segmented Tabs */}
      <div className="sticky top-14 sm:top-16 z-40 -mx-1.5 sm:-mx-2 rounded-2xl border border-[#dfd3be]/25 bg-[#17130e]/95 backdrop-blur-md px-2.5 py-2 sm:px-6 sm:py-3 shadow-glass space-y-1.5 sm:space-y-2.5">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            {/* Top row: Back button (44px target) + Category on desktop + Compact Price/Savings pill on mobile */}
            <div className="flex items-center justify-between gap-2 text-xs text-[#b5a48b]">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Link
                  href="/"
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1.5 font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> All Builds
                </Link>
                {analysis?.category ? (
                  <>
                    <span className="hidden sm:inline">/</span>
                    <span className="hidden sm:inline truncate text-[#b5a48b]">
                      {analysis.category}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline text-[#b5a48b]/50">/</span>
                    <span className="hidden sm:inline-block h-4 w-28 rounded-md skeleton-shimmer" />
                  </>
                )}
              </div>

              {/* Compact Mobile Price & Savings Pill (fits on same row as Back button on <sm) */}
              {bom ? (
                <div className="flex sm:hidden items-center gap-1.5 rounded-xl border border-[#e5bd47]/45 bg-[#0c0a08] px-2.5 py-1.5 shrink-0 tabular-nums">
                  <span className="text-[11px] text-[#b5a48b] line-through">
                    ${bom.summary.originalRetailPrice.toFixed(0)}
                  </span>
                  <span className="text-[11px] text-[#b5a48b]">→</span>
                  <span className="font-display text-base font-bold text-[#faf4e8]">
                    ${bom.summary.totalDiyCost.toFixed(2)}
                  </span>
                  <span className="rounded-md bg-[#e5bd47] px-1.5 py-0.5 text-[11px] font-bold text-[#140e07]">
                    -{bom.summary.savingsPercent}%
                  </span>
                </div>
              ) : (
                <div className="flex sm:hidden items-center gap-1.5 rounded-xl border border-[#e5bd47]/35 bg-[#0c0a08] px-2.5 py-1.5 shrink-0 tabular-nums">
                  {analysis ? (
                    <>
                      <span className="text-[11px] text-[#b5a48b] line-through">
                        ${analysis.originalProduct.retailPrice.toFixed(0)}
                      </span>
                      <span className="text-[11px] text-[#b5a48b]">→</span>
                      <span className="font-display text-base font-bold text-[#faf4e8]">
                        ~${analysis.targetDiyCost.toFixed(0)}
                      </span>
                      <span className="rounded-md border border-[#e5bd47]/40 bg-[#e5bd47]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#f3d478]">
                        Est.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-3.5 w-8 rounded skeleton-shimmer" />
                      <span className="text-[11px] text-[#b5a48b]">→</span>
                      <span className="h-5 w-14 rounded skeleton-shimmer" />
                    </>
                  )}
                </div>
              )}
            </div>

            <h1 className="font-display text-lg sm:text-3xl font-bold tracking-tight text-[#faf4e8] truncate">
              {manifest.title}
            </h1>
            {analysis?.tagline ? (
              <p className="hidden sm:block text-sm text-[#dfd3be] max-w-2xl truncate">
                {analysis.tagline}
              </p>
            ) : (
              <div className="hidden sm:block h-4 w-96 max-w-full rounded-md skeleton-shimmer" />
            )}
          </div>

          {/* Dominant Price Comparison & Savings (sm+ tablet/desktop) */}
          {bom ? (
            <div className="hidden sm:flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-xl border border-[#e5bd47]/45 bg-[#0c0a08] px-3 py-1.5 sm:px-4 sm:py-2.5 shrink-0">
              <div className="flex items-baseline gap-1.5 sm:gap-2.5 tabular-nums min-w-0">
                <span
                  className="text-xs sm:text-sm text-[#b5a48b] line-through"
                  title="Original Retail Price"
                >
                  ${bom.summary.originalRetailPrice.toFixed(2)}
                </span>
                <span className="text-xs sm:text-sm text-[#b5a48b]">→</span>
                <span
                  className="font-display text-xl sm:text-3xl font-bold text-[#faf4e8]"
                  title="DIY Alternative Total Cost"
                >
                  ${bom.summary.totalDiyCost.toFixed(2)}
                </span>
                <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#dfd3be]">
                  DIY
                </span>
              </div>

              <div className="rounded-lg bg-[#e5bd47] px-2.5 py-1 sm:px-3 sm:py-1.5 text-[#140e07] font-sans font-bold text-xs sm:text-sm tabular-nums shadow-sm shrink-0">
                Save ${bom.summary.totalSavings.toFixed(2)} (
                {bom.summary.savingsPercent}%)
              </div>
            </div>
          ) : (
            <div className="hidden sm:flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-xl border border-[#e5bd47]/35 bg-[#0c0a08] px-3 py-1.5 sm:px-4 sm:py-2.5 shrink-0 tabular-nums">
              {analysis ? (
                <>
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-xs sm:text-sm text-[#b5a48b] line-through">
                      ${analysis.originalProduct.retailPrice.toFixed(2)}
                    </span>
                    <span className="text-xs sm:text-sm text-[#b5a48b]">→</span>
                    <span className="font-display text-xl sm:text-3xl font-bold text-[#faf4e8]">
                      ~${analysis.targetDiyCost.toFixed(2)}
                    </span>
                    <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#dfd3be]">
                      Est. DIY
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5bd47]/40 bg-[#e5bd47]/15 px-2.5 py-1 text-xs font-bold text-[#f3d478]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Stage 05 · Pricing BOM
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-14 rounded skeleton-shimmer" />
                    <span className="text-xs sm:text-sm text-[#b5a48b]">→</span>
                    <span className="h-7 w-20 rounded-md skeleton-shimmer" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5bd47]/35 bg-[#e5bd47]/10 px-2.5 py-1 text-xs font-semibold text-[#f3d478]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Stage 05 · BOM
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* High-Contrast Scrollable Segmented Tab Control (Single-row horizontally scrollable on mobile, >= 44px targets) */}
        <div
          role="tablist"
          aria-label="Project Sections"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            e.preventDefault();
            const curIdx = TABS.findIndex((t) => t.id === activeTab);
            const nextIdx =
              e.key === 'ArrowRight'
                ? (curIdx + 1) % TABS.length
                : (curIdx - 1 + TABS.length) % TABS.length;
            const nextTab = TABS[nextIdx];
            if (nextTab) {
              setActiveTab(nextTab.id);
              const btn = e.currentTarget.querySelector<HTMLElement>(
                `[data-tab-id="${nextTab.id}"]`
              );
              btn?.focus();
              btn?.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
              });
            }
          }}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-1 sm:p-1.5"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                data-tab-id={t.id}
                type="button"
                onClick={(e) => {
                  setActiveTab(t.id);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest',
                  });
                }}
                className={`relative inline-flex min-h-[44px] snap-start shrink-0 lg:flex-1 whitespace-nowrap items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold transition-all ${
                  active
                    ? 'bg-[#e5bd47] text-[#140e07] font-bold shadow-md'
                    : 'bg-transparent text-[#dfd3be] hover:bg-[#231d15] hover:text-[#faf4e8]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] sm:text-xs font-mono tabular-nums ${
                      active
                        ? 'bg-[#140e07]/15 text-[#140e07] font-bold'
                        : t.isStageRunning
                        ? 'border border-[#e5bd47]/40 bg-[#e5bd47]/15 text-[#f3d478]'
                        : 'bg-[#231d15] text-[#b5a48b]'
                    }`}
                  >
                    {t.isStageRunning && (
                      <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
                    )}
                    <span>{t.badge}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Ask Argon + Pipeline bars above tab content on non-canvas tabs; below canvas on Exploded View & Instructions */}
      {!isCanvasTab && agentBars}

      {/* Actionable SSE / Pipeline Error Banner with 1-click Retry & Instant Demo fallback */}
      {(streamError ||
        manifest.status === 'error' ||
        manifest.stages.some((s) => s.status === 'error')) && (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-[#e06348]/50 bg-[#2a0f0a]/85 px-4 py-3 text-xs sm:text-sm text-[#faf4e8]"
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#e06348] mt-0.5 sm:mt-0" />
            <span className="font-medium text-[#faf4e8]">
              {streamError ||
                manifest.stages
                  .find((s) => s.status === 'error')
                  ?.logs?.slice(-1)[0]?.message ||
                'An agent stage encountered an error while streaming artifacts.'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRetryProject}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#f3d478]/50 bg-[#231d15] px-3 py-1.5 text-xs font-bold text-[#f3d478] hover:border-[#f3d478] hover:bg-[#2e261c] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#e5bd47] px-3 py-1.5 text-xs font-bold text-[#140e07] hover:bg-[#f3d478] transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Open Instant Demo
            </Link>
          </div>
        </div>
      )}

      {/* Per-Tab Progressive Stage ETA & Live Shimmer Skeleton Cards (P2) */}
      {((activeTab === 'overview' && !analysis) ||
        (activeTab === 'sources' && !sources) ||
        (activeTab === 'bom' && !bom) ||
        (activeTab === 'print' && !plates) ||
        (activeTab === 'instructions' && !instructions) ||
        (activeTab === 'exploded' && !design)) &&
        (() => {
          const meta = TAB_STAGE_META[activeTab];
          const targetStage = manifest.stages.find(
            (s) => s.id === meta.stageId
          );
          const runningStage =
            manifest.stages.find((s) => s.status === 'running') || targetStage;
          const completedStagesCount = manifest.stages.filter(
            (s) => s.status === 'completed'
          ).length;
          const totalStagesCount = Math.max(1, manifest.stages.length);
          const isTargetActive =
            targetStage?.status === 'running' ||
            (activeTab === 'exploded' &&
              manifest.stages.some(
                (s) =>
                  (s.id === 'designer' || s.id === 'critic') &&
                  s.status === 'running'
              ));

          const createdTime = Date.parse(manifest.createdAt || '');
          const stageStartTime = Date.parse(
            (isTargetActive
              ? targetStage?.startedAt
              : runningStage?.startedAt) || ''
          );
          const pipelineElapsedSec = Number.isFinite(createdTime)
            ? Math.max(1, Math.floor((nowMs - createdTime) / 1000))
            : Math.max(
                1,
                Math.floor(
                  manifest.stages.reduce(
                    (acc, s) => acc + (s.durationMs || 0),
                    0
                  ) / 1000
                )
              );
          const activeStageElapsedSec = Number.isFinite(stageStartTime)
            ? Math.max(1, Math.floor((nowMs - stageStartTime) / 1000))
            : pipelineElapsedSec;

          const latestEvent =
            [...streamEvents]
              .reverse()
              .find((ev) => ev.message && ev.message.trim().length > 0) || null;
          const latestLogMessage =
            latestEvent?.message ||
            runningStage?.logs?.[runningStage.logs.length - 1]?.message ||
            targetStage?.description ||
            'Synthesizing parametric DIY build artifacts...';

          const progressPct = Math.min(
            94,
            Math.max(
              12,
              Math.round(
                ((completedStagesCount + (isTargetActive ? 0.55 : 0.25)) /
                  totalStagesCount) *
                  100
              )
            )
          );

          return (
            <div
              className="space-y-4 sm:space-y-6"
              aria-busy="true"
              aria-live="polite"
            >
              {/* Progressive Stage Status, Elapsed Timer & ETA Card */}
              <div className="rounded-2xl border border-[#e5bd47]/40 bg-[#17130e]/95 p-4 sm:p-6 shadow-glass space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e5bd47] px-2.5 py-1 text-xs font-bold text-[#140e07]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        <span>{meta.stageLabel}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                          isTargetActive
                            ? 'border-[#e5bd47]/45 bg-[#e5bd47]/15 text-[#f3d478]'
                            : 'border-[#dfd3be]/20 bg-[#0c0a08] text-[#dfd3be]'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isTargetActive
                              ? 'bg-[#e5bd47] animate-pulse'
                              : 'bg-[#b5a48b]'
                          }`}
                        />
                        <span>
                          {isTargetActive
                            ? `Active Now (${formatDurationSec(activeStageElapsedSec)})`
                            : `Queued · Currently in ${runningStage?.name || 'Pipeline'}`}
                        </span>
                      </span>

                      <span className="hidden sm:inline-flex items-center gap-1 rounded-md border border-[#dfd3be]/15 bg-[#0c0a08] px-2 py-0.5 font-mono text-[11px] text-[#b5a48b]">
                        <FileCode className="h-3 w-3 text-[#e5bd47]" />
                        {meta.artifact}
                      </span>
                    </div>

                    <h2 className="font-display text-xl sm:text-2xl font-bold text-[#faf4e8]">
                      {meta.headline}
                    </h2>

                    <p className="text-xs sm:text-sm text-[#dfd3be] flex items-center gap-2 truncate">
                      <Terminal className="h-3.5 w-3.5 text-[#e5bd47] shrink-0" />
                      <span className="truncate">{latestLogMessage}</span>
                    </p>
                  </div>

                  {/* Elapsed Timer & Typical Stage ETA Telemetry Box */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-3 rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] px-3.5 py-2.5 shrink-0 tabular-nums">
                    <div className="space-y-0.5 pr-2.5 border-r border-[#dfd3be]/15">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b5a48b]">
                        Elapsed Time
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-sm sm:text-base font-bold text-[#faf4e8]">
                        <Clock className="h-3.5 w-3.5 text-[#e5bd47]" />
                        <span>{formatDurationSec(pipelineElapsedSec)}</span>
                      </div>
                    </div>

                    <div className="space-y-0.5 pr-2.5 border-r border-[#dfd3be]/15">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b5a48b]">
                        Stage ETA
                      </div>
                      <div className="font-mono text-sm sm:text-base font-bold text-[#f3d478]">
                        {meta.estRange}
                      </div>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#b5a48b]">
                        Pipeline
                      </div>
                      <div className="font-mono text-xs sm:text-sm font-bold text-[#dfd3be]">
                        {completedStagesCount}/{totalStagesCount} stages
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Deliverables Preview */}
                <div className="space-y-2.5 pt-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#0c0a08] border border-[#dfd3be]/15">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#d4af37] via-[#f3d478] to-[#e5bd47] transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-[#b5a48b]">
                        What you&apos;ll get:
                      </span>
                      {meta.deliverables.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1 rounded-md border border-[#dfd3be]/15 bg-[#0c0a08] px-2 py-0.5 text-[11px] text-[#dfd3be]"
                        >
                          <CheckCircle2 className="h-3 w-3 text-[#e5bd47]" />
                          {item}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-[#b5a48b]">
                      Auto-populates as soon as {meta.stageShort} finishes
                    </span>
                  </div>
                </div>
              </div>

              {/* Tab-Specific Shimmer Skeleton Cards */}
              {activeTab === 'overview' && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="rounded-2xl surface-card p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="h-6 w-28 rounded-md skeleton-shimmer" />
                        <span className="h-4 w-52 rounded skeleton-shimmer" />
                      </div>
                      <div className="h-7 w-4/5 rounded-md skeleton-shimmer" />
                      <div className="space-y-2">
                        <div className="h-4 w-full rounded skeleton-shimmer" />
                        <div className="h-4 w-5/6 rounded skeleton-shimmer" />
                      </div>
                      <div className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-4 space-y-2">
                        <div className="h-3.5 w-40 rounded skeleton-shimmer" />
                        <div className="h-4 w-full rounded skeleton-shimmer" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[0, 1].map((col) => (
                        <div
                          key={col}
                          className="rounded-2xl surface-card p-5 space-y-3"
                        >
                          <div className="h-4 w-44 rounded skeleton-shimmer" />
                          <div className="space-y-2 pt-1">
                            <div className="h-4 w-11/12 rounded skeleton-shimmer" />
                            <div className="h-4 w-4/5 rounded skeleton-shimmer" />
                            <div className="h-4 w-5/6 rounded skeleton-shimmer" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="rounded-2xl surface-card p-5 space-y-3">
                      <div className="h-4 w-32 rounded skeleton-shimmer" />
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 space-y-2"
                        >
                          <div className="h-3.5 w-full rounded skeleton-shimmer" />
                          <div className="h-3.5 w-2/3 rounded skeleton-shimmer" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'sources' && (
                <div className="space-y-4">
                  <div className="rounded-2xl surface-card p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-5 w-56 rounded skeleton-shimmer" />
                      <div className="h-5 w-28 rounded-full skeleton-shimmer" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      {[0, 1, 2, 3].map((frameIdx) => (
                        <div
                          key={frameIdx}
                          className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-2.5 space-y-2"
                        >
                          <div className="aspect-video w-full rounded-lg skeleton-shimmer" />
                          <div className="h-3.5 w-3/4 rounded skeleton-shimmer" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[0, 1, 2, 3].map((cardIdx) => (
                      <div
                        key={cardIdx}
                        className="rounded-2xl surface-card p-5 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="h-5 w-28 rounded skeleton-shimmer" />
                          <span className="h-4 w-12 rounded skeleton-shimmer" />
                        </div>
                        <div className="h-5 w-4/5 rounded skeleton-shimmer" />
                        <div className="space-y-1.5">
                          <div className="h-3.5 w-full rounded skeleton-shimmer" />
                          <div className="h-3.5 w-5/6 rounded skeleton-shimmer" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'bom' && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-4">
                    {[
                      'Original Retail Price',
                      'Off-the-Shelf Hardware',
                      '3D Print Filament Est.',
                      'Total DIY Cost & Savings',
                    ].map((label) => (
                      <div
                        key={label}
                        className="rounded-2xl surface-card p-4 space-y-2"
                      >
                        <div className="text-xs text-[#b5a48b]">{label}</div>
                        <div className="h-7 w-24 rounded-md skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl surface-card p-5 space-y-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="h-5 w-32 rounded skeleton-shimmer" />
                          <span className="h-6 w-20 rounded skeleton-shimmer" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-5 w-3/4 rounded skeleton-shimmer" />
                          <div className="h-3.5 w-full rounded skeleton-shimmer" />
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-[#dfd3be]/15 pt-3">
                          <span className="h-8 w-28 rounded-lg skeleton-shimmer" />
                          <span className="h-8 w-28 rounded-lg skeleton-shimmer" />
                          <span className="h-8 w-24 rounded-lg skeleton-shimmer" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'print' && (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {[0, 1].map((plateIdx) => (
                      <div
                        key={plateIdx}
                        className="rounded-2xl surface-card p-5 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1.5">
                            <div className="h-5 w-40 rounded skeleton-shimmer" />
                            <div className="h-3.5 w-56 rounded skeleton-shimmer" />
                          </div>
                          <div className="h-8 w-24 rounded-lg skeleton-shimmer" />
                        </div>
                        <div className="aspect-square max-w-[240px] mx-auto w-full rounded-xl skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                  <div className="rounded-2xl surface-card p-5 space-y-4">
                    <div className="h-5 w-56 rounded skeleton-shimmer" />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[0, 1, 2, 3, 4, 5].map((partIdx) => (
                        <div
                          key={partIdx}
                          className="flex items-center justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3.5"
                        >
                          <div className="space-y-1.5">
                            <div className="h-4 w-32 rounded skeleton-shimmer" />
                            <div className="h-3 w-24 rounded skeleton-shimmer" />
                          </div>
                          <div className="h-8 w-16 rounded-lg skeleton-shimmer" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(activeTab === 'instructions' || activeTab === 'exploded') && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-2xl surface-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="h-6 w-36 rounded-lg skeleton-shimmer" />
                      <div className="flex items-center gap-2">
                        <span className="h-9 w-20 rounded-lg skeleton-shimmer" />
                        <span className="h-9 w-24 rounded-lg skeleton-shimmer" />
                      </div>
                    </div>
                    <div className="aspect-[16/10] w-full rounded-xl skeleton-shimmer" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="h-16 rounded-xl skeleton-shimmer" />
                      <div className="h-16 rounded-xl skeleton-shimmer" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[0, 1, 2, 3, 4].map((stepIdx) => (
                      <div
                        key={stepIdx}
                        className="rounded-xl surface-card p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="h-4 w-16 rounded skeleton-shimmer" />
                          <span className="h-3.5 w-14 rounded skeleton-shimmer" />
                        </div>
                        <div className="h-4 w-4/5 rounded skeleton-shimmer" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && analysis && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl surface-card p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-[#e5bd47]/15 px-2.5 py-1 text-xs font-semibold text-[#f3d478] border border-[#e5bd47]/35">
                  {analysis.category}
                </span>
                <span className="text-xs text-[#b5a48b] font-mono">
                  Difficulty:{' '}
                  <strong className="text-[#faf4e8]">{analysis.difficulty}</strong> ·
                  Est. Print:{' '}
                  <strong className="text-[#faf4e8]">
                    {analysis.estimatedPrintTimeHours}h
                  </strong>{' '}
                  · Assembly:{' '}
                  <strong className="text-[#faf4e8]">
                    {analysis.estimatedAssemblyMinutes} min
                  </strong>
                </span>
              </div>

              <h3 className="font-display text-2xl font-bold text-[#faf4e8]">
                Why the Commercial Version Costs $
                {analysis.originalProduct.retailPrice} — and How This DIY Build Beats It
              </h3>
              <div>
                <p
                  className={`text-sm sm:text-base text-[#dfd3be] leading-relaxed ${
                    !overviewExpanded ? 'line-clamp-2' : ''
                  }`}
                >
                  {analysis.description}
                </p>
                {analysis.description && analysis.description.length > 140 && (
                  <button
                    type="button"
                    onClick={() => setOverviewExpanded((prev) => !prev)}
                    className="mt-1 -ml-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-xs font-semibold text-[#f3d478] hover:underline"
                  >
                    {overviewExpanded ? 'Show Less' : 'Read More'}
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-4 space-y-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                  Core Engineering Function
                </div>
                <p
                  className={`text-sm text-[#dfd3be] leading-relaxed ${
                    !overviewExpanded ? 'line-clamp-2' : ''
                  }`}
                >
                  {analysis.functionSummary}
                </p>
              </div>
            </div>

            {/* Printed vs Bought Split */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl surface-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                    <Printer className="h-4 w-4 text-[#e5bd47]" />
                    3D-Printed Parts ({analysis.whatGetsPrinted.length})
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('print')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#f3d478] hover:underline"
                  >
                    <span>STLs &amp; Plates</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="space-y-2 text-sm text-[#dfd3be]">
                  {analysis.whatGetsPrinted.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#e5bd47] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl surface-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                    <ShoppingCart className="h-4 w-4 text-[#e5bd47]" />
                    Off-the-Shelf Hardware ({analysis.whatGetsBought.length})
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('bom')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#f3d478] hover:underline"
                  >
                    <span>Retail BOM</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="space-y-2 text-sm text-[#dfd3be]">
                  {analysis.whatGetsBought.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#e5bd47] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {critique && <CritiquePanel critique={critique} />}
          </div>

          {/* Right Column: Specs & Engineering Notes */}
          <div className="space-y-6">
            <div className="rounded-2xl surface-card p-5 space-y-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Key Mechanisms
              </h3>
              <ul className="space-y-2.5 text-sm text-[#dfd3be]">
                {analysis.keyMechanisms.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 leading-relaxed"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl surface-card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                DFM &amp; Slicer Notes
              </h3>
              <ul className="space-y-2 text-sm text-[#dfd3be]">
                {analysis.engineeringNotes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 mt-0.5 text-[#e5bd47] shrink-0" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl surface-card p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Explore Build Package
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('print')}
                  className="flex items-center justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] px-3.5 py-2.5 text-left text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Printer className="h-4 w-4 text-[#e5bd47]" />
                    <span>3D Print Plates &amp; STLs</span>
                  </span>
                  <span className="font-mono text-[#f3d478]">
                    {plates
                      ? `${plates.totalPlates} ${plates.totalPlates === 1 ? 'plate' : 'plates'} →`
                      : 'Open →'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('bom')}
                  className="flex items-center justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] px-3.5 py-2.5 text-left text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-[#e5bd47]" />
                    <span>Sourced Retail BOM</span>
                  </span>
                  <span className="font-mono text-[#f3d478]">
                    {bom ? `$${bom.summary.totalDiyCost.toFixed(2)} →` : 'Open →'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('instructions')}
                  className="flex items-center justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] px-3.5 py-2.5 text-left text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-[#e5bd47]" />
                    <span>3D Assembly Player</span>
                  </span>
                  <span className="font-mono text-[#f3d478]">
                    {instructions
                      ? `${instructions.steps.length} steps →`
                      : 'Open →'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('exploded')}
                  className="flex items-center justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] px-3.5 py-2.5 text-left text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478] transition-colors"
                >
                  <span className="inline-flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#e5bd47]" />
                    <span>Interactive Exploded View</span>
                  </span>
                  <span className="font-mono text-[#f3d478]">
                    {design ? `${design.parts.length} parts →` : 'Open →'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SOURCES */}
      {activeTab === 'sources' && sources && (
        <div className="space-y-6">
          {PeerSourcesComp ? (
            <PeerSourcesComp
              sources={sources}
              teardown={teardown}
              bomItems={bom?.items}
              designParts={design?.parts}
              analysis={analysis}
              projectId={manifest.id}
              onSelectBomRef={() => setActiveTab('bom')}
              onSelectDesignPart={(partId: string) => {
                setSelectedPartId(partId);
                setActiveTab('exploded');
              }}
            />
          ) : (
            <>
              <div className="rounded-2xl codex-folio p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-[#f5ebd6]">
                    Gemini 4 Argon Grounded Web Research & Open-Source Priors
                  </h3>
                  <span className="rounded-full border border-[#d4af37]/35 bg-[#d4af37]/15 px-3 py-0.5 font-codex text-xs text-[#f3d478]">
                    Google Search Grounding Active
                  </span>
                </div>
                <p className="text-xs text-[#e6d3b3]">{sources.querySummary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {sources.sources.map((src) => (
                  <a
                    key={src.id}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col justify-between rounded-2xl codex-folio p-5 hover:border-[#f3d478]/60 transition-all"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="rounded-md bg-[#1d1710] border border-[#d4af37]/25 px-2 py-0.5 font-codex uppercase text-[#f3d478]">
                          {src.type} · {src.domain}
                        </span>
                        <ExternalLink className="h-4 w-4 text-[#bda782] group-hover:text-[#f3d478]" />
                      </div>
                      <h4 className="font-display text-base font-bold text-[#f5ebd6] group-hover:text-[#f3d478]">
                        {src.title}
                      </h4>
                      <p className="text-xs text-[#bda782] leading-relaxed">
                        {src.summary}
                      </p>
                    </div>

                    <ul className="mt-4 space-y-1 border-t border-[#d4af37]/20 pt-3 text-[11px] text-[#e6d3b3]">
                      {src.keyTakeaways.map((tk, i) => (
                        <li key={i}>• {tk}</li>
                      ))}
                    </ul>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: BOM */}
      {activeTab === 'bom' && bom && (
        <div className="space-y-6">
          {PeerBomComp ? (
            <PeerBomComp
              bom={bom}
              analysis={analysis}
              design={design}
              onSelectPartId={(partId: string) => {
                setSelectedPartId(partId);
                setActiveTab('exploded');
              }}
            />
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="rounded-2xl codex-folio p-4">
                  <div className="text-xs text-[#bda782]">
                    Original Commercial Price
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-[#bda782] line-through">
                    ${bom.summary.originalRetailPrice.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-2xl codex-folio p-4">
                  <div className="text-xs text-[#bda782]">
                    Off-The-Shelf Hardware
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-[#f5ebd6]">
                    ${bom.summary.purchasedPartsTotal.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-2xl codex-folio p-4">
                  <div className="text-xs text-[#bda782]">
                    3D Print Filament Est.
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold text-[#f3d478]">
                    ${bom.summary.filamentCostTotal.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-2xl border border-[#d4af37]/50 bg-[#d4af37]/15 p-4">
                  <div className="text-xs font-semibold text-[#f3d478]">
                    Total DIY Cost (Save {bom.summary.savingsPercent}%)
                  </div>
                  <div className="mt-1 font-display text-2xl font-black text-[#f3d478]">
                    ${bom.summary.totalDiyCost.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* BOM Line Cards */}
              <div className="grid gap-4 md:grid-cols-2">
                {bom.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-2xl codex-folio p-5 space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-[#1d1710] border border-[#d4af37]/25 px-2 py-0.5 font-codex text-xs font-bold text-[#f3d478]">
                          {item.partNumber} · {item.category}
                        </span>
                        <span className="font-display text-lg font-extrabold text-[#f5ebd6]">
                          ${item.totalPrice.toFixed(2)}{' '}
                          <span className="text-xs font-normal text-[#bda782]">
                            (Qty: {item.qty} {item.unit})
                          </span>
                        </span>
                      </div>

                      <h4 className="font-display text-base font-bold text-[#f5ebd6]">
                        {item.name}
                      </h4>
                      <p className="text-xs text-[#e6d3b3]">
                        {item.specification}
                      </p>
                      {item.notes && (
                        <p className="text-[11px] text-[#bda782]">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    {/* Retailer Links */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-[#d4af37]/20 pt-3">
                      {item.retailerLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs font-semibold text-[#e6d3b3] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors"
                        >
                          <span>{link.retailer}</span>
                          <span className="text-[#f3d478]">
                            ${link.estPrice.toFixed(2)}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: PRINT FILES */}
      {activeTab === 'print' && plates && (
        <div className="space-y-6">
          {PeerPrintComp ? (
            <PeerPrintComp
              plates={plates}
              design={design}
              projectId={manifest.id}
            />
          ) : (
            <>
              <div className="rounded-xl border border-[#d4af37]/35 bg-[#14100b] p-4 text-xs text-[#e6d3b3] flex items-center justify-between">
                <span>
                  3D Plate Viewer slot ready — automatically mounts{' '}
                  <code>components/print/</code> when present. Below are the live generated plates & STL downloads from{' '}
                  <code>plates.json</code> and <code>parts/*.stl</code>.
                </span>
                <button
                  type="button"
                  onClick={() => setShowOrderModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#d4af37] px-3.5 py-2 font-codex text-xs font-bold text-[#140e07]"
                >
                  <Truck className="h-3.5 w-3.5" /> No Printer? Order Prints
                </button>
              </div>

              {/* Plates Summary */}
              <div className="grid gap-4 md:grid-cols-2">
                {plates.plates.map((plate) => (
                  <div
                    key={plate.plateNumber}
                    className="rounded-2xl codex-folio p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-display text-lg font-bold text-[#f5ebd6]">
                          {plate.name}
                        </h4>
                        <p className="text-xs text-[#bda782]">
                          Printer: {plate.printerName} (
                          {plate.bedDimensionsMm.join('×')} mm) · Utilization:{' '}
                          {plate.utilizationPercent}%
                        </p>
                      </div>
                      <div className="text-right text-xs text-[#e6d3b3]">
                        <div className="font-bold text-[#f3d478]">
                          {plate.weightGrams}g filament
                        </div>
                        <div>~{plate.estimatedMinutes} min</div>
                      </div>
                    </div>

                    {/* 2D Bed Preview */}
                    <div className="relative mx-auto aspect-square max-w-[260px] rounded-xl border border-[#d4af37]/30 bg-[#0c0906] p-3 flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 bg-grid-pattern opacity-40" />
                      <div className="relative z-10 text-center space-y-1">
                        <Box className="mx-auto h-6 w-6 text-[#f3d478]" />
                        <div className="text-xs font-bold text-[#f5ebd6]">
                          {plate.placements.length} Packed Parts
                        </div>
                        <div className="text-[10px] text-[#bda782]">
                          {plate.bedDimensionsMm[0]} × {plate.bedDimensionsMm[1]} mm
                          Build Plate
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Individual STL Parts Table */}
              <div className="rounded-2xl codex-folio p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-codex text-sm font-bold uppercase tracking-wider text-[#f5ebd6]">
                    Individual Printable STL Files (parts/*.stl)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowOrderModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-1.5 font-codex text-xs font-semibold text-[#f3d478] hover:bg-[#d4af37]/25"
                  >
                    <Truck className="h-3.5 w-3.5" /> Request Print Bureau Quote
                    (Craftcloud / JLC3DP / Xometry)
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plates.parts.map((part) => {
                    const fileBase = part.stlFile.split('/').pop() || `${part.partId}.stl`;
                    return (
                      <div
                        key={part.partId}
                        className="flex items-center justify-between rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: part.color }}
                            />
                            <span className="font-display text-sm font-bold text-[#f5ebd6]">
                              {part.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#bda782] font-mono">
                            {part.dims_mm.join('×')}mm · {part.weightGrams}g ·{' '}
                            {part.material}
                          </div>
                        </div>

                        <a
                          href={`/api/objects/${manifest.id}/stl/${fileBase}`}
                          download={fileBase}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#d4af37]/35 bg-[#14100b] px-2.5 py-1.5 font-codex text-xs font-semibold text-[#f3d478] hover:border-[#f3d478]"
                        >
                          <Download className="h-3.5 w-3.5" /> STL
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {critique && <CritiquePanel critique={critique} />}
        </div>
      )}

      {/* TAB 5: INSTRUCTIONS */}
      {activeTab === 'instructions' && instructions && (
        <div className="space-y-6">
          {PeerInstructionsComp ? (
            <PeerInstructionsComp
              instructions={instructions}
              design={design}
              projectId={manifest.id}
            />
          ) : (
            <>
              <div className="rounded-xl border border-[#d4af37]/35 bg-[#14100b] p-4 text-xs text-[#e6d3b3]">
                IKEA-Style Three.js Animated Player slot ready — dynamically imports{' '}
                <code>components/three/</code> when present. Step through the{' '}
                <code>instructions.json</code> motion choreography below:
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Step Player Card */}
                <div className="lg:col-span-2 rounded-2xl codex-folio p-6 space-y-5">
                  {(() => {
                    const step =
                      instructions.steps[activeStepIdx] || instructions.steps[0];
                    if (!step) return null;
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="rounded-lg bg-[#d4af37] px-3 py-1 font-codex text-xs font-bold text-[#140e07]">
                            STEP {step.n} OF {instructions.steps.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={activeStepIdx === 0}
                              onClick={() =>
                                setActiveStepIdx((i) => Math.max(0, i - 1))
                              }
                              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#d4af37]/35 bg-[#14100b] px-3.5 py-1.5 font-codex text-xs font-semibold text-[#dfd3be] disabled:opacity-40"
                            >
                              Prev
                            </button>
                            <button
                              type="button"
                              disabled={
                                activeStepIdx >= instructions.steps.length - 1
                              }
                              onClick={() =>
                                setActiveStepIdx((i) =>
                                  Math.min(instructions.steps.length - 1, i + 1)
                                )
                              }
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-[#d4af37] px-3.5 py-1.5 font-codex text-xs font-bold text-[#140e07] disabled:opacity-40"
                            >
                              <Play className="h-3 w-3" /> Next Step
                            </button>
                          </div>
                        </div>

                        <h3 className="font-display text-2xl font-bold text-[#faf4e8]">
                          {step.title}
                        </h3>
                        <div>
                          <p
                            className={`text-sm text-[#dfd3be] leading-relaxed ${
                              !stepNoteExpanded ? 'line-clamp-2' : ''
                            }`}
                          >
                            {step.note}
                          </p>
                          {step.note && step.note.length > 120 && (
                            <button
                              type="button"
                              onClick={() =>
                                setStepNoteExpanded((prev) => !prev)
                              }
                              className="mt-1 -ml-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-xs font-semibold text-[#f3d478] hover:underline"
                            >
                              {stepNoteExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5 space-y-1.5">
                            <div className="font-codex text-[11px] font-bold uppercase text-[#bda782]">
                              Parts Involved
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {step.partIds.map((pid) => (
                                <span
                                  key={pid}
                                  className="rounded bg-[#d4af37]/15 border border-[#d4af37]/35 px-2 py-0.5 font-codex text-xs text-[#f3d478]"
                                >
                                  {pid}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5 space-y-1.5">
                            <div className="font-codex text-[11px] font-bold uppercase text-[#bda782]">
                              3D Motion Vectors (from → to mm)
                            </div>
                            <div className="space-y-1 font-mono text-[11px] text-[#e6d3b3]">
                              {step.motion.map((m, idx) => (
                                <div key={idx}>
                                  {m.partId}: [{m.from.join(', ')}] → [
                                  {m.to.join(', ')}]
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Step List */}
                <div className="space-y-2.5">
                  {instructions.steps.map((s, idx) => (
                    <button
                      key={s.n}
                      type="button"
                      onClick={() => setActiveStepIdx(idx)}
                      className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                        idx === activeStepIdx
                          ? 'border-[#f3d478] bg-[#d4af37]/15'
                          : 'border-[#d4af37]/20 bg-[#14100b]/80 hover:border-[#d4af37]/45'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-codex font-bold text-[#f3d478]">
                          STEP 0{s.n}
                        </span>
                        <span className="text-[11px] text-[#bda782]">
                          {s.partIds.length} part(s)
                        </span>
                      </div>
                      <div className="mt-1 font-display text-sm font-bold text-[#f5ebd6]">
                        {s.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 6: EXPLODED VIEW */}
      {activeTab === 'exploded' && design && (
        <div className="space-y-6">
          {PeerExplodedComp ? (
            <PeerExplodedComp
              design={design}
              bom={bom}
              projectId={manifest.id}
            />
          ) : (
            <>
              <div className="rounded-xl border border-[#d4af37]/35 bg-[#14100b] p-4 text-xs text-[#e6d3b3]">
                Interactive Three.js Exploded View slot ready — dynamically imports{' '}
                <code>components/three/</code> when present. Inspect the parametric assembly graph (
                <code>design.json</code>) below:
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
                  {design.parts.map((part) => {
                    const isSelected = selectedPart?.id === part.id;
                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => setSelectedPartId(part.id)}
                        className={`rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? 'border-[#f3d478] bg-[#d4af37]/15'
                            : 'border-[#d4af37]/20 bg-[#14100b]/80 hover:border-[#d4af37]/45'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-xs font-codex font-bold text-[#e6d3b3]">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: part.color }}
                            />
                            {part.partNumber || part.id}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 font-codex text-[10px] font-bold uppercase ${
                              part.kind === 'printed'
                                ? 'bg-[#b89b4a]/20 text-[#f3d478] border border-[#b89b4a]/40'
                                : 'bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/40'
                            }`}
                          >
                            {part.kind}
                          </span>
                        </div>
                        <div className="mt-2 font-display text-base font-bold text-[#f5ebd6]">
                          {part.name}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[#bda782]">
                          dims: {part.dims_mm.join('×')}mm · shape: {part.shape}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Part Inspector Panel */}
                {selectedPart && (
                  <div className="rounded-2xl codex-folio p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-codex text-xs font-bold text-[#f3d478]">
                        {selectedPart.id}
                      </span>
                      <span className="rounded bg-[#1d1710] border border-[#d4af37]/25 px-2 py-0.5 text-xs text-[#e6d3b3]">
                        {selectedPart.material}
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#f5ebd6]">
                      {selectedPart.name}
                    </h3>
                    <p className="text-xs text-[#e6d3b3] leading-relaxed">
                      {selectedPart.description}
                    </p>

                    <div className="space-y-2 rounded-xl border border-[#d4af37]/25 bg-[#0c0906] p-3.5 font-mono text-xs text-[#e6d3b3]">
                      <div>dims_mm: [{selectedPart.dims_mm.join(', ')}]</div>
                      <div>position: [{selectedPart.position.join(', ')}]</div>
                      <div>explode: [{selectedPart.explode.join(', ')}]</div>
                      <div>shape: {selectedPart.shape}</div>
                      {selectedPart.bomRef && (
                        <div className="text-[#f3d478]">
                          bomRef: {selectedPart.bomRef}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Render Ask Argon + Pipeline bars below the 3D canvas on Exploded View & Instructions tabs */}
      {isCanvasTab && agentBars}

      {/* Bottom-Safe Mobile Sticky Action Bar (390x844 ergonomics: >= 44px targets, safe-area inset) */}
      <div
        role="region"
        aria-label="Quick Mobile Project Actions"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#dfd3be]/25 bg-[#17130e]/95 backdrop-blur-md px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_32px_rgba(0,0,0,0.85)]"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextTab: TabId =
                activeTab === 'exploded' ? 'instructions' : 'exploded';
              setActiveTab(nextTab);
              const tabBtn = document.querySelector<HTMLElement>(
                `[data-tab-id="${nextTab}"]`
              );
              tabBtn?.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
              });
            }}
            className="btn-secondary-surface min-h-[44px] px-3 py-2 text-xs font-semibold shrink-0"
          >
            <Layers className="h-3.5 w-3.5 text-[#f3d478]" />
            <span>{activeTab === 'exploded' ? '3D Steps' : '3D Exploded'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextTab: TabId = activeTab === 'print' ? 'bom' : 'print';
              setActiveTab(nextTab);
              const tabBtn = document.querySelector<HTMLElement>(
                `[data-tab-id="${nextTab}"]`
              );
              tabBtn?.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
              });
            }}
            className="btn-primary-gold min-h-[44px] flex-1 px-3.5 py-2 text-xs font-bold"
          >
            {activeTab === 'print' ? (
              <>
                <ShoppingCart className="h-3.5 w-3.5" />
                <span>
                  View Sourced BOM (
                  {bom ? `$${bom.summary.totalDiyCost.toFixed(2)}` : 'Parts'})
                </span>
              </>
            ) : (
              <>
                <Printer className="h-3.5 w-3.5" />
                <span>
                  Get Print Files (
                  {plates ? `${plates.totalPlates} plate` : 'STL/3MF'})
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Print Service Quote Modal */}
      {showOrderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order 3D Prints from On-Demand Print Service"
          onClick={() => setShowOrderModal(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0c0906]/85 backdrop-blur-sm p-3 sm:p-4 safe-bottom"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl codex-folio p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xl font-bold text-[#f5ebd6]">
                No 3D Printer? Send STLs to an On-Demand Print Service
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8] shrink-0"
              >
                Close ✕
              </button>
            </div>

            <p className="text-xs text-[#e6d3b3]">
              Bundle all {plates?.parts.length || 7} printed STL files (
              {plates?.totalWeightGrams || 185}g total) and hand off to a print bureau:
            </p>

            <div className="space-y-2">
              {[
                {
                  id: 'craftcloud',
                  name: 'Craftcloud by All3DP',
                  est: '$14.80',
                  url: 'https://craftcloud3d.com',
                },
                {
                  id: 'jlc3dp',
                  name: 'JLC3DP Factory Direct',
                  est: '$9.40',
                  url: 'https://jlc3dp.com',
                },
                {
                  id: 'xometry',
                  name: 'Xometry Express',
                  est: '$24.50',
                  url: 'https://www.xometry.com',
                },
              ].map((srv) => (
                <label
                  key={srv.id}
                  className={`flex min-h-[48px] cursor-pointer items-center justify-between rounded-xl border p-3 ${
                    selectedService === srv.id
                      ? 'border-[#f3d478] bg-[#d4af37]/15'
                      : 'border-[#d4af37]/25 bg-[#0c0906]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="service"
                      checked={selectedService === srv.id}
                      onChange={() => setSelectedService(srv.id)}
                    />
                    <span className="text-xs font-bold text-[#f5ebd6]">
                      {srv.name}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-[#f3d478]">
                    Est. {srv.est}
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={shippingZip}
                onChange={(e) => setShippingZip(e.target.value)}
                placeholder="Shipping ZIP / Postal Code"
                className="flex-1 min-h-[44px] rounded-lg border border-[#d4af37]/35 bg-[#0c0906] px-3 py-2 text-xs text-[#f5ebd6]"
              />
              <a
                href={
                  selectedService === 'jlc3dp'
                    ? 'https://jlc3dp.com'
                    : selectedService === 'xometry'
                    ? 'https://www.xometry.com'
                    : 'https://craftcloud3d.com'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary-gold min-h-[44px] px-4 py-2 text-xs font-bold"
              >
                Continue to Service <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
