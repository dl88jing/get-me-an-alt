'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { RecentBuildsShelf } from '../components/ui/RecentBuildsShelf';
import { saveLocalCachedManifest } from '@/lib/recent-builds';
import {
  ArrowRight,
  Box,
  ChevronDown,
  Cpu,
  Layers,
  Link2,
  Printer,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Upload,
  Wrench,
} from 'lucide-react';

const ScrollExplodeScene = dynamic(
  () => import('@/components/ui/ScrollExplodeScene'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[420px] rounded-2xl border border-[#dfd3be]/20 bg-[#17130e] p-8 flex items-center justify-center font-mono text-sm text-[#dfd3be] skeleton-shimmer">
        Loading interactive 3D exploded preview...
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
    id: 'desktop-robot-arm',
    title: '6-Axis Desktop Robot Arm',
    category: 'Robotics',
    retail: '$899',
    diy: '$74.50',
    savings: 'Save $824',
    savingsPct: '92%',
    partsSpec: '9 STLs · 7 BOM parts · 2 plates',
    desc: '6808 slew-bearing turntable, MG996R/MG90S servos & parallel gripper.',
    prompt:
      '6-Axis Programmable Desktop Robot Arm with parallel servo gripper and slew bearing waist',
    url: 'https://www.amazon.com/s?k=6+axis+desktop+robot+arm+programmable+servo+kit',
    isInstantDemo: true,
  },
  {
    id: 'plant-auto-waterer',
    title: 'Smart Plant Auto-Waterer',
    category: 'Home & Garden',
    retail: '$149',
    diy: '$24.85',
    savings: 'Save $124',
    savingsPct: '83%',
    partsSpec: '7 STLs · 4 BOM parts · 1 plate',
    desc: '750mL PETG reservoir, 5V pump, capacitive soil sensor & drip manifold.',
    prompt:
      'Smart Autonomous Plant Watering Station with 750mL reservoir and soil sensor',
    url: 'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
    isInstantDemo: true,
  },
  {
    id: 'camera-slider-3axis',
    title: '3-Axis Motorized Camera Slider',
    category: 'Cinematography',
    retail: '$899',
    diy: '$84.90',
    savings: 'Save $814',
    savingsPct: '91%',
    partsSpec: '9 STLs · 8 BOM parts · 2 plates',
    desc: '800mm 2040 V-slot rail, 3× NEMA 17 steppers & silent pan/tilt gimbal.',
    prompt:
      '3-Axis Motorized Camera Slider with pan-tilt head and silent stepper motion control',
    url: 'https://www.amazon.com/s?k=motorized+3+axis+camera+slider+pan+tilt',
    isInstantDemo: true,
  },
  {
    id: 'bladeless-air-purifier',
    title: 'Bladeless HEPA Air Purifier',
    category: 'Aerodynamics',
    retail: '$549',
    diy: '$58.40',
    savings: 'Save $490',
    savingsPct: '89%',
    partsSpec: '9 STLs · 6 BOM parts · 7 plates',
    desc: '360° HEPA H13 drum, 24V brushless impeller & Coanda airfoil loop.',
    prompt:
      'Bladeless Tower Fan and HEPA H13 Air Purifier with Coanda airfoil loop',
    url: 'https://www.amazon.com/s?k=bladeless+tower+fan+hepa+air+purifier',
    isInstantDemo: true,
  },
  {
    id: 'liquid-handler',
    title: 'Benchtop Lab Pipette Robot',
    category: 'Lab Automation',
    retail: '$590',
    diy: '$68.50',
    savings: 'Save $521',
    savingsPct: '88%',
    partsSpec: '8 STLs · 9 BOM parts · 2 plates',
    desc: '96-well plate indexer, linear rail carriage & compliant pipette gantry.',
    prompt:
      'Desktop 96-well plate liquid handling robot / multi-channel pipette workstation',
    url: 'https://www.youtube.com/results?search_query=diy+liquid+handling+robot+3d+printed',
    isInstantDemo: true,
  },
  {
    id: 'art-easel',
    title: 'Articulated Studio Art Easel',
    category: 'Art & Studio',
    retail: '$189',
    diy: '$27.40',
    savings: 'Save $161',
    savingsPct: '85%',
    partsSpec: '6 STLs · 5 BOM parts · 1 plate',
    desc: 'Ratcheting tilt mast, canvas clamp jaws & 2020 aluminum spine.',
    prompt:
      'Bespoke Articulated Tabletop Studio Painting Easel with adjustable tilt and canvas clamp',
    url: 'https://www.amazon.com/s?k=adjustable+tabletop+studio+art+easel',
    isInstantDemo: true,
  },
  {
    id: 'iphone-magnifier',
    title: 'iPhone Macro Microscope Stage',
    category: 'Optics',
    retail: '$119',
    diy: '$16.20',
    savings: 'Save $102',
    savingsPct: '86%',
    partsSpec: '4 STLs · 4 BOM parts · 1 plate',
    desc: 'XYZ flexure focus stage, 100x achromatic doublet & 5V LED ring.',
    prompt:
      'iPhone Smartphone Microscope Magnifier Adapter with LED illumination and focus stage',
    url: 'https://www.amazon.com/s?k=smartphone+microscope+adapter+stage',
    isInstantDemo: true,
  },
];

const AGENT_STAGES = [
  {
    step: '01',
    name: 'Analyst',
    artifact: 'analysis.json',
    desc: 'Extracts product dimensions, core mechanisms, and retail price markup.',
    icon: Cpu,
  },
  {
    step: '02',
    name: 'Researcher & Teardown',
    artifact: 'sources.json + teardown.json',
    desc: 'Finds open-source CAD priors, schematics, and timestamped video teardown frames.',
    icon: Search,
  },
  {
    step: '03',
    name: 'Designer',
    artifact: 'design.json',
    desc: 'Splits printed vs. purchased parts with parametric dimensions and explode vectors.',
    icon: Layers,
  },
  {
    step: '04',
    name: 'DFM Critic',
    artifact: 'critique.json',
    desc: 'Audits overhangs, wall thickness, tolerances, and bed fit in a revision loop.',
    icon: ShieldCheck,
  },
  {
    step: '05',
    name: 'BOM & Price Hunter',
    artifact: 'bom.json',
    desc: 'Sources the lowest live prices across Amazon, McMaster-Carr, Walmart & Home Depot.',
    icon: ShoppingCart,
  },
  {
    step: '06',
    name: 'CAD & Plate Packer',
    artifact: 'plates.json + *.3mf',
    desc: 'Compiles watertight OpenSCAD STLs and packs them onto the fewest build plates.',
    icon: Box,
  },
  {
    step: '07',
    name: 'Instructions',
    artifact: 'instructions.json',
    desc: 'Generates step-by-step IKEA-style 3D assembly choreography and tool callouts.',
    icon: Wrench,
  },
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
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [knownSampleIds, setKnownSampleIds] = useState<Set<string>>(
    new Set([
      'plant-auto-waterer',
      'art-easel',
      'iphone-magnifier',
      'liquid-handler',
      'desktop-robot-arm',
      'bladeless-air-purifier',
      'camera-slider-3axis',
    ])
  );

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
      setError(
        'Paste a product link, video link, description, or upload a photo first.'
      );
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

      if (data.manifest) {
        saveLocalCachedManifest(data.id, data.manifest);
      }

      const qs = isUrl
        ? `?url=${encodeURIComponent(inputValue.trim())}`
        : '';
      router.push(`/projects/${data.id}${qs}`);
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

  return (
    <div className="space-y-7 sm:space-y-14 pb-16 sm:pb-20">
      {/* =====================================================================
          1. FOCUSED HERO — ONE HEADLINE, ONE SUBHEAD, ONE PRIMARY ACTION
      ===================================================================== */}
      <section
        id="hero-command"
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl gilded-frame bg-[#17130e] px-4 py-5 sm:px-12 sm:py-14"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(229,189,71,0.14),transparent_65%)]"
        />

        <div className="relative z-10 mx-auto max-w-3xl text-center space-y-3 sm:space-y-5">
          <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#e5bd47]/40 bg-[#231d15] px-3 py-1 text-[11px] sm:text-xs font-semibold text-[#f3d478]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#e5bd47]" />
            <span>DIY 3D-Printed Parts + Off-the-Shelf Hardware</span>
          </div>

          <h1 className="font-display text-[1.75rem] sm:text-6xl font-bold tracking-tight text-[#faf4e8] leading-[1.1] sm:leading-[1.05]">
            Every invention begins as a sketch.{' '}
            <span className="text-[#f3d478] italic font-normal">
              Build a DIY alternative for 80–92% less.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-[#dfd3be] max-w-2xl mx-auto leading-snug sm:leading-relaxed">
            Paste a product URL, YouTube video, or photo to get plate-packed STL
            &amp; 3MF print files, a sourced retail BOM, and animated 3D assembly
            steps.
          </p>

          {/* Single Primary Input & High-Contrast Solid CTA */}
          <form
            onSubmit={handleStartPipeline}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-4 sm:mt-6 space-y-2.5 sm:space-y-3 rounded-2xl p-3 sm:p-4 text-left transition-all glass-command-bar ${
              isDragging ? 'ring-2 ring-[#f3d478] border-[#f3d478]' : ''
            }`}
          >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <div className="relative flex-1 min-w-0">
                <Link2 className="pointer-events-none absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-[#e5bd47]" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Paste a product link, YouTube URL, or describe any gadget..."
                  className="w-full min-h-[46px] sm:min-h-[48px] rounded-xl border border-[#dfd3be]/25 bg-[#0c0a08] pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 text-sm sm:text-base text-[#faf4e8] placeholder-[#b5a48b] focus:border-[#f3d478]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary-gold min-h-[46px] sm:min-h-[48px] w-full sm:w-auto px-6 sm:px-7 text-sm sm:text-base tracking-wide shrink-0 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#140e07] border-t-transparent" />
                    Running Agents...
                  </>
                ) : (
                  <>
                    Build My DIY Alt
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2 sm:gap-3 pt-2 border-t border-[#dfd3be]/15 text-sm text-[#dfd3be]">
              <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPhoto(true);
                  }}
                  onDragLeave={() => setIsDraggingPhoto(false)}
                  onDrop={handlePhotoDrop}
                  className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isDraggingPhoto
                      ? 'border-[#f3d478] bg-[#e5bd47]/25 text-[#faf4e8]'
                      : 'border-[#dfd3be]/25 bg-[#17130e] text-[#faf4e8] hover:border-[#f3d478]'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 shrink-0 text-[#f3d478]" />
                  <span className="truncate">
                    {isDraggingPhoto
                      ? 'Drop photo to upload'
                      : imageFile
                      ? `Photo: ${imageFile.name}`
                      : 'Upload or Drop Photo'}
                  </span>
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
                    className="min-h-[44px] px-2 text-xs font-medium text-[#e06348] hover:underline shrink-0"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                <Printer className="h-4 w-4 shrink-0 text-[#e5bd47]" />
                <label
                  htmlFor="hero-printer-select"
                  className="text-xs font-medium text-[#b5a48b] shrink-0"
                >
                  Printer:
                </label>
                <select
                  id="hero-printer-select"
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="min-h-[44px] min-w-0 flex-1 sm:flex-initial max-w-full truncate rounded-lg border border-[#dfd3be]/25 bg-[#0c0a08] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[#faf4e8] focus:border-[#f3d478]"
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
              <p className="text-sm font-medium text-[#e06348]">{error}</p>
            )}
          </form>
        </div>
      </section>

      {/* =====================================================================
          2. INSTANT DEMOS — CLEAN CARD GRID WITH CLEAR HIERARCHY
      ===================================================================== */}
      <section
        id="sample-builds"
        aria-label="Instant Demo Builds"
        className="space-y-4 sm:space-y-5 pt-1 sm:pt-2"
      >
        <div id="showcase-gallery" className="-mt-4" />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1.5 sm:gap-2 border-b border-[#dfd3be]/15 pb-3 sm:pb-4">
          <div>
            <p className="eyebrow">Instant Demos</p>
            <h2 className="mt-0.5 sm:mt-1 font-display text-2xl sm:text-4xl font-bold text-[#faf4e8]">
              Explore Ready-to-Print DIY Builds
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#dfd3be]">
            Click any build to inspect its BOM, printable STLs/3MFs, and 3D
            assembly guide.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRESET_GADGETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => launchPreset(item)}
              className="group flex flex-col justify-between rounded-2xl surface-card p-5 text-left hover:border-[#f3d478] hover:bg-[#1d1812] hover:-translate-y-0.5 transition-all"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#b5a48b]">
                    {item.category}
                  </span>
                  <span className="rounded-full bg-[#e5bd47]/20 border border-[#e5bd47]/50 px-2.5 py-0.5 text-xs font-bold text-[#f3d478] tabular-nums">
                    Save {item.savingsPct}
                  </span>
                </div>

                <h3 className="font-display text-xl font-bold text-[#faf4e8] group-hover:text-[#f3d478] transition-colors leading-snug">
                  {item.title}
                </h3>

                <p className="text-sm text-[#dfd3be] leading-relaxed line-clamp-2">
                  {item.desc}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-[#dfd3be]/15 space-y-2">
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-bold text-[#faf4e8]">
                      {item.diy}
                    </span>
                    <span className="text-xs text-[#b5a48b] line-through">
                      {item.retail}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#f3d478] group-hover:translate-x-0.5 transition-transform">
                    Open Build <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="text-xs text-[#b5a48b]">{item.partsSpec}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* =====================================================================
          3. RECENT BUILDS SHELF (COMPACT WHEN EMPTY)
      ===================================================================== */}
      <RecentBuildsShelf />

      {/* =====================================================================
          4. PROGRESSIVE DISCLOSURE: HOW IT WORKS (PIPELINE + 3D PREVIEW)
      ===================================================================== */}
      <section
        id="how-it-works"
        className="rounded-2xl surface-card p-6 sm:p-8 space-y-6"
      >
        <div id="pipeline-story" className="-mt-4" />
        <div id="savings-story" className="-mt-4" />
        <div id="exploded-story" className="-mt-4" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="eyebrow">How It Works</p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#faf4e8]">
              Seven Managed Gemini 4 Argon Agents. Zero Manual CAD.
            </h2>
            <p className="text-sm text-[#dfd3be]">
              From a single link or photo to printable STLs, verified retail
              links, and interactive 3D instructions.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setHowItWorksOpen((o) => !o)}
            aria-expanded={howItWorksOpen}
            className="btn-secondary-surface text-sm shrink-0 self-start md:self-auto"
          >
            <span>
              {howItWorksOpen
                ? 'Hide Pipeline & 3D Preview'
                : 'Inspect 7-Agent Pipeline & 3D Preview'}
            </span>
            <ChevronDown
              className={`h-4 w-4 text-[#f3d478] transition-transform ${
                howItWorksOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Always-visible 3-pillar summary (1 concise line each) */}
        <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t border-[#dfd3be]/15">
          <div className="rounded-xl surface-raised p-4 space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              1. Deconstruct &amp; Teardown
            </div>
            <p className="text-sm text-[#dfd3be]">
              Analyst, Researcher &amp; Video Teardown agents extract dimensions
              and open-source CAD priors.
            </p>
          </div>
          <div className="rounded-xl surface-raised p-4 space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              2. Self-Healing CAD &amp; DFM
            </div>
            <p className="text-sm text-[#dfd3be]">
              Designer, Critic &amp; OpenSCAD agents compile watertight STLs and
              pack build plates.
            </p>
          </div>
          <div className="rounded-xl surface-raised p-4 space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              3. Grounded BOM &amp; 3D Guide
            </div>
            <p className="text-sm text-[#dfd3be]">
              Price Hunter compares Amazon/McMaster/Walmart while Instructions
              choreographs 3D assembly.
            </p>
          </div>
        </div>

        {/* Collapsible Detailed Pipeline + 3D Sketch-to-Reality Preview */}
        {howItWorksOpen && (
          <div className="space-y-8 pt-4 border-t border-[#dfd3be]/15 animate-slide-in">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {AGENT_STAGES.map((stage) => {
                const Icon = stage.icon;
                return (
                  <div
                    key={stage.step}
                    className="flex flex-col justify-between rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3.5 space-y-2"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-[#f3d478]">
                        <span>STAGE {stage.step}</span>
                        <Icon className="h-4 w-4 text-[#e5bd47]" />
                      </div>
                      <div className="font-display text-base font-bold text-[#faf4e8]">
                        {stage.name}
                      </div>
                      <p className="text-xs text-[#dfd3be] leading-snug">
                        {stage.desc}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-[#dfd3be]/15 font-mono text-[11px] text-[#b5a48b] truncate">
                      {stage.artifact}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xl font-bold text-[#faf4e8]">
                  Interactive Sketch-to-Reality 3D Exploded Preview
                </h3>
                <Link
                  href="/projects/plant-auto-waterer"
                  className="text-sm font-semibold text-[#f3d478] hover:underline"
                >
                  Open full Smart Plant Auto-Waterer build ($149 → $24.85) →
                </Link>
              </div>
              <ScrollExplodeScene scrollFactor={0.55} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
