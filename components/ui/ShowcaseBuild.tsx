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
        <h2 className="font-display text-2xl font-bold text-[#f5ebd6]">
          Showcase: a finished build
        </h2>
        <p className="text-xs text-[#bda782]">
          One complete reverse-engineering run, end to end — research, teardown, BOM, CAD, plates
          and assembly — ready to open, print and build.
        </p>
      </div>

      <Link
        href="/projects/plant-auto-waterer"
        className="group block rounded-2xl border border-[#d4af37]/35 bg-gradient-to-br from-[#d4af37]/15 via-[#14100b] to-[#1d1710] p-5 transition-all hover:border-[#f3d478]/70 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <span className="rounded-md bg-[#d4af37]/20 px-2.5 py-0.5 font-codex text-[11px] font-bold text-[#f3d478] border border-[#d4af37]/45">
              Save 83% · $124.15
            </span>
            <h3 className="font-display text-xl font-bold text-[#f5ebd6] group-hover:text-[#f3d478] transition-colors sm:text-2xl">
              HydroPulse Smart Plant Auto-Waterer — alt to a $149 smart auto-waterer
            </h3>
            <p className="max-w-2xl text-xs leading-relaxed text-[#e6d3b3]">
              Closed-loop capacitive soil-moisture irrigation with a 750mL reservoir,
              drip manifold &amp; root-zone emitter spikes — with exploded 3D view, print files and
              step-by-step assembly.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 font-codex text-xs font-bold text-[#e6d3b3] group-hover:text-[#f3d478]">
            Open build <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>

        <div className="mt-5 grid gap-3 border-t border-[#d4af37]/20 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-start gap-2.5">
              <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-[#f3d478]" />
              <div>
                <div className="font-display text-base font-bold text-[#f5ebd6]">
                  {s.value}
                </div>
                <div className="text-[11px] text-[#bda782]">
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
