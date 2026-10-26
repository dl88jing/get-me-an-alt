import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Cormorant_Garamond,
  Cinzel,
  Inter,
  JetBrains_Mono,
} from 'next/font/google';
import SmoothScrollProvider from '@/components/ui/SmoothScrollProvider';
import './globals.css';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-codex',
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
  title:
    'Get Me An Alt — DIY 3D-Printable Alternatives to Expensive Gadgets',
  description:
    'Paste any gadget link, video, or photo and get a DIY alternative with 3D-printable STLs, a sourced retail BOM, and animated assembly instructions powered by Managed Gemini 4 Argon Agents.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${cormorantGaramond.variable} ${cinzel.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="relative bg-[#0c0906] text-[#f5ebd6] antialiased selection:bg-[#d4af37]/30 selection:text-[#f3d478] bg-grid-pattern">
        {/* Tactile vellum/canvas grain & candlelit ambient spotlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 film-grain opacity-75"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-20 cursor-ambient-glow"
        />

        <SmoothScrollProvider>
          {/* Sticky Florentine Codex Header */}
          <header className="sticky top-0 z-50 border-b border-[#d4af37]/25 bg-[#0c0906]/85 backdrop-blur-xl shadow-[inset_0_-1px_0_0_rgba(243,212,120,0.08)]">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-center gap-3.5 group shrink-0">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/60 bg-gradient-to-br from-[#f3d478] via-[#d4af37] to-[#8c6218] text-[#140e07] font-codex font-bold text-lg shadow-[0_0_26px_-4px_rgba(212,175,55,0.55)] transition-transform duration-300 group-hover:scale-105">
                  {/* Vitruvian Circle + Square Emblem */}
                  <svg
                    viewBox="0 0 36 36"
                    className="h-6 w-6 text-[#140e07]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="18" cy="18" r="13" />
                    <rect x="7.5" y="7.5" width="21" height="21" />
                    <path d="M18 6v24M6 18h24" strokeOpacity="0.45" />
                    <circle cx="18" cy="18" r="3" fill="currentColor" />
                  </svg>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#0c0906] p-0.5">
                    <span className="block h-full w-full rounded-full bg-[#d4af37]" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <span className="font-codex text-base sm:text-lg font-bold tracking-wider text-[#f5ebd6] group-hover:text-[#f3d478] transition-colors">
                      Get Me An Alt
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-2.5 py-0.5 font-codex text-[10px] font-bold uppercase tracking-widest text-[#f3d478]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#d4af37] animate-pulse" />
                      Gemini 4 Argon
                    </span>
                  </div>
                  <p className="font-codex text-[10px] tracking-[0.12em] text-[#bda782] hidden xl:block whitespace-nowrap">
                    DIY 3D-PRINTED PARTS + OFF-THE-SHELF RETAIL BOM
                  </p>
                </div>
              </Link>

              <nav className="flex items-center gap-1 sm:gap-2 whitespace-nowrap shrink-0">
                <Link
                  href="/#pipeline-story"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-codex text-xs font-semibold tracking-wide text-[#e6d3b3] hover:bg-[#d4af37]/10 hover:text-[#f3d478] transition-colors whitespace-nowrap"
                >
                  <span className="font-codex text-[#d4af37]">2.</span> Agent Pipeline
                </Link>
                <Link
                  href="/#savings-story"
                  className="hidden xl:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-codex text-xs font-semibold tracking-wide text-[#e6d3b3] hover:bg-[#d4af37]/10 hover:text-[#f3d478] transition-colors whitespace-nowrap"
                >
                  <span className="font-codex text-[#d4af37]">3.</span> BOM &amp; Savings
                </Link>
                <Link
                  href="/#exploded-story"
                  className="hidden lg:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-codex text-xs font-semibold tracking-wide text-[#e6d3b3] hover:bg-[#d4af37]/10 hover:text-[#f3d478] transition-colors whitespace-nowrap"
                >
                  <span className="font-codex text-[#d4af37]">4.</span> Exploded 3D View
                </Link>
                <Link
                  href="/#showcase-gallery"
                  className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-codex text-xs font-semibold tracking-wide text-[#e6d3b3] hover:bg-[#d4af37]/10 hover:text-[#f3d478] transition-colors whitespace-nowrap"
                >
                  <span className="font-codex text-[#d4af37]">5.</span> Sample Builds
                </Link>

                <Link
                  href="/projects/plant-auto-waterer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#d4af37]/55 bg-gradient-to-r from-[#d4af37]/20 via-[#d4af37]/15 to-[#b87333]/20 px-3.5 py-1.5 text-xs font-semibold text-[#f3d478] shadow-[0_0_24px_-6px_rgba(212,175,55,0.4)] hover:bg-[#d4af37] hover:text-[#140e07] transition-all duration-200 whitespace-nowrap"
                >
                  <span className="h-2 w-2 rounded-full bg-current animate-pulse shrink-0" />
                  <span className="font-codex tracking-wide">Live Demo</span>
                  <span className="hidden sm:inline font-mono text-[11px] opacity-90">
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
