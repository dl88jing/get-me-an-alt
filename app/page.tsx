'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ShowcaseBuild } from '../components/ui/ShowcaseBuild';
import { RecentBuildsShelf } from '../components/ui/RecentBuildsShelf';
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  CheckCircle2,
  Compass,
  Cpu,
  Feather,
  Layers,
  Link2,
  Printer,
  ScrollText,
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
      <div className="min-h-[460px] rounded-2xl border border-[#d4af37]/30 bg-[#14100b] p-8 flex items-center justify-center font-mono text-xs text-[#e6d3b3] skeleton-shimmer">
        PREPARING 3D EXPLODED VIEWPORT // 256×256×256MM...
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
    badge: 'BUILD 01',
    title: 'Smart Plant Auto-Waterer',
    latinTitle: 'Autonomous Soil-Sensing Hydro-Station',
    category: 'HOME & GARDEN // FLUIDICS',
    retail: '$149',
    diy: '$24.85',
    savings: 'Save $124',
    savingsPct: '83%',
    partsSpec: '7 Printed STLs · 4 BOM Parts · 1 Plate',
    desc: '750mL fluted PETG vessel + 5V brushless impeller pump + capacitive probe + anti-siphon drip manifold.',
    prompt:
      'Smart Autonomous Plant Watering Station with 750mL reservoir and soil sensor',
    url: 'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
    isInstantDemo: true,
  },
  {
    id: 'art-easel',
    badge: 'BUILD 02',
    title: 'Articulated Tabletop Studio Art Easel',
    latinTitle: 'Multi-Angle Studio Tabletop Easel',
    category: 'ART & STUDIO // MECHANICS',
    retail: '$189',
    diy: '$27.40',
    savings: 'Save $161',
    savingsPct: '85%',
    partsSpec: '6 Printed STLs · 5 BOM Parts · 1 Plate',
    desc: 'Ratcheting tilt mast + canvas clamp jaws + 2020 aluminum extrusion spine + knurled M5 brass knobs.',
    prompt:
      'Bespoke Articulated Tabletop Studio Painting Easel with adjustable tilt and canvas clamp',
    url: 'https://www.amazon.com/s?k=adjustable+tabletop+studio+art+easel',
    isInstantDemo: true,
  },
  {
    id: 'iphone-magnifier',
    badge: 'BUILD 03',
    title: 'iPhone Macro Microscope & Slide Stage',
    latinTitle: '100x Compound Lens & XYZ Focus Stage',
    category: 'OPTICS // PRECISION STAGE',
    retail: '$119',
    diy: '$16.20',
    savings: 'Save $102',
    savingsPct: '86%',
    partsSpec: '4 Printed STLs · 4 BOM Parts · 1 Plate',
    desc: 'Precision XYZ focus sled + clip-on 100x glass doublet mount + 5V warm LED ring diffuser.',
    prompt:
      'iPhone Smartphone Microscope Magnifier Adapter with LED illumination and focus stage',
    url: 'https://www.amazon.com/s?k=smartphone+microscope+adapter+stage',
    isInstantDemo: true,
  },
  {
    id: 'liquid-handler',
    badge: 'BUILD 04',
    title: 'Benchtop Lab Pipette Liquid Automaton',
    latinTitle: '96-Well Multi-Channel Pipette Gantry',
    category: 'LAB AUTOMATION // GANTRY',
    retail: '$590',
    diy: '$68.50',
    savings: 'Save $521',
    savingsPct: '88%',
    partsSpec: '8 Printed STLs · 9 BOM Parts · 2 Plates',
    desc: '96-well plate indexer + linear rail carriage + compliant pipette plunger escapement.',
    prompt:
      'Desktop 96-well plate liquid handling robot / multi-channel pipette workstation',
    url: 'https://www.youtube.com/results?search_query=diy+liquid+handling+robot+3d+printed',
    isInstantDemo: true,
  },
  {
    id: 'desktop-robot-arm',
    badge: 'BUILD 05',
    title: '6-Axis Desktop Robot Arm',
    latinTitle: '6-DOF Servo Articulated Manipulator',
    category: 'ROBOTICS // KINEMATICS',
    retail: '$899',
    diy: '$74.50',
    savings: 'Save $824',
    savingsPct: '92%',
    partsSpec: '9 Printed STLs · 7 BOM Parts · 2 Plates',
    desc: '6808 slew-bearing waist turntable + 3× MG996R & 3× MG90S metal-gear servos + PCA9685 I2C driver + parallel geared gripper.',
    prompt:
      '6-Axis Programmable Desktop Robot Arm with parallel servo gripper and slew bearing waist',
    url: 'https://www.amazon.com/s?k=6+axis+desktop+robot+arm+programmable+servo+kit',
    isInstantDemo: true,
  },
  {
    id: 'bladeless-air-purifier',
    badge: 'BUILD 06',
    title: 'Bladeless HEPA Air Purifier Tower',
    latinTitle: 'Coanda Airfoil Loop & H13 HEPA Tower',
    category: 'AERODYNAMICS // FLUIDICS',
    retail: '$549',
    diy: '$58.40',
    savings: 'Save $490',
    savingsPct: '89%',
    partsSpec: '9 Printed STLs · 6 BOM Parts · 7 Plates',
    desc: '360° HEPA H13 intake drum + 24V mixed-flow brushless impeller + Coanda boundary-layer airfoil loop amplifier.',
    prompt:
      'Bladeless Tower Fan and HEPA H13 Air Purifier with Coanda airfoil loop',
    url: 'https://www.amazon.com/s?k=bladeless+tower+fan+hepa+air+purifier',
    isInstantDemo: true,
  },
  {
    id: 'camera-slider-3axis',
    badge: 'BUILD 07',
    title: '3-Axis Motorized Camera Slider',
    latinTitle: '800mm Linear Rail & Pan-Tilt Motion Rig',
    category: 'CINEMATOGRAPHY // MOTION',
    retail: '$899',
    diy: '$84.90',
    savings: 'Save $814',
    savingsPct: '91%',
    partsSpec: '9 Printed STLs · 8 BOM Parts · 2 Plates',
    desc: '800mm 2040 V-slot linear rail + 3× NEMA 17 steppers + TMC2209 silent drivers + GT2 belt drive & pan/tilt gimbal.',
    prompt:
      '3-Axis Motorized Camera Slider with pan-tilt head and silent stepper motion control',
    url: 'https://www.amazon.com/s?k=motorized+3+axis+camera+slider+pan+tilt',
    isInstantDemo: true,
  },
];

const AGENT_STAGES = [
  {
    step: '01',
    roman: 'I',
    name: 'Analyst',
    latinRole: 'Product & Dimension Analyst',
    artifact: 'analysis.json',
    desc: 'Gemini 4 Argon multimodal analysis of URLs, videos & photos into dimensions, mechanisms, and retail markup.',
    icon: Cpu,
  },
  {
    step: '02',
    roman: 'II',
    name: 'Researcher',
    latinRole: 'Web & Video Teardown Search',
    artifact: 'sources.json + teardown.json',
    desc: 'Google Search grounding + video teardown frame extraction for schematics, Printables & open-source designs.',
    icon: Search,
  },
  {
    step: '03',
    roman: 'III',
    name: 'Designer',
    latinRole: 'Parametric CAD Architect',
    artifact: 'design.json',
    desc: 'Separates 3D-printed parts from off-the-shelf hardware, computing CSG dimensions and 3D explosion vectors.',
    icon: Layers,
  },
  {
    step: '04',
    roman: 'IV',
    name: 'Critic',
    latinRole: 'DFM Printability Critic',
    artifact: 'critique.json',
    desc: 'DFM printability review verifying overhangs <=45°, wall thickness, tolerances & bed fit in a revision loop.',
    icon: ShieldCheck,
  },
  {
    step: '05',
    roman: 'V',
    name: 'BOM & Price Hunter',
    latinRole: 'Retail Sourcing & Price Hunter',
    artifact: 'bom.json',
    desc: 'Live grounded sourcing across Amazon, Home Depot, Walmart & McMaster-Carr to find the lowest price.',
    icon: ShoppingCart,
  },
  {
    step: '06',
    roman: 'VI',
    name: 'CAD & Packer',
    latinRole: 'OpenSCAD & Plate Packer',
    artifact: 'plates.json + *.3mf',
    desc: 'OpenSCAD-WASM parametric STL compilation with 3x self-healing retry + 2D bin-packing onto fewest plates.',
    icon: Box,
  },
  {
    step: '07',
    roman: 'VII',
    name: 'Instructions',
    latinRole: '3D Assembly Choreographer',
    artifact: 'instructions.json',
    desc: 'IKEA-style step-by-step animated 3D assembly guide with insertion vectors & tool callouts.',
    icon: Wrench,
  },
];

const RETAILER_MARQUEE = [
  { name: 'AMAZON', tag: 'PRIME FASTENERS & PUMPS' },
  { name: 'McMASTER-CARR', tag: 'PRECISION METRIC BRASS & STEEL' },
  { name: 'BAMBU LAB', tag: '256×256MM 3MF PLATES' },
  { name: 'HOME DEPOT', tag: 'EXTRUSIONS & TUBING' },
  { name: 'DIGIKEY', tag: 'SENSORS & CONTROLLERS' },
  { name: 'PRINTABLES', tag: 'OPEN-SOURCE CAD PRIORS' },
  { name: 'ALIEXPRESS', tag: 'DIRECT MOTION PARTS' },
  { name: 'WALMART', tag: 'COMMODITY HARDWARE' },
  { name: 'PRUSA RESEARCH', tag: 'MK4S / CORE ONE PROFILES' },
  { name: 'CRAFTCLOUD', tag: 'ON-DEMAND PRINT SERVICE' },
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

  // Scroll-driven gear drawing & 3D explode progress
  const studySectionRef = useRef<HTMLElement | null>(null);
  const explodeSectionRef = useRef<HTMLElement | null>(null);
  const [gearScrollProgress, setGearScrollProgress] = useState(0.45);
  const [scrollExplodeFactor, setScrollExplodeFactor] = useState(0.35);

  // Savings count-up animation
  const savingsSectionRef = useRef<HTMLElement | null>(null);
  const [savingsCount, setSavingsCount] = useState(83);
  const [diyCostCount, setDiyCostCount] = useState(24.85);
  const [dollarSavedCount, setDollarSavedCount] = useState(124);

  // Cycle active agent scholar highlight on Folio II
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

  // Scroll listener for SVG stroke-dashoffset gear drawing & 3D sketch->reality explode section
  useEffect(() => {
    const handleScroll = () => {
      const vh = window.innerHeight || 800;

      if (studySectionRef.current) {
        const sRect = studySectionRef.current.getBoundingClientRect();
        const sRaw = (vh * 0.85 - sRect.top) / (sRect.height * 0.85);
        setGearScrollProgress(Math.max(0.15, Math.min(1, sRaw)));
      }

      if (explodeSectionRef.current) {
        const rect = explodeSectionRef.current.getBoundingClientRect();
        const raw = (vh * 0.72 - rect.top) / (rect.height * 0.78);
        const clamped = Math.max(0.08, Math.min(1, raw));
        setScrollExplodeFactor(clamped);
      }
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

  const gearDashOffset = Math.round((1 - gearScrollProgress) * 420);

  return (
    <div className="space-y-16 sm:space-y-24 pb-20">
      {/* =====================================================================
          FOLIO I — THE VISION: DA VINCI'S WORKSHOP HERO & ORNATE GILDED FRAME
      ===================================================================== */}
      <section
        id="hero-command"
        className="relative overflow-hidden rounded-[28px] gilded-frame bg-[#0e0a07] p-6 sm:p-10 lg:p-14"
      >
        {/* Background Layer 1: Generated Florentine Vellum & Chiaroscuro Workshop Painting */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-25 mix-blend-luminosity"
          style={{
            backgroundImage: "url('/media/renaissance/parchment-codex-bg.webp')",
          }}
        />

        {/* Background Layer 2: Graded Sepia Hardware Video Ambient Underlay */}
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/hero-poster.jpg"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25 sepia-video-grade"
        >
          <source src="/media/hero.mp4" type="video/mp4" />
        </video>

        {/* Multi-Stop Caravaggio Chiaroscuro Vignette & Candlelight Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0c0906]/60 via-[#0c0906]/82 to-[#0c0906]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(212,175,55,0.22),transparent_62%)]"
        />

        {/* Vitruvian Circle + Square Compass Geometry Background SVG */}
        <svg
          aria-hidden="true"
          viewBox="0 0 800 800"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[760px] w-[760px] opacity-[0.14]"
        >
          <circle
            cx="400"
            cy="400"
            r="350"
            fill="none"
            stroke="#d4af37"
            strokeWidth="1.2"
            strokeDasharray="8 6"
          />
          <circle
            cx="400"
            cy="400"
            r="280"
            fill="none"
            stroke="#e6d3b3"
            strokeWidth="0.8"
          />
          <rect
            x="120"
            y="120"
            width="560"
            height="560"
            fill="none"
            stroke="#d4af37"
            strokeWidth="1"
          />
          <line
            x1="400"
            y1="20"
            x2="400"
            y2="780"
            stroke="#d4af37"
            strokeWidth="0.6"
            strokeDasharray="4 6"
          />
          <line
            x1="20"
            y1="400"
            x2="780"
            y2="400"
            stroke="#d4af37"
            strokeWidth="0.6"
            strokeDasharray="4 6"
          />
        </svg>

        {/* Top Section Header & Spec Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[#d4af37]/25 pb-4 mb-8 font-mono text-[11px] text-[#bda782]">
          <span className="inline-flex items-center gap-2 text-[#f3d478]">
            <Compass className="h-3.5 w-3.5 text-[#d4af37] animate-spin-slow" />
            <span className="font-codex tracking-widest">
              1. PASTE A LINK, VIDEO, OR PHOTO
            </span>
          </span>

          <span
            className="group inline-flex items-center gap-2 rounded-full border border-[#d4af37]/25 bg-[#14100b]/80 px-3 py-0.5 text-[10px] text-[#e6d3b3]"
            title="Hover to read hardware specification note"
          >
            <Feather className="h-3 w-3 text-[#d4af37]" />
            <span className="mirror-script font-mono tracking-wider">
              3D-PRINTED PARTS + OFF-THE-SHELF HARDWARE · GEMINI 4 ARGON
            </span>
            <span className="text-[#d4af37]/75 hidden sm:inline">
              (hover mirror script)
            </span>
          </span>

          <span className="hidden md:inline text-[#e6d3b3]">
            BED PROPORTION: 256×256×256MM · TOLERANCE ±0.15MM
          </span>
        </div>

        {/* Central Hero Copy + Command Bar */}
        <div className="relative z-10 mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/45 bg-[#d4af37]/12 px-4 py-1.5 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478] shadow-[0_0_28px_-4px_rgba(212,175,55,0.4)]">
            <Sparkles className="h-3.5 w-3.5 text-[#f3d478]" />
            <span>
              Get Me An Alt · Managed Gemini 4 Argon Agents
            </span>
          </div>

          <h1 className="font-display text-4xl sm:text-6xl lg:text-7xl font-bold tracking-[-0.02em] text-[#f5ebd6] leading-[0.98]">
            Every invention begins as a sketch.{' '}
            <span className="block mt-1 italic font-normal bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#e6c365] bg-clip-text text-transparent">
              Get a DIY alternative to anything you can&apos;t afford.
            </span>
          </h1>

          <p className="text-sm sm:text-lg text-[#e6d3b3] max-w-2xl mx-auto leading-relaxed font-sans">
            Paste any pricey commercial gadget link, YouTube video, or upload a
            photo. Seven autonomous Gemini 4 Argon agents decompose it
            into{' '}
            <strong className="text-[#f5ebd6] font-semibold">
              plate-packed 3D-printable STLs &amp; 3MFs
            </strong>
            , a{' '}
            <strong className="text-[#f5ebd6] font-semibold">
              grounded retail BOM
            </strong>
            , and{' '}
            <strong className="text-[#f5ebd6] font-semibold">
              animated 3D assembly instructions
            </strong>
            .
          </p>

          {/* Prominent Command Bar (Paste Link / Upload Photo / Video) */}
          <form
            onSubmit={handleStartPipeline}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`mt-8 space-y-4 rounded-2xl p-4 sm:p-5 text-left transition-all glass-command-bar ${
              isDragging ? 'ring-2 ring-[#f3d478] border-[#f3d478]' : ''
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-[#d4af37]" />
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Paste product link (Amazon, Kickstarter, YouTube) or describe a gadget (e.g., 'Articulated studio art easel')..."
                  className="w-full rounded-xl border border-[#d4af37]/30 bg-[#0c0906]/90 pl-12 pr-4 py-3.5 text-sm text-[#f5ebd6] placeholder-[#bda782]/75 focus:border-[#f3d478] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/30"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] px-7 py-3.5 font-codex text-xs sm:text-sm font-bold tracking-wider uppercase text-[#140e07] shadow-electric hover:brightness-110 disabled:opacity-50 transition-all shrink-0"
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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#d4af37]/20 text-xs text-[#e6d3b3]">
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
                      ? 'border-[#f3d478] bg-[#d4af37]/25 text-[#f3d478]'
                      : 'border-[#d4af37]/30 bg-[#d4af37]/[0.08] text-[#f5ebd6] hover:border-[#f3d478] hover:text-[#f3d478]'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5 text-[#f3d478]" />
                  {isDraggingPhoto
                    ? 'Drop photo to upload'
                    : imageFile
                      ? `Photo: ${imageFile.name}`
                      : 'Upload or Drop Photo'}
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
                    className="font-mono text-xs text-[#e06348] hover:underline"
                  >
                    Remove image
                  </button>
                )}
                <span className="hidden md:inline font-mono text-[11px] text-[#bda782]">
                  Accepts Amazon/Kickstarter URLs, YouTube teardowns, or
                  JPEG/PNG/WebP
                </span>
              </div>

              {/* Target Printer Selector */}
              <div className="flex items-center gap-2">
                <Printer className="h-3.5 w-3.5 text-[#f3d478]" />
                <span className="font-mono text-[11px] text-[#bda782]">
                  Target Printer:
                </span>
                <select
                  value={printerId}
                  onChange={(e) => setPrinterId(e.target.value)}
                  className="rounded-lg border border-[#d4af37]/30 bg-[#0c0906] px-2.5 py-1.5 font-mono text-xs text-[#f5ebd6] focus:border-[#f3d478] focus:outline-none"
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
              <p className="font-mono text-xs font-medium text-[#e06348]">
                {error}
              </p>
            )}
          </form>

          {/* Instant Demo CTA */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex items-center gap-2.5 rounded-xl border border-[#d4af37]/55 bg-[#d4af37]/15 px-5 py-2.5 font-codex text-xs font-bold tracking-wide text-[#f3d478] hover:bg-[#d4af37]/25 transition-all shadow-[0_0_30px_-8px_rgba(212,175,55,0.45)]"
            >
              <Zap className="h-4 w-4 text-[#f3d478]" />
              <span>
                Explore Featured Build: Smart Plant Auto-Waterer ($149
                Retail → $24.85 DIY · Save 83%)
              </span>
            </Link>
          </div>
        </div>

        {/* Ornate Gilded Gallery Diptych: Graded Hero Video + Still-Life Art */}
        <div className="relative z-10 mt-10 grid gap-6 lg:grid-cols-12 items-stretch">
          {/* Left Frame: Graded Sepia/Chiaroscuro Hardware Video in Ornate Gilded Frame */}
          <div className="lg:col-span-7 relative overflow-hidden rounded-2xl gilded-frame bg-[#0c0906] min-h-[260px] sm:min-h-[320px] flex flex-col justify-between p-5">
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/media/hero-poster.jpg"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80 sepia-video-grade"
            >
              <source src="/media/hero.mp4" type="video/mp4" />
            </video>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0906] via-[#0c0906]/25 to-[#0c0906]/65"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 film-grain opacity-80"
            />

            {/* Hand-Drawn Ink Callout Leader Overlay */}
            <svg
              aria-hidden="true"
              viewBox="0 0 600 300"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <path
                d="M 110 85 Q 190 55 265 110"
                fill="none"
                stroke="#f3d478"
                strokeWidth="1.3"
                strokeDasharray="4 3"
              />
              <circle cx="265" cy="110" r="4" fill="#f3d478" />
              <path
                d="M 465 215 Q 395 180 340 155"
                fill="none"
                stroke="#f3d478"
                strokeWidth="1.3"
                strokeDasharray="4 3"
              />
              <circle cx="340" cy="155" r="4" fill="#f3d478" />
            </svg>

            <div className="relative z-10 flex items-center justify-between">
              <span className="rounded-md border border-[#d4af37]/50 bg-[#0c0906]/85 px-2.5 py-1 font-codex text-[10px] font-bold uppercase tracking-widest text-[#f3d478]">
                LIVE PREVIEW · MULTI-PLATE 3D PRINTING
              </span>
              <span className="font-mono text-[10px] text-[#e6d3b3] bg-[#0c0906]/75 px-2.5 py-1 rounded border border-[#d4af37]/25">
                FIG. 01 // SEPIA CHIAROSCURO GRADE
              </span>
            </div>

            <div className="relative z-10 space-y-1 max-w-lg">
              <div className="font-codex text-[10px] font-bold uppercase tracking-widest text-[#f3d478]">
                PLATE-PACKED OPENSCAD GEOMETRY
              </div>
              <h3 className="font-display italic text-xl sm:text-2xl font-bold text-[#f5ebd6]">
                “Parametric OpenSCAD parts packed onto a single build plate.”
              </h3>
              <p className="text-xs text-[#e6d3b3]">
                Hover the frame to lift the sepia patina and reveal full-color
                laser toolpath telemetry.
              </p>
            </div>
          </div>

          {/* Right Frame: Generated Illustration + Parchment Callout */}
          <div className="lg:col-span-5 relative overflow-hidden rounded-2xl gilded-frame bg-[#14100b] min-h-[260px] sm:min-h-[320px] flex flex-col justify-between p-5">
            <img
              src="/media/renaissance/davinci-workshop-hero.webp"
              alt="Renaissance still-life illustration of mechanical gear sketches and a 3D-printed plant auto-waterer"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-85 transition-transform duration-700 hover:scale-105"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0906] via-[#0c0906]/30 to-transparent"
            />

            <div className="relative z-10 flex items-center justify-between">
              <span className="rounded-md border border-[#d4af37]/50 bg-[#0c0906]/85 px-2.5 py-1 font-codex text-[10px] font-bold uppercase tracking-widest text-[#f3d478]">
                GET ME AN ALT · FEATURED BUILD
              </span>
              <span className="rounded-full bg-[#c84b31]/90 px-2.5 py-0.5 font-codex text-[10px] font-bold text-[#f5ebd6] shadow">
                83% SAVED
              </span>
            </div>

            <div className="relative z-10 rounded-xl parchment-sheet p-3.5 space-y-1">
              <div className="flex items-center justify-between font-mono text-[10px] font-bold text-[#5c3a1d]">
                <span>SMART PLANT AUTO-WATERER · BOM SUMMARY</span>
                <span className="mirror-script">SAVE 83%</span>
              </div>
              <p className="font-display italic text-sm font-semibold text-[#2b1d0e] leading-snug">
                “Print the custom housing at home; source standard pumps and
                sensors for pennies.”
              </p>
              <div className="font-mono text-[10px] text-[#5c3a1d]">
                7 Printed PETG Parts ($4.25) + 4 Off-the-Shelf Parts ($20.60) ={' '}
                <strong>$24.85 Total</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SUPPORTED RETAILERS & 3D PRINTERS MARQUEE
      ===================================================================== */}
      <section
        aria-label="Supported Retailers and Printers"
        className="relative overflow-hidden rounded-2xl border border-[#d4af37]/25 bg-[#14100b]/90 py-3.5"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0c0906] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0c0906] to-transparent" />

        <div className="flex w-max animate-marquee items-center gap-8 px-4">
          {[...RETAILER_MARQUEE, ...RETAILER_MARQUEE].map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="flex items-center gap-3 font-mono text-xs whitespace-nowrap"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#d4af37]" />
              <span className="font-codex font-bold tracking-wider text-[#f5ebd6]">
                {item.name}
              </span>
              <span className="rounded border border-[#d4af37]/25 bg-[#d4af37]/[0.06] px-2 py-0.5 text-[10px] text-[#bda782]">
                {item.tag}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          RECENT BUILDS SHELF (USER IP & LOCALSTORAGE SYNCED)
      ===================================================================== */}
      <RecentBuildsShelf />

      {/* =====================================================================
          2. AGENT PIPELINE: 7 MANAGED GEMINI 4 ARGON AGENTS & SCROLL GEARS
      ===================================================================== */}
      <section
        id="agent-pipeline"
        ref={studySectionRef}
        className="rounded-3xl codex-folio p-6 sm:p-8 space-y-6"
      >
        {/* Anchor alias for existing #pipeline-story links */}
        <div id="pipeline-story" className="-mt-4" />

        <div className="grid gap-6 lg:grid-cols-12 items-center border-b border-[#d4af37]/20 pb-6">
          <div className="lg:col-span-8 space-y-2">
            <div className="inline-flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-[0.18em] text-[#d4af37]">
              <ScrollText className="h-4 w-4" />
              2. MANAGED AGENT PIPELINE
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#f5ebd6]">
              Seven Managed Gemini 4 Argon Agents.{' '}
              <span className="italic font-normal text-[#f3d478]">
                Zero Manual CAD.
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-[#e6d3b3] max-w-2xl leading-relaxed">
              Each stage runs a specialized Gemini 4 Argon agent via the
              Antigravity CLI or grounded REST API, writing structured build
              artifacts into{' '}
              <code className="font-mono text-[#f3d478]">
                data/objects/&lt;slug&gt;-&lt;id&gt;/
              </code>{' '}
              while streaming thoughts, tokens, and self-healing OpenSCAD meshes.
            </p>
          </div>

          {/* Scroll-Driven SVG Stroke-Dashoffset Gear & Compass Sketch */}
          <div className="lg:col-span-4 flex items-center justify-between gap-4 rounded-2xl border border-[#d4af37]/30 bg-[#0c0906]/85 p-4">
            <div className="space-y-1">
              <div className="font-codex text-[10px] uppercase tracking-widest text-[#f3d478]">
                LIVE TELEMETRY · SSE STREAM
              </div>
              <p className="font-display italic text-sm text-[#e6d3b3]">
                Scroll-driven gear kinematics ({Math.round(gearScrollProgress * 100)}
                % complete)
              </p>
              <div className="font-mono text-[10px] text-[#bda782]">
                agy -p &quot;...&quot; --model gemini-4-argon
              </div>
            </div>

            <svg
              viewBox="0 0 120 120"
              className="h-20 w-20 shrink-0 text-[#d4af37]"
              aria-label="Mechanical gear illustration animated on scroll"
            >
              <g
                style={{
                  transform: `rotate(${gearScrollProgress * 140}deg)`,
                  transformOrigin: '60px 60px',
                  transition: 'transform 120ms linear',
                }}
              >
                <circle
                  cx="60"
                  cy="60"
                  r="34"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="420"
                  strokeDashoffset={gearDashOffset}
                />
                <circle
                  cx="60"
                  cy="60"
                  r="18"
                  fill="none"
                  stroke="#e6d3b3"
                  strokeWidth="1.4"
                  strokeDasharray="220"
                  strokeDashoffset={Math.round(gearDashOffset * 0.5)}
                />
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(
                  (deg) => (
                    <line
                      key={deg}
                      x1="60"
                      y1="16"
                      x2="60"
                      y2="26"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      transform={`rotate(${deg} 60 60)`}
                    />
                  )
                )}
                <line
                  x1="26"
                  y1="60"
                  x2="94"
                  y2="60"
                  stroke="#e6d3b3"
                  strokeWidth="1"
                />
                <line
                  x1="60"
                  y1="26"
                  x2="60"
                  y2="94"
                  stroke="#e6d3b3"
                  strokeWidth="1"
                />
              </g>
            </svg>
          </div>
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
                    ? 'border-[#f3d478]/80 bg-[#d4af37]/[0.12] shadow-[0_0_32px_-8px_rgba(212,175,55,0.4)] -translate-y-0.5'
                    : 'border-[#d4af37]/20 bg-[#0c0906]/85 hover:border-[#d4af37]/45'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-codex text-[11px] font-bold text-[#f3d478]">
                      STAGE {stage.step}
                    </span>
                    <Icon
                      className={`h-4 w-4 transition-colors ${
                        isPulsing ? 'text-[#f3d478]' : 'text-[#bda782]'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="font-display text-base font-bold text-[#f5ebd6]">
                      {stage.name}
                    </div>
                    <div className="font-display italic text-xs text-[#d4af37]">
                      {stage.latinRole}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#e6d3b3]/90 leading-relaxed">
                    {stage.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-[#d4af37]/15 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-[#bda782] truncate">
                    {stage.artifact}
                  </span>
                  <CheckCircle2
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isPulsing ? 'text-[#f3d478]' : 'text-[#5c4930]'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          3. BILL OF MATERIALS & RETAIL SAVINGS
      ===================================================================== */}
      <section
        id="bom-section"
        ref={savingsSectionRef}
        className="rounded-3xl codex-folio p-6 sm:p-10"
      >
        <div id="savings-story" className="-mt-4" />
        <div className="grid gap-8 lg:grid-cols-12 items-center">
          {/* Left Column: Narrative + Generated Sketch-to-Machine Oil Painting */}
          <div className="lg:col-span-5 space-y-5">
            <div className="inline-flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-[0.18em] text-[#d4af37]">
              <TrendingDown className="h-4 w-4" />
              3. BILL OF MATERIALS &amp; RETAIL PRICE COMPARISON
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#f5ebd6] leading-tight">
              Skip the Brand Markup.{' '}
              <span className="italic font-normal text-[#f3d478]">
                Save 83% on Hardware.
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-[#e6d3b3] leading-relaxed">
              Bespoke consumer hardware is 80% injection-molded plastic housing
              around $20 of standard pumps, sensors, and metric fasteners. Our
              BOM &amp; Price Hunter agents ground live prices across Amazon,
              McMaster-Carr, Home Depot, and Walmart while your printer builds
              the custom housing overnight.
            </p>

            {/* Framed Illustration: Technical Drawing to 3D Machine */}
            <div className="relative overflow-hidden rounded-2xl gilded-frame bg-[#0c0906] p-3">
              <div className="grid sm:grid-cols-12 gap-3 items-center">
                <img
                  src="/media/renaissance/sketch-to-machine.webp"
                  alt="Illustrated brass dividers over a technical drawing as a 3D-printed assembly materializes"
                  className="sm:col-span-5 h-36 w-full rounded-xl object-cover border border-[#d4af37]/30"
                />
                <div className="sm:col-span-7 space-y-1.5 px-1">
                  <div className="font-codex text-[10px] font-bold uppercase tracking-widest text-[#f3d478]">
                    PRICE HUNTER · VERIFIED RETAIL LINKS
                  </div>
                  <p className="font-display italic text-base text-[#f5ebd6] leading-snug">
                    “Why pay $149 for injection-molded plastic when you can
                    print the body for $4.25 and buy the pump for $5.90?”
                  </p>
                  <Link
                    href="/projects/plant-auto-waterer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#f3d478] hover:underline pt-1"
                  >
                    Inspect Full BOM &amp; Sourced Links{' '}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Monumental Gilded Ledger Numerals */}
          <div className="lg:col-span-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#d4af37]/55 bg-gradient-to-br from-[#d4af37]/20 via-[#d4af37]/[0.08] to-transparent p-5 space-y-2">
              <div className="font-codex text-[11px] font-bold uppercase tracking-wider text-[#f3d478]">
                YOUR SAVINGS
              </div>
              <div className="font-display text-5xl sm:text-6xl font-bold text-[#f3d478] tabular-nums tracking-tight">
                {savingsCount}%
              </div>
              <p className="font-mono text-xs text-[#e6d3b3]">
                Save ${dollarSavedCount} on the flagship Plant Auto-Waterer
              </p>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/25 bg-[#0c0906]/90 p-5 space-y-2">
              <div className="font-codex text-[11px] font-bold uppercase tracking-wider text-[#bda782]">
                DIY BUILD TOTAL
              </div>
              <div className="font-display text-4xl sm:text-5xl font-bold text-[#f5ebd6] tabular-nums tracking-tight">
                ${diyCostCount.toFixed(2)}
              </div>
              <p className="font-mono text-xs text-[#bda782]">
                vs.{' '}
                <span className="line-through text-[#c84b31]">$149.00</span>{' '}
                retail price
              </p>
            </div>

            <div className="rounded-2xl border border-[#d4af37]/25 bg-[#0c0906]/90 p-5 space-y-2">
              <div className="font-codex text-[11px] font-bold uppercase tracking-wider text-[#f3d478]">
                SINGLE-PLATE PRINT
              </div>
              <div className="font-display text-4xl sm:text-5xl font-bold text-[#f3d478] tabular-nums tracking-tight">
                1 Plate
              </div>
              <p className="font-mono text-xs text-[#bda782]">
                185g PETG · $4.25 filament + $20.60 hardware
              </p>
            </div>

            {/* Parchment Cost Breakdown Bar */}
            <div className="sm:col-span-3 rounded-2xl parchment-sheet p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                <span className="font-codex font-bold text-[#2b1d0e]">
                  COST BREAKDOWN // SMART PLANT AUTO-WATERER
                </span>
                <span className="rounded-full bg-[#c84b31] px-3 py-0.5 font-codex text-[11px] font-bold text-[#f5ebd6]">
                  YOU SAVE $124.15 (83.3%)
                </span>
              </div>
              <div className="h-3.5 w-full rounded-full bg-[#2b1d0e]/20 overflow-hidden flex border border-[#5c3a1d]/40">
                <div
                  style={{ width: '4%' }}
                  className="bg-[#6e5a26] h-full"
                  title="3D Filament ($4.25)"
                />
                <div
                  style={{ width: '13%' }}
                  className="bg-[#b45309] h-full"
                  title="Off-The-Shelf BOM ($20.60)"
                />
                <div
                  style={{ width: '83%' }}
                  className="bg-[#c84b31]/35 h-full"
                  title="Brand Markup Saved ($124.15)"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#3b2410]">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#6e5a26]" />
                  $4.25 Printed PETG (3%)
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#b45309]" />
                  $20.60 Off-the-Shelf Hardware (14%)
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#c84b31]" />
                  $124.15 Retail Markup Saved (83%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          4. SKETCH -> REALITY 3D EXPLODED VIEW
      ===================================================================== */}
      <section
        id="exploded-view"
        ref={explodeSectionRef}
        className="rounded-3xl codex-folio p-6 sm:p-8 space-y-6"
      >
        <div id="exploded-story" className="-mt-4" />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-[0.18em] text-[#d4af37]">
              <Layers className="h-4 w-4" />
              4. INTERACTIVE SKETCH-TO-REALITY 3D EXPLODED VIEW
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#f5ebd6]">
              From Concept Sketch{' '}
              <span className="italic font-normal text-[#f3d478]">
                to 3D-Printed Reality.
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-[#e6d3b3] max-w-2xl leading-relaxed">
              As you scroll through this section, watch the assembly transition
              from a{' '}
              <strong className="text-[#f5ebd6]">
                sepia pen-and-ink technical sketch on parchment
              </strong>{' '}
              into{' '}
              <strong className="text-[#f5ebd6]">
                watertight bronze-gilded PETG and burnished brass hardware
              </strong>
              —exploding along its `[x, y, z]` assembly axis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 font-codex text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/40 bg-[#e6d3b3]/15 px-3 py-1.5 text-[#f3d478]">
              <span className="h-2 w-2 rounded-full bg-[#e6d3b3]" />
              Sepia Ink Sketch
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#b89b4a]/45 bg-[#b89b4a]/15 px-3 py-1.5 text-[#f3d478]">
              <span className="h-2 w-2 rounded-full bg-[#b89b4a]" />
              3D-Printed PETG
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/10 px-3 py-1.5 text-[#f3d478]">
              <span className="h-2 w-2 rounded-full bg-[#d4af37]" />
              Off-the-Shelf BOM
            </span>
          </div>
        </div>

        <ScrollExplodeScene scrollFactor={scrollExplodeFactor} />
      </section>

      {/* =====================================================================
          5. SAMPLE DIY BUILDS & PRESETS GALLERY
      ===================================================================== */}
      <section id="sample-builds" className="space-y-6">
        <div id="showcase-gallery" className="-mt-4" />
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1.5">
            <div className="font-codex text-xs font-bold uppercase tracking-[0.18em] text-[#d4af37]">
              5. SAMPLE DIY BUILDS &amp; PRESETS
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#f5ebd6]">
              Explore Ready-to-Print{' '}
              <span className="italic font-normal text-[#f3d478]">
                Sample Builds
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-[#e6d3b3]">
              Select any build below to inspect its bill of materials,
              plate-packed STLs &amp; 3MFs, exploded 3D view, and IKEA-style
              animated assembly guide.
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
                className="spotlight-card group flex flex-col justify-between rounded-2xl codex-folio p-5 text-left hover:border-[#f3d478]/70 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-[#d4af37]/15 px-2.5 py-0.5 font-codex text-[10px] font-bold text-[#f3d478] border border-[#d4af37]/40">
                      {item.badge} · {item.savings} ({item.savingsPct})
                    </span>
                    {isReadySample && (
                      <span className="rounded-md bg-[#b89b4a]/20 px-2 py-0.5 font-codex text-[10px] font-semibold text-[#f3d478] border border-[#b89b4a]/40">
                        Instant Demo
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-[10px] tracking-wider text-[#bda782]">
                    {item.category}
                  </div>

                  <div>
                    <h3 className="font-display text-xl font-bold text-[#f5ebd6] group-hover:text-[#f3d478] transition-colors">
                      {item.title}
                    </h3>
                    <div className="font-display italic text-xs text-[#d4af37]">
                      “{item.latinTitle}”
                    </div>
                  </div>

                  <p className="text-xs text-[#e6d3b3]/90 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-5 space-y-3 border-t border-[#d4af37]/20 pt-3">
                  <div className="font-mono text-[10px] text-[#bda782]">
                    {item.partsSpec}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-mono tabular-nums">
                      <span className="text-[#bda782] line-through mr-1.5">
                        {item.retail}
                      </span>
                      <span className="font-bold text-[#f3d478]">
                        {item.diy} DIY
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-codex text-[11px] font-bold text-[#f5ebd6] group-hover:text-[#f3d478]">
                      Open Build <ArrowRight className="h-3.5 w-3.5" />
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
          FOOTER CTA
      ===================================================================== */}
      <footer className="relative overflow-hidden rounded-3xl gilded-frame bg-gradient-to-r from-[#14100b] via-[#1f170e] to-[#14100b] p-8 sm:p-10">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="font-codex text-xs font-bold uppercase tracking-[0.2em] text-[#f3d478]">
              GET ME AN ALT // POWERED BY GEMINI 4 ARGON
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#f5ebd6]">
              Ready to turn any gadget into a 3D-printable DIY build?
            </h2>
            <p className="text-xs sm:text-sm text-[#e6d3b3]">
              Paste any product link above or explore our flagship Smart Plant
              Auto-Waterer build with self-healing OpenSCAD STLs, Bambu 3MF
              plates, and animated 3D assembly instructions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="#hero-command"
              className="inline-flex items-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-5 py-3 font-codex text-xs font-bold text-[#f5ebd6] hover:border-[#f3d478] transition-colors"
            >
              Paste a Product Link
            </a>
            <Link
              href="/projects/plant-auto-waterer"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] px-6 py-3 font-codex text-xs font-bold text-[#140e07] shadow-electric hover:brightness-110 transition-all"
            >
              Open Live Demo Project <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
