import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Get Me An Alt — DIY 3D-Printed + Off-The-Shelf Gadget Builder',
  description:
    'Paste a product link, video, or photo of any pricey gadget. A team of 6 Gemini 4 Argon agents reverse-engineers it into 3D-printed parts + mainstream retail hardware.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#07090e] text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200 bg-grid-pattern">
        <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#07090e]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-teal-500 to-sky-500 text-slate-950 font-black text-lg shadow-lg shadow-emerald-500/20">
                A
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors">
                    Get Me An Alt
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    Gemini 4 Argon
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Reverse-engineer pricey gadgets into 3D prints + off-the-shelf BOM
                </p>
              </div>
            </Link>

            <nav className="flex items-center gap-3">
              <Link
                href="/projects/plant-auto-waterer"
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Instant Demo: Plant Auto-Waterer ($149 → $24.85)
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
