'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Box,
  Cpu,
  FileCode2,
  Layers,
  Link2,
  Printer,
  Search,
  ShoppingCart,
  Sparkles,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react';

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
    title: 'Smart Plant Auto-Waterer',
    retail: '$149',
    diy: '$24.85',
    savings: 'Save $124',
    desc: '750mL PETG reservoir + 5V brushless pump + capacitive probe + anti-siphon drip spikes',
    prompt: 'Smart Autonomous Plant Watering Station with 750mL reservoir and soil sensor',
    url: 'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
    isInstantDemo: true,
  },
  {
    title: 'Articulated Tabletop Studio Art Easel',
    retail: '$189',
    diy: '$27.40',
    savings: 'Save $161',
    desc: 'Ratcheting tilt mast + canvas clamp jaws + 2020 aluminum extrusion spine + M5 knobs',
    prompt: 'Bespoke Articulated Tabletop Studio Painting Easel with adjustable tilt and canvas clamp',
    url: 'https://www.amazon.com/s?k=adjustable+tabletop+studio+art+easel',
    isInstantDemo: false,
  },
  {
    title: 'iPhone Macro Microscope & Slide Adapter',
    retail: '$119',
    diy: '$16.20',
    savings: 'Save $102',
    desc: 'Precision XYZ focus sled + clip-on 100x glass doublet mount + 5V LED ring diffuser',
    prompt: 'iPhone Smartphone Microscope Magnifier Adapter with LED illumination and focus stage',
    url: 'https://www.amazon.com/s?k=smartphone+microscope+adapter+stage',
    isInstantDemo: false,
  },
  {
    title: 'Benchtop Lab Pipette Liquid Handler Stand',
    retail: '$590',
    diy: '$68.50',
    savings: 'Save $521',
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
    desc: 'Gemini 4 Argon multimodal deconstruction of URLs, videos & photos into dimensions and mechanisms.',
    icon: Cpu,
  },
  {
    step: '02',
    name: 'Researcher',
    desc: 'Google Search grounding for teardowns, schematics, Printables, Thingiverse & GitHub open hardware.',
    icon: Search,
  },
  {
    step: '03',
    name: 'Designer',
    desc: 'Splits printed vs. purchased parts, parametric CSG shapes, and 3D explode vectors.',
    icon: Layers,
  },
  {
    step: '04',
    name: 'BOM Agent',
    desc: 'Retailer sourcing links (Amazon, Home Depot, Walmart, McMaster, AliExpress) + total savings.',
    icon: ShoppingCart,
  },
  {
    step: '05',
    name: 'CAD & Packer',
    desc: 'Parametric STL mesh generation + 2D bin-packing onto minimum plates for your printer.',
    icon: Box,
  },
  {
    step: '06',
    name: 'Instructions',
    desc: 'IKEA-style step-by-step animated assembly choreography with motion vectors & tool callouts.',
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageFile = (file: File | undefined | null) => {
    if (!file) return;
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
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    } else if (file) {
      setError('Please drop an image file (PNG, JPG, WebP, etc.).');
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
    if (preset.isInstantDemo) {
      router.push('/projects/plant-auto-waterer');
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
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800/90 bg-gradient-to-b from-slate-900/90 via-[#0b101b] to-[#07090e] p-6 sm:p-12 shadow-2xl">
        <div className="mx-auto max-w-3xl text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-medium text-emerald-300">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Powered by 6 Managed Gemini 4 Argon Agents (Antigravity CLI + Grounded REST)
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl leading-tight">
            Bespoke Gadgets Are Pricey.{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 bg-clip-text text-transparent">
              Get The 3D-Printable DIY Alt.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Paste any product URL, YouTube video, or photo. Our 6-agent hardware team reverse-engineers it into{' '}
            <strong className="text-white">plate-packed STL print files</strong>, an{' '}
            <strong className="text-white">off-the-shelf BOM</strong> from mainstream retailers,{' '}
            <strong className="text-white">IKEA-style animated 3D instructions</strong>, and an{' '}
            <strong className="text-white">interactive exploded view</strong>.
          </p>

          {/* Input Form */}
          <form
            onSubmit={handleStartPipeline}
            className="mt-6 space-y-4 rounded-2xl border border-slate-700/80 bg-slate-950/90 p-4 sm:p-5 text-left shadow-inner"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Paste product link (Amazon, Kickstarter, YouTube) or describe a gadget (e.g., 'Articulated studio art easel')..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/90 pl-11 pr-4 py-3 text-sm text-white placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50 transition-all"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-xs text-slate-300">
              {/* Image upload */}
              <div className="flex items-center gap-3">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingPhoto(true);
                  }}
                  onDragLeave={() => setIsDraggingPhoto(false)}
                  onDrop={handlePhotoDrop}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isDraggingPhoto
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 text-emerald-400" />
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
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Remove photo
                  </button>
                )}
              </div>

              {/* Target Printer Selector */}
              <div className="flex items-center gap-2">
                <Printer className="h-3.5 w-3.5 text-sky-400" />
                <span className="text-slate-400">Target Printer:</span>
                <select
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
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
              <p className="text-xs font-medium text-rose-400">{error}</p>
            )}
          </form>

          {/* Instant Demo CTA */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 transition-all"
            >
              <Zap className="h-4 w-4 text-emerald-400" />
              Instant Demo Mode: Smart Plant Auto-Waterer ($149 Commercial → $24.85 DIY)
            </Link>
          </div>
        </div>
      </section>

      {/* Preset Gadgets Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">
              Try a Featured Gadget Reverse-Engineering Run
            </h2>
            <p className="text-xs text-slate-400">
              Click any card to open the instant pre-built sample or launch a live 6-agent Gemini 4 Argon build.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRESET_GADGETS.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => launchPreset(item)}
              className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-emerald-500/50 hover:bg-slate-900 transition-all"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                    {item.savings}
                  </span>
                  {item.isInstantDemo && (
                    <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-300 border border-sky-500/30">
                      Instant Demo
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.desc}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
                <div>
                  <span className="text-slate-500 line-through mr-1.5">
                    {item.retail}
                  </span>
                  <span className="font-bold text-emerald-400">
                    {item.diy} DIY
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 font-semibold text-slate-300 group-hover:text-emerald-300">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Managed Agents Pipeline Overview */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-emerald-400" />
              6-Stage Managed Agent Pipeline (Gemini 4 Argon)
            </h2>
            <p className="text-xs text-slate-400">
              Every stage spawns an isolated Gemini 4 Argon agent that writes structured artifacts into{' '}
              <code className="text-emerald-300">data/objects/&lt;slug&gt;-&lt;id&gt;/</code> and streams live over SSE.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-[11px] font-mono text-slate-300">
            agy -p &quot;...&quot; --model gemini-4-argon --output-format json
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {AGENT_STAGES.map((stage) => {
            const Icon = stage.icon;
            return (
              <div
                key={stage.step}
                className="rounded-xl border border-slate-800/90 bg-slate-950/70 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-emerald-400">
                    STAGE {stage.step}
                  </span>
                  <Icon className="h-4 w-4 text-slate-400" />
                </div>
                <div className="text-sm font-bold text-white">{stage.name}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {stage.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
