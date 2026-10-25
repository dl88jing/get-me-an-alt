import Link from 'next/link';
import { ArrowRight, Layers, Printer, ShoppingCart, Wrench } from 'lucide-react';

/**
 * ShowcaseBuild — featured completed-build card for the landing page.
 * Numbers are the verified demo artifacts in data/demo/plant-waterer
 * (bom.json, design.json, plates.json, instructions.json), not marketing
 * copy: $129 retail -> $33.40 DIY (74% saved), 16 parts (9 printed +
 * 7 purchased), 10 assembly steps, 1 Bambu A1 plate, 6h 10m, 249g.
 * More showcase builds arrive with the data/samples lane; this card only
 * ever advertises builds that actually exist.
 */
export function ShowcaseBuild() {
  const stats = [
    { icon: Layers, label: 'Parts', value: '16', sub: '9 printed · 7 purchased' },
    { icon: Printer, label: 'Print', value: '1 plate · 6h 10m', sub: '249g · Bambu A1' },
    { icon: Wrench, label: 'Assembly', value: '10 steps', sub: 'IKEA-style player' },
    { icon: ShoppingCart, label: 'DIY cost', value: '$33.40', sub: 'vs $129 retail' },
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
              Save 74% · $95.60
            </span>
            <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors sm:text-lg">
              Self-watering plant system — alt to a $129 smart auto-waterer
            </h3>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
              Closed-loop capacitive soil-moisture irrigation with a 1.4L modular PETG reservoir,
              flow wheel &amp; root-zone emitter stakes — with exploded 3D view, print files and
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
