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
      return 'border-[#c84b31]/50 bg-[#c84b31]/15 text-[#e06348]';
    }
    if (sev === 'warning') {
      return 'border-[#d4af37]/45 bg-[#d4af37]/15 text-[#f3d478]';
    }
    return 'border-[#b89b4a]/45 bg-[#b89b4a]/15 text-[#e6d3b3]';
  };

  return (
    <div
      data-testid="critic-panel"
      className="rounded-2xl codex-folio p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#f3d478]" />
            <h3 className="font-display text-lg font-bold tracking-wide text-[#f5ebd6]">
              Gemini 4 Argon Printability Critic · DFM Audit (`critique.json`)
            </h3>
            <span
              className={`rounded-md border px-2 py-0.5 font-codex text-[11px] font-bold uppercase ${
                critique.passed
                  ? 'border-[#b89b4a]/50 bg-[#b89b4a]/20 text-[#f3d478]'
                  : 'border-[#d4af37]/50 bg-[#d4af37]/20 text-[#f3d478]'
              }`}
            >
              {critique.passed ? 'PASS' : 'REVISED'} · {critique.finalScore}/100
            </span>
            {critique.degradedGracefully && (
              <span className="rounded-md border border-[#d4af37]/35 bg-[#282016] px-2 py-0.5 text-[10px] font-codex text-[#f3d478]">
                Graceful DFM Fallback Active
              </span>
            )}
          </div>
          <p className="text-xs text-[#bda782]">
            Target Printer:{' '}
            <strong className="text-[#f5ebd6]">
              {critique.printerName || critique.printerId}
            </strong>{' '}
            ({critique.bedDimensionsMm.join('×')} mm) ·{' '}
            <strong className="text-[#f3d478]">
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
            className={`rounded-lg px-2.5 py-1 font-codex text-xs font-bold transition-colors ${
              selectedRoundNum === 'all'
                ? 'bg-[#d4af37] text-[#140e07]'
                : 'border border-[#d4af37]/30 bg-[#14100b] text-[#e6d3b3] hover:text-[#f5ebd6]'
            }`}
          >
            All Rounds ({rounds.length})
          </button>
          {rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              onClick={() => setSelectedRoundNum(r.round)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-codex text-xs font-bold transition-colors ${
                selectedRoundNum === r.round
                  ? 'bg-[#d4af37] text-[#140e07]'
                  : 'border border-[#d4af37]/30 bg-[#14100b] text-[#e6d3b3] hover:text-[#f5ebd6]'
              }`}
            >
              <span>Round {r.round}</span>
              <span
                className={`rounded px-1 py-0.2 text-[10px] font-codex ${
                  selectedRoundNum === r.round
                    ? 'bg-[#140e07]/20 text-[#140e07]'
                    : r.passed
                    ? 'bg-[#b89b4a]/25 text-[#f3d478]'
                    : 'bg-[#d4af37]/25 text-[#f3d478]'
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
            className="flex items-center justify-between rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/80 px-3 py-2 text-xs"
          >
            <span className="text-[#e6d3b3] font-medium">{p.label}</span>
            {p.pass ? (
              <span className="inline-flex items-center gap-1 font-codex text-[11px] font-bold text-[#f3d478]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#b89b4a]" /> PASS
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-codex text-[11px] font-bold text-[#e5c158]">
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
                ? 'border-[#b89b4a]/35 bg-[#14100b]/90'
                : 'border-[#d4af37]/35 bg-[#1d1710]/90'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-codex text-xs font-bold uppercase ${
                    round.passed
                      ? 'bg-[#b89b4a] text-[#140e07]'
                      : 'bg-[#d4af37] text-[#140e07]'
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
                <span className="font-codex text-xs font-bold text-[#f5ebd6]">
                  Score: {round.score}/100
                </span>
              </div>
              {!round.passed && (
                <span className="inline-flex items-center gap-1 font-codex text-[11px] font-semibold text-[#f3d478]">
                  <RefreshCw className="h-3 w-3" /> Sent {round.issues.length}{' '}
                  fix(es) back to Designer Agent
                </span>
              )}
            </div>

            <p className="text-xs text-[#e6d3b3] leading-relaxed">
              {round.summary}
            </p>

            {/* Issues Table / Grid for this Round */}
            <div className="grid gap-2.5 md:grid-cols-2">
              {round.issues.map((iss, idx) => (
                <div
                  key={`${round.round}-${iss.partId}-${idx}`}
                  className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/90 p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-[#f5ebd6] truncate">
                      {iss.part}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded bg-[#1d1710] border border-[#d4af37]/25 px-1.5 py-0.5 font-codex text-[10px] uppercase text-[#e6d3b3]">
                        {iss.category.replace('_', ' ')}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-codex text-[10px] font-bold uppercase ${severityBadge(
                          iss.severity
                        )}`}
                      >
                        {iss.severity}
                      </span>
                    </div>
                  </div>

                  <div className="text-[#e6d3b3] leading-relaxed">
                    <span className="font-semibold text-[#bda782]">
                      Problem:{' '}
                    </span>
                    {iss.problem}
                  </div>

                  <div className="text-[#f3d478] leading-relaxed flex items-start gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-[#d4af37] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[#d4af37]">Fix: </strong>
                      {iss.fix}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Designer Fixes Applied in this Round */}
            {round.fixesApplied && round.fixesApplied.length > 0 && (
              <div className="rounded-lg border border-[#d4af37]/25 bg-[#1a130c] p-3 space-y-1">
                <div className="font-codex text-[11px] font-bold uppercase tracking-wider text-[#f3d478]">
                  {round.passed
                    ? 'Round Verification Status'
                    : `Designer Revision ${round.round} Adjustments Applied to design.json`}
                </div>
                <ul className="space-y-1 text-[11px] font-mono text-[#e6d3b3]">
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
