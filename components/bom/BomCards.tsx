import type { BomData, BomItem } from '../../lib/types';
import { formatMoney, SavingsBadge } from '../ui/SavingsBadge';

const RETAILER_BADGE: Record<string, string> = {
  Amazon: 'bg-[#ff9900]/15 text-[#ff9900]',
  'Home Depot': 'bg-[#f96302]/15 text-[#f96302]',
  Walmart: 'bg-[#0071dc]/15 text-[#0071dc]',
  'McMaster-Carr': 'bg-[#e6edf3]/10 text-[#e6edf3]',
  AliExpress: 'bg-[#e62e04]/15 text-[#e62e04]',
  Adafruit: 'bg-[#000000]/20 text-[#e6edf3] border border-[#232c38]',
};

function RetailerBadge({ retailer }: { retailer: string }) {
  const cls = RETAILER_BADGE[retailer] ?? 'bg-[#e6edf3]/10 text-[#e6edf3]';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {retailer}
    </span>
  );
}

export function BomSummary({ bom }: { bom: BomData }) {
  const { summary } = bom;
  return (
    <div className="card animate-slide-in p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">DIY alternative</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">
            {formatMoney(summary.totalDiyCost, bom.currency)}
          </p>
          <p className="mt-1 text-sm text-[#8b98a9]">
            vs. {formatMoney(summary.originalRetailPrice, bom.currency)} retail
          </p>
        </div>
        <SavingsBadge
          savings={summary.totalSavings}
          savingsPercent={summary.savingsPercent}
          currency={bom.currency}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#232c38] pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[#8b98a9]">Off-the-shelf parts</dt>
          <dd className="mt-0.5 font-medium">
            {formatMoney(summary.purchasedPartsTotal, bom.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[#8b98a9]">Filament</dt>
          <dd className="mt-0.5 font-medium">
            {formatMoney(summary.filamentCostTotal, bom.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[#8b98a9]">Items</dt>
          <dd className="mt-0.5 font-medium">{bom.items.length}</dd>
        </div>
      </dl>
    </div>
  );
}

export function BomItemCard({ item, currency = 'USD' }: { item: BomItem; currency?: string }) {
  return (
    <article className="card card-hover animate-slide-in p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#8b98a9]">
            {item.partNumber} · {item.category}
          </p>
          <h3 className="mt-0.5 truncate font-medium">{item.name}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#8b98a9]">
            {item.specification}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block font-semibold">{formatMoney(item.totalPrice, currency)}</span>
          <span className="text-xs text-[#8b98a9]">
            {item.qty} × {formatMoney(item.unitPrice, currency)} / {item.unit}
          </span>
        </p>
      </div>
      {item.notes ? <p className="mt-2 text-sm text-[#8b98a9]">{item.notes}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RetailerBadge retailer={item.primaryRetailer} />
        <a
          href={item.primaryUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-[#3fb950] hover:underline"
        >
          Buy at {item.primaryRetailer} →
        </a>
        {item.retailerLinks
          .filter((l) => l.retailer !== item.primaryRetailer)
          .map((l) => (
            <a
              key={l.retailer}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[#8b98a9] hover:text-[#e6edf3] hover:underline"
            >
              {l.retailer} ({formatMoney(l.estPrice, currency)})
            </a>
          ))}
      </div>
      {item.linkedPartIds.length > 0 ? (
        <p className="mt-2 text-xs text-[#8b98a9]">
          Printed parts: {item.linkedPartIds.join(', ')}
        </p>
      ) : null}
    </article>
  );
}
