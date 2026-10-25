'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { CritiqueData, CritiqueIssue, CritiqueRound } from '@/lib/types';

interface CritiquePanelProps {
  critique?: CritiqueData;
}

export default function CritiquePanel({ critique }: CritiquePanelProps) {
  const rounds: CritiqueRound[] =
    critique?.rounds && critique.rounds.length > 0
      ? critique.rounds
      : critique
      ? [
          {
            round: 1,
            passed: critique.passed,
            score: critique.finalScore,
            summary: `Evaluated ${critique.issues.length} printability checks on ${critique.printerName || critique.printerId}.`,
            issues: critique.issues,
            fixesApplied: critique.designAdjustments,
          },
        ]
      : [];

  const [selectedRoundNum, setSelectedRoundNum] = useState<number | 'all'>(
    'all'
  );

  if (!critique || rounds.length === 0) {
    return null;
  }

  const visibleRounds =
    selectedRoundNum === 'all'
      ? rounds
      : rounds.filter((r) => r.round === selectedRoundNum);

  const pillars = [
    {
      label: 'Overhangs ≤ 45°',
      pass: critique.checksSummary?.overhangsPass ?? true,
    },
    {
      label: 'Wall Thickness ≥ 2.0mm',
      pass: critique.checksSummary?.wallThicknessPass ?? true,
    },
    {
      label: 'Fit & Fastener Tolerances',
      pass: critique.checksSummary?.tolerancesPass ?? true,
    },
    {
      label: `Bed Fit (${critique.bedDimensionsMm.join('×')} mm)`,
      pass: critique.checksSummary?.bedFitPass ?? true,
    },
  ];

  const severityBadge = (sev: CritiqueIssue['severity']) => {
    if (sev === 'critical') {
      return 'border-rose-500/40 bg-rose-500/15 text-rose-300';
    }
    if (sev === 'warning') {
      return 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    }
    return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';
  };

  return (
    <div
      data-testid="critic-panel"
      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Gemini 4 Argon Printability Critic · DFM Audit (`critique.json`)
            </h3>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase ${
                critique.passed
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              {critique.passed ? 'PASS' : 'REVISED'} · {critique.finalScore}/100
            </span>
            {critique.degradedGracefully && (
              <span className="rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                Graceful DFM Fallback Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Target Printer:{' '}
            <strong className="text-slate-200">
              {critique.printerName || critique.printerId}
            </strong>{' '}
            ({critique.bedDimensionsMm.join('×')} mm) ·{' '}
            <strong className="text-emerald-300">
              {rounds.length} Critique Round{rounds.length > 1 ? 's' : ''}
            </strong>
            {typeof critique.revisionRoundsUsed === 'number' &&
              critique.revisionRoundsUsed > 0 && (
                <span>
                  {' '}
                  · {critique.revisionRoundsUsed} Designer Revision Loop
                  {critique.revisionRoundsUsed > 1 ? 's' : ''}
                </span>
              )}
          </p>
        </div>

        {/* Round Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedRoundNum('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              selectedRoundNum === 'all'
                ? 'bg-emerald-400 text-slate-950'
                : 'border border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
            }`}
          >
            All Rounds ({rounds.length})
          </button>
          {rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              onClick={() => setSelectedRoundNum(r.round)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                selectedRoundNum === r.round
                  ? 'bg-emerald-400 text-slate-950'
                  : 'border border-slate-700 bg-slate-950 text-slate-300 hover:text-white'
              }`}
            >
              <span>Round {r.round}</span>
              <span
                className={`rounded px-1 py-0.2 text-[10px] font-mono ${
                  selectedRoundNum === r.round
                    ? 'bg-slate-950/20 text-slate-950'
                    : r.passed
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {r.passed ? 'PASS' : 'FIX'} · {r.score}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4 DFM Pillar Badges */}
      <div className="grid gap-2 sm:grid-cols-4">
        {pillars.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
          >
            <span className="text-slate-300 font-medium">{p.label}</span>
            {p.pass ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> PASS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> REVISED
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Per-Round Cards */}
      <div className="space-y-4">
        {visibleRounds.map((round) => (
          <div
            key={round.round}
            className={`rounded-xl border p-4 space-y-3 ${
              round.passed
                ? 'border-emerald-500/30 bg-emerald-950/10'
                : 'border-amber-500/30 bg-amber-950/10'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-black uppercase ${
                    round.passed
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  {round.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5" />
                  )}
                  Round {round.round} ·{' '}
                  {round.passed ? 'PASSED' : 'LOOPED TO DESIGNER'}
                </span>
                <span className="font-mono text-xs font-bold text-white">
                  Score: {round.score}/100
                </span>
              </div>
              {!round.passed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                  <RefreshCw className="h-3 w-3" /> Sent {round.issues.length}{' '}
                  fix(es) back to Designer Agent
                </span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {round.summary}
            </p>

            {/* Issues Table / Grid for this Round */}
            <div className="grid gap-2.5 md:grid-cols-2">
              {round.issues.map((iss, idx) => (
                <div
                  key={`${round.round}-${iss.partId}-${idx}`}
                  className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-slate-200 truncate">
                      {iss.part}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                        {iss.category.replace('_', ' ')}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${severityBadge(
                          iss.severity
                        )}`}
                      >
                        {iss.severity}
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-300 leading-relaxed">
                    <span className="font-semibold text-slate-400">
                      Problem:{' '}
                    </span>
                    {iss.problem}
                  </div>

                  <div className="text-emerald-300/95 leading-relaxed flex items-start gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-emerald-400">Fix: </strong>
                      {iss.fix}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Designer Fixes Applied in this Round */}
            {round.fixesApplied && round.fixesApplied.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  {round.passed
                    ? 'Round Verification Status'
                    : `Designer Revision ${round.round} Adjustments Applied to design.json`}
                </div>
                <ul className="space-y-1 text-[11px] font-mono text-slate-300">
                  {round.fixesApplied.map((f, i) => (
                    <li key={i}>✓ {f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
