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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedStageId, setSelectedStageId] =
    useState<AgentStageId>('analyst');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedService, setSelectedService] = useState('craftcloud');
  const [shippingZip, setShippingZip] = useState('94107');
  const syncedBuildRef = useRef<string>('');

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

      try {
        const res = await fetch(`/api/objects/${projectId}`);
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

      es = new EventSource(`/api/objects/${projectId}/stream`);
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
            const evtData = (sseEvt.data || {}) as Record<string, unknown>;
            const updated = evtData.manifest as ProjectManifest | undefined;
            if (updated && Array.isArray(updated.stages)) {
              setManifest(updated);
              setLoading(false);
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
        es?.close();
      };
    }

    loadInitial();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [projectId]);

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
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#f3d478]" />
        <div>
          <h2 className="font-display text-2xl font-bold text-[#f5ebd6]">
            Initializing Gemini 4 Argon Agent Workspace...
          </h2>
          <p className="text-xs text-[#bda782]">
            Streaming artifacts from data/objects/{projectId}
          </p>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="rounded-2xl border border-[#c84b31]/45 bg-[#2a0f0a]/60 p-8 text-center space-y-4">
        <AlertCircle className="mx-auto h-8 w-8 text-[#e06348]" />
        <h2 className="font-display text-2xl font-bold text-[#f5ebd6]">Project Not Found</h2>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-[#d4af37] px-4 py-2 font-codex text-xs font-bold text-[#140e07]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>
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
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'overview', label: 'Overview', icon: Sparkles },
    {
      id: 'sources',
      label: 'Sources',
      badge: sources ? String(sources.sources.length) : undefined,
      icon: Search,
    },
    {
      id: 'bom',
      label: 'BOM',
      badge: bom ? `$${bom.summary.totalDiyCost.toFixed(2)}` : undefined,
      icon: ShoppingCart,
    },
    {
      id: 'print',
      label: 'Print Files',
      badge: plates ? `${plates.totalPlates} plate(s)` : undefined,
      icon: Printer,
    },
    {
      id: 'instructions',
      label: 'Instructions',
      badge: instructions ? `${instructions.steps.length} steps` : undefined,
      icon: Wrench,
    },
    {
      id: 'exploded',
      label: 'Exploded View',
      badge: design ? `${design.parts.length} parts` : undefined,
      icon: Layers,
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Bar & Savings Summary */}
      <div className="flex flex-col gap-4 rounded-2xl gilded-frame codex-folio p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 font-mono text-xs text-[#bda782] hover:text-[#f3d478] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Get Me An Alt
            </Link>
            <span className="text-[#5c4930]">/</span>
            <span className="rounded-md border border-[#d4af37]/25 bg-[#0c0906] px-2 py-0.5 font-mono text-[11px] text-[#e6d3b3]">
              data/objects/{manifest.id}
            </span>
            {manifest.isSample && (
              <span className="rounded-md border border-[#d4af37]/45 bg-[#d4af37]/15 px-2 py-0.5 font-codex text-[10px] font-bold uppercase tracking-wider text-[#f3d478]">
                Featured Sample Build
              </span>
            )}
          </div>

          <h1 className="font-display text-3xl font-bold tracking-tight text-[#f5ebd6] sm:text-4xl">
            {manifest.title}
          </h1>
          {analysis?.tagline && (
            <p className="text-xs sm:text-sm text-[#e6d3b3] max-w-3xl font-sans">
              {analysis.tagline}
            </p>
          )}
        </div>

        {/* Gilded Savings Seal */}
        {bom && (
          <div className="flex items-center gap-4 rounded-2xl border border-[#d4af37]/50 bg-gradient-to-r from-[#d4af37]/15 via-[#14100b] to-[#d4af37]/10 px-5 py-3 shadow-electric">
            <div>
              <div className="font-codex text-[10px] uppercase tracking-widest text-[#f3d478] font-bold">
                DIY Build vs. Retail Price
              </div>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="font-display text-2xl sm:text-3xl font-bold text-[#f5ebd6]">
                  ${bom.summary.totalDiyCost.toFixed(2)}
                </span>
                <span className="text-xs text-[#bda782] line-through">
                  ${bom.summary.originalRetailPrice.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] px-3.5 py-1.5 text-[#140e07] font-codex font-bold text-xs tabular-nums">
              YOU SAVE ${bom.summary.totalSavings.toFixed(2)} (
              {bom.summary.savingsPercent}%)
            </div>
          </div>
        )}
      </div>

      {/* Live Managed Agents Orchestration Graph (Mission Control) */}
      <MissionControl
        projectId={manifest.id}
        manifest={manifest}
        stages={manifest.stages}
        events={streamEvents}
        onSelectStage={(id) => setSelectedStageId(id)}
      />

      {/* Ask Argon to Modify — Selective Agent Re-Orchestration Chat */}
      <ModifyChat
        projectId={manifest.id}
        manifest={manifest}
        onEvent={(ev) => setStreamEvents((prev) => [...prev.slice(-150), ev])}
        onManifestUpdate={(updated) => setManifest(updated)}
      />

      {/* Sticky Codex Folio Navigation Tabs with Gilded Active Underline */}
      <div className="sticky top-[57px] z-40 -mx-1 rounded-2xl border border-[#d4af37]/30 bg-[#0c0906]/90 backdrop-blur-xl px-3 py-2 shadow-glass">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-codex text-xs font-bold tracking-wide transition-all duration-200 ${
                  active
                    ? 'bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/55 shadow-[0_0_24px_-6px_rgba(212,175,55,0.45)]'
                    : 'border border-transparent bg-[#14100b]/70 text-[#e6d3b3] hover:border-[#d4af37]/25 hover:text-[#f5ebd6]'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${
                      active
                        ? 'bg-[#d4af37] text-[#140e07] font-bold'
                        : 'bg-[#1d1710] text-[#bda782]'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b89b4a] transition-all duration-300 ${
                    active ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Graceful in-progress / partial state banner so no tab is ever blank */}
      {((activeTab === 'overview' && !analysis) ||
        (activeTab === 'sources' && !sources) ||
        (activeTab === 'bom' && !bom) ||
        (activeTab === 'print' && !plates) ||
        (activeTab === 'instructions' && !instructions) ||
        (activeTab === 'exploded' && !design)) && (
        <div className="rounded-2xl border border-[#d4af37]/35 bg-[#14100b]/90 p-8 text-center space-y-3">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#f3d478]" />
          <div className="font-display text-lg font-bold text-[#f5ebd6]">
            Gemini 4 Argon Swarm Synthesizing {activeTab.toUpperCase()} Artifact...
          </div>
          <p className="text-xs text-[#bda782]">
            Watch live agent progress in Mission Control above — this tab populates automatically as soon as the stage completes.
          </p>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && analysis && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl codex-folio p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-md bg-[#d4af37]/15 px-2.5 py-1 font-codex text-xs font-semibold text-[#f3d478] border border-[#d4af37]/35">
                  {analysis.category}
                </span>
                <span className="text-xs text-[#bda782] font-mono">
                  Difficulty:{' '}
                  <strong className="text-[#f5ebd6]">{analysis.difficulty}</strong> ·
                  Est. Print:{' '}
                  <strong className="text-[#f5ebd6]">
                    {analysis.estimatedPrintTimeHours}h
                  </strong>{' '}
                  · Assembly:{' '}
                  <strong className="text-[#f5ebd6]">
                    {analysis.estimatedAssemblyMinutes} min
                  </strong>
                </span>
              </div>

              <h3 className="font-display text-2xl font-bold text-[#f5ebd6]">
                Why the Commercial Version Costs $
                {analysis.originalProduct.retailPrice} — and How This DIY Build Beats It
              </h3>
              <p className="text-sm text-[#e6d3b3] leading-relaxed">
                {analysis.description}
              </p>

              <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/80 p-4 space-y-2">
                <div className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                  Core Engineering Function
                </div>
                <p className="text-xs text-[#e6d3b3] leading-relaxed">
                  {analysis.functionSummary}
                </p>
              </div>
            </div>

            {/* Printed vs Bought Split */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#b89b4a]/40 bg-[#1d1710]/85 p-5 space-y-3">
                <div className="flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                  <Printer className="h-4 w-4 text-[#b89b4a]" />
                  3D-Printed Parts ({analysis.whatGetsPrinted.length})
                </div>
                <ul className="space-y-2 text-xs text-[#e6d3b3]">
                  {analysis.whatGetsPrinted.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#b89b4a] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-[#d4af37]/35 bg-[#d4af37]/[0.07] p-5 space-y-3">
                <div className="flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                  <ShoppingCart className="h-4 w-4" />
                  Off-the-Shelf Hardware ({analysis.whatGetsBought.length})
                </div>
                <ul className="space-y-2 text-xs text-[#e6d3b3]">
                  {analysis.whatGetsBought.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#d4af37] shrink-0" />
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
            <div className="rounded-2xl codex-folio p-5 space-y-4">
              <h3 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Key Mechanisms
              </h3>
              <ul className="space-y-2.5 text-xs text-[#e6d3b3]">
                {analysis.keyMechanisms.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/75 p-3 leading-relaxed"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl codex-folio p-5 space-y-3">
              <h3 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                DFM &amp; Slicer Notes
              </h3>
              <ul className="space-y-2 text-xs text-[#e6d3b3]">
                {analysis.engineeringNotes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-[#d4af37] shrink-0" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
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
          {critique && <CritiquePanel critique={critique} />}
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
                              className="rounded-lg border border-[#d4af37]/35 bg-[#14100b] px-3 py-1.5 font-codex text-xs font-semibold text-[#e6d3b3] disabled:opacity-40"
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
                              className="inline-flex items-center gap-1 rounded-lg bg-[#d4af37] px-3.5 py-1.5 font-codex text-xs font-bold text-[#140e07] disabled:opacity-40"
                            >
                              <Play className="h-3 w-3" /> Next Step
                            </button>
                          </div>
                        </div>

                        <h3 className="font-display text-2xl font-bold text-[#f5ebd6]">
                          {step.title}
                        </h3>
                        <p className="text-sm text-[#e6d3b3] leading-relaxed">
                          {step.note}
                        </p>

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

      {/* Print Service Quote Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c0906]/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl codex-folio p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-bold text-[#f5ebd6]">
                No 3D Printer? Send STLs to an On-Demand Print Service
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-xs text-[#bda782] hover:text-[#f5ebd6]"
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
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${
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

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shippingZip}
                onChange={(e) => setShippingZip(e.target.value)}
                placeholder="Shipping ZIP / Postal Code"
                className="flex-1 rounded-lg border border-[#d4af37]/35 bg-[#0c0906] px-3 py-2 text-xs text-[#f5ebd6]"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#d4af37] px-4 py-2 font-codex text-xs font-bold text-[#140e07]"
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
