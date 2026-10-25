import {
  DEFAULT_PRINTER,
  getPrinterById,
  Printer,
  PrinterSpeedClass,
} from "../printers";
import { TriangleMesh } from "./geometry";

export const PLA_DENSITY_G_CM3 = 1.24;
export const DEFAULT_INFILL_RATIO = 0.15;
export const DEFAULT_WALL_COUNT = 2;
export const DEFAULT_NOZZLE_LINE_WIDTH_MM = 0.4;
export const DEFAULT_LAYER_HEIGHT_MM = 0.2;
export const FILAMENT_DIAMETER_MM = 1.75;

const FILAMENT_CROSS_SECTION_MM2 =
  Math.PI * Math.pow(FILAMENT_DIAMETER_MM * 0.5, 2); // ~2.40528 mm^2

export interface SpeedClassProfile {
  speedClass: PrinterSpeedClass;
  label: string;
  /** Effective average volumetric flow rate in mm^3/s including accel/decel & retractions */
  volumetricFlowMm3PerSec: number;
  /** Per-layer Z-hop, wipe, and travel overhead in seconds */
  layerOverheadSec: number;
  /** Bed heating, homing, auto-leveling & purge line time in minutes per plate */
  platePrepMinutes: number;
}

export const SPEED_CLASS_PROFILES: Record<PrinterSpeedClass, SpeedClassProfile> =
  {
    "corexy-fast": {
      speedClass: "corexy-fast",
      label: "CoreXY High-Flow (300–500 mm/s)",
      volumetricFlowMm3PerSec: 15.0,
      layerOverheadSec: 2.2,
      platePrepMinutes: 3.5,
    },
    "high-speed": {
      speedClass: "high-speed",
      label: "Input-Shaper High-Speed (200–300 mm/s)",
      volumetricFlowMm3PerSec: 11.2,
      layerOverheadSec: 3.0,
      platePrepMinutes: 4.0,
    },
    standard: {
      speedClass: "standard",
      label: "Standard Cartesian (80–150 mm/s)",
      volumetricFlowMm3PerSec: 6.5,
      layerOverheadSec: 4.4,
      platePrepMinutes: 5.0,
    },
  };

export interface PrintEstimateOptions {
  /** Printer instance, printer ID, or explicit speed class */
  printer?: Printer | string;
  speedClass?: PrinterSpeedClass;
  /** Filament density in g/cm^3 (default PLA 1.24 g/cm^3) */
  densityGCm3?: number;
  /** Sparse infill fraction 0..1 (default 0.15 = 15%) */
  infillRatio?: number;
  /** Number of perimeter walls (default 2) */
  wallCount?: number;
  /** Extrusion line width in mm (default 0.4 mm) */
  lineWidthMm?: number;
  /** Layer height in mm (default 0.2 mm) */
  layerHeightMm?: number;
}

export interface MeshGeometricMetrics {
  volumeMm3: number;
  volumeCm3: number;
  surfaceAreaMm2: number;
  surfaceAreaCm2: number;
  heightMm: number;
}

export interface PartPrintEstimate {
  volumeMm3: number;
  volumeCm3: number;
  surfaceAreaMm2: number;
  surfaceAreaCm2: number;
  shellVolumeMm3: number;
  infillVolumeMm3: number;
  extrudedVolumeMm3: number;
  filamentGrams: number;
  weightGrams: number;
  filamentMeters: number;
  layers: number;
  extrusionSeconds: number;
  travelSeconds: number;
  printTimeMinutes: number;
  estimatedMinutes: number;
  formattedTime: string;
  speedClass: PrinterSpeedClass;
}

export interface PlatePrintEstimate {
  filamentGrams: number;
  weightGrams: number;
  filamentMeters: number;
  extrudedVolumeMm3: number;
  layers: number;
  printTimeMinutes: number;
  estimatedMinutes: number;
  formattedTime: string;
  speedClass: PrinterSpeedClass;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function resolveSpeedClass(
  options?: PrintEstimateOptions
): PrinterSpeedClass {
  if (options?.speedClass) {
    return options.speedClass;
  }
  if (options?.printer) {
    if (typeof options.printer === "string") {
      return getPrinterById(options.printer).speedClass;
    }
    if (options.printer.speedClass) {
      return options.printer.speedClass;
    }
  }
  return DEFAULT_PRINTER.speedClass;
}

export function formatPrintDuration(minutes: number): string {
  const totalMin = Math.max(1, Math.round(minutes));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs <= 0) {
    return `${mins}m`;
  }
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/**
 * Computes exact closed-mesh volume (mm^3) and total triangle surface area (mm^2)
 * directly from a TriangleMesh's indexed vertex positions.
 */
export function computeMeshSurfaceAreaAndVolume(
  mesh: TriangleMesh
): MeshGeometricMetrics {
  const { positions, indices, bbox } = mesh;
  let signedVolume6 = 0;
  let surfaceAreaMm2 = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = positions[i0];
    const ay = positions[i0 + 1];
    const az = positions[i0 + 2];

    const bx = positions[i1];
    const by = positions[i1 + 1];
    const bz = positions[i1 + 2];

    const cx = positions[i2];
    const cy = positions[i2 + 1];
    const cz = positions[i2 + 2];

    // Signed tetrahedron volume * 6
    signedVolume6 +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);

    // Triangle area = 0.5 * |(b - a) x (c - a)|
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    surfaceAreaMm2 += 0.5 * Math.hypot(nx, ny, nz);
  }

  const volumeMm3 = Math.abs(signedVolume6) / 6;
  const heightMm = Math.max(1, bbox.size[2]);

  return {
    volumeMm3: round2(volumeMm3),
    volumeCm3: round2(volumeMm3 / 1000),
    surfaceAreaMm2: round2(surfaceAreaMm2),
    surfaceAreaCm2: round2(surfaceAreaMm2 / 100),
    heightMm: round2(heightMm),
  };
}

/**
 * Estimates per-part filament mass (grams) and print duration (minutes) from
 * mesh volume (mm^3), surface area (mm^2), and Z height (mm).
 *
 * Default slicer profile:
 * - Material: PLA (1.24 g/cm^3)
 * - Infill: 15% sparse infill
 * - Perimeters: 2 walls * 0.4 mm nozzle = 0.8 mm wall shell
 * - Layer height: 0.2 mm
 * - Printer speed class: from lib/printers.ts
 */
export function estimateFromVolumeAndSurfaceArea(
  volumeMm3: number,
  surfaceAreaMm2: number,
  heightMm: number,
  options?: PrintEstimateOptions
): PartPrintEstimate {
  const densityGCm3 = options?.densityGCm3 ?? PLA_DENSITY_G_CM3;
  const infillRatio = options?.infillRatio ?? DEFAULT_INFILL_RATIO;
  const wallCount = options?.wallCount ?? DEFAULT_WALL_COUNT;
  const lineWidthMm = options?.lineWidthMm ?? DEFAULT_NOZZLE_LINE_WIDTH_MM;
  const layerHeightMm = options?.layerHeightMm ?? DEFAULT_LAYER_HEIGHT_MM;
  const speedClass = resolveSpeedClass(options);
  const speedProfile = SPEED_CLASS_PROFILES[speedClass];

  const cleanVolMm3 = Math.max(10, volumeMm3);
  const cleanAreaMm2 = Math.max(20, surfaceAreaMm2);
  const cleanHeightMm = Math.max(layerHeightMm, heightMm);

  // Effective wall & top/bottom shell thickness (2 walls * 0.4mm = 0.8mm, 0.82 overlap correction at corners)
  const shellThicknessMm = wallCount * lineWidthMm;
  const rawShellVolumeMm3 = cleanAreaMm2 * shellThicknessMm * 0.82;
  const shellVolumeMm3 = Math.min(cleanVolMm3, rawShellVolumeMm3);
  const interiorVolumeMm3 = Math.max(0, cleanVolMm3 - shellVolumeMm3);
  const infillVolumeMm3 = interiorVolumeMm3 * infillRatio;

  const extrudedVolumeMm3 = shellVolumeMm3 + infillVolumeMm3;
  const extrudedVolumeCm3 = extrudedVolumeMm3 / 1000;

  const filamentGrams = Math.max(1.2, round1(extrudedVolumeCm3 * densityGCm3));
  const filamentMeters = Math.max(
    0.4,
    round2(extrudedVolumeMm3 / FILAMENT_CROSS_SECTION_MM2 / 1000)
  );

  const layers = Math.max(1, Math.ceil(cleanHeightMm / layerHeightMm));
  const extrusionSeconds =
    extrudedVolumeMm3 / speedProfile.volumetricFlowMm3PerSec;
  const travelSeconds = layers * speedProfile.layerOverheadSec;

  // Single-part print time in minutes (including a small per-part startup buffer)
  const rawMinutes = (extrusionSeconds + travelSeconds) / 60 + 1.5;
  const printTimeMinutes = Math.max(3, Math.round(rawMinutes));

  return {
    volumeMm3: round2(cleanVolMm3),
    volumeCm3: round2(cleanVolMm3 / 1000),
    surfaceAreaMm2: round2(cleanAreaMm2),
    surfaceAreaCm2: round2(cleanAreaMm2 / 100),
    shellVolumeMm3: round2(shellVolumeMm3),
    infillVolumeMm3: round2(infillVolumeMm3),
    extrudedVolumeMm3: round2(extrudedVolumeMm3),
    filamentGrams,
    weightGrams: filamentGrams,
    filamentMeters,
    layers,
    extrusionSeconds: round1(extrusionSeconds),
    travelSeconds: round1(travelSeconds),
    printTimeMinutes,
    estimatedMinutes: printTimeMinutes,
    formattedTime: formatPrintDuration(printTimeMinutes),
    speedClass,
  };
}

/**
 * Estimates print time and filament grams directly from a TriangleMesh.
 */
export function estimatePartPrint(
  mesh: TriangleMesh,
  options?: PrintEstimateOptions
): PartPrintEstimate {
  const metrics = computeMeshSurfaceAreaAndVolume(mesh);
  return estimateFromVolumeAndSurfaceArea(
    metrics.volumeMm3,
    metrics.surfaceAreaMm2,
    metrics.heightMm,
    options
  );
}

/**
 * Estimates total filament grams and print duration for a packed build plate
 * containing one or more placed parts.
 */
export function estimatePlatePrint(
  placedParts: Array<{
    estimate: PartPrintEstimate;
    heightMm?: number;
    count?: number;
  }>,
  options?: PrintEstimateOptions
): PlatePrintEstimate {
  const layerHeightMm = options?.layerHeightMm ?? DEFAULT_LAYER_HEIGHT_MM;
  const speedClass = resolveSpeedClass(options);
  const speedProfile = SPEED_CLASS_PROFILES[speedClass];

  if (placedParts.length === 0) {
    return {
      filamentGrams: 0,
      weightGrams: 0,
      filamentMeters: 0,
      extrudedVolumeMm3: 0,
      layers: 0,
      printTimeMinutes: 0,
      estimatedMinutes: 0,
      formattedTime: "0m",
      speedClass,
    };
  }

  let totalGrams = 0;
  let totalMeters = 0;
  let totalExtrudedMm3 = 0;
  let totalExtrusionSec = 0;
  let maxLayers = 0;
  let totalItems = 0;

  for (const item of placedParts) {
    const qty = Math.max(1, item.count ?? 1);
    totalItems += qty;
    totalGrams += item.estimate.filamentGrams * qty;
    totalMeters += item.estimate.filamentMeters * qty;
    totalExtrudedMm3 += item.estimate.extrudedVolumeMm3 * qty;
    totalExtrusionSec += item.estimate.extrusionSeconds * qty;

    const itemLayers = item.heightMm
      ? Math.ceil(item.heightMm / layerHeightMm)
      : item.estimate.layers;
    if (itemLayers > maxLayers) {
      maxLayers = itemLayers;
    }
  }

  // On a shared plate, Z layer changes happen once per layer up to maxHeight,
  // plus inter-part travel penalty (15% per additional part on the bed).
  const multiPartTravelFactor = 1 + 0.15 * Math.max(0, totalItems - 1);
  const plateLayerTravelSec =
    maxLayers * speedProfile.layerOverheadSec * multiPartTravelFactor;

  const totalMinutes = Math.max(
    4,
    Math.round(
      (totalExtrusionSec + plateLayerTravelSec) / 60 +
        speedProfile.platePrepMinutes
    )
  );
  const roundedGrams = round1(totalGrams);

  return {
    filamentGrams: roundedGrams,
    weightGrams: roundedGrams,
    filamentMeters: round2(totalMeters),
    extrudedVolumeMm3: round2(totalExtrudedMm3),
    layers: maxLayers,
    printTimeMinutes: totalMinutes,
    estimatedMinutes: totalMinutes,
    formattedTime: formatPrintDuration(totalMinutes),
    speedClass,
  };
}
