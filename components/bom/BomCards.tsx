'use client';

import React, { useMemo, useState } from 'react';
import type { BomData, BomItem } from '../../lib/types';
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
      className={`inline-flex rounded-full px-2.5 py-0.5 font-codex text-[11px] font-semibold ${cls}`}
    >
      {retailer}
    </span>
  );
}

export function BomSummary({ bom }: { bom: BomData }) {
  const { summary } = bom;

  const categorySubtotals = useMemo(() => {
    const map = new Map<string, { count: number; subtotal: number }>();
    for (const item of bom.items) {
      const cat = (item.category || 'Hardware').trim();
      const prev = map.get(cat) || { count: 0, subtotal: 0 };
      map.set(cat, {
        count: prev.count + 1,
        subtotal: Math.round((prev.subtotal + (item.totalPrice || 0)) * 100) / 100,
      });
    }
    return Array.from(map.entries()).map(([category, data]) => ({
      category,
      ...data,
    }));
  }, [bom.items]);

  return (
    <div className="surface-card rounded-2xl px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#dfd3be]">
          <span className="font-codex font-bold uppercase tracking-wider text-[#f3d478]">
            Category Subtotals
          </span>
          <span className="text-[#b5a48b]/60">·</span>
          <span className="font-mono text-[11px] text-[#b5a48b]/85 tabular-nums">
            {bom.items.length} line items (OTS{' '}
            {formatMoney(summary.purchasedPartsTotal, bom.currency)} + Filament{' '}
            {formatMoney(summary.filamentCostTotal, bom.currency)})
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {categorySubtotals.map((cat) => (
            <div
              key={cat.category}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-3 py-1.5 text-xs"
            >
              <span className="font-medium capitalize text-[#dfd3be]">
                {cat.category}
              </span>
              <span className="font-mono text-[11px] text-[#b5a48b]/80 tabular-nums">
                ({cat.count})
              </span>
              <span className="font-display font-bold text-[#f3d478] tabular-nums">
                {formatMoney(cat.subtotal, bom.currency)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BomItemCard({
  item,
  currency = 'USD',
  onSelectPartId,
}: {
  item: BomItem;
  currency?: string;
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
      className="codex-folio rounded-2xl card-hover animate-slide-in p-4 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-[#b5a48b]/80">
              {item.partNumber} · <span className="capitalize">{item.category}</span>
            </p>
            <h3 className="mt-0.5 truncate font-display text-lg font-bold text-[#faf4e8]">
              {item.name}
            </h3>
            <p
              className={`mt-1 text-sm leading-relaxed text-[#dfd3be] ${
                !expanded && isLongDesc ? 'line-clamp-2' : ''
              }`}
            >
              {fullDesc}
            </p>
            {isLongDesc && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-1 inline-flex items-center text-xs font-semibold text-[#f3d478] hover:underline"
              >
                {expanded ? 'Less' : 'More'}
              </button>
            )}
          </div>
          <p className="shrink-0 text-right">
            <span className="block font-display text-lg font-bold text-[#f3d478] tabular-nums">
              {formatMoney(item.totalPrice, currency)}
            </span>
            <span className="font-mono text-[11px] text-[#b5a48b]/80 tabular-nums">
              {item.qty} × {formatMoney(item.unitPrice, currency)} / {item.unit}
            </span>
          </p>
        </div>
      </div>

      <div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#dfd3be]/15 pt-3">
          <RetailerBadge retailer={item.primaryRetailer} />
          <a
            href={item.primaryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[#d4af37]/35 bg-[#14100b] px-3 py-1.5 text-xs font-semibold text-[#f3d478] hover:border-[#f3d478] hover:bg-[#231d15] transition-colors"
          >
            Buy at {item.primaryRetailer} ({formatMoney(item.totalPrice, currency)}) →
          </a>
          {item.retailerLinks
            .filter((l) => l.retailer !== item.primaryRetailer)
            .map((l) => (
              <a
                key={l.retailer}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[#dfd3be]/20 bg-[#0c0a08] px-2.5 py-1.5 text-xs text-[#dfd3be] hover:border-[#f3d478] hover:text-[#faf4e8] transition-colors"
              >
                {l.retailer} ({formatMoney(l.estPrice, currency)})
              </a>
            ))}
        </div>
        {item.linkedPartIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#b5a48b]">
            <span>Linked 3D parts:</span>
            {item.linkedPartIds.map((pid) =>
              onSelectPartId ? (
                <button
                  key={pid}
                  type="button"
                  onClick={() => onSelectPartId(pid)}
                  className="inline-flex min-h-[36px] items-center rounded-md border border-[#d4af37]/35 bg-[#d4af37]/12 px-2 py-1 font-mono text-[11px] font-semibold text-[#f3d478] hover:bg-[#d4af37]/25"
                >
                  {pid}
                </button>
              ) : (
                <span
                  key={pid}
                  className="rounded bg-[#282016] border border-[#d4af37]/25 px-1.5 py-0.5 font-mono text-[11px] text-[#e6d3b3]"
                >
                  {pid}
                </span>
              )
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function BomTab({
  bom,
  onSelectPartId,
}: {
  bom: BomData;
  analysis?: unknown;
  design?: unknown;
  onSelectPartId?: (partId: string) => void;
}) {
  if (!bom) return null;
  const { summary } = bom;

  return (
    <div className="space-y-4" data-testid="bom-tab">
      <BomSummary bom={bom} />

      <div className="grid gap-4 md:grid-cols-2">
        {bom.items.map((item) => (
          <BomItemCard
            key={item.id}
            item={item}
            currency={bom.currency}
            onSelectPartId={onSelectPartId}
          />
        ))}
      </div>

      {/* Compact Total Row at the Bottom */}
      <div className="surface-card rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#dfd3be]">
          <span className="font-codex font-bold uppercase tracking-wider text-[#faf4e8]">
            BOM Total ({bom.items.length} items)
          </span>
          <span className="font-mono text-[#b5a48b]/85 tabular-nums">
            Off-the-shelf {formatMoney(summary.purchasedPartsTotal, bom.currency)} + Filament{' '}
            {formatMoney(summary.filamentCostTotal, bom.currency)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 tabular-nums">
          <span className="text-xs text-[#b5a48b] line-through">
            {formatMoney(summary.originalRetailPrice, bom.currency)} retail
          </span>
          <span className="font-display text-xl font-bold text-[#faf4e8]">
            {formatMoney(summary.totalDiyCost, bom.currency)} DIY
          </span>
          <span className="rounded-lg bg-[#e5bd47] px-2.5 py-1 text-xs font-bold text-[#140e07]">
            Save {formatMoney(summary.totalSavings, bom.currency)} ({summary.savingsPercent}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export default BomTab;
