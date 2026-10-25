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
  | "custom_csg";

export type ProxyShapeType = "box" | "cylinder" | PartShape;

export interface PrintedPartSpec {
  id: string;
  name: string;
  shape: PartShape;
  params: Record<string, number>;
  color?: string;
  quantity: number;
}

export interface PurchasedPartSpec {
  id: string;
  name: string;
  bomLine?: string;
  color?: string;
  quantity?: number;
  proxyShape: {
    shape: ProxyShapeType;
    params: Record<string, number>;
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

export interface DesignData {
  name?: string;
  description?: string;
  printed: PrintedPartSpec[];
  purchased: PurchasedPartSpec[];
  assembly: AssemblyNode[];
}

export type AssemblyAction = "insert" | "screw" | "snap" | "place" | "connect";

export interface InstructionStep {
  n: number;
  title: string;
  partIds: string[];
  action: AssemblyAction;
  tools?: string[];
  note?: string;
}

export interface InstructionsData {
  steps: InstructionStep[];
}

export interface BomRetailerLink {
  retailer: string;
  url: string;
}

export interface BomItem {
  id: string;
  name: string;
  qty: number;
  priceUsd: number;
  links: BomRetailerLink[];
}

export interface BomData {
  items: BomItem[];
  originalPriceUsd?: number;
  currency?: string;
}

export interface PlateItemFootprint {
  partId: string;
  name: string;
  /** Bottom-left or center X position on bed in mm */
  x: number;
  /** Bottom-left or center Y position on bed in mm */
  y: number;
  /** Footprint width in mm */
  w: number;
  /** Footprint depth/height in mm */
  h: number;
  rotated: boolean;
  color?: string;
}

export interface PrintPlate {
  index: number;
  items: PlateItemFootprint[];
  /** 0..1 ratio or 0..100 percentage */
  utilization: number;
  estPrintTimeMin?: number;
  filamentGrams?: number;
}

export interface PlatesData {
  printer: {
    name: string;
    bed: {
      x: number;
      y: number;
      z?: number;
    };
  };
  plates: PrintPlate[];
}

export type PartFilterMode = "all" | "printed" | "purchased";

export interface ResolvedAssemblyPart {
  /** Unique key per assembly placement instance */
  instanceId: string;
  partId: string;
  name: string;
  category: "printed" | "purchased";
  shape: PartShape;
  params: Record<string, number>;
  color: string;
  quantity: number;
  position: [number, number, number];
  rotation: [number, number, number];
  explode: [number, number, number];
  step: number;
  bomLine?: string;
  bomItem?: BomItem;
  stepInfo?: InstructionStep;
}

const DEFAULT_PRINTED_PALETTE = [
  "#38BDF8", // Sky cyan
  "#34D399", // Emerald mint
  "#818CF8", // Indigo
  "#FBBF24", // Amber
  "#F472B6", // Pink
  "#A78BFA", // Violet
  "#2DD4BF", // Teal
  "#FB923C", // Orange
];

const DEFAULT_PURCHASED_PALETTE = [
  "#94A3B8", // Brushed steel
  "#64748B", // Gunmetal
  "#E2E8F0", // Chrome/Silver
  "#475569", // Dark anodized
];

/**
 * Resolves `design`, `bom`, and `instructions` into a normalized list of 3D instances
 * ready for rendering in ExplodedView and AssemblyPlayer.
 */
export function resolveAssemblyParts(
  design: DesignData,
  bom?: BomData,
  instructions?: InstructionsData
): ResolvedAssemblyPart[] {
  const printedMap = new Map<string, PrintedPartSpec>();
  const purchasedMap = new Map<string, PurchasedPartSpec>();

  (design?.printed ?? []).forEach((p) => printedMap.set(p.id, p));
  (design?.purchased ?? []).forEach((p) => purchasedMap.set(p.id, p));

  const bomById = new Map<string, BomItem>();
  (bom?.items ?? []).forEach((item) => {
    bomById.set(item.id, item);
    bomById.set(item.name.toLowerCase(), item);
  });

  const stepByNumber = new Map<number, InstructionStep>();
  const stepByPartId = new Map<string, InstructionStep>();
  (instructions?.steps ?? []).forEach((s) => {
    stepByNumber.set(s.n, s);
    (s.partIds ?? []).forEach((pid) => {
      if (!stepByPartId.has(pid)) {
        stepByPartId.set(pid, s);
      }
    });
  });

  const assemblyList = design?.assembly ?? [];
  const results: ResolvedAssemblyPart[] = [];

  assemblyList.forEach((node, idx) => {
    const printed = printedMap.get(node.partId);
    const purchased = purchasedMap.get(node.partId);

    const stepNum = node.step ?? stepByPartId.get(node.partId)?.n ?? idx + 1;
    const stepInfo = stepByNumber.get(stepNum) ?? stepByPartId.get(node.partId);

    if (printed) {
      const color =
        printed.color ||
        DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length];
      results.push({
        instanceId: `${node.partId}-${idx}`,
        partId: node.partId,
        name: printed.name,
        category: "printed",
        shape: printed.shape || "box",
        params: printed.params || {},
        color,
        quantity: printed.quantity ?? 1,
        position: node.position || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        explode: node.explode || [0, 40, 0],
        step: stepNum,
        stepInfo,
      });
    } else if (purchased) {
      const color =
        purchased.color ||
        DEFAULT_PURCHASED_PALETTE[idx % DEFAULT_PURCHASED_PALETTE.length];
      const matchedBom =
        (purchased.bomLine &&
          (bomById.get(purchased.bomLine) ||
            bomById.get(purchased.bomLine.toLowerCase()))) ||
        bomById.get(purchased.id) ||
        bomById.get(purchased.name.toLowerCase());

      results.push({
        instanceId: `${node.partId}-${idx}`,
        partId: node.partId,
        name: purchased.name,
        category: "purchased",
        shape: (purchased.proxyShape?.shape as PartShape) || "cylinder",
        params: purchased.proxyShape?.params || {},
        color,
        quantity: purchased.quantity ?? matchedBom?.qty ?? 1,
        position: node.position || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        explode: node.explode || [0, 50, 0],
        step: stepNum,
        bomLine: purchased.bomLine || matchedBom?.name,
        bomItem: matchedBom,
        stepInfo,
      });
    } else {
      // Fallback if an assembly node references an unlisted partId
      results.push({
        instanceId: `${node.partId}-${idx}`,
        partId: node.partId,
        name: node.partId,
        category: "printed",
        shape: "box",
        params: { w: 25, h: 25, d: 25 },
        color: DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length],
        quantity: 1,
        position: node.position || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        explode: node.explode || [0, 40, 0],
        step: stepNum,
        stepInfo,
      });
    }
  });

  // If assembly was empty, auto-layout printed + purchased parts so viewer never renders blank
  if (results.length === 0) {
    let idx = 0;
    for (const p of design?.printed ?? []) {
      results.push({
        instanceId: `${p.id}-${idx}`,
        partId: p.id,
        name: p.name,
        category: "printed",
        shape: p.shape || "box",
        params: p.params || {},
        color:
          p.color ||
          DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length],
        quantity: p.quantity ?? 1,
        position: [(idx - 2) * 45, 0, 0],
        rotation: [0, 0, 0],
        explode: [0, 40 + idx * 12, 0],
        step: idx + 1,
      });
      idx++;
    }
    for (const p of design?.purchased ?? []) {
      const matchedBom =
        (p.bomLine &&
          (bomById.get(p.bomLine) || bomById.get(p.bomLine.toLowerCase()))) ||
        bomById.get(p.id);
      results.push({
        instanceId: `${p.id}-${idx}`,
        partId: p.id,
        name: p.name,
        category: "purchased",
        shape: (p.proxyShape?.shape as PartShape) || "cylinder",
        params: p.proxyShape?.params || {},
        color:
          p.color ||
          DEFAULT_PURCHASED_PALETTE[idx % DEFAULT_PURCHASED_PALETTE.length],
        quantity: p.quantity ?? matchedBom?.qty ?? 1,
        position: [(idx - 2) * 45, 30, 0],
        rotation: [0, 0, 0],
        explode: [0, 60 + idx * 10, 0],
        step: idx + 1,
        bomLine: p.bomLine || matchedBom?.name,
        bomItem: matchedBom,
      });
      idx++;
    }
  }

  return results;
}
