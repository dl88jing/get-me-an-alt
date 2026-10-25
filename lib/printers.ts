export interface PrinterBed {
  /** Build plate width (X axis) in mm */
  x: number;
  /** Build plate depth (Y axis) in mm */
  y: number;
  /** Maximum build height (Z axis) in mm */
  z: number;
}

export interface Printer {
  id: string;
  name: string;
  brand: string;
  bed: PrinterBed;
  multiColor: boolean;
}

export const DEFAULT_PRINTER_ID = "bambu-a1";

export const PRINTERS: Printer[] = [
  {
    id: "bambu-a1",
    name: "Bambu Lab A1",
    brand: "Bambu Lab",
    bed: { x: 256, y: 256, z: 256 },
    multiColor: true,
  },
  {
    id: "bambu-a1-mini",
    name: "Bambu Lab A1 mini",
    brand: "Bambu Lab",
    bed: { x: 180, y: 180, z: 180 },
    multiColor: true,
  },
  {
    id: "bambu-p1s",
    name: "Bambu Lab P1S",
    brand: "Bambu Lab",
    bed: { x: 256, y: 256, z: 256 },
    multiColor: true,
  },
  {
    id: "bambu-p1p",
    name: "Bambu Lab P1P",
    brand: "Bambu Lab",
    bed: { x: 256, y: 256, z: 256 },
    multiColor: true,
  },
  {
    id: "bambu-x1c",
    name: "Bambu Lab X1C",
    brand: "Bambu Lab",
    bed: { x: 256, y: 256, z: 256 },
    multiColor: true,
  },
  {
    id: "bambu-x1e",
    name: "Bambu Lab X1E",
    brand: "Bambu Lab",
    bed: { x: 256, y: 256, z: 256 },
    multiColor: true,
  },
  {
    id: "bambu-h2d",
    name: "Bambu Lab H2D",
    brand: "Bambu Lab",
    bed: { x: 350, y: 320, z: 325 },
    multiColor: true,
  },
  {
    id: "prusa-mk4s",
    name: "Prusa MK4/MK4S",
    brand: "Prusa Research",
    bed: { x: 250, y: 210, z: 220 },
    multiColor: true,
  },
  {
    id: "prusa-core-one",
    name: "Prusa Core One",
    brand: "Prusa Research",
    bed: { x: 250, y: 220, z: 270 },
    multiColor: true,
  },
  {
    id: "prusa-mini-plus",
    name: "Prusa MINI+",
    brand: "Prusa Research",
    bed: { x: 180, y: 180, z: 180 },
    multiColor: false,
  },
  {
    id: "prusa-xl",
    name: "Prusa XL",
    brand: "Prusa Research",
    bed: { x: 360, y: 360, z: 360 },
    multiColor: true,
  },
  {
    id: "creality-k1",
    name: "Creality K1",
    brand: "Creality",
    bed: { x: 220, y: 220, z: 250 },
    multiColor: false,
  },
  {
    id: "creality-k1-max",
    name: "Creality K1 Max",
    brand: "Creality",
    bed: { x: 300, y: 300, z: 300 },
    multiColor: true,
  },
  {
    id: "creality-k1c",
    name: "Creality K1C",
    brand: "Creality",
    bed: { x: 220, y: 220, z: 250 },
    multiColor: true,
  },
  {
    id: "creality-ender-3-v3",
    name: "Creality Ender-3 V3",
    brand: "Creality",
    bed: { x: 220, y: 220, z: 250 },
    multiColor: false,
  },
  {
    id: "creality-ender-3-v3-ke",
    name: "Creality Ender-3 V3 KE",
    brand: "Creality",
    bed: { x: 220, y: 220, z: 240 },
    multiColor: false,
  },
  {
    id: "elegoo-neptune-4-pro",
    name: "Elegoo Neptune 4 Pro",
    brand: "Elegoo",
    bed: { x: 225, y: 225, z: 265 },
    multiColor: false,
  },
  {
    id: "elegoo-neptune-4-max",
    name: "Elegoo Neptune 4 Max",
    brand: "Elegoo",
    bed: { x: 420, y: 420, z: 480 },
    multiColor: false,
  },
  {
    id: "anycubic-kobra-3",
    name: "Anycubic Kobra 3",
    brand: "Anycubic",
    bed: { x: 250, y: 250, z: 260 },
    multiColor: true,
  },
  {
    id: "anycubic-kobra-2-max",
    name: "Anycubic Kobra 2 Max",
    brand: "Anycubic",
    bed: { x: 420, y: 420, z: 500 },
    multiColor: false,
  },
  {
    id: "voron-2-4-350",
    name: "Voron 2.4 350",
    brand: "Voron Design",
    bed: { x: 350, y: 350, z: 350 },
    multiColor: false,
  },
  {
    id: "sovol-sv08",
    name: "Sovol SV08",
    brand: "Sovol",
    bed: { x: 350, y: 350, z: 345 },
    multiColor: false,
  },
];

export const DEFAULT_PRINTER: Printer =
  PRINTERS.find((p) => p.id === DEFAULT_PRINTER_ID) ?? PRINTERS[0];

/**
 * Look up a printer by ID (or alias), falling back to Bambu Lab A1.
 */
export function getPrinterById(id?: string | null): Printer {
  if (!id) return DEFAULT_PRINTER;
  const normalized = id.trim().toLowerCase();
  const exact = PRINTERS.find((p) => p.id.toLowerCase() === normalized);
  if (exact) return exact;
  if (normalized === "prusa-mk4") {
    return PRINTERS.find((p) => p.id === "prusa-mk4s") ?? DEFAULT_PRINTER;
  }
  if (normalized === "ender-3-v3") {
    return PRINTERS.find((p) => p.id === "creality-ender-3-v3") ?? DEFAULT_PRINTER;
  }
  if (normalized === "ender-3-v3-ke") {
    return PRINTERS.find((p) => p.id === "creality-ender-3-v3-ke") ?? DEFAULT_PRINTER;
  }
  const byName = PRINTERS.find((p) =>
    p.name.toLowerCase().includes(normalized)
  );
  return byName ?? DEFAULT_PRINTER;
}
