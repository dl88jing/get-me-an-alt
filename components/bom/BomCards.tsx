import type { BomData, BomItem } from '../../lib/types';
import { formatMoney, SavingsBadge } from '../ui/SavingsBadge';

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
    <span className={`inline-flex rounded-full px-2.5 py-0.5 font-codex text-[11px] font-semibold ${cls}`}>
      {retailer}
    </span>
  );
}

export function BomSummary({ bom }: { bom: BomData }) {
  const { summary } = bom;
  return (
    <div className="codex-folio rounded-2xl animate-slide-in p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">DIY alternative</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight text-[#f5ebd6]">
            {formatMoney(summary.totalDiyCost, bom.currency)}
          </p>
          <p className="mt-1 text-sm text-[#bda782]">
            vs. {formatMoney(summary.originalRetailPrice, bom.currency)} retail
          </p>
        </div>
        <SavingsBadge
          savings={summary.totalSavings}
          savingsPercent={summary.savingsPercent}
          currency={bom.currency}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#d4af37]/20 pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-codex text-xs uppercase tracking-wider text-[#bda782]">
            Off-the-shelf parts
          </dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-[#f5ebd6]">
            {formatMoney(summary.purchasedPartsTotal, bom.currency)}
          </dd>
        </div>
        <div>
          <dt className="font-codex text-xs uppercase tracking-wider text-[#bda782]">
            Filament
          </dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-[#f3d478]">
            {formatMoney(summary.filamentCostTotal, bom.currency)}
          </dd>
        </div>
        <div>
          <dt className="font-codex text-xs uppercase tracking-wider text-[#bda782]">
            Items
          </dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-[#f5ebd6]">
            {bom.items.length}
          </dd>
        </div>
      </dl>
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
  if (!item) return null;
  return (
    <article
      id={`bom-item-${item.id}`}
      className="codex-folio rounded-2xl card-hover animate-slide-in p-4 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#d4af37] font-codex">
              {item.partNumber} · {item.category}
            </p>
            <h3 className="mt-0.5 truncate font-display text-lg font-bold text-[#f5ebd6]">
              {item.name}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[#e6d3b3]">
              {item.specification}
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block font-display text-lg font-bold text-[#f3d478] tabular-nums">
              {formatMoney(item.totalPrice, currency)}
            </span>
            <span className="text-xs text-[#bda782] tabular-nums">
              {item.qty} × {formatMoney(item.unitPrice, currency)} / {item.unit}
            </span>
          </p>
        </div>
        {item.notes ? <p className="mt-2 text-sm text-[#bda782]">{item.notes}</p> : null}
      </div>
      <div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#d4af37]/20 pt-3">
          <RetailerBadge retailer={item.primaryRetailer} />
          <a
            href={item.primaryUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#f3d478] hover:underline"
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
                className="text-sm text-[#bda782] hover:text-[#f5ebd6] hover:underline"
              >
                {l.retailer} ({formatMoney(l.estPrice, currency)})
              </a>
            ))}
        </div>
        {item.linkedPartIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-[#bda782]">
            <span>Linked 3D parts:</span>
            {item.linkedPartIds.map((pid) =>
              onSelectPartId ? (
                <button
                  key={pid}
                  type="button"
                  onClick={() => onSelectPartId(pid)}
                  className="rounded border border-[#d4af37]/35 bg-[#d4af37]/12 px-1.5 py-0.5 font-codex text-[11px] font-semibold text-[#f3d478] hover:bg-[#d4af37]/25"
                >
                  {pid}
                </button>
              ) : (
                <span
                  key={pid}
                  className="rounded bg-[#282016] border border-[#d4af37]/25 px-1.5 py-0.5 font-codex text-[11px] text-[#e6d3b3]"
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
  return (
    <div className="space-y-6" data-testid="bom-tab">
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
    </div>
  );
}

export default BomTab;
