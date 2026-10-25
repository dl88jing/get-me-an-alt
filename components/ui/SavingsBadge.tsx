export function SavingsBadge({
  savings,
  savingsPercent,
  currency = 'USD',
}: {
  savings: number;
  savingsPercent: number;
  currency?: string;
}) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(savings);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/45 px-3 py-1 font-codex text-xs font-bold text-[#f3d478]"
      style={{ background: 'var(--accent-soft)' }}
      title={`You save ${formatted} (${savingsPercent.toFixed(1)}%) vs. the original`}
    >
      <span aria-hidden="true">↓</span> Save {formatted} · {savingsPercent.toFixed(0)}%
    </span>
  );
}

export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}
