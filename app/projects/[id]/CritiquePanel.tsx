'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [expandedIssueKeys, setExpandedIssueKeys] = useState<
    Record<string, boolean>
  >({});

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
      className="rounded-2xl codex-folio p-4 sm:p-5 space-y-3.5"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#f3d478]" />
            <h3 className="font-display text-lg font-bold tracking-wide text-[#faf4e8]">
              Printability Critic · DFM Audit
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
          </div>
          <p className="text-xs text-[#b5a48b]">
            Target Printer:{' '}
            <strong className="text-[#dfd3be]">
              {critique.printerName || critique.printerId}
            </strong>{' '}
            {!(critique.printerName || '').includes('(') && (
              <span className="font-mono text-[11px] text-[#b5a48b]/80">
                ({critique.bedDimensionsMm.join('×')} mm){' '}
              </span>
            )}
            ·{' '}
            <span className="text-[#f3d478]">
              {rounds.length} Critique Round{rounds.length > 1 ? 's' : ''}
            </span>
          </p>
        </div>

        {/* Round Filter Pills + Expand Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              onClick={() => {
                setSelectedRoundNum(r.round);
                setDetailsExpanded(true);
              }}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-codex text-xs font-bold transition-colors ${
                detailsExpanded && selectedRoundNum === r.round
                  ? 'bg-[#d4af37] text-[#140e07]'
                  : 'border border-[#d4af37]/30 bg-[#14100b] text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8]'
              }`}
            >
              <span>Round {r.round}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${
                  detailsExpanded && selectedRoundNum === r.round
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
          <button
            type="button"
            onClick={() => {
              if (!detailsExpanded) setSelectedRoundNum('all');
              setDetailsExpanded((prev) => !prev);
            }}
            aria-expanded={detailsExpanded}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-3 py-1.5 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8]"
          >
            <span>{detailsExpanded ? 'Hide Details' : 'More Details'}</span>
            {detailsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* 4 DFM Pillar Badges */}
      <div className="grid gap-2 sm:grid-cols-4">
        {pillars.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/80 px-3 py-2 text-xs"
          >
            <span className="font-codex text-xs font-semibold text-[#dfd3be]">
              {p.label}
            </span>
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

      {/* Collapsible Per-Round Cards */}
      {detailsExpanded && (
        <div className="space-y-4 pt-2 border-t border-[#dfd3be]/15">
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

              <p className="text-xs text-[#dfd3be] leading-relaxed line-clamp-2">
                {round.summary}
              </p>

              {/* Issues Table / Grid for this Round */}
              <div className="grid gap-2.5 md:grid-cols-2">
                {round.issues.map((iss, idx) => {
                  const issueKey = `${round.round}-${iss.partId}-${idx}`;
                  const isExp = Boolean(expandedIssueKeys[issueKey]);
                  const isLong =
                    (iss.problem?.length || 0) + (iss.fix?.length || 0) > 130;
                  return (
                    <div
                      key={issueKey}
                      className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/90 p-3 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-bold text-[#faf4e8] truncate">
                          {iss.part}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="rounded bg-[#1d1710] border border-[#d4af37]/25 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#b5a48b]">
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

                      <div
                        className={`text-[#dfd3be] leading-relaxed ${
                          !isExp && isLong ? 'line-clamp-2' : ''
                        }`}
                      >
                        <span className="font-semibold text-[#b5a48b]">
                          Issue:{' '}
                        </span>
                        {iss.problem}
                      </div>

                      <div
                        className={`text-[#f3d478] leading-relaxed flex items-start gap-1.5 ${
                          !isExp && isLong ? 'line-clamp-2' : ''
                        }`}
                      >
                        <Wrench className="h-3.5 w-3.5 text-[#d4af37] shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-[#d4af37]">Fix: </strong>
                          {iss.fix}
                        </span>
                      </div>

                      {isLong && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedIssueKeys((prev) => ({
                              ...prev,
                              [issueKey]: !prev[issueKey],
                            }))
                          }
                          className="-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-[11px] font-semibold text-[#f3d478] hover:underline"
                        >
                          {isExp ? 'Show Less' : 'Read More'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
