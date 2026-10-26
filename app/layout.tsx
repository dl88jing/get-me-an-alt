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
      <body className="relative bg-[#0c0a08] text-[#faf4e8] antialiased selection:bg-[#e5bd47]/30 selection:text-[#faf4e8] bg-grid-pattern">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-30 film-grain opacity-50"
        />

        <SmoothScrollProvider>
          {/* Sticky Top Bar (height 64px) */}
          <header className="sticky top-0 z-50 h-16 border-b border-[#dfd3be]/20 bg-[#0c0a08]/95 backdrop-blur-md">
            <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
              <Link
                href="/"
                className="flex items-center gap-3 group shrink-0 rounded-lg py-1"
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5bd47]/70 bg-gradient-to-br from-[#f3d478] via-[#d4af37] to-[#9c721c] text-[#140e07] font-codex font-bold shadow-sm transition-transform duration-200 group-hover:scale-105">
                  <svg
                    viewBox="0 0 36 36"
                    className="h-5 w-5 text-[#140e07]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="18" cy="18" r="13" />
                    <rect x="7.5" y="7.5" width="21" height="21" />
                    <circle cx="18" cy="18" r="3" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-display text-xl font-bold tracking-tight text-[#faf4e8] group-hover:text-[#f3d478] transition-colors">
                    Get Me An Alt
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#dfd3be]/25 bg-[#17130e] px-2.5 py-0.5 font-sans text-xs font-medium text-[#dfd3be]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#e5bd47]" />
                    Gemini 4 Argon
                  </span>
                </div>
              </Link>

              <nav
                aria-label="Primary Navigation"
                className="flex items-center gap-2 shrink-0"
              >
                <Link
                  href="/#showcase-gallery"
                  className="hidden md:inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-2 text-sm font-medium text-[#dfd3be] hover:bg-[#17130e] hover:text-[#faf4e8] transition-colors"
                >
                  Instant Demos
                </Link>
                <Link
                  href="/#how-it-works"
                  className="hidden sm:inline-flex min-h-[40px] items-center rounded-lg px-3.5 py-2 text-sm font-medium text-[#dfd3be] hover:bg-[#17130e] hover:text-[#faf4e8] transition-colors"
                >
                  How It Works
                </Link>
                <Link
                  href="/projects/desktop-robot-arm"
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#e5bd47]/60 bg-[#231d15] px-3.5 py-2 text-sm font-semibold text-[#f3d478] hover:bg-[#e5bd47] hover:text-[#140e07] transition-colors"
                >
                  <span>Featured Build</span>
                  <span className="hidden sm:inline font-mono text-xs opacity-90">
                    $899 → $74.50
                  </span>
                </Link>
              </nav>
            </div>
          </header>

          <main className="relative z-20 mx-auto max-w-7xl px-3.5 py-3 sm:px-6 sm:py-6">
            {children}
          </main>
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
