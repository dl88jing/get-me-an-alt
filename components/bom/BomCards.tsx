'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  Layers,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { BomData, BomItem, DesignPart } from '../../lib/types';
import { formatMoney } from '../ui/SavingsBadge';

const RETAILER_BADGE: Record<string, string> = {
  Amazon: 'border border-[#d4af37]/40 bg-[#d4af37]/15 text-[#f3d478]',
  'Home Depot': 'border border-[#c84b31]/45 bg-[#c84b31]/15 text-[#e6d3b3]',
  Walmart: 'border border-[#b89b4a]/45 bg-[#b89b4a]/15 text-[#f3d478]',
  'McMaster-Carr': 'border border-[#d4af37]/35 bg-[#282016] text-[#f5ebd6]',
  AliExpress: 'border border-[#c84b31]/40 bg-[#c84b31]/15 text-[#f3d478]',
  Adafruit: 'border border-[#d4af37]/30 bg-[#1d1710] text-[#e6d3b3]',
};

function RetailerBadge({ retailer }: { retailer: string }) {
  const cls =
    RETAILER_BADGE[retailer] ??
    'border border-[#d4af37]/30 bg-[#1d1710] text-[#e6d3b3]';
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 font-codex text-[11px] font-semibold ${cls}`}
    >
      {retailer}
    </span>
  );
}

function buildBomCsv(bom: BomData, ownedIds: Set<string>): string {
  const headers = [
    'Part Number',
    'Name',
    'Category',
    'Quantity',
    'Unit',
    'Unit Price',
    'Total Price',
    'Currency',
    'Status',
    'Primary Retailer',
    'Primary URL',
    'Specification',
  ];
  const escapeCsv = (val: string | number | undefined) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };
  const rows = bom.items.map((item) => [
    escapeCsv(item.partNumber),
    escapeCsv(item.name),
    escapeCsv(item.category),
    escapeCsv(item.qty),
    escapeCsv(item.unit),
    escapeCsv(item.unitPrice),
    escapeCsv(item.totalPrice),
    escapeCsv(bom.currency || 'USD'),
    escapeCsv(ownedIds.has(item.id) ? 'In Workshop ($0)' : 'To Buy'),
    escapeCsv(item.primaryRetailer),
    escapeCsv(item.primaryUrl),
    escapeCsv(item.specification),
  ]);
  return [headers.map(escapeCsv).join(','), ...rows.map((r) => r.join(','))].join(
    '\n'
  );
}

export function BomSummary({
  bom,
  activeCategory,
  onSelectCategory,
  ownedIds,
  onResetOwned,
  onCopyCsv,
  onDownloadCsv,
  copiedCsv,
}: {
  bom: BomData;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  ownedIds?: Set<string>;
  onResetOwned?: () => void;
  onCopyCsv?: () => void;
  onDownloadCsv?: () => void;
  copiedCsv?: boolean;
}) {
  const { summary } = bom;
  const selectedCategory = activeCategory || 'all';
  const ownedSet = ownedIds || new Set<string>();

  const categorySubtotals = useMemo(() => {
    const map = new Map<string, { count: number; subtotal: number }>();
    for (const item of bom.items) {
      const cat = (item.category || 'Hardware').trim();
      const prev = map.get(cat) || { count: 0, subtotal: 0 };
      map.set(cat, {
        count: prev.count + 1,
        subtotal:
          Math.round((prev.subtotal + (item.totalPrice || 0)) * 100) / 100,
      });
    }
    return Array.from(map.entries()).map(([category, data]) => ({
      category,
      ...data,
    }));
  }, [bom.items]);

  const ownedSavings = useMemo(() => {
    let sum = 0;
    for (const item of bom.items) {
      if (ownedSet.has(item.id)) {
        sum += item.totalPrice || 0;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [bom.items, ownedSet]);

  const remainingOutOfPocket = Math.max(
    0,
    Math.round((summary.totalDiyCost - ownedSavings) * 100) / 100
  );

  return (
    <div className="surface-card rounded-2xl px-4 py-3.5 sm:px-5 space-y-3">
      {/* Top row: Subtotals label + Workshop Out-of-Pocket status + CSV Export utilities */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#dfd3be] min-w-0">
          <span className="font-codex font-bold uppercase tracking-wider text-[#f3d478]">
            Category Subtotals
          </span>
          <span className="text-[#b5a48b]/60">·</span>
          <span className="font-mono text-[11px] text-[#b5a48b]/90 tabular-nums">
            {bom.items.length} line items (OTS{' '}
            {formatMoney(summary.purchasedPartsTotal, bom.currency)} + Filament{' '}
            {formatMoney(summary.filamentCostTotal, bom.currency)})
          </span>
          {ownedSet.size > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5bd47]/45 bg-[#e5bd47]/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#f3d478] tabular-nums">
              <span>
                Out-of-Pocket: {formatMoney(remainingOutOfPocket, bom.currency)}
              </span>
              <span className="text-[#dfd3be]/80 font-normal">
                ({ownedSet.size} in workshop)
              </span>
              {onResetOwned && (
                <button
                  type="button"
                  onClick={onResetOwned}
                  title="Reset workshop owned checkboxes"
                  className="ml-1 inline-flex items-center gap-0.5 underline hover:text-[#faf4e8]"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </span>
          )}
        </div>

        {(onCopyCsv || onDownloadCsv) && (
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {onCopyCsv && (
              <button
                type="button"
                onClick={onCopyCsv}
                aria-label={
                  copiedCsv
                    ? 'BOM CSV copied to clipboard'
                    : 'Copy BOM as CSV to clipboard'
                }
                data-testid="bom-copy-csv-btn"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors"
              >
                {copiedCsv ? (
                  <>
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#e5bd47]" />
                    <span className="text-[#f3d478]">Copied CSV</span>
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="h-3.5 w-3.5 text-[#e5bd47]" />
                    <span>Copy CSV</span>
                  </>
                )}
              </button>
            )}
            {onDownloadCsv && (
              <button
                type="button"
                onClick={onDownloadCsv}
                aria-label="Export BOM as CSV file"
                data-testid="bom-download-csv-btn"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1 text-xs font-semibold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors"
              >
                <Download aria-hidden="true" className="h-3.5 w-3.5 text-[#e5bd47]" />
                <span>Export .CSV</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Category Filter Pills */}
      <div
        role="toolbar"
        aria-label="Filter BOM items by category"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          onClick={() => onSelectCategory?.('all')}
          aria-pressed={selectedCategory === 'all'}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
            selectedCategory === 'all'
              ? 'border-[#f3d478] bg-[#e5bd47]/20 text-[#faf4e8] font-bold shadow-sm'
              : 'border-[#dfd3be]/20 bg-[#0c0a08] text-[#dfd3be] hover:border-[#f3d478]/50 hover:text-[#faf4e8]'
          }`}
        >
          <span>All Items</span>
          <span className="font-mono text-[11px] text-[#b5a48b] tabular-nums">
            ({bom.items.length})
          </span>
          <span className="font-display font-bold text-[#f3d478] tabular-nums">
            {formatMoney(summary.totalDiyCost, bom.currency)}
          </span>
        </button>

        {categorySubtotals.map((cat) => {
          const isActive =
            selectedCategory.toLowerCase() === cat.category.toLowerCase();
          return (
            <button
              key={cat.category}
              type="button"
              onClick={() =>
                onSelectCategory?.(isActive ? 'all' : cat.category)
              }
              aria-pressed={isActive}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-all ${
                isActive
                  ? 'border-[#f3d478] bg-[#e5bd47]/20 text-[#faf4e8] font-bold shadow-sm'
                  : 'border-[#dfd3be]/20 bg-[#0c0a08] text-[#dfd3be] hover:border-[#f3d478]/50 hover:text-[#faf4e8]'
              }`}
            >
              <span className="font-medium capitalize">{cat.category}</span>
              <span className="font-mono text-[11px] text-[#b5a48b]/85 tabular-nums">
                ({cat.count})
              </span>
              <span className="font-display font-bold text-[#f3d478] tabular-nums">
                {formatMoney(cat.subtotal, bom.currency)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BomItemCard({
  item,
  currency = 'USD',
  designPartsMap,
  isOwned = false,
  isHighlighted = false,
  onToggleOwned,
  onSelectPartId,
}: {
  item: BomItem;
  currency?: string;
  designPartsMap?: Map<string, DesignPart>;
  isOwned?: boolean;
  isHighlighted?: boolean;
  onToggleOwned?: (id: string) => void;
  onSelectPartId?: (partId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!item) return null;

  const fullDesc = item.notes
    ? `${item.specification} — ${item.notes}`
    : item.specification;
  const isLongDesc = (fullDesc || '').length > 125;

  return (
    <article
      id={`bom-item-${item.id}`}
      data-bom-part-number={item.partNumber}
      className={`codex-folio min-w-0 max-w-full overflow-hidden rounded-2xl card-hover animate-slide-in p-4 flex flex-col justify-between transition-all ${
        isHighlighted
          ? 'ring-2 ring-inset ring-[#f3d478] !border-[#f3d478] bg-[#231d15]/90'
          : isOwned
          ? 'border-[#e5bd47]/40 bg-[#14100b]/75 opacity-90'
          : ''
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-[#d4af37]/30 bg-[#0c0a08] px-2 py-0.5 font-mono text-[11px] font-bold text-[#f3d478]">
                {item.partNumber}
              </span>
              <span className="font-mono text-[11px] capitalize text-[#b5a48b]">
                {item.category}
              </span>
              {isHighlighted && (
                <span className="inline-flex items-center rounded-md bg-[#e5bd47] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#140e07]">
                  Selected
                </span>
              )}
              {onToggleOwned && (
                <button
                  type="button"
                  onClick={() => onToggleOwned(item.id)}
                  aria-pressed={isOwned}
                  data-testid={`bom-owned-toggle-${item.partNumber}`}
                  className={`inline-flex min-h-[28px] items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                    isOwned
                      ? 'border-[#e5bd47]/60 bg-[#e5bd47]/20 text-[#f3d478]'
                      : 'border-[#dfd3be]/20 bg-[#0c0a08] text-[#b5a48b] hover:border-[#f3d478]/45 hover:text-[#faf4e8]'
                  }`}
                >
                  {isOwned ? (
                    <>
                      <CheckSquare className="h-3 w-3 text-[#e5bd47] shrink-0" />
                      <span>In Workshop</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-3 w-3 text-[#b5a48b] shrink-0" />
                      <span>Have it</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <h3
              className={`mt-1.5 font-display text-base sm:text-lg font-bold leading-snug break-words ${
                isOwned ? 'line-through text-[#b5a48b]' : 'text-[#faf4e8]'
              }`}
            >
              {item.name}
            </h3>

            <p
              className={`mt-1 text-xs sm:text-sm leading-relaxed text-[#dfd3be] break-words ${
                !expanded && isLongDesc ? 'line-clamp-2' : ''
              }`}
            >
              {fullDesc}
            </p>
            {isLongDesc && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-1 -ml-2 inline-flex min-h-[36px] items-center px-2 text-xs font-semibold text-[#f3d478] hover:underline"
              >
                {expanded ? 'Show Less' : 'Read More'}
              </button>
            )}
          </div>

          <div className="shrink-0 text-right">
            <span
              className={`block font-display text-lg font-bold tabular-nums ${
                isOwned ? 'line-through text-[#b5a48b]' : 'text-[#f3d478]'
              }`}
            >
              {formatMoney(item.totalPrice, currency)}
            </span>
            {isOwned ? (
              <span className="inline-block rounded bg-[#e5bd47]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#f3d478]">
                $0 to buy
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[#b5a48b]/80 tabular-nums">
                {item.qty} × {formatMoney(item.unitPrice, currency)} /{' '}
                {item.unit}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#dfd3be]/15 pt-3">
          <RetailerBadge retailer={item.primaryRetailer} />
          <a
            href={item.primaryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[40px] max-w-full items-center gap-1 rounded-lg border border-[#d4af37]/35 bg-[#14100b] px-3 py-1.5 text-xs font-semibold text-[#f3d478] hover:border-[#f3d478] hover:bg-[#231d15] transition-colors"
          >
            <span className="truncate">
              Buy at {item.primaryRetailer} (
              {formatMoney(item.totalPrice, currency)})
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
          {item.retailerLinks
            .filter((l) => l.retailer !== item.primaryRetailer)
            .map((l) => (
              <a
                key={l.retailer}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1.5 text-xs text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8] transition-colors"
              >
                <span>
                  {l.retailer} ({formatMoney(l.estPrice, currency)})
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-75" />
              </a>
            ))}
        </div>

        {item.linkedPartIds.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-[#b5a48b]">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#b5a48b]">
              <Layers className="h-3 w-3 text-[#e5bd47]" />
              <span>Inspect in 3D:</span>
            </span>
            {item.linkedPartIds.map((pid) => {
              const matchedPart = designPartsMap?.get(pid);
              const label = matchedPart
                ? `${matchedPart.partNumber || matchedPart.id} · ${matchedPart.name}`
                : pid;
              return onSelectPartId ? (
                <button
                  key={pid}
                  type="button"
                  onClick={() => onSelectPartId(pid)}
                  title={`Open ${label} in Interactive 3D Exploded View`}
                  className="inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/12 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#f3d478] hover:border-[#f3d478] hover:bg-[#d4af37]/25 transition-colors"
                >
                  <span className="truncate max-w-[210px] sm:max-w-[260px]">
                    {label}
                  </span>
                  <span className="text-[10px] text-[#e5bd47] shrink-0">
                    3D →
                  </span>
                </button>
              ) : (
                <span
                  key={pid}
                  className="rounded bg-[#282016] border border-[#d4af37]/25 px-1.5 py-0.5 font-mono text-[11px] text-[#e6d3b3]"
                >
                  {label}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function BomTab({
  bom,
  design,
  projectId,
  selectedBomId,
  onSelectPartId,
}: {
  bom: BomData;
  analysis?: unknown;
  design?: { parts?: DesignPart[] } | null;
  projectId?: string;
  selectedBomId?: string | null;
  onSelectPartId?: (partId: string) => void;
}) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [ownedIds, setOwnedIds] = useState<Set<string>>(() => new Set());
  const [copiedCsv, setCopiedCsv] = useState(false);

  const storageKey = `gma-bom-owned:${projectId || 'default'}`;

  useEffect(() => {
    if (typeof window === 'undefined' || !bom) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setOwnedIds(new Set(parsed.filter((x) => typeof x === 'string')));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey, bom]);

  const designPartsMap = useMemo(() => {
    const map = new Map<string, DesignPart>();
    if (design?.parts) {
      for (const p of design.parts) {
        map.set(p.id, p);
        if (p.partNumber) map.set(p.partNumber, p);
      }
    }
    return map;
  }, [design]);

  // Auto-scroll and reveal when a specific BOM item is deep-linked from Overview or Sources
  useEffect(() => {
    if (!selectedBomId || !bom) return;
    const matched = bom.items.find(
      (i) =>
        i.id === selectedBomId ||
        i.partNumber?.toLowerCase() === selectedBomId.toLowerCase() ||
        i.linkedPartIds.includes(selectedBomId)
    );
    if (!matched) return;

    if (
      activeCategory !== 'all' &&
      (matched.category || '').toLowerCase() !== activeCategory.toLowerCase()
    ) {
      setActiveCategory('all');
    }

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`bom-item-${matched.id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedBomId, bom, activeCategory]);

  if (!bom) return null;
  const { summary } = bom;

  const persistOwned = (next: Set<string>) => {
    setOwnedIds(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
    }
  };

  const handleToggleOwned = (id: string) => {
    const next = new Set(ownedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    persistOwned(next);
  };

  const handleResetOwned = () => {
    persistOwned(new Set());
  };

  const handleCopyCsv = async () => {
    const csv = buildBomCsv(bom, ownedIds);
    try {
      await navigator.clipboard.writeText(csv);
      setCopiedCsv(true);
      window.setTimeout(() => setCopiedCsv(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildBomCsv(bom, ownedIds);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectId || 'diy-build'}-bom.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredItems =
    activeCategory === 'all'
      ? bom.items
      : bom.items.filter(
          (i) =>
            (i.category || 'Hardware').trim().toLowerCase() ===
            activeCategory.toLowerCase()
        );

  const ownedSavings = bom.items.reduce(
    (acc, item) => acc + (ownedIds.has(item.id) ? item.totalPrice || 0 : 0),
    0
  );
  const remainingOutOfPocket = Math.max(
    0,
    Math.round((summary.totalDiyCost - ownedSavings) * 100) / 100
  );

  return (
    <div className="space-y-4 min-w-0 max-w-full" data-testid="bom-tab">
      <BomSummary
        bom={bom}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        ownedIds={ownedIds}
        onResetOwned={handleResetOwned}
        onCopyCsv={handleCopyCsv}
        onDownloadCsv={handleDownloadCsv}
        copiedCsv={copiedCsv}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 min-w-0">
        {filteredItems.map((item) => {
          const isHighlighted = Boolean(
            selectedBomId &&
              (item.id === selectedBomId ||
                item.partNumber?.toLowerCase() ===
                  selectedBomId.toLowerCase() ||
                item.linkedPartIds.includes(selectedBomId))
          );
          return (
            <BomItemCard
              key={item.id}
              item={item}
              currency={bom.currency}
              designPartsMap={designPartsMap}
              isOwned={ownedIds.has(item.id)}
              isHighlighted={isHighlighted}
              onToggleOwned={handleToggleOwned}
              onSelectPartId={onSelectPartId}
            />
          );
        })}
      </div>

      {/* Compact Total Row at the Bottom */}
      <div className="surface-card rounded-2xl px-4 py-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#dfd3be]">
          <span className="font-codex font-bold uppercase tracking-wider text-[#faf4e8]">
            BOM Total ({bom.items.length} items)
          </span>
          <span className="font-mono text-[#b5a48b]/85 tabular-nums">
            Off-the-shelf {formatMoney(summary.purchasedPartsTotal, bom.currency)}{' '}
            + Filament {formatMoney(summary.filamentCostTotal, bom.currency)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          <span className="text-xs text-[#b5a48b] line-through">
            {formatMoney(summary.originalRetailPrice, bom.currency)} retail
          </span>
          <span className="font-display text-xl font-bold text-[#faf4e8]">
            {formatMoney(
              ownedIds.size > 0 ? remainingOutOfPocket : summary.totalDiyCost,
              bom.currency
            )}{' '}
            {ownedIds.size > 0 ? 'Out-of-Pocket' : 'DIY'}
          </span>
          <span className="rounded-lg bg-[#e5bd47] px-2.5 py-1 text-xs font-bold text-[#140e07]">
            Save{' '}
            {formatMoney(
              summary.originalRetailPrice -
                (ownedIds.size > 0
                  ? remainingOutOfPocket
                  : summary.totalDiyCost),
              bom.currency
            )}{' '}
            (
            {Math.round(
              ((summary.originalRetailPrice -
                (ownedIds.size > 0
                  ? remainingOutOfPocket
                  : summary.totalDiyCost)) /
                Math.max(1, summary.originalRetailPrice)) *
                100
            )}
            %)
          </span>
        </div>
      </div>
    </div>
  );
}

export default BomTab;
