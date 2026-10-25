export type PartShape =
  | "box"
  | "cylinder"
  | "tube"
  | "bracketL"
  | "plate_with_holes"
  | "hook"
  | "clip"
  | "funnel"
  | "gear_simple"
  | "custom_csg"
  | "cone"
  | "sphere"
  | "bracket"
  | "enclosure";

export type ProxyShapeType = "box" | "cylinder" | PartShape;

export type PartParams = Record<string, any>;

export interface PrintedPartSpec {
  id: string;
  partNumber?: string;
  name: string;
  shape: PartShape;
  params: PartParams;
  dims_mm?: [number, number, number];
  color?: string;
  material?: string;
  quantity: number;
  description?: string;
  roleInAssembly?: string;
  bomRef?: string;
  step?: number;
}

export interface PurchasedPartSpec {
  id: string;
  partNumber?: string;
  name: string;
  bomLine?: string;
  bomRef?: string;
  color?: string;
  material?: string;
  quantity?: number;
  dims_mm?: [number, number, number];
  description?: string;
  roleInAssembly?: string;
  step?: number;
  proxyShape: {
    shape: ProxyShapeType;
    params: PartParams;
  };
}

export interface AssemblyNode {
  partId: string;
  /** Position in millimeters [x, y, z] */
  position: [number, number, number];
  /** Euler rotation in degrees [rx, ry, rz] */
  rotation: [number, number, number];
  /** Explode offset vector in millimeters [dx, dy, dz] */
  explode: [number, number, number];
  /** 1-based step index when this part is assembled */
  step: number;
}

/**
 * Shared contract in COORDINATION.md for design.json parts:
 * `{ id, name, kind: "printed"|"purchased", dims_mm:[x,y,z], shape, params, position:[x,y,z], rotation:[x,y,z], explode:[x,y,z], color, bomRef? }`
 */
export interface SharedDesignPart {
  id: string;
  partNumber?: string;
  name: string;
  kind: "printed" | "purchased";
  dims_mm: [number, number, number];
  shape: PartShape | string;
  params: PartParams;
  position: [number, number, number];
  rotation: [number, number, number];
  explode: [number, number, number];
  color: string;
  bomRef?: string;
  material?: string;
  quantity?: number;
  description?: string;
  roleInAssembly?: string;
  infillPercent?: number;
  layerHeightMm?: number;
  supportsRequired?: boolean;
  step?: number;
}

export interface DesignData {
  name?: string;
  objectName?: string;
  description?: string;
  designPhilosophy?: string;
  summary?: string;
  overallBoundingBoxMm?: [number, number, number];
  printedPartsCount?: number;
  purchasedPartsCount?: number;
  assemblyNotes?: string[];
  printed: PrintedPartSpec[];
  purchased: PurchasedPartSpec[];
  assembly: AssemblyNode[];
  parts?: SharedDesignPart[];
}

/** Accepts either the internal `DesignData` or the shared-contract `DesignSpec` (`{ parts: [...] }`). */
export type AnyDesignInput =
  | DesignData
  | {
      objectName?: string;
      name?: string;
      designPhilosophy?: string;
      description?: string;
      overallBoundingBoxMm?: [number, number, number];
      printedPartsCount?: number;
      purchasedPartsCount?: number;
      assemblyNotes?: string[];
      parts?: SharedDesignPart[];
      printed?: PrintedPartSpec[];
      purchased?: PurchasedPartSpec[];
      assembly?: AssemblyNode[];
    };

export type AssemblyAction =
  | "insert"
  | "screw"
  | "snap"
  | "place"
  | "connect"
  | "fasten"
  | "route"
  | "test";

export interface StepMotion {
  partId: string;
  from: [number, number, number];
  to: [number, number, number];
}

export interface InstructionStep {
  n: number;
  title: string;
  partIds: string[];
  action?: AssemblyAction;
  actionType?: string;
  tools?: string[];
  note?: string;
  description?: string;
  motion?: StepMotion[];
  proTip?: string;
}

export interface InstructionsData {
  objectId?: string;
  objectName?: string;
  totalSteps?: number;
  estimatedMinutes?: number;
  estimatedTotalMinutes?: number;
  difficulty?: string;
  safetyNotes?: string[];
  steps: InstructionStep[];
}

export type AnyInstructionsInput = InstructionsData | { steps: any[] };

export interface BomRetailerLink {
  retailer: string;
  url: string;
  estPrice?: number;
  inStock?: boolean;
}

export interface BomItem {
  id: string;
  partNumber?: string;
  partId?: string;
  name: string;
  category?: string;
  specification?: string;
  qty: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  priceUsd: number;
  primaryRetailer?: string;
  primaryUrl?: string;
  links: BomRetailerLink[];
  retailerLinks?: BomRetailerLink[];
  linkedPartIds?: string[];
  notes?: string;
}

export interface BomData {
  items: BomItem[];
  originalPriceUsd?: number;
  currency?: string;
  summary?: {
    purchasedPartsTotal: number;
    filamentCostTotal: number;
    totalDiyCost: number;
    originalRetailPrice: number;
    totalSavings: number;
    savingsPercent: number;
  };
}

export type AnyBomInput =
  | BomData
  | {
      currency?: string;
      originalPrice?: number;
      originalPriceUsd?: number;
      items: any[];
      summary?: BomData["summary"];
    };

export interface PlateItemFootprint {
  partId: string;
  name: string;
  copy?: number;
  copyIndex?: number;
  /** Bottom-left X position on bed in mm */
  x: number;
  /** Bottom-left Y position on bed in mm */
  y: number;
  /** Footprint width in mm */
  w: number;
  /** Footprint depth on bed in mm */
  h: number;
  /** Optional raw width in mm (shared contract alias) */
  width?: number;
  /** Optional raw depth in mm (shared contract alias) */
  depth?: number;
  /** Optional vertical Z height in mm */
  height?: number;
  rotated: boolean;
  color?: string;
  stlFile?: string;
}

export interface PrintPlate {
  index: number;
  plateNumber?: number;
  name?: string;
  printerId?: string;
  printerName?: string;
  bedDimensionsMm?: [number, number, number];
  items: PlateItemFootprint[];
  placements?: PlateItemFootprint[];
  /** 0..1 ratio or 0..100 percentage */
  utilization: number;
  utilizationPercent?: number;
  estPrintTimeMin?: number;
  estimatedMinutes?: number;
  filamentGrams?: number;
  weightGrams?: number;
  stlFile?: string;
}

export interface PlatesData {
  printer: {
    id?: string;
    name: string;
    bed: {
      x: number;
      y: number;
      z?: number;
    };
  };
  printerId?: string;
  printerName?: string;
  bedDimensionsMm?: [number, number, number];
  totalPlates?: number;
  totalWeightGrams?: number;
  totalPrintTimeMinutes?: number;
  parts?: Array<{
    partId: string;
    name: string;
    stlFile: string;
    dims_mm: [number, number, number];
    weightGrams: number;
    estimatedMinutes: number;
    color: string;
    material: string;
  }>;
  plates: PrintPlate[];
}

export type AnyPlatesInput =
  | PlatesData
  | {
      printerId?: string;
      printerName?: string;
      bedDimensionsMm?: [number, number, number];
      totalPlates?: number;
      totalWeightGrams?: number;
      totalPrintTimeMinutes?: number;
      printer?: {
        id?: string;
        name: string;
        bed: { x: number; y: number; z?: number };
      };
      parts?: any[];
      plates: any[];
    };

export type PartFilterMode = "all" | "printed" | "purchased";

export interface ResolvedAssemblyPart {
  /** Unique key per assembly placement instance */
  instanceId: string;
  /** 1-based callout number matching the parts legend */
  calloutNumber?: number;
  partId: string;
  partNumber?: string;
  name: string;
  category: "printed" | "purchased";
  shape: PartShape;
  params: PartParams;
  dims_mm?: [number, number, number];
  color: string;
  material?: string;
  description?: string;
  roleInAssembly?: string;
  quantity: number;
  position: [number, number, number];
  rotation: [number, number, number];
  explode: [number, number, number];
  step: number;
  stlFile?: string;
  bomRef?: string;
  bomLine?: string;
  bomItem?: BomItem;
  stepInfo?: InstructionStep;
}

export { resolveAssemblyParts } from "./adapters";
