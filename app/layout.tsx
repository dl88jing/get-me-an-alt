import type { Metadata } from 'next';
import Link from 'next/link';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import SmoothScrollProvider from '@/components/ui/SmoothScrollProvider';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Get Me An Alt — Don’t Buy It. Print & Build The Hardware Alt.',
  description:
    'Paste a product link, video, or photo of any pricey gadget. A swarm of managed Gemini 4 Argon agents reverse-engineers it into plate-packed 3D-printed STLs + off-the-shelf hardware.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="relative bg-[#050608] text-slate-100 antialiased selection:bg-[#00f5a0]/30 selection:text-[#00f5a0] bg-grid-pattern">
        {/* Tactile film grain & cursor-follow ambient spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 film-grain opacity-70"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-20 cursor-ambient-glow"
        />

        <SmoothScrollProvider>
          {/* Sticky Frosted Obsidian Glass Header */}
          <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#050608]/80 backdrop-blur-xl shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-center gap-3.5 group">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#00f5a0]/40 bg-gradient-to-br from-[#00f5a0] via-emerald-400 to-sky-400 text-[#050608] font-display font-bold text-lg shadow-[0_0_24px_-4px_rgba(0,245,160,0.45)] transition-transform duration-300 group-hover:scale-105">
                  A
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#050608] p-0.5">
                    <span className="block h-full w-full rounded-full bg-[#00f5a0]" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-display text-base font-bold tracking-tight text-white group-hover:text-[#00f5a0] transition-colors">
                      Get Me An Alt
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#00f5a0]/30 bg-[#00f5a0]/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-[#00f5a0]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#00f5a0] animate-pulse" />
                      Gemini 4 Argon
                    </span>
                  </div>
                  <p className="font-mono text-[11px] tracking-tight text-slate-400 hidden md:block">
                    REVERSE-ENGINEER BESPOKE HARDWARE → STL PLATES + RETAIL BOM
                  </p>
                </div>
              </Link>

              <nav className="flex items-center gap-2 sm:gap-3">
                <Link
                  href="/#pipeline-story"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                >
                  <span className="text-[#00f5a0]">01</span> Pipeline
                </Link>
                <Link
                  href="/#exploded-story"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                >
                  <span className="text-[#00f5a0]">02</span> 3D Explode
                </Link>
                <Link
                  href="/#showcase-gallery"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors"
                >
                  <span className="text-[#00f5a0]">03</span> Gallery
                </Link>

                <Link
                  href="/projects/plant-auto-waterer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#00f5a0]/40 bg-[#00f5a0]/10 px-3.5 py-1.5 text-xs font-semibold text-[#00f5a0] shadow-[0_0_24px_-6px_rgba(0,245,160,0.3)] hover:bg-[#00f5a0] hover:text-[#050608] transition-all duration-200"
                >
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                  <span>Instant Demo</span>
                  <span className="hidden sm:inline font-mono text-[11px] opacity-85">
                    ($149 → $24.85)
                  </span>
                </Link>
              </nav>
            </div>
          </header>

          <main className="relative z-20 mx-auto max-w-7xl px-4 py-6 sm:px-6">
            {children}
          </main>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
