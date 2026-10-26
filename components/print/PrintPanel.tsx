'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  FileBox,
  Layers,
  MapPin,
  Package,
  Printer as PrinterIcon,
  RotateCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  DEFAULT_PRINTER_ID,
  getPrinterById,
  getPrintersByBrand,
  PRINTERS,
  Printer,
} from '@/lib/printers';
import { createStoreZip } from '@/lib/cad/stl';
import {
  estimateFromVolumeAndSurfaceArea,
  estimatePlatePrint,
  formatPrintDuration,
  SPEED_CLASS_PROFILES,
} from '@/lib/cad/estimate';
import { generateCadBundle } from '@/lib/cad/adapters';
import { packParts } from '@/lib/cad/packer';
import type { DesignSpec, PlatesData } from '@/lib/types';

export interface PrintPanelProps {
  plates?: PlatesData | Record<string, any>;
  design?: DesignSpec | Record<string, any>;
  projectId?: string;
}

interface PrintServiceOption {
  id: 'craftcloud' | 'jlc3dp' | 'xometry' | 'shapeways';
  name: string;
  badgeText: string;
  badgeBg: string;
  badgeBorder: string;
  tagline: string;
  leadTime: string;
  baseFeeUsd: number;
  ratePerGramUsd: number;
  shippingUsd: number;
  uploadUrl: string;
}

const RENAISSANCE_PART_PALETTE = [
  '#d4af37', // Gilded Gold
  '#b89b4a', // Antique Bronze
  '#c87d4b', // Burnished Terracotta
  '#9c7a4c', // Sepia Brass
  '#e6c365', // Florentine Ochre
  '#c84b31', // Venetian Oxblood
  '#a67c52', // Warm Umber
  '#d4bc94', // Deep Vellum
];

const WARM_RENAISSANCE_HEX = new Set([
  '#d4af37',
  '#f3d478',
  '#b89b4a',
  '#c87d4b',
  '#9c7a4c',
  '#e6c365',
  '#c84b31',
  '#a67c52',
  '#d4bc94',
  '#e6d3b3',
  '#f5ebd6',
  '#bda782',
  '#8c6218',
  '#b87333',
  '#b8860b',
  '#6e5a26',
  '#b45309',
  '#5c3a1d',
  '#3a2c1d',
  '#282016',
  '#1d1710',
  '#14100b',
  '#0c0906',
]);

function toRenaissancePartColor(rawColor?: string, idx = 0): string {
  const clean = (rawColor || '').trim().toLowerCase();
  if (!clean || !WARM_RENAISSANCE_HEX.has(clean)) {
    return RENAISSANCE_PART_PALETTE[idx % RENAISSANCE_PART_PALETTE.length];
  }
  return rawColor!;
}

const PRINT_SERVICES: PrintServiceOption[] = [
  {
    id: 'craftcloud',
    name: 'Craftcloud',
    badgeText: 'CRAFTCLOUD',
    badgeBg: 'bg-[#d4af37]/15 text-[#f3d478]',
    badgeBorder: 'border-[#d4af37]/45',
    tagline: 'All3DP marketplace · Compares 150+ local & global print bureaus',
    leadTime: '4–6 business days',
    baseFeeUsd: 4.5,
    ratePerGramUsd: 0.055,
    shippingUsd: 5.95,
    uploadUrl: 'https://craftcloud3d.com/upload',
  },
  {
    id: 'jlc3dp',
    name: 'JLC3DP',
    badgeText: 'JLC3DP',
    badgeBg: 'bg-[#b89b4a]/15 text-[#f3d478]',
    badgeBorder: 'border-[#b89b4a]/45',
    tagline: 'Factory-direct industrial FDM / SLA / MJF · Lowest per-gram cost',
    leadTime: '5–8 business days',
    baseFeeUsd: 2.0,
    ratePerGramUsd: 0.032,
    shippingUsd: 6.5,
    uploadUrl: 'https://jlc3dp.com/3d-printing-quote',
  },
  {
    id: 'xometry',
    name: 'Xometry',
    badgeText: 'XOMETRY',
    badgeBg: 'bg-[#9c7a4c]/20 text-[#e6d3b3]',
    badgeBorder: 'border-[#9c7a4c]/45',
    tagline: 'ISO-9001 domestic manufacturing · Dimensional inspection available',
    leadTime: '2–4 business days',
    baseFeeUsd: 11.0,
    ratePerGramUsd: 0.095,
    shippingUsd: 7.9,
    uploadUrl: 'https://www.xometry.com/quoting/home/',
  },
  {
    id: 'shapeways',
    name: 'Shapeways',
    badgeText: 'SHAPEWAYS',
    badgeBg: 'bg-[#c84b31]/15 text-[#f3d478]',
    badgeBorder: 'border-[#c84b31]/40',
    tagline: 'Precision additive manufacturing · Multi-Jet Fusion & SLS Nylon',
    leadTime: '4–7 business days',
    baseFeeUsd: 7.5,
    ratePerGramUsd: 0.075,
    shippingUsd: 6.95,
    uploadUrl: 'https://www.shapeways.com/upload',
  },
];

const SERVICE_MATERIALS = [
  {
    id: 'pla',
    name: 'PLA+ (1.24 g/cm³)',
    note: 'Rigid, high dimensional accuracy, everyday enclosures',
    multiplier: 1.0,
  },
  {
    id: 'petg',
    name: 'PETG (Watertight / Mechanical)',
    note: 'Chemical & moisture resistant, ideal for fluid parts & clips',
    multiplier: 1.15,
  },
  {
    id: 'abs-asa',
    name: 'ASA / ABS (UV & Heat Resistant)',
    note: 'Outdoor & high-temperature functional durability up to 95°C',
    multiplier: 1.28,
  },
  {
    id: 'nylon-pa12',
    name: 'SLS Nylon PA12 (Powder Bed)',
    note: 'Isotropic industrial strength, zero layer lines',
    multiplier: 1.75,
  },
  {
    id: 'tough-resin',
    name: 'Engineering Tough Resin (SLA)',
    note: '50 µm smooth surface finish for tight-tolerance gears & threads',
    multiplier: 1.6,
  },
];

const SERVICE_COLORS = [
  { id: 'charcoal', name: 'Florentine Iron Ink', hex: '#282016' },
  { id: 'vellum', name: 'Warm Vellum Ivory', hex: '#f5ebd6' },
  { id: 'bronze', name: 'Antique Bronze', hex: '#b89b4a' },
  { id: 'cobalt', name: 'Burnished Gold', hex: '#d4af37' },
  { id: 'ochre', name: 'Gilded Ochre', hex: '#e6c365' },
  { id: 'natural', name: 'Aged Parchment', hex: '#d4bc94' },
];

function resolveOptionalPlatePreview(): React.ComponentType<any> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (require as any).context(
      '../../components',
      true,
      /PlatePreview\.(tsx|jsx)$/
    );
    const keys: string[] = ctx.keys();
    if (keys.length > 0) {
      const mod = ctx(keys[0]);
      return mod?.PlatePreview || mod?.default || null;
    }
  } catch {
    // Optional three.js PlatePreview not present in this branch
  }
  return null;
}

function triggerBrowserDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/octet-stream'
) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export function PrintPanel({
  plates: initialPlates,
  design,
  projectId = 'plant-auto-waterer',
}: PrintPanelProps) {
  const printersByBrand = useMemo(() => getPrintersByBrand(), []);
  const initialPrinterId =
    (initialPlates as any)?.printerId &&
    PRINTERS.some((p) => p.id === (initialPlates as any).printerId)
      ? (initialPlates as any).printerId
      : DEFAULT_PRINTER_ID;

  const [selectedPrinterId, setSelectedPrinterId] =
    useState<string>(initialPrinterId);
  const [selectedPlateIdx, setSelectedPlateIdx] = useState<number>(0);
  const [hoveredPlacementIdx, setHoveredPlacementIdx] = useState<number | null>(
    null
  );
  const [previewMode, setPreviewMode] = useState<'svg' | '3d'>('svg');

  // Print Service ("No printer?") state
  const [selectedServiceId, setSelectedServiceId] =
    useState<PrintServiceOption['id']>('craftcloud');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('petg');
  const [selectedColorId, setSelectedColorId] = useState<string>('cobalt');
  const [orderQuantity, setOrderQuantity] = useState<number>(1);
  const [recipientName, setRecipientName] = useState<string>('Alex Rivera');
  const [streetAddress, setStreetAddress] = useState<string>(
    '548 Market St, Suite 310'
  );
  const [city, setCity] = useState<string>('San Francisco');
  const [stateCode, setStateCode] = useState<string>('CA');
  const [postalCode, setPostalCode] = useState<string>('94104');
  const [country, setCountry] = useState<string>('United States');
  const [handoffStatus, setHandoffStatus] = useState<string | null>(null);

  const OptionalThreePlatePreview = useMemo(
    () => resolveOptionalPlatePreview(),
    []
  );

  const selectedPrinter: Printer = useMemo(
    () => getPrinterById(selectedPrinterId),
    [selectedPrinterId]
  );

  // Client-side CAD mesh generation + min-plate bin packing + volume/surface-area estimation
  const liveBundle = useMemo(() => {
    try {
      const hasDesignParts =
        design &&
        ((Array.isArray((design as any).parts) &&
          (design as any).parts.length > 0) ||
          (Array.isArray((design as any).printedParts) &&
            (design as any).printedParts.length > 0));

      if (hasDesignParts) {
        return generateCadBundle(design, {
          printerId: selectedPrinterId,
          objectId: projectId,
        });
      }

      // Fallback if only plates.parts metadata was passed without full design.json
      const fallbackParts = Array.isArray((initialPlates as any)?.parts)
        ? (initialPlates as any).parts
        : [];
      if (fallbackParts.length > 0) {
        const syntheticDesign = {
          objectName: projectId,
          parts: fallbackParts.map((p: any, idx: number) => ({
            id: p.partId || `part-${idx + 1}`,
            name: p.name || `Printed Part ${idx + 1}`,
            kind: 'printed',
            shape: p.shape || 'box',
            dims_mm: p.dims_mm || [50, 50, 25],
            params: {
              width: p.dims_mm?.[0] ?? 50,
              depth: p.dims_mm?.[1] ?? 50,
              height: p.dims_mm?.[2] ?? 25,
            },
            color: toRenaissancePartColor(p.color, idx),
            material: p.material || 'PLA',
            quantity: p.quantity || 1,
          })),
        };
        return generateCadBundle(syntheticDesign, {
          printerId: selectedPrinterId,
          objectId: projectId,
        });
      }
    } catch {
      // Fallback handled below
    }
    return null;
  }, [design, initialPlates, selectedPrinterId, projectId]);

  // Direct client-side re-pack fallback if liveBundle is null
  const repackedView = useMemo(() => {
    if (liveBundle) {
      return {
        platesJson: liveBundle.platesJson,
        stlArtifacts: liveBundle.stlArtifacts,
        plate3mfArtifacts: liveBundle.plate3mfArtifacts,
        multiPlate3mfArtifact: liveBundle.multiPlate3mfArtifact,
      };
    }

    const rawParts = Array.isArray((initialPlates as any)?.parts)
      ? (initialPlates as any).parts
      : [];
    const packInputs = rawParts.map((p: any) => ({
      partId: p.partId,
      name: p.name,
      width: p.dims_mm?.[0] ?? 40,
      depth: p.dims_mm?.[1] ?? 40,
      height: p.dims_mm?.[2] ?? 20,
      quantity: p.quantity ?? 1,
    }));

    const packed = packParts(packInputs, selectedPrinter.bed, {
      margin: 5,
      spacing: 5,
      allowRotation: true,
    });

    const partById = new Map(rawParts.map((p: any) => [p.partId, p]));
    const computedPlates = packed.plates.map((pl) => {
      const plateNumber = pl.index + 1;
      const itemEstimates = pl.items.map((item) => {
        const rawP: any = partById.get(item.partId) || {};
        const w = item.width;
        const d = item.depth;
        const h = item.height;
        const vol = rawP.volumeMm3 || w * d * h * 0.42;
        const area = rawP.surfaceAreaMm2 || 2 * (w * d + w * h + d * h);
        const est = estimateFromVolumeAndSurfaceArea(vol, area, h, {
          printer: selectedPrinter,
        });
        return { item, rawP, est };
      });

      const plateEst = estimatePlatePrint(
        itemEstimates.map((e) => ({
          estimate: e.est,
          heightMm: e.item.height,
          count: 1,
        })),
        { printer: selectedPrinter }
      );

      const placements = itemEstimates.map(({ item, rawP, est }, idx) => ({
        partId: item.partId,
        name: rawP.name || item.partId,
        copyIndex: item.copy,
        copy: item.copy,
        x: item.x,
        y: item.y,
        centerX: item.centerX,
        centerY: item.centerY,
        width: item.width,
        depth: item.depth,
        height: item.height,
        rotated: item.rotated,
        color: toRenaissancePartColor(rawP.color, idx),
        stlFile: rawP.stlFile || `parts/${item.partId}.stl`,
        weightGrams: est.filamentGrams,
        estimatedMinutes: est.printTimeMinutes,
      }));

      return {
        plateNumber,
        index: pl.index,
        name: `Plate ${plateNumber} — ${selectedPrinter.name} (${placements.length} items)`,
        printerId: selectedPrinter.id,
        printerName: `${selectedPrinter.name} (${selectedPrinter.bed.x}×${selectedPrinter.bed.y}×${selectedPrinter.bed.z} mm)`,
        bedDimensionsMm: [
          selectedPrinter.bed.x,
          selectedPrinter.bed.y,
          selectedPrinter.bed.z,
        ] as [number, number, number],
        utilizationPercent: Math.round(pl.utilization * 1000) / 10,
        utilization: pl.utilization,
        maxHeight: pl.maxHeight,
        estimatedMinutes: plateEst.printTimeMinutes,
        printTimeMinutes: plateEst.printTimeMinutes,
        formattedTime: plateEst.formattedTime,
        weightGrams: plateEst.filamentGrams,
        filamentGrams: plateEst.filamentGrams,
        filamentMeters: plateEst.filamentMeters,
        layers: plateEst.layers,
        file: `parts/plate-${plateNumber}.3mf`,
        stlFile: `parts/plate-${plateNumber}.3mf`,
        bytes: 0,
        placements,
        items: placements,
      };
    });

    const totalWeightGrams =
      Math.round(
        computedPlates.reduce((acc, p) => acc + p.weightGrams, 0) * 10
      ) / 10;
    const totalPrintTimeMinutes = Math.round(
      computedPlates.reduce((acc, p) => acc + p.estimatedMinutes, 0)
    );

    return {
      platesJson: {
        objectId: projectId,
        printerId: selectedPrinter.id,
        printerName: `${selectedPrinter.name} (${selectedPrinter.bed.x}×${selectedPrinter.bed.y}×${selectedPrinter.bed.z} mm)`,
        bedDimensionsMm: [
          selectedPrinter.bed.x,
          selectedPrinter.bed.y,
          selectedPrinter.bed.z,
        ] as [number, number, number],
        totalPlates: computedPlates.length,
        totalUniqueParts: rawParts.length,
        totalPrintedItems: computedPlates.reduce(
          (acc, p) => acc + p.placements.length,
          0
        ),
        totalWeightGrams,
        totalFilamentGrams: totalWeightGrams,
        totalFilamentMeters:
          Math.round((totalWeightGrams / 2.98) * 100) / 100,
        totalPrintTimeMinutes,
        formattedTotalPrintTime: formatPrintDuration(totalPrintTimeMinutes),
        multiPlate3mfFile: 'parts/all-plates.3mf',
        multiPlate3mfBytes: 0,
        printer: selectedPrinter,
        margin: packed.margin,
        spacing: packed.spacing,
        heuristicUsed: packed.heuristicUsed,
        parts: rawParts,
        partFiles: rawParts,
        plates: computedPlates,
        rejected: packed.rejected,
      },
      stlArtifacts: [],
      plate3mfArtifacts: [],
      multiPlate3mfArtifact: null,
    };
  }, [liveBundle, initialPlates, selectedPrinter, projectId]);

  const {
    platesJson,
    stlArtifacts,
    plate3mfArtifacts,
    multiPlate3mfArtifact,
  } = repackedView;

  const safePlateIdx = Math.min(
    selectedPlateIdx,
    Math.max(0, platesJson.plates.length - 1)
  );
  const activePlate = platesJson.plates[safePlateIdx] || platesJson.plates[0];

  const stlMap = useMemo(
    () => new Map(stlArtifacts.map((a) => [a.partId, a])),
    [stlArtifacts]
  );

  const handlePrinterChange = (newPrinterId: string) => {
    setSelectedPrinterId(newPrinterId);
    setSelectedPlateIdx(0);
    setHoveredPlacementIdx(null);
  };

  const handleDownloadPartStl = (partId: string, fallbackStlFile?: string) => {
    const art = stlMap.get(partId);
    if (art && art.bytes.byteLength > 0) {
      triggerBrowserDownload(art.bytes, art.fileName, 'model/stl');
      return;
    }
    const fileBase =
      fallbackStlFile?.split('/').pop() || `${partId}.stl`;
    window.open(`/api/objects/${projectId}/stl/${fileBase}`, '_blank');
  };

  const handleDownloadPlate3mf = (plateNumber: number) => {
    const art = plate3mfArtifacts.find((p) => p.plateNumber === plateNumber);
    if (art && art.bytes.byteLength > 0) {
      triggerBrowserDownload(
        art.bytes,
        `${projectId}-${selectedPrinter.id}-plate-${plateNumber}.3mf`,
        'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
      );
      return;
    }
    window.open(
      `/api/objects/${projectId}/stl/plate-${plateNumber}.3mf`,
      '_blank'
    );
  };

  const handleDownloadMultiPlate3mf = () => {
    if (multiPlate3mfArtifact && multiPlate3mfArtifact.bytes.byteLength > 0) {
      triggerBrowserDownload(
        multiPlate3mfArtifact.bytes,
        `${projectId}-${selectedPrinter.id}-all-${platesJson.totalPlates}-plates.3mf`,
        'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
      );
      return;
    }
    window.open(`/api/objects/${projectId}/stl/all-plates.3mf`, '_blank');
  };

  const handleDownloadAllZip = () => {
    const zipEntries: Array<{ path: string; data: string | Uint8Array }> = [
      {
        path: 'plates.json',
        data: JSON.stringify(platesJson, null, 2),
      },
    ];

    for (const stl of stlArtifacts) {
      zipEntries.push({
        path: stl.stlFile,
        data: stl.bytes,
      });
    }

    for (const p3mf of plate3mfArtifacts) {
      zipEntries.push({
        path: p3mf.relativePath,
        data: p3mf.bytes,
      });
    }

    if (multiPlate3mfArtifact) {
      zipEntries.push({
        path: multiPlate3mfArtifact.relativePath,
        data: multiPlate3mfArtifact.bytes,
      });
    }

    const zipBytes = createStoreZip(zipEntries);
    triggerBrowserDownload(
      zipBytes,
      `${projectId}-${selectedPrinter.id}-print-files.zip`,
      'application/zip'
    );
  };

  // Quote calculation for "No printer? Get it printed & delivered"
  const activeService =
    PRINT_SERVICES.find((s) => s.id === selectedServiceId) || PRINT_SERVICES[0];
  const activeMaterial =
    SERVICE_MATERIALS.find((m) => m.id === selectedMaterialId) ||
    SERVICE_MATERIALS[0];
  const activeColor =
    SERVICE_COLORS.find((c) => c.id === selectedColorId) || SERVICE_COLORS[0];

  const computeServiceQuote = (service: PrintServiceOption) => {
    const grams = Math.max(10, platesJson.totalWeightGrams || 180);
    const qty = Math.max(1, orderQuantity);
    const unitPrintCost =
      service.baseFeeUsd +
      grams * service.ratePerGramUsd * activeMaterial.multiplier;
    const volumeDiscount = qty >= 10 ? 0.85 : qty >= 5 ? 0.92 : 1.0;
    const subtotalParts =
      Math.round(unitPrintCost * qty * volumeDiscount * 100) / 100;
    const shipping = service.shippingUsd;
    const total = Math.round((subtotalParts + shipping) * 100) / 100;
    return {
      grams,
      unitPrintCost: Math.round(unitPrintCost * 100) / 100,
      subtotalParts,
      shipping,
      total,
    };
  };

  const activeQuote = computeServiceQuote(activeService);

  const handleSendToPrintService = () => {
    // Also trigger the ZIP download so the user has the exact STL+3MF bundle ready to drag-and-drop
    handleDownloadAllZip();
    setHandoffStatus(
      `Downloaded ${projectId}-${selectedPrinter.id}-print-files.zip (${platesJson.parts.length} STLs + Bambu 3MF) and opened ${activeService.name} upload portal.`
    );
    window.open(activeService.uploadUrl, '_blank', 'noopener,noreferrer');
  };

  const speedProfile = SPEED_CLASS_PROFILES[selectedPrinter.speedClass];

  // Format data for optional components/three/PlatePreview if toggled
  const threePlatePreviewData = useMemo(() => {
    return {
      printer: selectedPrinter,
      plates: platesJson.plates.map((p) => ({
        index: p.plateNumber,
        utilization: p.utilization,
        items: p.placements.map((item, idx) => ({
          partId: item.partId,
          copy: item.copy,
          x: item.x,
          y: item.y,
          w: item.width,
          h: item.depth,
          rotated: item.rotated,
          color: toRenaissancePartColor(item.color, idx),
        })),
      })),
    };
  }, [selectedPrinter, platesJson]);

  return (
    <div
      className="space-y-6"
      data-testid="print-panel"
    >
      {/* Top Printer Selector & Live Re-Pack Header */}
      <div className="rounded-2xl codex-folio p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-1 font-codex text-[11px] font-bold uppercase tracking-wider text-[#f3d478]">
              <Sparkles className="h-3.5 w-3.5 text-[#f3d478]" />
              Parametric Watertight CAD · Multi-Heuristic MaxRects &amp; Skyline Plate Packer
            </div>
            <h2 className="font-display text-2xl font-bold text-[#faf4e8] sm:text-3xl">
              3D Print Build Plates &amp; Slicer-Ready CAD Package
            </h2>
            <p className="text-xs sm:text-sm text-[#dfd3be] max-w-2xl line-clamp-2">
              Select your 3D printer below to re-pack all{' '}
              <strong className="text-[#faf4e8]">
                {platesJson.totalPrintedItems} printed items ({platesJson.totalUniqueParts} unique STLs)
              </strong>{' '}
              client-side onto the minimum number of build plates and recalculate print time &amp; PLA filament mass.
            </p>
          </div>

          {/* Printer Selector Dropdown + Download All Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1.5">
              <label
                htmlFor="printer-select"
                className="block font-codex text-[11px] font-bold uppercase tracking-wider text-[#dfd3be]"
              >
                Target 3D Printer ({PRINTERS.length} Models)
              </label>
              <div className="relative">
                <select
                  id="printer-select"
                  data-testid="printer-select"
                  value={selectedPrinterId}
                  onChange={(e) => handlePrinterChange(e.target.value)}
                  className="w-full sm:w-80 min-h-[44px] rounded-xl border border-[#d4af37]/35 bg-[#0c0906] px-3.5 py-2.5 font-mono text-xs font-bold text-[#faf4e8] shadow-inner focus:border-[#f3d478] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                >
                  {printersByBrand.map((group) => (
                    <optgroup key={group.brand} label={group.brand}>
                      {group.printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.bed.x}×{p.bed.y}×{p.bed.z}mm
                          {p.multiColor ? ' · AMS/Multi' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="download-bambu-3mf"
                onClick={handleDownloadMultiPlate3mf}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#d4af37]/45 bg-[#d4af37]/15 px-3.5 py-2.5 font-codex text-xs font-bold text-[#f3d478] hover:bg-[#d4af37]/25 transition-all"
                title="Single Bambu Studio / OrcaSlicer .3mf file containing all packed plates with plate metadata"
              >
                <FileBox className="h-4 w-4 text-[#f3d478]" />
                Bambu All-Plates (.3mf)
              </button>

              <button
                type="button"
                data-testid="download-all-zip"
                onClick={handleDownloadAllZip}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] px-4 py-2.5 font-codex text-xs font-bold text-[#140e07] shadow-electric hover:brightness-110 transition-all"
              >
                <Archive className="h-4 w-4" />
                Download All (.zip)
              </button>
            </div>
          </div>
        </div>

        {/* 4 Key Print Metrics Bar */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5">
            <div className="flex items-center justify-between font-codex text-[11px] uppercase tracking-wider text-[#bda782]">
              <span>Packed Build Plates</span>
              <Layers className="h-4 w-4 text-[#f3d478]" />
            </div>
            <div
              className="mt-1 flex items-baseline gap-2"
              data-testid="packed-plate-count"
            >
              <span className="font-display text-2xl font-bold text-[#f5ebd6]">
                {platesJson.totalPlates}{' '}
                {platesJson.totalPlates === 1 ? 'Plate' : 'Plates'}
              </span>
              <span className="text-xs font-mono text-[#d4af37]">
                min-plate optimal
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#bda782]">
              Bed: {selectedPrinter.bed.x}×{selectedPrinter.bed.y}×
              {selectedPrinter.bed.z} mm ({platesJson.margin}mm margin)
            </div>
          </div>

          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5">
            <div className="flex items-center justify-between font-codex text-[11px] uppercase tracking-wider text-[#bda782]">
              <span>Est. Total Print Time</span>
              <Clock className="h-4 w-4 text-[#d4af37]" />
            </div>
            <div
              className="mt-1 flex items-baseline gap-2"
              data-testid="total-print-time"
            >
              <span className="font-display text-2xl font-bold text-[#f5ebd6]">
                {platesJson.formattedTotalPrintTime ||
                  formatPrintDuration(platesJson.totalPrintTimeMinutes)}
              </span>
              <span className="text-xs font-mono text-[#bda782]">
                ({platesJson.totalPrintTimeMinutes} min)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#bda782]">
              {speedProfile.label} · 0.20mm layer
            </div>
          </div>

          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5">
            <div className="flex items-center justify-between font-codex text-[11px] uppercase tracking-wider text-[#bda782]">
              <span>Total Filament Estimate</span>
              <Scale className="h-4 w-4 text-[#b89b4a]" />
            </div>
            <div
              className="mt-1 flex items-baseline gap-2"
              data-testid="total-filament-grams"
            >
              <span className="font-display text-2xl font-bold text-[#f3d478]">
                {platesJson.totalWeightGrams}g
              </span>
              <span className="text-xs font-mono text-[#bda782]">
                (~{platesJson.totalFilamentMeters}m · $
                {((platesJson.totalWeightGrams / 1000) * 19.5).toFixed(2)} spool)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#bda782]">
              PLA 1.24 g/cm³ · 15% infill · 2 walls (0.4mm)
            </div>
          </div>

          <div className="rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-3.5">
            <div className="flex items-center justify-between font-codex text-[11px] uppercase tracking-wider text-[#bda782]">
              <span>Mesh &amp; Slicer Readiness</span>
              <ShieldCheck className="h-4 w-4 text-[#b89b4a]" />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-bold text-[#f5ebd6]">
                100% Manifold
              </span>
              <span className="rounded border border-[#b89b4a]/45 bg-[#b89b4a]/15 px-1.5 py-0.5 font-codex text-[10px] font-bold text-[#f3d478]">
                ZERO SUPPORTS
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[#bda782] truncate">
              Packer: {platesJson.heuristicUsed}
            </div>
          </div>
        </div>

        {/* Oversized / Rejected Parts Warning (if user selects a tiny bed for a large part) */}
        {platesJson.rejected && platesJson.rejected.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#c84b31]/50 bg-[#2a0f0a]/60 p-4 text-xs text-[#f5ebd6] space-y-2">
            <div className="flex items-center gap-2 font-codex font-bold text-[#f3d478]">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#c84b31]" />
              <span>
                {platesJson.rejected.length} part(s) exceed {selectedPrinter.name}{' '}
                build volume ({selectedPrinter.bed.x}×{selectedPrinter.bed.y}×
                {selectedPrinter.bed.z} mm)
              </span>
            </div>
            <ul className="space-y-1 pl-6 list-disc text-[#e6d3b3]">
              {platesJson.rejected.map((rej) => (
                <li key={rej.partId}>
                  <strong className="text-[#f5ebd6]">{rej.name || rej.partId}</strong> ({rej.width}×
                  {rej.depth}×{rej.height} mm): {rej.reasons.join(' ')}{' '}
                  <span className="text-[#f3d478]">{rej.suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Interactive Build Plate Preview + Packed Plates Cards */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left 7 Cols: Interactive Top-Down SVG Slicer Bed (or 3D PlatePreview) */}
        <div className="lg:col-span-7 rounded-2xl codex-folio p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#d4af37]/15 border border-[#d4af37]/40 px-2 py-0.5 font-codex text-xs font-bold text-[#f3d478]">
                  PLATE {activePlate?.plateNumber || 1} OF{' '}
                  {platesJson.totalPlates}
                </span>
                <h3 className="font-display text-lg font-bold text-[#f5ebd6]">
                  {selectedPrinter.name} Build Plate Layout
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-[#bda782]">
                Bed {selectedPrinter.bed.x} × {selectedPrinter.bed.y} mm ·{' '}
                {activePlate?.placements.length || 0} placed parts ·{' '}
                {activePlate?.utilizationPercent || 0}% footprint utilization
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Plate Switcher Pills when multiple plates exist */}
              {platesJson.plates.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#d4af37]/25 bg-[#0c0906] p-1">
                  {platesJson.plates.map((pl, idx) => (
                    <button
                      key={pl.plateNumber}
                      type="button"
                      onClick={() => setSelectedPlateIdx(idx)}
                      className={`inline-flex min-h-[44px] items-center rounded-lg px-2.5 py-1.5 font-codex text-xs font-bold transition-all ${
                        idx === safePlateIdx
                          ? 'bg-[#d4af37] text-[#140e07]'
                          : 'text-[#bda782] hover:text-[#f5ebd6]'
                      }`}
                    >
                      Plate {pl.plateNumber}
                    </button>
                  ))}
                </div>
              )}

              {OptionalThreePlatePreview && (
                <div className="flex items-center gap-1 rounded-xl border border-[#d4af37]/25 bg-[#0c0906] p-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('svg')}
                    className={`inline-flex min-h-[44px] items-center rounded-lg px-2.5 py-1.5 font-codex text-[11px] font-bold ${
                      previewMode === 'svg'
                        ? 'bg-[#d4af37] text-[#140e07]'
                        : 'text-[#bda782] hover:text-[#f5ebd6]'
                    }`}
                  >
                    2D Slicer Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('3d')}
                    className={`inline-flex min-h-[44px] items-center rounded-lg px-2.5 py-1.5 font-codex text-[11px] font-bold ${
                      previewMode === '3d'
                        ? 'bg-[#d4af37] text-[#140e07]'
                        : 'text-[#bda782] hover:text-[#f5ebd6]'
                    }`}
                  >
                    3D Bed View
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Plate Viewer Canvas */}
          {previewMode === '3d' && OptionalThreePlatePreview ? (
            <div className="min-h-[380px] rounded-xl border border-[#d4af37]/30 bg-[#0c0906] overflow-hidden">
              <OptionalThreePlatePreview
                plates={threePlatePreviewData}
                design={design}
                initialPlateIndex={safePlateIdx}
                initialViewMode="3d"
              />
            </div>
          ) : (
            <div className="relative flex flex-col items-center justify-center rounded-xl border border-[#d4af37]/30 bg-[#0c0906] p-4">
              {activePlate && (
                <svg
                  viewBox={`-14 -14 ${selectedPrinter.bed.x + 28} ${
                    selectedPrinter.bed.y + 32
                  }`}
                  className="w-full max-w-[430px] aspect-square select-none"
                  data-testid="plate-svg-preview"
                >
                  <defs>
                    <pattern
                      id="slicer-minor-grid"
                      width="10"
                      height="10"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 10 0 L 0 0 0 10"
                        fill="none"
                        stroke="#282016"
                        strokeWidth="0.35"
                      />
                    </pattern>
                    <pattern
                      id="slicer-major-grid"
                      width="50"
                      height="50"
                      patternUnits="userSpaceOnUse"
                    >
                      <rect
                        width="50"
                        height="50"
                        fill="url(#slicer-minor-grid)"
                      />
                      <path
                        d="M 50 0 L 0 0 0 50"
                        fill="none"
                        stroke="#3a2c1d"
                        strokeWidth="0.7"
                      />
                    </pattern>
                  </defs>

                  {/* Outer PEI Textured Build Plate */}
                  <rect
                    x={0}
                    y={0}
                    width={selectedPrinter.bed.x}
                    height={selectedPrinter.bed.y}
                    rx={8}
                    ry={8}
                    fill="#14100b"
                    stroke="#9c7a4c"
                    strokeWidth={1.5}
                  />

                  {/* Slicer Coordinate Grid */}
                  <rect
                    x={0}
                    y={0}
                    width={selectedPrinter.bed.x}
                    height={selectedPrinter.bed.y}
                    rx={8}
                    ry={8}
                    fill="url(#slicer-major-grid)"
                  />

                  {/* Keep-out 5mm Margin Perimeter */}
                  <rect
                    x={platesJson.margin}
                    y={platesJson.margin}
                    width={selectedPrinter.bed.x - platesJson.margin * 2}
                    height={selectedPrinter.bed.y - platesJson.margin * 2}
                    fill="none"
                    stroke="#d4af37"
                    strokeOpacity={0.4}
                    strokeWidth={0.8}
                    strokeDasharray="4 3"
                  />

                  {/* Front Slicer Grab Tab */}
                  <path
                    d={`M ${selectedPrinter.bed.x * 0.34} ${
                      selectedPrinter.bed.y
                    } L ${selectedPrinter.bed.x * 0.66} ${
                      selectedPrinter.bed.y
                    } L ${selectedPrinter.bed.x * 0.63} ${
                      selectedPrinter.bed.y + 11
                    } L ${selectedPrinter.bed.x * 0.37} ${
                      selectedPrinter.bed.y + 11
                    } Z`}
                    fill="#1d1710"
                    stroke="#9c7a4c"
                    strokeWidth={1}
                  />
                  <text
                    x={selectedPrinter.bed.x * 0.5}
                    y={selectedPrinter.bed.y + 8}
                    textAnchor="middle"
                    fill="#bda782"
                    fontSize={5.5}
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    FRONT · {selectedPrinter.name.toUpperCase()} (
                    {selectedPrinter.bed.x}×{selectedPrinter.bed.y}MM)
                  </text>

                  {/* Origin Axes Indicator (X/Y) */}
                  <line
                    x1={0}
                    y1={selectedPrinter.bed.y}
                    x2={22}
                    y2={selectedPrinter.bed.y}
                    stroke="#c84b31"
                    strokeWidth={1.8}
                  />
                  <line
                    x1={0}
                    y1={selectedPrinter.bed.y}
                    x2={0}
                    y2={selectedPrinter.bed.y - 22}
                    stroke="#d4af37"
                    strokeWidth={1.8}
                  />
                  <circle
                    cx={0}
                    cy={selectedPrinter.bed.y}
                    r={2.5}
                    fill="#f5ebd6"
                  />

                  {/* Packed Part Footprints */}
                  {activePlate.placements.map((item, idx) => {
                    const isHovered = hoveredPlacementIdx === idx;
                    const partFillColor = toRenaissancePartColor(
                      item.color,
                      idx
                    );
                    const svgY =
                      selectedPrinter.bed.y - item.y - item.depth;
                    const minDim = Math.min(item.width, item.depth);
                    const innerW = Math.max(4, item.width - 5);
                    const innerH = Math.max(4, item.depth - 4);
                    const showName = minDim >= 14 && item.width >= 16;
                    const showDims = item.depth >= 24 && item.width >= 28;
                    const clipId = `slicer-part-clip-${safePlateIdx}-${idx}`;

                    const copySuffix =
                      (item.copy ?? 1) > 1 ? ` #${item.copy}` : '';
                    const fullLabel = `${item.name || item.partId}${copySuffix}`;

                    const fontSize = Math.max(
                      3.8,
                      Math.min(
                        7.5,
                        Math.min(
                          innerW * 0.13,
                          innerH * (showDims ? 0.26 : 0.42)
                        )
                      )
                    );
                    const maxLabelChars = Math.max(
                      3,
                      Math.floor(innerW / (fontSize * 0.62))
                    );
                    const displayLabel =
                      fullLabel.length > maxLabelChars
                        ? `${fullLabel
                            .slice(0, Math.max(2, maxLabelChars - 1))
                            .trimEnd()}…`
                        : fullLabel;

                    const fullDimStr = `${Math.round(item.width)}×${Math.round(
                      item.depth
                    )}×${Math.round(item.height)}mm${
                      item.rotated ? ' ↻90°' : ''
                    }`;
                    const shortDimStr = `${Math.round(item.width)}×${Math.round(
                      item.depth
                    )}mm${item.rotated ? ' ↻' : ''}`;
                    const minDimStr = `${Math.round(item.width)}×${Math.round(
                      item.depth
                    )}`;
                    const baseDimFontSize = Math.max(
                      3.4,
                      Math.min(5.8, fontSize * 0.78)
                    );
                    const dimLabel =
                      fullDimStr.length * baseDimFontSize * 0.6 <= innerW
                        ? fullDimStr
                        : shortDimStr.length * baseDimFontSize * 0.6 <= innerW
                        ? shortDimStr
                        : minDimStr;
                    const dimFontSize = Math.min(
                      baseDimFontSize,
                      Math.max(3.2, innerW / Math.max(1, dimLabel.length * 0.62))
                    );

                    const fullTooltip = `${item.name || item.partId}${copySuffix} (${
                      item.partId
                    }) — ${Math.round(item.width)}×${Math.round(
                      item.depth
                    )}×${Math.round(item.height)} mm${
                      item.rotated ? ' · Rotated 90°' : ''
                    }`;

                    return (
                      <g
                        key={`${item.partId}-${item.copy}-${idx}`}
                        onMouseEnter={() => setHoveredPlacementIdx(idx)}
                        onMouseLeave={() => setHoveredPlacementIdx(null)}
                        onClick={() =>
                          handleDownloadPartStl(item.partId, item.stlFile)
                        }
                        className="cursor-pointer transition-opacity"
                      >
                        <title>{fullTooltip}</title>
                        <clipPath id={clipId}>
                          <rect
                            x={item.x + 2}
                            y={svgY + 1.5}
                            width={Math.max(0, item.width - 4)}
                            height={Math.max(0, item.depth - 3)}
                            rx={2}
                          />
                        </clipPath>

                        {/* Skirt / Brim ring */}
                        <rect
                          x={item.x - 1.5}
                          y={svgY - 1.5}
                          width={item.width + 3}
                          height={item.depth + 3}
                          rx={3.5}
                          fill="none"
                          stroke={partFillColor}
                          strokeOpacity={isHovered ? 0.85 : 0.35}
                          strokeWidth={isHovered ? 1.2 : 0.6}
                          strokeDasharray="2 1.5"
                        />

                        {/* Part Footprint Fill */}
                        <rect
                          x={item.x}
                          y={svgY}
                          width={item.width}
                          height={item.depth}
                          rx={2.5}
                          fill={partFillColor}
                          fillOpacity={isHovered ? 0.48 : 0.28}
                          stroke={isHovered ? '#f5ebd6' : partFillColor}
                          strokeWidth={isHovered ? 1.8 : 1.1}
                        />

                        {/* Label inside footprint clipped to box bounds */}
                        {showName && (
                          <g clipPath={`url(#${clipId})`}>
                            <text
                              x={item.x + item.width / 2}
                              y={
                                svgY +
                                item.depth / 2 -
                                (showDims ? dimFontSize * 0.55 : 0)
                              }
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#f5ebd6"
                              fontSize={fontSize}
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              {displayLabel}
                            </text>
                            {showDims && (
                              <text
                                x={item.x + item.width / 2}
                                y={svgY + item.depth / 2 + fontSize * 0.72}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#e6d3b3"
                                fontSize={dimFontSize}
                                fontFamily="monospace"
                              >
                                {dimLabel}
                              </text>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}

              {/* Bottom Hover Inspector Bar */}
              <div className="mt-2 flex w-full items-center justify-between rounded-lg border border-[#d4af37]/25 bg-[#14100b]/95 px-3 py-2 text-xs">
                {hoveredPlacementIdx !== null &&
                activePlate?.placements[hoveredPlacementIdx] ? (
                  (() => {
                    const h = activePlate.placements[hoveredPlacementIdx];
                    const hColor = toRenaissancePartColor(
                      h.color,
                      hoveredPlacementIdx
                    );
                    return (
                      <div className="flex flex-wrap items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: hColor }}
                          />
                          <span className="font-display font-bold text-[#f5ebd6]">
                            {h.name}
                          </span>
                          <span className="font-mono text-[#bda782]">
                            (copy #{h.copy})
                          </span>
                          {h.rotated && (
                            <span className="inline-flex items-center gap-0.5 rounded border border-[#d4af37]/35 bg-[#d4af37]/15 px-1.5 py-0.5 text-[10px] font-mono text-[#f3d478]">
                              <RotateCw className="h-2.5 w-2.5" /> Rotated 90°
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#f3d478]">
                          pos=({h.x}, {h.y})mm · {h.width}×{h.depth}×{h.height}
                          mm · {(h as any).weightGrams ?? ''}g · Click to download STL
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex items-center justify-between w-full text-[11px] text-[#bda782]">
                    <span>
                      Hover any part on the bed to inspect coordinates &amp; mass; click a footprint to download its binary STL.
                    </span>
                    <span className="font-mono text-[#e6d3b3]">
                      Max Z: {activePlate?.maxHeight || 0}mm (
                      {(activePlate as any)?.layers ||
                        Math.ceil((activePlate?.maxHeight || 0) / 0.2)}{' '}
                      layers)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Per-Plate Breakdown & Plate 3MF Downloads */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Packed Build Plates ({platesJson.totalPlates})
              </h3>
              <span className="text-[11px] font-mono text-[#d4af37]">
                5mm bed margin · 5mm part spacing
              </span>
            </div>

            {platesJson.plates.map((plate, idx) => {
              const isSelected = idx === safePlateIdx;
              const formattedTime =
                (plate as any).formattedTime ||
                formatPrintDuration(plate.estimatedMinutes);
              return (
                <div
                  key={plate.plateNumber}
                  onClick={() => setSelectedPlateIdx(idx)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all space-y-3 ${
                    isSelected
                      ? 'border-[#f3d478] bg-[#d4af37]/15 shadow-electric'
                      : 'border-[#d4af37]/25 bg-[#14100b]/85 hover:border-[#d4af37]/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#d4af37] px-2 py-0.5 font-codex text-[11px] font-bold text-[#140e07]">
                          PLATE {plate.plateNumber}
                        </span>
                        <h4 className="font-display text-base font-bold text-[#f5ebd6]">
                          {selectedPrinter.name} ({plate.placements.length}{' '}
                          items)
                        </h4>
                      </div>
                      <p className="mt-1 text-xs text-[#bda782]">
                        Bed {plate.bedDimensionsMm.join('×')} mm · Utilization{' '}
                        <strong className="text-[#f5ebd6]">
                          {plate.utilizationPercent}%
                        </strong>{' '}
                        · Max height {plate.maxHeight} mm
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadPlate3mf(plate.plateNumber);
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#d4af37]/45 bg-[#0c0906] px-3 py-1.5 font-codex text-xs font-bold text-[#f3d478] hover:bg-[#d4af37] hover:text-[#140e07] transition-colors shrink-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      plate-{plate.plateNumber}.3mf
                    </button>
                  </div>

                  {/* Per-Plate Time & Grams Pill Row */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-2.5 text-center">
                    <div>
                      <div className="font-codex text-[10px] uppercase text-[#bda782]">
                        Print Time
                      </div>
                      <div className="text-xs font-extrabold text-[#f5ebd6]">
                        ~{formattedTime}
                      </div>
                    </div>
                    <div className="border-x border-[#d4af37]/20">
                      <div className="font-codex text-[10px] uppercase text-[#bda782]">
                        Filament Mass
                      </div>
                      <div className="text-xs font-extrabold text-[#f3d478]">
                        {plate.weightGrams}g PLA
                      </div>
                    </div>
                    <div>
                      <div className="font-codex text-[10px] uppercase text-[#bda782]">
                        Slicer Layers
                      </div>
                      <div className="text-xs font-extrabold text-[#e6d3b3]">
                        {(plate as any).layers ||
                          Math.ceil(plate.maxHeight / 0.2)}{' '}
                        @ 0.2mm
                      </div>
                    </div>
                  </div>

                  {/* Placed items badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {plate.placements.map((pl, pIdx) => (
                      <span
                        key={`${pl.partId}-${pl.copy}-${pIdx}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/25 bg-[#0c0906] px-2 py-1 text-[11px] text-[#e6d3b3]"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: toRenaissancePartColor(
                              pl.color,
                              pIdx
                            ),
                          }}
                        />
                        <span className="font-medium text-[#f5ebd6]">
                          {pl.name}
                        </span>
                        {(pl.copy ?? 1) > 1 && (
                          <span className="font-mono text-[10px] text-[#bda782]">
                            #{pl.copy}
                          </span>
                        )}
                        {pl.rotated && (
                          <span className="font-mono text-[10px] text-[#f3d478]">
                            ↻90°
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Slicer Profile Summary Box */}
          <div className="rounded-2xl border border-[#d4af37]/25 bg-[#14100b]/90 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between font-codex font-bold text-[#f5ebd6]">
              <span>Recommended Slicer Profile (Bambu Studio / Orca / Prusa)</span>
              <span className="rounded border border-[#b89b4a]/45 bg-[#b89b4a]/15 px-2 py-0.5 font-codex text-[10px] text-[#f3d478]">
                0.20mm STRENGTH
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-[#bda782] pt-1">
              <div>• Nozzle / Line: 0.40 mm (2 walls = 0.8mm)</div>
              <div>• Layer Height: 0.20 mm (4 top/bottom)</div>
              <div>• Sparse Infill: 15% Gyroid / Grid</div>
              <div>• Supports: None required (≤45° chamfers)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Individual Printable STL Parts Grid */}
      <div className="rounded-2xl codex-folio p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-xl font-bold text-[#f5ebd6]">
              Individual Printable Part Meshes (parts/*.stl)
            </h3>
            <p className="text-xs text-[#bda782]">
              Watertight 2-manifold binary STL files with volume + surface-area filament and time estimates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadAllZip}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#d4af37]/35 bg-[#0c0906] px-3 py-1.5 font-codex text-xs font-bold text-[#e6d3b3] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors"
            >
              <Archive className="h-3.5 w-3.5" />
              Download All {platesJson.parts.length} STLs + 3MFs (.zip)
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platesJson.parts.map((part: any, idx: number) => {
            const qty = part.quantity ?? 1;
            const partTimeStr =
              part.formattedTime || formatPrintDuration(part.estimatedMinutes);
            const partDotColor = toRenaissancePartColor(part.color, idx);
            return (
              <div
                key={part.partId}
                className="flex flex-col justify-between rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-4 hover:border-[#d4af37]/55 transition-all space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: partDotColor }}
                      />
                      <span className="truncate font-display text-sm font-bold text-[#f5ebd6]">
                        {part.name}
                      </span>
                    </div>
                    <span className="rounded border border-[#d4af37]/30 bg-[#1d1710] px-2 py-0.5 font-codex text-[10px] font-bold text-[#f3d478] shrink-0">
                      ×{qty}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[#bda782]">
                    <span>
                      {part.dims_mm
                        .map((d: number) => Math.round(d * 10) / 10)
                        .join('×')}{' '}
                      mm
                    </span>
                    <span>·</span>
                    <span className="text-[#f3d478] font-semibold">
                      {part.weightGrams}g
                    </span>
                    <span>·</span>
                    <span className="text-[#e6d3b3]">~{partTimeStr}</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#b5a48b]/75 font-mono pt-0.5">
                    <span>
                      {part.shape || 'parametric'} · {part.material}
                    </span>
                    {part.triangleCount && <span>{part.triangleCount} tris</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#d4af37]/20 pt-2.5">
                  <span className="font-mono text-[10px] text-[#b5a48b]/75 truncate max-w-[140px]">
                    {part.stlFile}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadPartStl(part.partId, part.stlFile)
                    }
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/12 px-3 py-1.5 font-codex text-xs font-bold text-[#f3d478] hover:bg-[#d4af37] hover:text-[#140e07] transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .STL
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* "No printer? Get it printed & delivered" Card */}
      <div
        className="rounded-2xl gilded-frame codex-folio p-6 space-y-6"
        data-testid="no-printer-card"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#d4af37]/25 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              <Truck className="h-4 w-4 text-[#d4af37]" />
              On-Demand 3D Print Bureau Handoff
            </div>
            <h3 className="font-display text-2xl font-bold text-[#f5ebd6]">
              No printer? Get it printed &amp; delivered
            </h3>
            <p className="text-xs text-[#e6d3b3]">
              Instant quote estimate calculated from your{' '}
              <strong className="text-[#f5ebd6]">
                {platesJson.totalWeightGrams}g total filament mass
              </strong>{' '}
              across {platesJson.totalPrintedItems} parts. Select a manufacturing bureau, material, color, and shipping destination:
            </p>
          </div>

          <div className="rounded-2xl border border-[#d4af37]/45 bg-[#d4af37]/15 px-4 py-3 text-right">
            <div className="font-codex text-[10px] font-bold uppercase tracking-wider text-[#f3d478]">
              Estimated Delivered Total ({activeService.name})
            </div>
            <div
              className="font-display text-2xl font-bold text-[#f5ebd6]"
              data-testid="quote-total-price"
            >
              ${activeQuote.total.toFixed(2)}{' '}
              <span className="font-sans text-xs font-normal text-[#bda782]">
                USD incl. shipping
              </span>
            </div>
            <div className="text-[11px] text-[#f3d478]">
              Parts: ${activeQuote.subtotalParts.toFixed(2)} + Shipping: $
              {activeQuote.shipping.toFixed(2)} · {activeService.leadTime}
            </div>
          </div>
        </div>

        {/* 1. Choose Print Service (4 Bureau Cards with Text Logo Badges) */}
        <div className="space-y-2">
          <label className="block font-codex text-xs font-bold uppercase tracking-wider text-[#e6d3b3]">
            1. Choose On-Demand Print Service Bureau
          </label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRINT_SERVICES.map((srv) => {
              const q = computeServiceQuote(srv);
              const isSelected = srv.id === selectedServiceId;
              return (
                <button
                  key={srv.id}
                  type="button"
                  data-testid={`service-option-${srv.id}`}
                  onClick={() => setSelectedServiceId(srv.id)}
                  className={`flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-[#f3d478] bg-[#d4af37]/15 shadow-electric'
                      : 'border-[#d4af37]/25 bg-[#0c0906]/85 hover:border-[#d4af37]/50'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-md border px-2 py-0.5 font-codex text-[11px] font-bold tracking-wider ${srv.badgeBg} ${srv.badgeBorder}`}
                      >
                        {srv.badgeText}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-[#f3d478] shrink-0" />
                      )}
                    </div>
                    <div className="font-display text-base font-bold text-[#f5ebd6]">
                      {srv.name}
                    </div>
                    <p className="text-[11px] text-[#bda782] leading-relaxed">
                      {srv.tagline}
                    </p>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between border-t border-[#d4af37]/20 pt-2.5">
                    <span className="text-[11px] text-[#bda782]">
                      {srv.leadTime}
                    </span>
                    <span className="font-display text-base font-bold text-[#f3d478]">
                      ${q.total.toFixed(2)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Material, Color & Quantity Selectors + 3. Shipping Address Form */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left 6 Cols: Material, Color, Quantity */}
          <div className="lg:col-span-6 space-y-4 rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-4">
            <div className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              2. Material, Finish Color &amp; Quantity
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="service-material-select"
                className="block text-xs font-semibold text-[#e6d3b3]"
              >
                Process &amp; Material
              </label>
              <select
                id="service-material-select"
                data-testid="service-material-select"
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#d4af37]/35 bg-[#14100b] px-3 py-2 text-xs font-bold text-[#f5ebd6] focus:border-[#f3d478] focus:outline-none"
              >
                {SERVICE_MATERIALS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.multiplier}x rate)
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#bda782]">{activeMaterial.note}</p>
            </div>

            {/* Color Selector Pills */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#e6d3b3]">
                Part Color ({activeColor.name})
              </label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_COLORS.map((col) => {
                  const active = col.id === selectedColorId;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => setSelectedColorId(col.id)}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'border-[#f3d478] bg-[#d4af37]/20 text-[#f5ebd6]'
                          : 'border-[#d4af37]/25 bg-[#14100b] text-[#e6d3b3] hover:border-[#d4af37]/50'
                      }`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-[#d4af37]/40"
                        style={{ backgroundColor: col.hex }}
                      />
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity Stepper */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-xs font-semibold text-[#e6d3b3]">
                  Complete Part Sets (Quantity)
                </div>
                <div className="text-[11px] text-[#bda782]">
                  Each set includes all {platesJson.totalPrintedItems} printed parts (
                  {platesJson.totalWeightGrams}g/set)
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() =>
                    setOrderQuantity((q) => Math.max(1, q - 1))
                  }
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#d4af37]/35 bg-[#14100b] text-sm font-bold text-[#f5ebd6] hover:border-[#f3d478]"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={50}
                  aria-label="Order quantity"
                  data-testid="service-quantity-input"
                  value={orderQuantity}
                  onChange={(e) =>
                    setOrderQuantity(
                      Math.max(1, Math.min(50, Number(e.target.value) || 1))
                    )
                  }
                  className="min-h-[44px] w-14 rounded-lg border border-[#d4af37]/35 bg-[#14100b] py-1 text-center font-mono text-xs font-bold text-[#f5ebd6]"
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() =>
                    setOrderQuantity((q) => Math.min(50, q + 1))
                  }
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#d4af37]/35 bg-[#14100b] text-sm font-bold text-[#f5ebd6] hover:border-[#f3d478]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Right 6 Cols: Shipping Address & Instant Quote Handoff */}
          <div className="lg:col-span-6 space-y-4 rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                  3. Shipping Destination &amp; Bureau Handoff
                </span>
                <span className="inline-flex items-center gap-1 font-codex text-[11px] text-[#d4af37]">
                  <MapPin className="h-3.5 w-3.5" /> Instant Quote Ready
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block font-codex text-[10px] uppercase text-[#bda782] mb-1">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full min-h-[44px] rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs text-[#f5ebd6]"
                  />
                </div>
                <div>
                  <label className="block font-codex text-[10px] uppercase text-[#bda782] mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    placeholder="Street Address"
                    className="w-full min-h-[44px] rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs text-[#f5ebd6]"
                  />
                </div>
                <div>
                  <label className="block font-codex text-[10px] uppercase text-[#bda782] mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="w-full min-h-[44px] rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs text-[#f5ebd6]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-codex text-[10px] uppercase text-[#bda782] mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={stateCode}
                      onChange={(e) => setStateCode(e.target.value)}
                      placeholder="CA"
                      className="w-full min-h-[44px] rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs text-[#f5ebd6]"
                    />
                  </div>
                  <div>
                    <label className="block font-codex text-[10px] uppercase text-[#bda782] mb-1">
                      ZIP / Postal
                    </label>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="94104"
                      className="w-full min-h-[44px] rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs text-[#f5ebd6]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quote Breakdown + Send Files Button */}
            <div className="space-y-3 border-t border-[#d4af37]/20 pt-3">
              <div className="flex flex-wrap items-center justify-between text-xs text-[#e6d3b3]">
                <span>
                  {orderQuantity}× set ({platesJson.totalWeightGrams * orderQuantity}g{' '}
                  {activeMaterial.name.split(' ')[0]} · {activeColor.name}) to{' '}
                  {city || 'SF'}, {postalCode || '94104'}
                </span>
                <span className="font-mono font-bold text-[#f3d478]">
                  Est. ${activeQuote.total.toFixed(2)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="send-files-to-service-btn"
                  onClick={handleSendToPrintService}
                  className="flex-1 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] px-4 py-2.5 font-codex text-xs font-bold text-[#140e07] shadow-electric hover:brightness-110 transition-all"
                >
                  <Truck className="h-4 w-4" />
                  Send files to {activeService.name} ($
                  {activeQuote.total.toFixed(2)})
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>

                <a
                  href={activeService.uploadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#d4af37]/35 bg-[#14100b] px-3.5 py-2.5 font-codex text-xs font-bold text-[#dfd3be] hover:border-[#f3d478] hover:text-[#f3d478]"
                >
                  Direct Portal <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {handoffStatus && (
                <div className="flex items-center gap-2 rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-2 text-[11px] text-[#f5ebd6]">
                  <Check className="h-4 w-4 text-[#f3d478] shrink-0" />
                  <span>{handoffStatus}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrintPanel;
