'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ShowcaseBuild } from '../components/ui/ShowcaseBuild';
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  CheckCircle2,
  Cpu,
  FileCode2,
  Layers,
  Link2,
  Printer,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react';

const ScrollExplodeScene = dynamic(
  () => import('@/components/ui/ScrollExplodeScene'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[460px] rounded-2xl border border-white/10 bg-[#070a0f] p-8 flex items-center justify-center font-mono text-xs text-slate-400 skeleton-shimmer">
        INITIALIZING WEBGL CAD VIEWPORT // 256×256×256MM...
      </div>
    ),
  }
);

const POPULAR_PRINTERS = [
  { id: 'bambu-a1', label: 'Bambu Lab A1 (256×256×256 mm) — Default' },
  { id: 'bambu-a1-mini', label: 'Bambu Lab A1 mini (180×180×180 mm)' },
  { id: 'bambu-p1s', label: 'Bambu Lab P1S (256×256×256 mm)' },
  { id: 'bambu-x1c', label: 'Bambu Lab X1 Carbon (256×256×256 mm)' },
  { id: 'bambu-h2d', label: 'Bambu Lab H2D (350×320×325 mm)' },
  { id: 'prusa-mk4s', label: 'Prusa MK4 / MK4S (250×210×220 mm)' },
  { id: 'prusa-core-one', label: 'Prusa Core One (250×220×270 mm)' },
  { id: 'prusa-mini-plus', label: 'Prusa MINI+ (180×180×180 mm)' },
  { id: 'creality-k1', label: 'Creality K1 / K1C (220×220×250 mm)' },
  { id: 'creality-k1-max', label: 'Creality K1 Max (300×300×300 mm)' },
  { id: 'creality-ender3-v3', label: 'Creality Ender-3 V3 (220×220×250 mm)' },
  { id: 'elegoo-neptune-4-pro', label: 'Elegoo Neptune 4 Pro (225×225×265 mm)' },
  { id: 'anycubic-kobra-3', label: 'Anycubic Kobra 3 (250×250×260 mm)' },
  { id: 'voron-24-350', label: 'Voron 2.4 350 (350×350×330 mm)' },
];

const PRESET_GADGETS = [
  {
    id: 'plant-auto-waterer',
    title: 'Smart Plant Auto-Waterer',
    category: 'HOME AUTOMATION // FLUIDICS',
    retail: '$149',
    diy: '$24.85',
    savings: 'Save $124',
    savingsPct: '83%',
    partsSpec: '5 Printed STLs · 6 BOM Parts · 1 Plate',
    desc: '750mL PETG reservoir + 5V brushless pump + capacitive probe + anti-siphon drip spikes',
    prompt: 'Smart Autonomous Plant Watering Station with 750mL reservoir and soil sensor',
    url: 'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
    isInstantDemo: true,
  },
  {
    id: 'art-easel',
    title: 'Articulated Tabletop Studio Art Easel',
    category: 'STUDIO HARDWARE // MECHANICS',
    retail: '$189',
    diy: '$27.40',
    savings: 'Save $161',
    savingsPct: '85%',
    partsSpec: '6 Printed STLs · 5 BOM Parts · 1 Plate',
    desc: 'Ratcheting tilt mast + canvas clamp jaws + 2020 aluminum extrusion spine + M5 knobs',
    prompt: 'Bespoke Articulated Tabletop Studio Painting Easel with adjustable tilt and canvas clamp',
    url: 'https://www.amazon.com/s?k=adjustable+tabletop+studio+art+easel',
    isInstantDemo: false,
  },
  {
    id: 'iphone-magnifier',
    title: 'iPhone Macro Microscope & Slide Adapter',
    category: 'OPTICS // PRECISION STAGE',
    retail: '$119',
    diy: '$16.20',
    savings: 'Save $102',
    savingsPct: '86%',
    partsSpec: '4 Printed STLs · 4 BOM Parts · 1 Plate',
    desc: 'Precision XYZ focus sled + clip-on 100x glass doublet mount + 5V LED ring diffuser',
    prompt: 'iPhone Smartphone Microscope Magnifier Adapter with LED illumination and focus stage',
    url: 'https://www.amazon.com/s?k=smartphone+microscope+adapter+stage',
    isInstantDemo: false,
  },
  {
    id: 'liquid-handler',
    title: 'Benchtop Lab Pipette Liquid Handler Stand',
    category: 'LAB AUTOMATION // GANTRY',
    retail: '$590',
    diy: '$68.50',
    savings: 'Save $521',
    savingsPct: '88%',
    partsSpec: '8 Printed STLs · 9 BOM Parts · 2 Plates',
    desc: '96-well plate indexer + linear rail carriage + compliant pipette plunger actuator',
    prompt: 'Desktop 96-well plate liquid handling robot / multi-channel pipette workstation',
    url: 'https://www.youtube.com/results?search_query=diy+liquid+handling+robot+3d+printed',
    isInstantDemo: false,
  },
];

const AGENT_STAGES = [
  {
    step: '01',
    name: 'Analyst',
    artifact: 'analysis.json',
    desc: 'Gemini 4 Argon multimodal deconstruction of URLs, videos & photos into dimensions and mechanisms.',
    icon: Cpu,
  },
  {
    step: '02',
    name: 'Researcher',
    artifact: 'sources.json',
    desc: 'Google Search grounding + video teardown frame extraction for schematics, Printables & open hardware.',
    icon: Search,
  },
  {
    step: '03',
    name: 'Designer',
    artifact: 'design.json',
    desc: 'Splits printed vs. purchased parts, parametric CSG shapes, and 3D explode vectors.',
    icon: Layers,
  },
  {
    step: '04',
    name: 'Critic',
    artifact: 'critique.json',
    desc: 'DFM printability verification checking overhangs, wall thickness, tolerances & bed fit in a feedback loop.',
    icon: ShieldCheck,
  },
  {
    step: '05',
    name: 'BOM Agent',
    artifact: 'bom.json',
    desc: 'Retailer sourcing links (Amazon, Home Depot, Walmart, McMaster, AliExpress) + total savings.',
    icon: ShoppingCart,
  },
  {
    step: '06',
    name: 'CAD & Packer',
    artifact: 'plates.json + *.3mf',
    desc: 'OpenSCAD-WASM parametric STL compilation + 2D bin-packing onto minimum plates for your printer.',
    icon: Box,
  },
  {
    step: '07',
    name: 'Instructions',
    artifact: 'instructions.json',
    desc: 'IKEA-style step-by-step animated assembly choreography with motion vectors & tool callouts.',
    icon: Wrench,
  },
];

const RETAILER_MARQUEE = [
  { name: 'AMAZON', tag: 'PRIME FASTENERS & PUMPS' },
  { name: 'McMASTER-CARR', tag: 'PRECISION METRIC HARDWARE' },
  { name: 'BAMBU LAB', tag: '256×256MM 3MF PLATES' },
  { name: 'HOME DEPOT', tag: 'EXTRUSIONS & TUBING' },
  { name: 'DIGIKEY', tag: 'SENSORS & CONTROLLERS' },
  { name: 'PRINTABLES', tag: 'OPEN CAD PRIORS' },
  { name: 'ALIEXPRESS', tag: 'DIRECT MOTION PARTS' },
  { name: 'WALMART', tag: 'LOCAL COMMODITY SUPPLY' },
  { name: 'PRUSA RESEARCH', tag: 'MK4S / CORE ONE PROFILES' },
  { name: 'CRAFTCLOUD', tag: 'ON-DEMAND PRINT BUREAU' },
  { name: 'JLC3DP', tag: 'FACTORY SLA / MJF / FDM' },
  { name: 'VORON DESIGN', tag: '350MM GANTRY SUPPORT' },
];

export default function LandingPage() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState('');
  const [printerId, setPrinterId] = useState('bambu-a1');
  const [imageFile, setImageFile] = useState<{
    name: string;
    mimeType: string;
    base64Data: string;
    previewUrl: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgentPulse, setActiveAgentPulse] = useState(0);
  const [knownSampleIds, setKnownSampleIds] = useState<Set<string>>(
    new Set(['plant-auto-waterer'])
  );

  // Scroll-driven explode progress
  const explodeSectionRef = useRef<HTMLElement | null>(null);
  const [scrollExplodeFactor, setScrollExplodeFactor] = useState(0.35);

  // Savings count-up animation
  const savingsSectionRef = useRef<HTMLElement | null>(null);
  const [savingsCount, setSavingsCount] = useState(83);
  const [diyCostCount, setDiyCostCount] = useState(24.85);
  const [dollarSavedCount, setDollarSavedCount] = useState(124);

  // Cycle active agent node highlight on landing strip
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveAgentPulse((prev) => (prev + 1) % AGENT_STAGES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, []);

  // Discover pre-generated samples from /api/objects if available
  useEffect(() => {
    fetch('/api/objects')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.projects)) {
          const ids = new Set<string>(['plant-auto-waterer']);
          for (const p of data.projects) {
            if (p?.id) ids.add(String(p.id));
            if (p?.slug) ids.add(String(p.slug));
          }
          setKnownSampleIds(ids);
        }
      })
      .catch(() => {});
  }, []);

  // Scroll listener for 3D explode section
  useEffect(() => {
    const handleScroll = () => {
      if (!explodeSectionRef.current) return;
      const rect = explodeSectionRef.current.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const raw = (vh * 0.72 - rect.top) / (rect.height * 0.78);
      const clamped = Math.max(0.08, Math.min(1, raw));
      setScrollExplodeFactor(clamped);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Savings count-up on intersection
  useEffect(() => {
    const el = savingsSectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let animated = false;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !animated) {
          animated = true;
          const duration = 1100;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setSavingsCount(Math.round(eased * 83));
            setDiyCostCount(Number((eased * 24.85).toFixed(2)));
            setDollarSavedCount(Math.round(eased * 124));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleImageFile = (file: File | undefined | null) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64Data = dataUrl.includes(',')
        ? dataUrl.split(',')[1]
        : dataUrl;
      setImageFile({
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        base64Data,
        previewUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleImageFile(e.target.files?.[0]);
  };

  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  const handlePhotoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhoto(false);
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    } else if (file) {
      setError('Please drop an image file (PNG, JPG, WebP, etc.).');
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
      return;
    } else if (file) {
      setError('Please drop an image file (PNG, JPG, WebP, etc.).');
      return;
    }
    const droppedText = e.dataTransfer.getData('text/plain');
    if (droppedText) {
      setInputValue(droppedText.trim());
    }
  };

  const handleStartPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() && !imageFile) {
      setError('Paste a product link, video link, description, or upload an image first.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const isUrl = /^https?:\/\//i.test(inputValue.trim());

    try {
      const res = await fetch('/api/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: isUrl ? undefined : inputValue.trim(),
          url: isUrl ? inputValue.trim() : undefined,
          imageName: imageFile?.name,
          inlineImage: imageFile
            ? {
                mimeType: imageFile.mimeType,
                base64Data: imageFile.base64Data,
              }
            : undefined,
          printerId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Failed to launch pipeline');
      }

      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const launchPreset = async (preset: (typeof PRESET_GADGETS)[number]) => {
    if (preset.isInstantDemo || knownSampleIds.has(preset.id)) {
      router.push(`/projects/${preset.id}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: preset.prompt,
          url: preset.url,
          printerId,
        }),
      });
      const data = await res.json();
      if (data.id) {
        router.push(`/projects/${data.id}`);
      }
    } catch {
      setSubmitting(false);
    }
  };

  const handleCardSpotlight = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {/* =====================================================================
          ACT I — FULL-BLEED VIDEO HERO + GLASS COMMAND BAR
      ===================================================================== */}
      <section
        id="hero-command"
        className="relative overflow-hidden rounded-[28px] border border-white/[0.12] bg-[#050608] p-6 sm:p-12 lg:p-16 shadow-glass"
      >
        {/* Atmospheric Hardware Video Background */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/hero-poster.jpg"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
        >
          <source src="/media/hero.mp4" type="video/mp4" />
        </video>

        {/* Multi-Stop Obsidian Vignette & Radial Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#050608]/55 via-[#050608]/80 to-[#050608]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,245,160,0.16),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 film-grain opacity-80"
        />

        {/* Corner CAD Registration Telemetry */}
        <div className="pointer-events-none hidden sm:flex items-center justify-between font-mono text-[11px] text-slate-400/90 mb-6 relative z-10">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#00f5a0] animate-pulse" />
            SYS_TELEMETRY // GEMINI_4_ARGON_SWARM [ONLINE]
          </span>
          <span>BED_TARGET: 256×256×256MM · TOLERANCE: ±0.15MM</span>
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00f5a0]/35 bg-[#00f5a0]/10 px-4 py-1.5 font-mono text-xs font-medium text-[#00f5a0] shadow-[0_0_24px_-4px_rgba(0,245,160,0.35)]">
            <Sparkles className="h-3.5 w-3.5 text-[#00f5a0]" />
            Powered by Managed Gemini 4 Argon Agents (Antigravity CLI + Grounded REST)
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.04em] text-white leading-[0.96]">
            Don&apos;t buy it.{' '}
            <span className="bg-gradient-to-r from-[#00f5a0] via-emerald-300 to-sky-400 bg-clip-text text-transparent">
              Get an alt.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Paste any pricey gadget link, YouTube video, or photo. Our autonomous hardware swarm reverse-engineers it into{' '}
            <strong className="text-white">plate-packed 3D-printable STLs &amp; 3MFs</strong>, a{' '}
            <strong className="text-white">sourced retail BOM</strong>,{' '}
            <strong className="text-white">IKEA-style animated 3D instructions</strong>, and an{' '}
            <strong className="text-white">interactive exploded view</strong>.
          </p>

          {/* Glassy Command Bar Input (Paste Link or Drag-and-Drop Image) */}
          <form
            onSubmit={handleStartPipeline}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-8 space-y-4 rounded-2xl p-4 sm:p-5 text-left transition-all glass-command-bar ${
              isDragging ? 'ring-2 ring-[#00f5a0] border-[#00f5a0]' : ''
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[#00f5a0]" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Paste product link (Amazon, Kickstarter, YouTube) or describe a gadget (e.g., 'Articulated studio art easel')..."
                  className="w-full rounded-xl border border-white/15 bg-[#050608]/90 pl-12 pr-4 py-3.5 text-sm text-white placeholder-slate-400 focus:border-[#00f5a0] focus:outline-none focus:ring-2 focus:ring-[#00f5a0]/25"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00f5a0] via-emerald-400 to-sky-400 px-7 py-3.5 font-display text-sm font-bold text-[#050608] shadow-electric hover:brightness-110 disabled:opacity-50 transition-all shrink-0"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#050608] border-t-transparent" />
                    Spawning Agents...
                  </>
                ) : (
                  <>
                    Build My DIY Alt
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs text-slate-300">
              {/* Drag-drop or click image upload */}
              <div className="flex flex-wrap items-center gap-3">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPhoto(true);
                  }}
                  onDragLeave={() => setIsDraggingPhoto(false)}
                  onDrop={handlePhotoDrop}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                    isDraggingPhoto
                      ? 'border-[#00f5a0] bg-[#00f5a0]/20 text-emerald-200'
                      : 'border-white/15 bg-white/[0.04] text-slate-200 hover:border-[#00f5a0]/60 hover:text-[#00f5a0]'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 text-[#00f5a0]" />
                  {isDraggingPhoto
                    ? 'Drop photo to upload'
                    : imageFile
                      ? `Photo: ${imageFile.name}`
                      : 'Upload or drop a gadget photo'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {imageFile && (
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    className="font-mono text-xs text-rose-400 hover:underline"
                  >
                    Remove photo
                  </button>
                )}
                <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                  Accepts URLs, YouTube teardowns, or JPEG/PNG/WebP
                </span>
              </div>

              {/* Target Printer Selector */}
              <div className="flex items-center gap-2">
                <Printer className="h-3.5 w-3.5 text-sky-400" />
                <span className="font-mono text-[11px] text-slate-400">
                  Target Printer:
                </span>
                <select
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#050608] px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-[#00f5a0] focus:outline-none"
                >
                  {POPULAR_PRINTERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="font-mono text-xs font-medium text-rose-400">
                {error}
              </p>
            )}
          </form>

          {/* Instant Demo CTA */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex items-center gap-2 rounded-xl border border-[#00f5a0]/50 bg-[#00f5a0]/15 px-5 py-2.5 text-xs font-semibold text-[#00f5a0] hover:bg-[#00f5a0]/25 transition-all shadow-[0_0_30px_-8px_rgba(0,245,160,0.4)]"
            >
              <Zap className="h-4 w-4 text-[#00f5a0]" />
              Instant Demo Mode: Smart Plant Auto-Waterer ($149 Commercial → $24.85 DIY)
            </Link>
          </div>
        </div>
      </section>

      {/* =====================================================================
          RETAILER & FABRICATION ECOSYSTEM MARQUEE
      ===================================================================== */}
      <section
        aria-label="Supported Retailers and Printers"
        className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0d12]/80 py-3.5"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#050608] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#050608] to-transparent" />

        <div className="flex w-max animate-marquee items-center gap-8 px-4">
          {[...RETAILER_MARQUEE, ...RETAILER_MARQUEE].map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="flex items-center gap-3 font-mono text-xs whitespace-nowrap"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#00f5a0]" />
              <span className="font-bold tracking-wider text-white">
                {item.name}
              </span>
              <span className="rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400">
                {item.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          ACT II — ANIMATED MANAGED AGENT NODE STRIP
      ===================================================================== */}
      <section
        id="pipeline-story"
        className="rounded-3xl border border-white/[0.09] bg-[#0a0d12]/85 p-6 sm:p-8 space-y-6 shadow-glass"
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/[0.07] pb-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[#00f5a0]">
              <FileCode2 className="h-4 w-4" />
              01 // AUTONOMOUS MULTI-AGENT HARDWARE PIPELINE
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
              7 Managed Gemini 4 Argon Agents. Zero Manual CAD.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Every stage runs an isolated Gemini 4 Argon agent that writes structured artifacts into{' '}
              <code className="font-mono text-[#00f5a0]">
                data/objects/&lt;slug&gt;-&lt;id&gt;/
              </code>{' '}
              and streams live thoughts, tokens, and STL geometry over Server-Sent Events.
            </p>
          </div>

          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#050608] px-3.5 py-2 font-mono text-[11px] text-slate-300 self-start lg:self-auto">
            <span className="h-2 w-2 rounded-full bg-[#00f5a0] animate-ping" />
            agy -p &quot;...&quot; --model gemini-4-argon --output-format json
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {AGENT_STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isPulsing = idx === activeAgentPulse;
            return (
              <div
                key={stage.step}
                onMouseEnter={() => setActiveAgentPulse(idx)}
                onMouseMove={handleCardSpotlight}
                className={`spotlight-card relative flex flex-col justify-between rounded-2xl border p-4 transition-all duration-300 ${
                  isPulsing
                    ? 'border-[#00f5a0]/70 bg-[#00f5a0]/[0.08] shadow-[0_0_32px_-8px_rgba(0,245,160,0.35)] -translate-y-0.5'
                    : 'border-white/[0.08] bg-[#050608]/80 hover:border-white/20'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-[#00f5a0]">
                      STAGE {stage.step}
                    </span>
                    <Icon
                      className={`h-4 w-4 transition-colors ${
                        isPulsing ? 'text-[#00f5a0]' : 'text-slate-400'
                      }`}
                    />
                  </div>
                  <div className="font-display text-sm font-bold text-white">
                    {stage.name}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {stage.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-white/[0.06] flex items-center justify-between font-mono text-[10px]">
                  <span className="text-slate-400 truncate">{stage.artifact}</span>
                  <CheckCircle2
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isPulsing ? 'text-[#00f5a0]' : 'text-slate-600'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          ACT III — SCROLL-DRIVEN 3D EXPLODED ASSEMBLY STORY
      ===================================================================== */}
      <section
        id="exploded-story"
        ref={explodeSectionRef}
        className="rounded-3xl border border-white/[0.09] bg-gradient-to-b from-[#0a0d12] to-[#050608] p-6 sm:p-8 space-y-6 shadow-glass"
      >
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[#00f5a0]">
              <Layers className="h-4 w-4" />
              02 // SCROLL-CHOREOGRAPHED HARDWARE DECONSTRUCTION
            </div>
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Watch Custom Printed STLs Separate From Off-The-Shelf Hardware.
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Scroll to scrub the 3D explosion vector or drag the axis slider below. Click any sub-assembly to inspect its filament weight, tolerances, and retail BOM source.
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#00f5a0]/30 bg-[#00f5a0]/10 px-3 py-1.5 text-[#00f5a0]">
              <span className="h-2 w-2 rounded-full bg-[#00f5a0]" />
              Printed PETG/PLA
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-sky-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Purchased BOM
            </span>
          </div>
        </div>

        <ScrollExplodeScene scrollFactor={scrollExplodeFactor} />
      </section>

      {/* =====================================================================
          ACT IV — MONUMENTAL SAVINGS COUNTER & ECONOMICS BREAKDOWN
      ===================================================================== */}
      <section
        id="savings-story"
        ref={savingsSectionRef}
        className="rounded-3xl border border-white/[0.09] bg-[#0a0d12]/90 p-6 sm:p-10 shadow-glass"
      >
        <div className="grid gap-8 lg:grid-cols-12 items-center">
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[#00f5a0]">
              <TrendingDown className="h-4 w-4" />
              03 // HARDWARE MARKUP ARBITRAGE
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Stop Paying 6× For Injection-Molded Plastic.
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Most bespoke consumer hardware is 80% structural plastic housing around $18 of standard pumps, sensors, and metric fasteners. Our BOM + Price Hunter agents source the exact industrial components while your 3D printer fabricates the chassis overnight.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/projects/plant-auto-waterer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#00f5a0] px-5 py-2.5 font-display text-xs font-bold text-[#050608] hover:brightness-110 transition-all"
              >
                Inspect Full BOM &amp; STLs <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#00f5a0]/40 bg-[#00f5a0]/[0.07] p-5 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#00f5a0]">
                AVG COST REDUCTION
              </div>
              <div className="font-display text-5xl sm:text-6xl font-bold text-[#00f5a0] tabular-nums tracking-tight">
                {savingsCount}%
              </div>
              <p className="font-mono text-xs text-slate-300">
                Save ${dollarSavedCount} on the flagship Plant Auto-Waterer
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#050608] p-5 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                TOTAL DIY ALT BUILD
              </div>
              <div className="font-display text-4xl sm:text-5xl font-bold text-white tabular-nums tracking-tight">
                ${diyCostCount.toFixed(2)}
              </div>
              <p className="font-mono text-xs text-slate-400">
                vs. <span className="line-through text-rose-400">$149.00</span> commercial MSRP
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#050608] p-5 space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-sky-400">
                SINGLE-PLATE PACKING
              </div>
              <div className="font-display text-4xl sm:text-5xl font-bold text-sky-400 tabular-nums tracking-tight">
                1 Plate
              </div>
              <p className="font-mono text-xs text-slate-400">
                185g PETG · $4.25 filament + $20.60 hardware
              </p>
            </div>

            {/* Visual Cost Comparison Bar */}
            <div className="sm:col-span-3 rounded-2xl border border-white/[0.08] bg-[#050608] p-4 space-y-3">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-slate-400">
                  COST BREAKDOWN // SMART PLANT AUTO-WATERER
                </span>
                <span className="text-[#00f5a0] font-bold">
                  YOU KEEP $124.15 (83.3%)
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-900 overflow-hidden flex">
                <div
                  style={{ width: '4%' }}
                  className="bg-[#00f5a0] h-full"
                  title="3D Filament ($4.25)"
                />
                <div
                  style={{ width: '13%' }}
                  className="bg-sky-400 h-full"
                  title="Off-The-Shelf BOM ($20.60)"
                />
                <div
                  style={{ width: '83%' }}
                  className="bg-rose-500/25 h-full"
                  title="Brand Markup Saved ($124.15)"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#00f5a0]" />
                  $4.25 Printed Filament (3%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  $20.60 Sourced Hardware (14%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400/60" />
                  $124.15 Retail Markup Eliminated (83%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          ACT V — SHOWCASE GALLERY (PRE-BUILT DEMO + FEATURED RUNS)
      ===================================================================== */}
      <section id="showcase-gallery" className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#00f5a0]">
              04 // SHOWCASE HARDWARE GALLERY
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Try a Featured Gadget Reverse-Engineering Run
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Click any build card to inspect the pre-generated sample or launch a live Gemini 4 Argon reverse-engineering run.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRESET_GADGETS.map((item) => {
            const isReadySample =
              item.isInstantDemo || knownSampleIds.has(item.id);
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => launchPreset(item)}
                onMouseMove={handleCardSpotlight}
                className="spotlight-card group flex flex-col justify-between rounded-2xl border border-white/[0.09] bg-[#0a0d12]/85 p-5 text-left hover:border-[#00f5a0]/60 hover:-translate-y-1 transition-all duration-300 shadow-glass"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-[#00f5a0]/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#00f5a0] border border-[#00f5a0]/30">
                      {item.savings} ({item.savingsPct})
                    </span>
                    {isReadySample && (
                      <span className="rounded-md bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-sky-300 border border-sky-500/30">
                        Instant Demo
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-[10px] tracking-wider text-slate-500">
                    {item.category}
                  </div>

                  <h3 className="font-display text-base font-bold text-white group-hover:text-[#00f5a0] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-5 space-y-3 border-t border-white/[0.07] pt-3">
                  <div className="font-mono text-[10px] text-slate-400">
                    {item.partsSpec}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-mono tabular-nums">
                      <span className="text-slate-500 line-through mr-1.5">
                        {item.retail}
                      </span>
                      <span className="font-bold text-[#00f5a0]">
                        {item.diy} DIY
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-display font-semibold text-slate-200 group-hover:text-[#00f5a0]">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Showcase: finished build */}
      <ShowcaseBuild />

      {/* =====================================================================
          ACT VI — FOOTER CTA
      ===================================================================== */}
      <footer className="relative overflow-hidden rounded-3xl border border-[#00f5a0]/30 bg-gradient-to-r from-[#0a0d12] via-[#071512] to-[#0a0d12] p-8 sm:p-10 shadow-glass">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#00f5a0]">
              READY TO FABRICATE // GEMINI 4 ARGON
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
              Got an overpriced gadget in your cart right now?
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">
              Paste the URL above or explore our complete Smart Plant Auto-Waterer engineering package with OpenSCAD STLs, Bambu 3MF plates, and IKEA-style 3D assembly instructions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#hero-command"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 font-display text-xs font-bold text-white hover:border-[#00f5a0] transition-colors"
            >
              Paste a Product Link
            </a>
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#00f5a0] px-6 py-3 font-display text-xs font-bold text-[#050608] shadow-electric hover:brightness-110 transition-all"
            >
              Open Instant Demo Project <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
