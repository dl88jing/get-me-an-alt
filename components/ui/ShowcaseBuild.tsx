import Link from 'next/link';
import { ArrowRight, Layers, Printer, ShoppingCart, Wrench } from 'lucide-react';

/**
 * ShowcaseBuild — featured completed-build card for the landing page.
 * Numbers match the project this card LINKS TO, /projects/plant-auto-waterer,
 * i.e. the in-app sample data in lib/sample-data.ts (SAMPLE_DESIGN /
 * SAMPLE_BOM / SAMPLE_PLATES / SAMPLE_INSTRUCTIONS), not marketing copy:
 * $149 retail -> $24.85 DIY (save $124.15, 83%), 11 parts (7 printed types
 * incl. the x2 emitter spike = 8 printed items, 4 purchased), 7 assembly
 * steps, 1 Bambu A1 plate, 3h 24m, 185g.
 * NOTE: data/demo/plant-waterer on disk is a DIFFERENT dataset ($129 ->
 * $33.40, 74%, 16 parts) and is NOT what this link opens — do not mix the
 * two sets of numbers on this card again.
 */
export function ShowcaseBuild() {
  const stats = [
    { icon: Layers, label: 'Parts', value: '11', sub: '7 printed · 4 purchased' },
    { icon: Printer, label: 'Print', value: '1 plate · 3h 24m', sub: '185g · Bambu A1' },
    { icon: Wrench, label: 'Assembly', value: '7 steps', sub: 'IKEA-style player' },
    { icon: ShoppingCart, label: 'DIY cost', value: '$24.85', sub: 'vs $149 retail' },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Showcase: a finished build</h2>
        <p className="text-xs text-slate-400">
          One complete reverse-engineering run, end to end — research, teardown, BOM, CAD, plates
          and assembly — ready to open, print and build.
        </p>
      </div>

      <Link
        href="/projects/plant-auto-waterer"
        className="group block rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-slate-900/60 p-5 transition-all hover:border-emerald-400/60 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
              Save 83% · $124.15
            </span>
            <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors sm:text-lg">
              HydroPulse Smart Plant Auto-Waterer — alt to a $149 smart auto-waterer
            </h3>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              Closed-loop capacitive soil-moisture irrigation with a 750mL reservoir,
              drip manifold &amp; root-zone emitter spikes — with exploded 3D view, print files and
              step-by-step assembly.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-300 group-hover:text-emerald-300">
            Open build <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>

        <div className="mt-5 grid gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-start gap-2.5">
              <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <div className="text-sm font-bold text-white">{s.value}</div>
                <div className="text-[11px] text-slate-500">
                  {s.label} · {s.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Link>
    </section>
  );
}
