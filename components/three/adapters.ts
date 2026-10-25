import {
  normalizeDesignPart,
  normalizeDesignSpec,
  normalizeInstructions,
  normalizePartShape,
} from "@/lib/cad/adapters";
import {
  AssemblyAction,
  AssemblyNode,
  BomData,
  BomItem,
  BomRetailerLink,
  DesignData,
  InstructionStep,
  InstructionsData,
  PartParams,
  PartShape,
  PlateItemFootprint,
  PlatesData,
  PrintedPartSpec,
  PrintPlate,
  PurchasedPartSpec,
  ResolvedAssemblyPart,
  SharedDesignPart,
  StepMotion,
} from "./types";

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

function toVec3(
  val: unknown,
  fallback: [number, number, number]
): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    const z = Number(val[2]);
    return [
      Number.isFinite(x) ? x : fallback[0],
      Number.isFinite(y) ? y : fallback[1],
      Number.isFinite(z) ? z : fallback[2],
    ];
  }
  return [...fallback];
}

/**
 * Detects whether a design's part coordinates use CAD Z-up (where Z is vertical height
 * and Y is horizontal depth, as in `data/demo/plant-waterer/design.json`) versus Three.js
 * Y-up (where Y is vertical height, as in `SAMPLE_DESIGN` and `FALLBACK_PLANT_WATERER_DESIGN`).
 */
export function isCadZUpDesign(
  parts: Array<{
    position?: [number, number, number];
    explode?: [number, number, number];
  }>
): boolean {
  if (!parts || parts.length === 0) return false;
  let yZeroZNonZero = 0;
  let zZeroYNonZero = 0;
  let sumAbsExplodeY = 0;
  let sumAbsExplodeZ = 0;

  for (const p of parts) {
    const pos = p.position ?? [0, 0, 0];
    const exp = p.explode ?? [0, 0, 0];
    if (Math.abs(pos[1]) < 0.01 && Math.abs(pos[2]) > 0.5) yZeroZNonZero++;
    if (Math.abs(pos[2]) < 0.01 && Math.abs(pos[1]) > 0.5) zZeroYNonZero++;
    sumAbsExplodeY += Math.abs(exp[1]);
    sumAbsExplodeZ += Math.abs(exp[2]);
  }

  return yZeroZNonZero > zZeroYNonZero && sumAbsExplodeZ > sumAbsExplodeY;
}

/**
 * Converts a 3D vector `[x, y, z]` from CAD Z-up to Three.js Y-up `[x, z, y]` when `zUp` is true.
 */
export function toThreeVec3(
  vec: [number, number, number],
  zUp: boolean
): [number, number, number] {
  if (!zUp) return [vec[0], vec[1], vec[2]];
  return [vec[0], vec[2], vec[1]];
}

/**
 * Enriches a part's `params` dictionary with fallback dimensions from `dims_mm`
 * and normalizes shape-specific parameters so `buildPartGeometry` renders accurate geometry.
 */
export function enrichPartParams(
  shape: PartShape,
  rawParams: PartParams | undefined,
  dims_mm?: [number, number, number],
  zUp = false
): PartParams {
  const params: PartParams =
    rawParams && typeof rawParams === "object" ? { ...rawParams } : {};

  if (Array.isArray(dims_mm) && dims_mm.length >= 3) {
    const dx = Number(dims_mm[0]) || 40;
    const dy = Number(dims_mm[1]) || 30;
    const dz = Number(dims_mm[2]) || 40;

    // In Z-up CAD specs, dims_mm is [widthX, depthY, heightZ].
    // In Y-up Three.js specs, dims_mm is [widthX, heightY, depthZ].
    const widthMm = dx;
    const heightMm = zUp ? dz : dy;
    const depthMm = zUp ? dy : dz;

    if (params.width === undefined && params.w === undefined) {
      params.width = widthMm;
    }
    if (params.height === undefined && params.h === undefined && params.thickness === undefined && params.t === undefined) {
      params.height = heightMm;
    }
    if (params.depth === undefined && params.d === undefined) {
      params.depth = depthMm;
    }
  }

  if (shape === "gear_simple") {
    if (
      params.r === undefined &&
      params.radius === undefined &&
      params.outerRadius === undefined &&
      typeof params.teeth === "number" &&
      typeof params.module === "number"
    ) {
      params.outerRadius =
        (params.teeth * params.module) / 2 + params.module;
    }
    if (params.bore === undefined && typeof params.boreRadius === "number") {
      params.bore = params.boreRadius;
    }
  }

  if (shape === "funnel") {
    if (
      params.h === undefined &&
      params.height === undefined &&
      (typeof params.coneHeight === "number" ||
        typeof params.spoutHeight === "number")
    ) {
      params.height =
        (Number(params.coneHeight) || 24) + (Number(params.spoutHeight) || 14);
    }
  }

  return params;
}

/**
 * Infers a clean `AssemblyAction` ("insert" | "screw" | "snap" | "place" | "connect")
 * from raw `action` / `actionType` / `title` / `tools`.
 */
export function normalizeAssemblyAction(
  rawAction?: unknown,
  rawActionType?: unknown,
  title?: string,
  tools?: string[]
): AssemblyAction {
  const candidate = String(rawAction || rawActionType || "")
    .trim()
    .toLowerCase();

  if (candidate === "screw" || candidate === "fasten") return "screw";
  if (candidate === "snap") return "snap";
  if (candidate === "insert") return "insert";
  if (candidate === "connect" || candidate === "route") return "connect";
  if (candidate === "place" || candidate === "test") return "place";

  const text = `${title || ""} ${(tools || []).join(" ")}`.toLowerCase();
  if (
    text.includes("screw") ||
    text.includes("fasten") ||
    text.includes("hex") ||
    text.includes("bolt")
  ) {
    return "screw";
  }
  if (
    text.includes("snap") ||
    text.includes("clip") ||
    text.includes("lock")
  ) {
    return "snap";
  }
  if (
    text.includes("connect") ||
    text.includes("route") ||
    text.includes("tube") ||
    text.includes("tubing") ||
    text.includes("plug") ||
    text.includes("wire")
  ) {
    return "connect";
  }
  if (
    text.includes("insert") ||
    text.includes("seat") ||
    text.includes("drop") ||
    text.includes("slide") ||
    text.includes("lower")
  ) {
    return "insert";
  }
  return "place";
}

/**
 * Adapts either the shared-contract `DesignSpec` (`{ objectName, parts: [...] }`)
 * or the internal `DesignData` (`{ printed, purchased, assembly }`) into a unified
 * `DesignData` object with both `printed`/`purchased`/`assembly` and `parts` populated.
 * Reuses `normalizeDesignSpec` from `lib/cad/adapters.ts`.
 */
export function adaptDesign(
  rawInput: unknown,
  rawInstructions?: unknown
): DesignData {
  if (!rawInput || typeof rawInput !== "object") {
    return {
      name: "DIY Alternative Assembly",
      objectName: "DIY Alternative Assembly",
      printed: [],
      purchased: [],
      assembly: [],
      parts: [],
    };
  }

  const raw = rawInput as Record<string, any>;

  // Build a lookup of first-seen step number per partId from instructions if provided
  const firstStepByPartId = new Map<string, number>();
  if (rawInstructions && typeof rawInstructions === "object") {
    const rawSteps = (rawInstructions as Record<string, any>).steps;
    if (Array.isArray(rawSteps)) {
      rawSteps.forEach((s: any, idx: number) => {
        const stepNum = Number(s?.n ?? s?.step ?? s?.stepNumber) || idx + 1;
        const pids: string[] = Array.isArray(s?.partIds)
          ? s.partIds.map(String)
          : [];
        const motionPids: string[] = Array.isArray(s?.motion)
          ? s.motion.map((m: any) => String(m?.partId || "")).filter(Boolean)
          : [];
        for (const pid of [...motionPids, ...pids]) {
          if (!firstStepByPartId.has(pid)) {
            firstStepByPartId.set(pid, stepNum);
          }
        }
      });
    }
  }

  // If already in internal DesignData shape (`printed` + `assembly`) and no `parts` array
  if (
    Array.isArray(raw.printed) &&
    raw.printed.length > 0 &&
    !Array.isArray(raw.parts)
  ) {
    const cadSpec = normalizeDesignSpec(raw);
    const printed: PrintedPartSpec[] = raw.printed.map(
      (p: any, idx: number) => {
        const shape = normalizePartShape(p.shape) as PartShape;
        return {
          id: String(p.id || `printed-${idx + 1}`),
          partNumber: p.partNumber || `PRT-${String(idx + 1).padStart(2, "0")}`,
          name: String(p.name || `Printed Part ${idx + 1}`),
          shape,
          params: enrichPartParams(shape, p.params, p.dims_mm, false),
          dims_mm: p.dims_mm,
          color:
            p.color ||
            DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length],
          material: p.material || "PETG",
          quantity: Number(p.quantity) || 1,
          description: p.description,
          roleInAssembly: p.roleInAssembly,
          bomRef: p.bomRef,
          step: p.step ?? firstStepByPartId.get(p.id),
        };
      }
    );

    const purchased: PurchasedPartSpec[] = (
      Array.isArray(raw.purchased) ? raw.purchased : []
    ).map((p: any, idx: number) => {
      const shape = normalizePartShape(
        p.proxyShape?.shape ?? p.shape ?? "box"
      ) as PartShape;
      const params = enrichPartParams(
        shape,
        p.proxyShape?.params ?? p.params,
        p.dims_mm,
        false
      );
      return {
        id: String(p.id || `purchased-${idx + 1}`),
        partNumber: p.partNumber || `OTS-${String(idx + 1).padStart(2, "0")}`,
        name: String(p.name || `Purchased Part ${idx + 1}`),
        bomLine: p.bomLine ?? p.bomRef,
        bomRef: p.bomRef ?? p.bomLine,
        color:
          p.color ||
          DEFAULT_PURCHASED_PALETTE[idx % DEFAULT_PURCHASED_PALETTE.length],
        material: p.material || "Off-the-Shelf Hardware",
        quantity: Number(p.quantity) || 1,
        dims_mm: p.dims_mm,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        step: p.step ?? firstStepByPartId.get(p.id),
        proxyShape: {
          shape,
          params,
        },
      };
    });

    const assembly: AssemblyNode[] = Array.isArray(raw.assembly)
      ? raw.assembly.map((node: any, idx: number) => ({
          partId: String(node.partId || `part-${idx + 1}`),
          position: toVec3(node.position, [0, 0, 0]),
          rotation: toVec3(node.rotation, [0, 0, 0]),
          explode: toVec3(node.explode, [0, 45, 0]),
          step:
            Number(node.step) ||
            firstStepByPartId.get(node.partId) ||
            idx + 1,
        }))
      : [];

    return {
      name: raw.name ?? raw.objectName ?? cadSpec.objectName,
      objectName: raw.objectName ?? raw.name ?? cadSpec.objectName,
      description:
        raw.description ?? raw.designPhilosophy ?? cadSpec.designPhilosophy,
      designPhilosophy:
        raw.designPhilosophy ?? raw.description ?? cadSpec.designPhilosophy,
      overallBoundingBoxMm: cadSpec.overallBoundingBoxMm,
      printedPartsCount: printed.length,
      purchasedPartsCount: purchased.length,
      assemblyNotes: cadSpec.assemblyNotes,
      printed,
      purchased,
      assembly,
      parts: cadSpec.parts as unknown as SharedDesignPart[],
    };
  }

  // Shared-contract or hybrid input: normalize with lib/cad/adapters.ts
  const spec = normalizeDesignSpec(rawInput);
  const zUp = isCadZUpDesign(spec.parts);

  // Track raw explicit step per partId so we know whether `part.step` was explicitly provided
  const rawPartsArray = Array.isArray(raw.parts) ? raw.parts : [];
  const explicitStepByPartId = new Map<string, number>();
  rawPartsArray.forEach((rp: any) => {
    if (rp && typeof rp.id === "string" && typeof rp.step === "number") {
      explicitStepByPartId.set(rp.id, rp.step);
    }
  });

  const printed: PrintedPartSpec[] = [];
  const purchased: PurchasedPartSpec[] = [];
  const assembly: AssemblyNode[] = [];
  const adaptedParts: SharedDesignPart[] = [];

  spec.parts.forEach((p, idx) => {
    const shape = normalizePartShape(p.shape) as PartShape;
    const params = enrichPartParams(shape, p.params, p.dims_mm, zUp);
    const position = toThreeVec3(p.position, zUp);
    const explode = toThreeVec3(p.explode, zUp);

    // Normalize rotation: if Z-up CAD coordinates had 90/180 X flips for Z-extruded shapes,
    // our Three.js geometry builders already orient heights along +Y.
    const rotation: [number, number, number] = zUp
      ? [0, p.rotation[2] || 0, 0]
      : [...p.rotation];

    const step =
      explicitStepByPartId.get(p.id) ??
      firstStepByPartId.get(p.id) ??
      p.step ??
      idx + 1;

    if (p.kind === "printed") {
      printed.push({
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        shape,
        params,
        dims_mm: p.dims_mm,
        color: p.color,
        material: p.material,
        quantity: p.quantity ?? 1,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        bomRef: p.bomRef,
        step,
      });
    } else {
      purchased.push({
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        bomLine: p.bomRef ?? p.id,
        bomRef: p.bomRef,
        color: p.color,
        material: p.material,
        quantity: p.quantity ?? 1,
        dims_mm: p.dims_mm,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        step,
        proxyShape: {
          shape,
          params,
        },
      });
    }

    assembly.push({
      partId: p.id,
      position,
      rotation,
      explode,
      step,
    });

    adaptedParts.push({
      ...p,
      shape,
      params,
      position,
      rotation,
      explode,
      step,
    });
  });

  return {
    name: spec.objectName,
    objectName: spec.objectName,
    description: spec.designPhilosophy ?? spec.summary,
    designPhilosophy: spec.designPhilosophy ?? spec.summary,
    summary: spec.summary,
    overallBoundingBoxMm: spec.overallBoundingBoxMm,
    printedPartsCount: printed.length,
    purchasedPartsCount: purchased.length,
    assemblyNotes: spec.assemblyNotes,
    printed,
    purchased,
    assembly,
    parts: adaptedParts,
  };
}

/**
 * Adapts either the shared-contract `InstructionsData` (`{ steps: [{ n, title, partIds, tools, note, motion }] }`)
 * or the internal `InstructionsData` into a normalized `InstructionsData` with `action` and Three.js Y-up `motion` vectors.
 * Reuses `normalizeInstructions` from `lib/cad/adapters.ts`.
 */
export function adaptInstructions(
  rawInput: unknown,
  rawDesign?: unknown
): InstructionsData {
  if (!rawInput || typeof rawInput !== "object") {
    return { steps: [] };
  }

  const normalized = normalizeInstructions(rawInput, rawDesign);

  // Check if either the design or the raw motion vectors use CAD Z-up
  let zUp = false;
  if (rawDesign && typeof rawDesign === "object") {
    const rawParts = (rawDesign as Record<string, any>).parts;
    if (Array.isArray(rawParts)) {
      zUp = isCadZUpDesign(rawParts);
    }
  } else {
    // Infer from motion vectors if design was not passed
    let zDeltaSum = 0;
    let yDeltaSum = 0;
    for (const s of normalized.steps) {
      for (const m of s.motion ?? []) {
        yDeltaSum += Math.abs((m.from?.[1] ?? 0) - (m.to?.[1] ?? 0));
        zDeltaSum += Math.abs((m.from?.[2] ?? 0) - (m.to?.[2] ?? 0));
      }
    }
    if (zDeltaSum > yDeltaSum * 1.5 && zDeltaSum > 20) {
      zUp = true;
    }
  }

  const steps: InstructionStep[] = normalized.steps.map((s) => {
    const action = normalizeAssemblyAction(
      s.action,
      s.actionType,
      s.title,
      s.tools
    );
    const motion: StepMotion[] = (s.motion ?? []).map((m) => ({
      partId: m.partId,
      from: toThreeVec3(m.from, zUp),
      to: toThreeVec3(m.to, zUp),
    }));

    return {
      n: s.n,
      title: s.title,
      partIds: s.partIds,
      action,
      actionType: s.actionType ?? action,
      tools: s.tools ?? [],
      note: s.note,
      description: s.description ?? s.note,
      motion,
    };
  });

  return {
    objectId: normalized.objectId,
    objectName: normalized.objectName,
    totalSteps: steps.length,
    estimatedMinutes: normalized.estimatedMinutes,
    estimatedTotalMinutes: normalized.estimatedTotalMinutes,
    difficulty: normalized.difficulty,
    safetyNotes: normalized.safetyNotes,
    steps,
  };
}

/**
 * Adapts either the shared-contract `BomData` (`{ currency, items: [{ unitPrice, totalPrice, retailerLinks, linkedPartIds }], summary }`)
 * or the internal `BomData` (`{ items: [{ priceUsd, links }], originalPriceUsd }`) so both sets of fields are always populated.
 */
export function adaptBom(rawInput: unknown): BomData {
  if (!rawInput || typeof rawInput !== "object") {
    return { items: [] };
  }

  const raw = rawInput as Record<string, any>;
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  const items: BomItem[] = rawItems.map((item: any, idx: number) => {
    const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
    const unitPrice = Number(
      item?.unitPrice ?? item?.priceUsd ?? item?.totalPrice ?? 0
    );
    const totalPrice = Number(
      item?.totalPrice ?? item?.priceUsd ?? unitPrice * qty
    );
    const priceUsd = Number(
      item?.priceUsd ?? item?.totalPrice ?? item?.unitPrice ?? 0
    );

    const rawLinks = Array.isArray(item?.links)
      ? item.links
      : Array.isArray(item?.retailerLinks)
        ? item.retailerLinks
        : [];

    const links: BomRetailerLink[] = rawLinks.map((l: any) => ({
      retailer: String(l?.retailer || "Amazon"),
      url: String(l?.url || "https://www.amazon.com"),
      estPrice:
        typeof l?.estPrice === "number" ? l.estPrice : priceUsd,
      inStock: l?.inStock ?? true,
    }));

    return {
      id: String(item?.id || `bom-${idx + 1}`),
      partNumber: item?.partNumber,
      partId: item?.partId,
      name: String(item?.name || `BOM Item ${idx + 1}`),
      category: item?.category,
      specification: item?.specification ?? item?.specs,
      qty,
      unit: item?.unit || "pc",
      unitPrice,
      totalPrice,
      priceUsd,
      primaryRetailer: item?.primaryRetailer ?? links[0]?.retailer,
      primaryUrl: item?.primaryUrl ?? links[0]?.url,
      links,
      retailerLinks: links,
      linkedPartIds: Array.isArray(item?.linkedPartIds)
        ? item.linkedPartIds.map(String)
        : item?.partId
          ? [String(item.partId)]
          : [],
      notes: item?.notes,
    };
  });

  const originalPriceUsd =
    Number(
      raw.originalPriceUsd ??
        raw.originalPrice ??
        raw.summary?.originalRetailPrice
    ) || undefined;

  return {
    currency: raw.currency || "USD",
    originalPriceUsd,
    items,
    summary: raw.summary,
  };
}

/**
 * Adapts either the shared-contract `PlatesData` / `UnifiedPlatesArtifact`
 * (`{ printerName, bedDimensionsMm, plates: [{ plateNumber, utilizationPercent, placements: [{ width, depth, height }] }] }`)
 * or the internal `PlatesData` (`{ printer: { name, bed }, plates: [{ index, utilization, items: [{ w, h }] }] }`)
 * into a unified `PlatesData` object.
 */
export function adaptPlates(rawInput: unknown): PlatesData {
  if (!rawInput || typeof rawInput !== "object") {
    return {
      printer: { name: "Bambu Lab A1", bed: { x: 256, y: 256, z: 256 } },
      plates: [],
    };
  }

  const raw = rawInput as Record<string, any>;
  const rawBedDims = Array.isArray(raw.bedDimensionsMm)
    ? raw.bedDimensionsMm
    : undefined;

  const bedX = Number(raw.printer?.bed?.x ?? rawBedDims?.[0] ?? 256) || 256;
  const bedY = Number(raw.printer?.bed?.y ?? rawBedDims?.[1] ?? 256) || 256;
  const bedZ = Number(raw.printer?.bed?.z ?? rawBedDims?.[2] ?? 256) || 256;

  const printerName = String(
    raw.printer?.name ?? raw.printerName ?? "Bambu Lab A1"
  );
  const printerId = String(raw.printer?.id ?? raw.printerId ?? "bambu-a1");

  const rawPlates = Array.isArray(raw.plates) ? raw.plates : [];

  const plates: PrintPlate[] = rawPlates.map((p: any, pIdx: number) => {
    const rawItems = Array.isArray(p?.items)
      ? p.items
      : Array.isArray(p?.placements)
        ? p.placements
        : [];

    // Check if any placement uses centered/negative coordinates (e.g. SAMPLE_PLATES in lib/sample-data.ts)
    const hasNegativeCoords = rawItems.some(
      (it: any) => Number(it?.x) < 0 || Number(it?.y) < 0
    );

    const items: PlateItemFootprint[] = rawItems.map(
      (item: any, iIdx: number) => {
        const w =
          Number(item?.w ?? item?.width ?? item?.dims_mm?.[0] ?? 30) || 30;
        // Important: in shared contract, `depth` is Y footprint on bed and `height` is Z vertical height!
        // Only fall back to `item.h` when `item.depth` is not defined or when `item.w` was explicitly used.
        const h =
          Number(
            item?.w !== undefined && item?.h !== undefined
              ? item.h
              : item?.depth ?? item?.h ?? item?.dims_mm?.[1] ?? 30
          ) || 30;
        const partHeight =
          Number(item?.height ?? item?.dims_mm?.[2] ?? 20) || 20;

        let x = Number(item?.x ?? 10);
        let y = Number(item?.y ?? 10);
        if (hasNegativeCoords) {
          x = x + bedX / 2;
          y = y + bedY / 2;
        }

        return {
          partId: String(item?.partId || `part-${iIdx + 1}`),
          name: String(item?.name || item?.partId || `Part ${iIdx + 1}`),
          copy: Number(item?.copy ?? item?.copyIndex ?? 1) || 1,
          copyIndex: Number(item?.copyIndex ?? item?.copy ?? 1) || 1,
          x,
          y,
          w,
          h,
          width: w,
          depth: h,
          height: partHeight,
          rotated: Boolean(item?.rotated),
          color: item?.color,
          stlFile: item?.stlFile,
        };
      }
    );

    const plateNumber =
      Number(p?.plateNumber) ||
      (typeof p?.index === "number"
        ? p.index === 0 && rawPlates.length >= 1 && p?.plateNumber === undefined
          ? p.index + 1
          : p.index
        : pIdx + 1);

    const utilization =
      typeof p?.utilization === "number"
        ? p.utilization
        : typeof p?.utilizationPercent === "number"
          ? p.utilizationPercent / 100
          : 0;

    const utilizationPercent =
      typeof p?.utilizationPercent === "number"
        ? p.utilizationPercent
        : utilization <= 1
          ? Math.round(utilization * 1000) / 10
          : utilization;

    return {
      index: plateNumber,
      plateNumber,
      name: p?.name || `Plate ${plateNumber} — ${printerName}`,
      printerId: p?.printerId || printerId,
      printerName: p?.printerName || printerName,
      bedDimensionsMm: p?.bedDimensionsMm || [bedX, bedY, bedZ],
      items,
      placements: items,
      utilization,
      utilizationPercent,
      estPrintTimeMin: Number(p?.estPrintTimeMin ?? p?.estimatedMinutes) || undefined,
      estimatedMinutes: Number(p?.estimatedMinutes ?? p?.estPrintTimeMin) || undefined,
      filamentGrams: Number(p?.filamentGrams ?? p?.weightGrams) || undefined,
      weightGrams: Number(p?.weightGrams ?? p?.filamentGrams) || undefined,
      stlFile: p?.stlFile ?? p?.file,
    };
  });

  return {
    printer: {
      id: printerId,
      name: printerName,
      bed: { x: bedX, y: bedY, z: bedZ },
    },
    printerId,
    printerName,
    bedDimensionsMm: [bedX, bedY, bedZ],
    totalPlates: Number(raw.totalPlates) || plates.length,
    totalWeightGrams: Number(raw.totalWeightGrams) || undefined,
    totalPrintTimeMinutes: Number(raw.totalPrintTimeMinutes) || undefined,
    parts: Array.isArray(raw.parts) ? raw.parts : undefined,
    plates,
  };
}

/**
 * Resolves `design`, `bom`, and `instructions` (each in either shared-contract or internal shape)
 * into a normalized list of 3D instances ready for rendering in ExplodedView and AssemblyPlayer.
 */
export function resolveAssemblyParts(
  designInput: unknown,
  bomInput?: unknown,
  instructionsInput?: unknown
): ResolvedAssemblyPart[] {
  const design = adaptDesign(designInput, instructionsInput);
  const bom = bomInput ? adaptBom(bomInput) : undefined;
  const instructions = instructionsInput
    ? adaptInstructions(instructionsInput, designInput)
    : undefined;

  const printedMap = new Map<string, PrintedPartSpec>();
  const purchasedMap = new Map<string, PurchasedPartSpec>();

  (design.printed ?? []).forEach((p) => printedMap.set(p.id, p));
  (design.purchased ?? []).forEach((p) => purchasedMap.set(p.id, p));

  const bomById = new Map<string, BomItem>();
  (bom?.items ?? []).forEach((item) => {
    bomById.set(item.id, item);
    bomById.set(item.name.toLowerCase(), item);
    if (item.partId) bomById.set(item.partId, item);
    if (item.partNumber) bomById.set(item.partNumber, item);
    (item.linkedPartIds ?? []).forEach((pid) => {
      if (!bomById.has(pid)) {
        bomById.set(pid, item);
      }
    });
  });

  const stepByNumber = new Map<number, InstructionStep>();
  const stepByPartId = new Map<string, InstructionStep>();
  (instructions?.steps ?? []).forEach((s) => {
    stepByNumber.set(s.n, s);
    // Prioritize motion partIds first so parts are assigned to the step where they move into place
    (s.motion ?? []).forEach((m) => {
      if (m.partId && !stepByPartId.has(m.partId)) {
        stepByPartId.set(m.partId, s);
      }
    });
    (s.partIds ?? []).forEach((pid) => {
      if (!stepByPartId.has(pid)) {
        stepByPartId.set(pid, s);
      }
    });
  });

  const assemblyList = design.assembly ?? [];
  const results: ResolvedAssemblyPart[] = [];

  assemblyList.forEach((node, idx) => {
    const printed = printedMap.get(node.partId);
    const purchased = purchasedMap.get(node.partId);

    const stepFromInstructions = stepByPartId.get(node.partId)?.n;
    const stepNum = stepFromInstructions ?? node.step ?? idx + 1;
    const stepInfo =
      stepByNumber.get(stepNum) ?? stepByPartId.get(node.partId);

    if (printed) {
      const color =
        printed.color ||
        DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length];
      const matchedBom =
        (printed.bomRef && bomById.get(printed.bomRef)) ||
        bomById.get(printed.id);

      results.push({
        instanceId: `${node.partId}-${idx}`,
        partId: node.partId,
        partNumber: printed.partNumber,
        name: printed.name,
        category: "printed",
        shape: printed.shape || "box",
        params: printed.params || {},
        dims_mm: printed.dims_mm,
        color,
        material: printed.material,
        description: printed.description,
        roleInAssembly: printed.roleInAssembly,
        quantity: printed.quantity ?? 1,
        position: node.position || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        explode: node.explode || [0, 40, 0],
        step: stepNum,
        bomRef: printed.bomRef,
        bomItem: matchedBom,
        stepInfo,
      });
    } else if (purchased) {
      const color =
        purchased.color ||
        DEFAULT_PURCHASED_PALETTE[idx % DEFAULT_PURCHASED_PALETTE.length];
      const matchedBom =
        (purchased.bomRef && bomById.get(purchased.bomRef)) ||
        (purchased.bomLine &&
          (bomById.get(purchased.bomLine) ||
            bomById.get(purchased.bomLine.toLowerCase()))) ||
        bomById.get(purchased.id) ||
        (purchased.partNumber ? bomById.get(purchased.partNumber) : undefined) ||
        bomById.get(purchased.name.toLowerCase());

      results.push({
        instanceId: `${node.partId}-${idx}`,
        partId: node.partId,
        partNumber: purchased.partNumber,
        name: purchased.name,
        category: "purchased",
        shape: (purchased.proxyShape?.shape as PartShape) || "cylinder",
        params: purchased.proxyShape?.params || {},
        dims_mm: purchased.dims_mm,
        color,
        material: purchased.material,
        description: purchased.description,
        roleInAssembly: purchased.roleInAssembly,
        quantity: purchased.quantity ?? matchedBom?.qty ?? 1,
        position: node.position || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0],
        explode: node.explode || [0, 50, 0],
        step: stepNum,
        bomRef: purchased.bomRef,
        bomLine: purchased.bomLine || matchedBom?.name,
        bomItem: matchedBom,
        stepInfo,
      });
    } else {
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

  // Fallback if assembly list was empty
  if (results.length === 0) {
    let idx = 0;
    for (const p of design.printed ?? []) {
      results.push({
        instanceId: `${p.id}-${idx}`,
        partId: p.id,
        partNumber: p.partNumber,
        name: p.name,
        category: "printed",
        shape: p.shape || "box",
        params: p.params || {},
        dims_mm: p.dims_mm,
        color:
          p.color ||
          DEFAULT_PRINTED_PALETTE[idx % DEFAULT_PRINTED_PALETTE.length],
        material: p.material,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        quantity: p.quantity ?? 1,
        position: [(idx - 2) * 45, 0, 0],
        rotation: [0, 0, 0],
        explode: [0, 40 + idx * 12, 0],
        step: p.step ?? idx + 1,
        bomRef: p.bomRef,
      });
      idx++;
    }
    for (const p of design.purchased ?? []) {
      const matchedBom =
        (p.bomRef && bomById.get(p.bomRef)) ||
        (p.bomLine &&
          (bomById.get(p.bomLine) || bomById.get(p.bomLine.toLowerCase()))) ||
        bomById.get(p.id);
      results.push({
        instanceId: `${p.id}-${idx}`,
        partId: p.id,
        partNumber: p.partNumber,
        name: p.name,
        category: "purchased",
        shape: (p.proxyShape?.shape as PartShape) || "cylinder",
        params: p.proxyShape?.params || {},
        dims_mm: p.dims_mm,
        color:
          p.color ||
          DEFAULT_PURCHASED_PALETTE[idx % DEFAULT_PURCHASED_PALETTE.length],
        material: p.material,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        quantity: p.quantity ?? matchedBom?.qty ?? 1,
        position: [(idx - 2) * 45, 30, 0],
        rotation: [0, 0, 0],
        explode: [0, 60 + idx * 10, 0],
        step: p.step ?? idx + 1,
        bomRef: p.bomRef,
        bomLine: p.bomLine || matchedBom?.name,
        bomItem: matchedBom,
      });
      idx++;
    }
  }

  return results;
}

export { normalizeDesignPart, normalizeDesignSpec, normalizeInstructions, normalizePartShape };
