'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
} from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedStageId, setSelectedStageId] =
    useState<AgentStageId>('analyst');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedService, setSelectedService] = useState('craftcloud');
  const [shippingZip, setShippingZip] = useState('94107');

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    async function loadInitial() {
      try {
        const res = await fetch(`/api/objects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.manifest) {
            setManifest(data.manifest);
            setLoading(false);
          }
        }
      } catch {
        // continue to SSE
      }

      es = new EventSource(`/api/objects/${projectId}/stream`);
      es.onmessage = (evt) => {
        if (cancelled) return;
        try {
          const updated = JSON.parse(evt.data) as ProjectManifest;
          setManifest(updated);
          setLoading(false);

          const running = updated.stages.find((s) => s.status === 'running');
          if (running) {
            setSelectedStageId(running.id);
          }
          if (updated.status === 'completed' || updated.status === 'error') {
            es?.close();
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

  if (loading && !manifest) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        <div>
          <h2 className="text-lg font-bold text-white">
            Initializing Gemini 4 Argon Agent Workspace...
          </h2>
          <p className="text-xs text-slate-400">
            Streaming artifacts from data/objects/{projectId}
          </p>
        </div>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center space-y-4">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
        <h2 className="text-lg font-bold text-white">Project Not Found</h2>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Home
        </Link>
      </div>
    );
  }

  const { analysis, sources, design, bom, plates, instructions } = manifest;
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
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All Projects
            </Link>
            <span className="text-slate-700">/</span>
            <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-300">
              data/objects/{manifest.id}
            </span>
            {manifest.isSample && (
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                Pre-Generated Sample
              </span>
            )}
          </div>

          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            {manifest.title}
          </h1>
          {analysis?.tagline && (
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              {analysis.tagline}
            </p>
          )}
        </div>

        {/* Savings Pill */}
        {bom && (
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                Total DIY Build vs. Retail
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  ${bom.summary.totalDiyCost.toFixed(2)}
                </span>
                <span className="text-xs text-slate-400 line-through">
                  ${bom.summary.originalRetailPrice.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-400 px-3 py-1.5 text-slate-950 font-black text-xs">
              YOU SAVE ${bom.summary.totalSavings.toFixed(2)} (
              {bom.summary.savingsPercent}%)
            </div>
          </div>
        )}
      </div>

      {/* Live Managed Agents Orchestration Timeline */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/90 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Gemini 4 Argon Managed Agent Pipeline (SSE Live Orchestration)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Status:{' '}
            <strong
              className={
                manifest.status === 'completed'
                  ? 'text-emerald-400'
                  : manifest.status === 'running'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }
            >
              {manifest.status.toUpperCase()}
            </strong>
          </span>
        </div>

        {/* 6 Agent Stage Pills */}
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {manifest.stages.map((stage, idx) => {
            const isSelected = stage.id === activeStage?.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageId(stage.id)}
                className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] text-slate-400">
                    0{idx + 1} · {stage.artifactFile}
                  </span>
                  {stage.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : stage.status === 'running' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
                  ) : stage.status === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                  )}
                </div>

                <div className="mt-1.5 text-xs font-bold text-white">
                  {stage.name}
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300">
                    {stage.runner || 'queued'}
                  </span>
                  {stage.durationMs && (
                    <span>{(stage.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Stage Inspector Log */}
        {activeStage && (
          <div className="rounded-xl border border-slate-800/90 bg-[#05070b] p-3.5 font-mono text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-bold text-slate-200">
                  {activeStage.name}
                </span>
                <span>— {activeStage.role}</span>
              </div>
              <div className="flex items-center gap-3">
                {activeStage.conversationId && (
                  <span>conv: {activeStage.conversationId}</span>
                )}
                {activeStage.tokensUsed && (
                  <span>tokens: {activeStage.tokensUsed.total}</span>
                )}
                <span className="text-emerald-400">
                  artifact: {activeStage.artifactFile}
                </span>
              </div>
            </div>

            {activeStage.summary && (
              <div className="text-emerald-300 text-xs">
                ✓ {activeStage.summary}
              </div>
            )}

            <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] text-slate-400">
              {activeStage.logs.length === 0 ? (
                <div className="text-slate-600">
                  Waiting for previous stage to complete...
                </div>
              ) : (
                activeStage.logs.map((log, i) => (
                  <div key={i} className="leading-relaxed">
                    <span className="text-slate-600 mr-2">
                      [{log.timestamp.slice(11, 19)}]
                    </span>
                    <span
                      className={
                        log.level === 'cmd'
                          ? 'text-sky-300'
                          : log.level === 'success'
                          ? 'text-emerald-300'
                          : log.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                active
                  ? 'bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge && (
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
                    active
                      ? 'bg-slate-950/20 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && analysis && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                  {analysis.category}
                </span>
                <span className="text-xs text-slate-400">
                  Difficulty:{' '}
                  <strong className="text-white">{analysis.difficulty}</strong> ·
                  Est. Print:{' '}
                  <strong className="text-white">
                    {analysis.estimatedPrintTimeHours}h
                  </strong>{' '}
                  · Assembly:{' '}
                  <strong className="text-white">
                    {analysis.estimatedAssemblyMinutes} min
                  </strong>
                </span>
              </div>

              <h3 className="text-lg font-bold text-white">
                Why the Commercial Version Costs $
                {analysis.originalProduct.retailPrice} — and How We Beat It
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {analysis.description}
              </p>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-400">
                  Core Engineering Function
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis.functionSummary}
                </p>
              </div>
            </div>

            {/* Printed vs Bought Split */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
                  <Printer className="h-4 w-4" />
                  3D-Printed Parts ({analysis.whatGetsPrinted.length})
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  {analysis.whatGetsPrinted.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-sky-500/30 bg-sky-950/10 p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-sky-300">
                  <ShoppingCart className="h-4 w-4" />
                  Off-The-Shelf Hardware ({analysis.whatGetsBought.length})
                </div>
                <ul className="space-y-2 text-xs text-slate-300">
                  {analysis.whatGetsBought.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column: Specs & Engineering Notes */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Key Mechanisms
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                {analysis.keyMechanisms.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 leading-relaxed"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                DFM & Slicer Notes
              </h3>
              <ul className="space-y-2 text-xs text-slate-400">
                {analysis.engineeringNotes.map((n, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <ChevronRight className="h-4 w-4 text-emerald-400 shrink-0" />
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
          {PeerSourcesComp && (
            <PeerSourcesComp
              sources={sources}
              analysis={analysis}
              projectId={manifest.id}
            />
          )}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Gemini 4 Argon Grounded Web Research & Open-Source Priors
              </h3>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-0.5 text-xs text-sky-300">
                Google Search Grounding Active
              </span>
            </div>
            <p className="text-xs text-slate-300">{sources.querySummary}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {sources.sources.map((src) => (
              <a
                key={src.id}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-emerald-500/50 transition-all"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono uppercase text-emerald-300">
                      {src.type} · {src.domain}
                    </span>
                    <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white group-hover:text-emerald-300">
                    {src.title}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {src.summary}
                  </p>
                </div>

                <ul className="mt-4 space-y-1 border-t border-slate-800/80 pt-3 text-[11px] text-slate-300">
                  {src.keyTakeaways.map((tk, i) => (
                    <li key={i}>• {tk}</li>
                  ))}
                </ul>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: BOM */}
      {activeTab === 'bom' && bom && (
        <div className="space-y-6">
          {PeerBomComp && (
            <PeerBomComp bom={bom} analysis={analysis} design={design} />
          )}

          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Original Commercial Price</div>
              <div className="mt-1 text-2xl font-bold text-slate-300 line-through">
                ${bom.summary.originalRetailPrice.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">Off-The-Shelf Hardware</div>
              <div className="mt-1 text-2xl font-bold text-white">
                ${bom.summary.purchasedPartsTotal.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="text-xs text-slate-400">3D Print Filament Est.</div>
              <div className="mt-1 text-2xl font-bold text-sky-400">
                ${bom.summary.filamentCostTotal.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <div className="text-xs font-semibold text-emerald-300">
                Total DIY Cost (Save {bom.summary.savingsPercent}%)
              </div>
              <div className="mt-1 text-2xl font-black text-emerald-400">
                ${bom.summary.totalDiyCost.toFixed(2)}
              </div>
            </div>
          </div>

          {/* BOM Line Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {bom.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/65 p-5 space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-bold text-emerald-300">
                      {item.partNumber} · {item.category}
                    </span>
                    <span className="text-base font-extrabold text-white">
                      ${item.totalPrice.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        (Qty: {item.qty} {item.unit})
                      </span>
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white">{item.name}</h4>
                  <p className="text-xs text-slate-400">{item.specification}</p>
                  {item.notes && (
                    <p className="text-[11px] text-slate-500">{item.notes}</p>
                  )}
                </div>

                {/* Retailer Links */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3">
                  {item.retailerLinks.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      <span>{link.retailer}</span>
                      <span className="text-emerald-400">
                        ${link.estPrice.toFixed(2)}
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-4 text-xs text-sky-200 flex items-center justify-between">
              <span>
                3D Plate Viewer slot ready — automatically mounts{' '}
                <code>components/print/</code> when present. Below are the live generated plates & STL downloads from{' '}
                <code>plates.json</code> and <code>parts/*.stl</code>.
              </span>
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-bold text-slate-950"
              >
                <Truck className="h-3.5 w-3.5" /> No Printer? Order Prints
              </button>
            </div>
          )}

          {/* Plates Summary */}
          <div className="grid gap-4 md:grid-cols-2">
            {plates.plates.map((plate) => (
              <div
                key={plate.plateNumber}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-white">
                      {plate.name}
                    </h4>
                    <p className="text-xs text-slate-400">
                      Printer: {plate.printerName} (
                      {plate.bedDimensionsMm.join('×')} mm) · Utilization:{' '}
                      {plate.utilizationPercent}%
                    </p>
                  </div>
                  <div className="text-right text-xs text-slate-300">
                    <div className="font-bold text-emerald-400">
                      {plate.weightGrams}g filament
                    </div>
                    <div>~{plate.estimatedMinutes} min</div>
                  </div>
                </div>

                {/* 2D Bed Preview */}
                <div className="relative mx-auto aspect-square max-w-[260px] rounded-xl border border-slate-700 bg-slate-950 p-3 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-grid-pattern opacity-40" />
                  <div className="relative z-10 text-center space-y-1">
                    <Box className="mx-auto h-6 w-6 text-emerald-400" />
                    <div className="text-xs font-bold text-white">
                      {plate.placements.length} Packed Parts
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {plate.bedDimensionsMm[0]} × {plate.bedDimensionsMm[1]} mm
                      Build Plate
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Individual STL Parts Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Individual Printable STL Files (parts/*.stl)
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
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
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: part.color }}
                        />
                        <span className="text-xs font-bold text-white">
                          {part.name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {part.dims_mm.join('×')}mm · {part.weightGrams}g ·{' '}
                        {part.material}
                      </div>
                    </div>

                    <a
                      href={`/api/objects/${manifest.id}/stl/${fileBase}`}
                      download={fileBase}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-400"
                    >
                      <Download className="h-3.5 w-3.5" /> STL
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
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
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-4 text-xs text-sky-200">
              IKEA-Style Three.js Animated Player slot ready — dynamically imports{' '}
              <code>components/three/</code> when present. Step through the{' '}
              <code>instructions.json</code> motion choreography below:
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Step Player Card */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
              {(() => {
                const step =
                  instructions.steps[activeStepIdx] || instructions.steps[0];
                if (!step) return null;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-black text-slate-950">
                        STEP {step.n} OF {instructions.steps.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={activeStepIdx === 0}
                          onClick={() =>
                            setActiveStepIdx((i) => Math.max(0, i - 1))
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-200 disabled:opacity-40"
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
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-40"
                        >
                          <Play className="h-3 w-3" /> Next Step
                        </button>
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-white">
                      {step.title}
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {step.note}
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                        <div className="text-[11px] font-bold uppercase text-slate-400">
                          Parts Involved
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {step.partIds.map((pid) => (
                            <span
                              key={pid}
                              className="rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-300"
                            >
                              {pid}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
                        <div className="text-[11px] font-bold uppercase text-slate-400">
                          3D Motion Vectors (from → to mm)
                        </div>
                        <div className="space-y-1 font-mono text-[11px] text-slate-300">
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
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-emerald-400">
                      STEP 0{s.n}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {s.partIds.length} part(s)
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-bold text-white">
                    {s.title}
                  </div>
                </button>
              ))}
            </div>
          </div>
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
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-4 text-xs text-sky-200">
              Interactive Three.js Exploded View slot ready — dynamically imports{' '}
              <code>components/three/</code> when present. Inspect the parametric assembly graph (
              <code>design.json</code>) below:
            </div>
          )}

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
                        ? 'border-emerald-400 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: part.color }}
                        />
                        {part.partNumber || part.id}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          part.kind === 'printed'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-sky-500/15 text-sky-300'
                        }`}
                      >
                        {part.kind}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-bold text-white">
                      {part.name}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      dims: {part.dims_mm.join('×')}mm · shape: {part.shape}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Part Inspector Panel */}
            {selectedPart && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-emerald-400">
                    {selectedPart.id}
                  </span>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                    {selectedPart.material}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  {selectedPart.name}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {selectedPart.description}
                </p>

                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3.5 font-mono text-xs text-slate-300">
                  <div>dims_mm: [{selectedPart.dims_mm.join(', ')}]</div>
                  <div>position: [{selectedPart.position.join(', ')}]</div>
                  <div>explode: [{selectedPart.explode.join(', ')}]</div>
                  <div>shape: {selectedPart.shape}</div>
                  {selectedPart.bomRef && (
                    <div className="text-emerald-400">
                      bomRef: {selectedPart.bomRef}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print Service Quote Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                No 3D Printer? Send STLs to an On-Demand Print Service
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
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
                      ? 'border-emerald-400 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="service"
                      checked={selectedService === srv.id}
                      onChange={() => setSelectedService(srv.id)}
                    />
                    <span className="text-xs font-bold text-white">
                      {srv.name}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400">
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
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-4 py-2 text-xs font-bold text-slate-950"
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
