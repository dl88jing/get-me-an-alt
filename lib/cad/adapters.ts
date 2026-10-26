import { DEFAULT_PRINTER_ID, getPrinterById, Printer } from "../printers";
import {
  generatePartMesh,
  ManifoldReport,
  TriangleMesh,
  validateManifold,
} from "./geometry";
import { PackOptions, packPrintedParts, PackResult, RejectedPart } from "./packer";
import {
  AssemblyNode,
  DesignPart,
  DesignPartShape,
  DesignSpec,
  InstructionMotion,
  InstructionStepSpec,
  InstructionsSpec,
  PrintedPart,
  PurchasedPart,
} from "./parts";
import {
  estimatePartPrint,
  estimatePlatePrint,
  formatPrintDuration,
  PartPrintEstimate,
} from "./estimate";
import {
  meshToBinaryStl,
  MultiPlate3mfSpec,
  Plate3mfItem,
  writeMultiPlate3mf,
  writePlate3mf,
} from "./stl";

const DEFAULT_PART_COLORS = [
  "#d4af37",
  "#b89b4a",
  "#c87d4b",
  "#d4af37",
  "#9c7a4c",
  "#b87333",
  "#e6c365",
  "#b45309",
  "#c84b31",
  "#e6c365",
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizePartShape(rawShape: unknown): DesignPartShape {
  const s = String(rawShape || "box").trim();
  switch (s) {
    case "box":
    case "cylinder":
    case "tube":
    case "bracketL":
    case "plate_with_holes":
    case "hook":
    case "clip":
    case "funnel":
    case "gear_simple":
    case "custom_csg":
    case "cone":
    case "sphere":
    case "bracket":
    case "enclosure":
      return s;
    default:
      return "box";
  }
}

/**
 * Computes the exact [x, y, z] bounding box dimensions in mm for a shape + params.
 */
export function computePartDimsMm(
  shape: DesignPartShape,
  params: Record<string, any>,
  fallbackDims?: [number, number, number]
): [number, number, number] {
  try {
    const mesh = generatePartMesh({
      shape,
      params,
      dims_mm: fallbackDims,
    });
    return [
      round2(mesh.bbox.size[0]),
      round2(mesh.bbox.size[1]),
      round2(mesh.bbox.size[2]),
    ];
  } catch {
    return fallbackDims ?? [40, 40, 25];
  }
}

/**
 * Normalizes a single part (from either the flat shared contract `parts[]` or legacy
 * `printedParts[]` / `purchasedParts[]`) into the shared contract `DesignPart`.
 */
export function normalizeDesignPart(
  raw: unknown,
  idx = 0,
  assemblyNode?: Partial<AssemblyNode>,
  forcedKind?: "printed" | "purchased"
): DesignPart {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const proxy =
    p.proxyShape && typeof p.proxyShape === "object"
      ? (p.proxyShape as Record<string, any>)
      : undefined;

  const kind: "printed" | "purchased" =
    forcedKind ??
    (p.kind === "purchased" ||
    p.type === "purchased" ||
    p.category === "purchased" ||
    Boolean(proxy) ||
    Boolean(p.bomLine)
      ? "purchased"
      : "printed");

  const id =
    typeof p.id === "string" && p.id.trim()
      ? p.id.trim()
      : `part-${idx + 1}`;
  const name =
    typeof p.name === "string" && p.name.trim()
      ? p.name.trim()
      : `Part ${idx + 1}`;

  const shape = normalizePartShape(p.shape ?? proxy?.shape ?? "box");
  const params: Record<string, any> =
    p.params && typeof p.params === "object"
      ? { ...p.params }
      : proxy?.params && typeof proxy.params === "object"
        ? { ...proxy.params }
        : {};

  const rawDims = p.dims_mm ?? p.dimensionsMm;
  const fallbackDims: [number, number, number] | undefined =
    Array.isArray(rawDims) && rawDims.length >= 3
      ? toVec3(rawDims, [40, 40, 25])
      : undefined;

  const dims_mm = fallbackDims ?? computePartDimsMm(shape, params);

  const angle = (idx / 8) * Math.PI * 2;
  const defaultExplode: [number, number, number] = [
    Math.round(Math.cos(angle) * 60),
    Math.round(Math.sin(angle) * 60),
    40 + idx * 10,
  ];

  const position = toVec3(
    p.position ?? assemblyNode?.position,
    [0, 0, idx * 15]
  );
  const rotation = toVec3(
    p.rotation ?? assemblyNode?.rotation,
    [0, 0, 0]
  );
  const explode = toVec3(
    p.explode ?? p.explodeVector ?? assemblyNode?.explode,
    defaultExplode
  );

  const color =
    typeof p.color === "string" && p.color.trim()
      ? p.color.trim()
      : typeof proxy?.color === "string" && proxy.color.trim()
        ? proxy.color.trim()
        : DEFAULT_PART_COLORS[idx % DEFAULT_PART_COLORS.length];

  const bomRef =
    typeof p.bomRef === "string" && p.bomRef.trim()
      ? p.bomRef.trim()
      : typeof p.bomLine === "string" && p.bomLine.trim()
        ? p.bomLine.trim()
        : kind === "printed"
          ? "bom-filament-petg"
          : undefined;

  const quantity = Math.max(1, Math.floor(Number(p.quantity ?? p.qty ?? 1) || 1));

  return {
    id,
    partNumber:
      typeof p.partNumber === "string" && p.partNumber.trim()
        ? p.partNumber.trim()
        : undefined,
    name,
    kind,
    dims_mm,
    shape,
    params,
    position,
    rotation,
    explode,
    color,
    bomRef,
    material:
      typeof p.material === "string" && p.material.trim()
        ? p.material.trim()
        : kind === "printed"
          ? "PETG"
          : "Off-the-Shelf Hardware",
    quantity,
    description:
      typeof p.description === "string" ? p.description : undefined,
    roleInAssembly:
      typeof p.roleInAssembly === "string" ? p.roleInAssembly : undefined,
    infillPercent:
      typeof p.infillPercent === "number" ? p.infillPercent : undefined,
    layerHeightMm:
      typeof p.layerHeightMm === "number" ? p.layerHeightMm : undefined,
    supportsRequired:
      typeof p.supportsRequired === "boolean" ? p.supportsRequired : false,
    step:
      typeof p.step === "number"
        ? p.step
        : typeof assemblyNode?.step === "number"
          ? assemblyNode.step
          : undefined,
    scadCode: typeof p.scadCode === "string" ? p.scadCode : undefined,
    stlBase64: typeof p.stlBase64 === "string" ? p.stlBase64 : undefined,
    stlFile: typeof p.stlFile === "string" ? p.stlFile : undefined,
    cadGrounded:
      typeof p.cadGrounded === "boolean" ? p.cadGrounded : undefined,
  };
}

/**
 * Normalizes any design.json structure (either the shared contract with flat `parts[]`,
 * or legacy `{ printedParts, purchasedParts, assembly }`, or viewer `{ printed, purchased, assembly }`)
 * into a unified `DesignSpec` with both `parts` and legacy fields populated.
 */
export function normalizeDesignSpec(raw: unknown): DesignSpec {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  const assemblyList: AssemblyNode[] = Array.isArray(d.assembly)
    ? d.assembly.map((node: any, idx: number) => ({
        id: typeof node?.id === "string" ? node.id : `node-${node?.partId ?? idx + 1}`,
        partId: String(node?.partId ?? `part-${idx + 1}`),
        copy: Number(node?.copy) || 1,
        position: toVec3(node?.position, [0, 0, 0]),
        rotation: toVec3(node?.rotation, [0, 0, 0]),
        explode: toVec3(node?.explode, [0, 0, 45]),
        step: Number(node?.step) || idx + 1,
      }))
    : [];

  const firstAssemblyByPartId = new Map<string, AssemblyNode>();
  for (const node of assemblyList) {
    if (!firstAssemblyByPartId.has(node.partId)) {
      firstAssemblyByPartId.set(node.partId, node);
    }
  }

  let parts: DesignPart[] = [];

  if (Array.isArray(d.parts) && d.parts.length > 0) {
    parts = d.parts.map((rawPart: unknown, idx: number) => {
      const pid = (rawPart as any)?.id;
      const asmNode = typeof pid === "string" ? firstAssemblyByPartId.get(pid) : undefined;
      return normalizeDesignPart(rawPart, idx, asmNode);
    });
  } else {
    const rawPrinted = Array.isArray(d.printedParts)
      ? d.printedParts
      : Array.isArray(d.printed)
        ? d.printed
        : [];
    const rawPurchased = Array.isArray(d.purchasedParts)
      ? d.purchasedParts
      : Array.isArray(d.purchased)
        ? d.purchased
        : [];

    let idx = 0;
    for (const rp of rawPrinted) {
      const pid = (rp as any)?.id;
      const asmNode = typeof pid === "string" ? firstAssemblyByPartId.get(pid) : undefined;
      parts.push(normalizeDesignPart(rp, idx++, asmNode, "printed"));
    }
    for (const op of rawPurchased) {
      const pid = (op as any)?.id;
      const asmNode = typeof pid === "string" ? firstAssemblyByPartId.get(pid) : undefined;
      parts.push(normalizeDesignPart(op, idx++, asmNode, "purchased"));
    }
  }

  // Assign partNumbers if missing
  let prtIdx = 1;
  let otsIdx = 1;
  for (const part of parts) {
    if (!part.partNumber) {
      part.partNumber =
        part.kind === "printed"
          ? `PRT-${String(prtIdx++).padStart(2, "0")}`
          : `OTS-${String(otsIdx++).padStart(2, "0")}`;
    }
  }

  const printedParts: PrintedPart[] = parts
    .filter((p) => p.kind === "printed")
    .map((p) => ({
      id: p.id,
      name: p.name,
      shape: p.shape,
      params: p.params,
      dims_mm: p.dims_mm,
      material: p.material,
      color: p.color,
      quantity: p.quantity ?? 1,
      description: p.description,
    }));

  const purchasedParts: PurchasedPart[] = parts
    .filter((p) => p.kind === "purchased")
    .map((p) => ({
      id: p.id,
      name: p.name,
      bomLine: p.bomRef ?? p.id,
      proxyShape: {
        shape: p.shape,
        params: p.params,
        color: p.color,
      },
      quantity: p.quantity ?? 1,
      color: p.color,
      description: p.description,
    }));

  const resolvedAssembly: AssemblyNode[] =
    assemblyList.length > 0
      ? assemblyList
      : parts.map((p, idx) => ({
          id: `node-${p.id}`,
          partId: p.id,
          copy: 1,
          position: p.position,
          rotation: p.rotation,
          explode: p.explode,
          step: p.step ?? idx + 1,
        }));

  const objectName =
    typeof d.objectName === "string"
      ? d.objectName
      : typeof d.name === "string"
        ? d.name
        : "DIY Alternative Object";

  const summary =
    typeof d.summary === "string"
      ? d.summary
      : typeof d.designPhilosophy === "string"
        ? d.designPhilosophy
        : typeof d.description === "string"
          ? d.description
          : undefined;

  return {
    objectName,
    designPhilosophy:
      typeof d.designPhilosophy === "string" ? d.designPhilosophy : summary,
    summary,
    overallBoundingBoxMm: Array.isArray(d.overallBoundingBoxMm)
      ? toVec3(d.overallBoundingBoxMm, [185, 140, 165])
      : [185, 140, 165],
    printedPartsCount: printedParts.length,
    purchasedPartsCount: purchasedParts.length,
    assemblyNotes: Array.isArray(d.assemblyNotes) ? d.assemblyNotes : undefined,
    parts,
    printedParts,
    purchasedParts,
    assembly: resolvedAssembly,
  };
}

/**
 * Extracts only the printed parts (`kind === "printed"`) from a DesignSpec or part array.
 */
export function getPrintedParts(input: unknown): DesignPart[] {
  if (Array.isArray(input)) {
    return input
      .map((item, idx) => normalizeDesignPart(item, idx))
      .filter((p) => p.kind === "printed");
  }
  const spec = normalizeDesignSpec(input);
  return spec.parts.filter((p) => p.kind === "printed");
}

/**
 * Extracts only the purchased parts (`kind === "purchased"`) from a DesignSpec or part array.
 */
export function getPurchasedParts(input: unknown): DesignPart[] {
  if (Array.isArray(input)) {
    return input
      .map((item, idx) => normalizeDesignPart(item, idx))
      .filter((p) => p.kind === "purchased");
  }
  const spec = normalizeDesignSpec(input);
  return spec.parts.filter((p) => p.kind === "purchased");
}

/**
 * Normalizes an instructions.json payload so every step includes:
 * `{ n, title, partIds:[], tools:[], note, motion:{ partId, from:[x,y,z], to:[x,y,z] }[] }`
 * while preserving optional `step`, `description`, `action`, `cameraHint` fields.
 */
export function normalizeInstructions(
  raw: unknown,
  designInput?: unknown
): InstructionsSpec {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const spec = designInput ? normalizeDesignSpec(designInput) : undefined;
  const partsById = new Map<string, DesignPart>(
    (spec?.parts ?? []).map((p) => [p.id, p])
  );

  const rawSteps = Array.isArray(d.steps) ? d.steps : [];
  const seenParts = new Set<string>();

  const steps: InstructionStepSpec[] = rawSteps.map((rawStep: any, idx: number) => {
    const s = (rawStep && typeof rawStep === "object" ? rawStep : {}) as Record<
      string,
      any
    >;
    const n = Number(s.n ?? s.step ?? s.stepNumber) || idx + 1;
    const title =
      typeof s.title === "string" && s.title.trim()
        ? s.title.trim()
        : `Step ${n}`;
    const partIds: string[] = Array.isArray(s.partIds)
      ? s.partIds.map(String)
      : Array.isArray(s.activePartIds)
        ? s.activePartIds.map(String)
        : [];
    const tools: string[] = Array.isArray(s.tools)
      ? s.tools.map(String)
      : [];
    const note =
      typeof s.note === "string" && s.note.trim()
        ? s.note.trim()
        : typeof s.description === "string" && s.description.trim()
          ? s.description.trim()
          : `Assemble ${partIds.join(", ")} in step ${n}.`;

    let motion: InstructionMotion[] = [];
    if (Array.isArray(s.motion) && s.motion.length > 0) {
      motion = s.motion.map((m: any) => {
        const pid = String(m?.partId ?? partIds[0] ?? `part-${n}`);
        const part = partsById.get(pid);
        const to: [number, number, number] = toVec3(
          m?.to,
          part ? part.position : [0, 0, 0]
        );
        const defaultFrom: [number, number, number] = part
          ? [
              round2(part.position[0] + part.explode[0]),
              round2(part.position[1] + part.explode[1]),
              round2(part.position[2] + part.explode[2]),
            ]
          : [to[0], to[1], to[2] + 80];
        const from: [number, number, number] = toVec3(m?.from, defaultFrom);
        return { partId: pid, from, to };
      });
    } else {
      // Determine which parts in `partIds` are being newly introduced in this step
      const newlyAdded = partIds.filter((pid) => !seenParts.has(pid));
      const motionPartIds = newlyAdded.length > 0 ? newlyAdded : partIds.slice(0, 1);
      motion = motionPartIds.map((pid) => {
        const part = partsById.get(pid);
        const to: [number, number, number] = part
          ? [...part.position]
          : [0, 0, idx * 20];
        const from: [number, number, number] = part
          ? [
              round2(part.position[0] + part.explode[0]),
              round2(part.position[1] + part.explode[1]),
              round2(part.position[2] + part.explode[2]),
            ]
          : [to[0], to[1], to[2] + 80];
        return { partId: pid, from, to };
      });
    }

    for (const pid of partIds) {
      seenParts.add(pid);
    }

    return {
      n,
      step: n,
      title,
      partIds,
      tools,
      note,
      description:
        typeof s.description === "string" ? s.description : note,
      motion,
      action: typeof s.action === "string" ? s.action : s.actionType,
      actionType: typeof s.actionType === "string" ? s.actionType : s.action,
      cameraHint: s.cameraHint,
    };
  });

  const estMin =
    Number(d.estimatedTotalMinutes ?? d.estimatedMinutes) || 25;

  return {
    objectId: typeof d.objectId === "string" ? d.objectId : undefined,
    objectName:
      typeof d.objectName === "string"
        ? d.objectName
        : spec?.objectName,
    totalSteps: steps.length,
    estimatedMinutes: estMin,
    estimatedTotalMinutes: estMin,
    difficulty: typeof d.difficulty === "string" ? d.difficulty : "Beginner",
    safetyNotes: Array.isArray(d.safetyNotes) ? d.safetyNotes : undefined,
    steps,
  };
}

export interface GeneratedStlArtifact {
  partId: string;
  name: string;
  shape: DesignPartShape;
  material: string;
  color: string;
  quantity: number;
  /** Filename inside `parts/`, e.g. `reservoir-tank.stl` */
  fileName: string;
  /** Relative path from object folder, e.g. `parts/reservoir-tank.stl` */
  stlFile: string;
  /** Optional relative path to OpenSCAD source, e.g. `parts/reservoir-tank.scad` */
  scadFile?: string;
  scadSource?: string;
  cadEngine?: "openscad-wasm" | "procedural";
  bytes: Uint8Array;
  byteLength: number;
  dims_mm: [number, number, number];
  weightGrams: number;
  filamentGrams: number;
  filamentMeters: number;
  estimatedMinutes: number;
  printTimeMinutes: number;
  formattedTime: string;
  surfaceAreaMm2: number;
  estimate: PartPrintEstimate;
  mesh: TriangleMesh;
  manifold: ManifoldReport;
}

export interface GeneratedPlate3mfArtifact {
  plateNumber: number;
  index: number;
  fileName: string;
  relativePath: string;
  bytes: Uint8Array;
  byteLength: number;
}

export interface GeneratedMultiPlate3mfArtifact {
  fileName: string;
  relativePath: string;
  plateCount: number;
  bytes: Uint8Array;
  byteLength: number;
}

export interface UnifiedPlatesArtifact {
  objectId?: string;
  printerId: string;
  printerName: string;
  bedDimensionsMm: [number, number, number];
  totalPlates: number;
  totalUniqueParts: number;
  totalPrintedItems: number;
  totalWeightGrams: number;
  totalFilamentGrams: number;
  totalFilamentMeters: number;
  totalPrintTimeMinutes: number;
  formattedTotalPrintTime: string;
  multiPlate3mfFile: string;
  multiPlate3mfBytes: number;
  printer: Printer;
  margin: number;
  spacing: number;
  heuristicUsed: string;
  parts: Array<{
    partId: string;
    name: string;
    shape: DesignPartShape;
    stlFile: string;
    file: string;
    scadFile?: string;
    cadEngine?: "openscad-wasm" | "procedural";
    bytes: number;
    dims_mm: [number, number, number];
    dimensionsMm: [number, number, number];
    weightGrams: number;
    filamentGrams: number;
    filamentMeters: number;
    estimatedMinutes: number;
    printTimeMinutes: number;
    formattedTime: string;
    color: string;
    material: string;
    quantity: number;
    triangleCount: number;
    vertexCount: number;
    edgeCount: number;
    volumeMm3: number;
    surfaceAreaMm2: number;
    isManifold: boolean;
  }>;
  partFiles: Array<{
    partId: string;
    name: string;
    shape: DesignPartShape;
    material: string;
    color: string;
    quantity: number;
    file: string;
    stlFile: string;
    scadFile?: string;
    cadEngine?: "openscad-wasm" | "procedural";
    bytes: number;
    dimensionsMm: [number, number, number];
    dims_mm: [number, number, number];
    weightGrams: number;
    filamentGrams: number;
    filamentMeters: number;
    estimatedMinutes: number;
    printTimeMinutes: number;
    formattedTime: string;
    triangleCount: number;
    vertexCount: number;
    edgeCount: number;
    volumeMm3: number;
    surfaceAreaMm2: number;
    isManifold: boolean;
  }>;
  plates: Array<{
    plateNumber: number;
    index: number;
    name: string;
    printerId: string;
    printerName: string;
    bedDimensionsMm: [number, number, number];
    utilizationPercent: number;
    utilization: number;
    maxHeight: number;
    estimatedMinutes: number;
    printTimeMinutes: number;
    formattedTime: string;
    weightGrams: number;
    filamentGrams: number;
    filamentMeters: number;
    layers: number;
    stlFile?: string;
    file: string;
    bytes: number;
    placements: Array<{
      partId: string;
      name: string;
      copyIndex: number;
      copy: number;
      x: number;
      y: number;
      centerX: number;
      centerY: number;
      width: number;
      depth: number;
      height: number;
      rotated: boolean;
      color: string;
      stlFile: string;
      weightGrams: number;
      estimatedMinutes: number;
    }>;
    items: Array<{
      partId: string;
      name: string;
      copy: number;
      copyIndex: number;
      x: number;
      y: number;
      centerX: number;
      centerY: number;
      width: number;
      depth: number;
      height: number;
      rotated: boolean;
      color: string;
      stlFile: string;
      weightGrams: number;
      estimatedMinutes: number;
    }>;
  }>;
  rejected: RejectedPart[];
}

export interface CadGenerationBundle {
  design: DesignSpec;
  printer: Printer;
  packResult: PackResult;
  stlArtifacts: GeneratedStlArtifact[];
  plate3mfArtifacts: GeneratedPlate3mfArtifact[];
  multiPlate3mfArtifact: GeneratedMultiPlate3mfArtifact;
  platesJson: UnifiedPlatesArtifact;
}

/**
 * Generates binary STL meshes for all printed parts in a `design.json` (accepting either
 * the flat `parts[]` shared contract or legacy `printedParts[]`), packs them onto the
 * minimum number of plates for the target printer, builds per-plate `.3mf` files AND a
 * single Bambu-friendly multi-plate `.3mf` file, and returns the unified `plates.json`
 * artifact + binary buffers.
 */
export function generateCadBundle(
  designInput: unknown,
  options: {
    printerId?: string;
    objectId?: string;
    packOptions?: PackOptions;
    meshOverrides?: Map<string, TriangleMesh> | Record<string, TriangleMesh>;
    scadSources?: Map<string, string> | Record<string, string>;
  } = {}
): CadGenerationBundle {
  const design = normalizeDesignSpec(designInput);
  const printer = getPrinterById(options.printerId ?? DEFAULT_PRINTER_ID);
  const printedParts = design.parts.filter((p) => p.kind === "printed");

  const getOverrideMesh = (partId: string): TriangleMesh | undefined => {
    if (!options.meshOverrides) return undefined;
    if (options.meshOverrides instanceof Map) {
      return options.meshOverrides.get(partId);
    }
    return options.meshOverrides[partId];
  };

  const getScadSource = (partId: string): string | undefined => {
    if (!options.scadSources) return undefined;
    if (options.scadSources instanceof Map) {
      return options.scadSources.get(partId);
    }
    return options.scadSources[partId];
  };

  const meshesById = new Map<string, TriangleMesh>();
  const stlArtifacts: GeneratedStlArtifact[] = [];

  for (const part of printedParts) {
    const overrideMesh = getOverrideMesh(part.id);
    const scadSource = getScadSource(part.id);
    const mesh = overrideMesh ?? generatePartMesh(part);
    const manifold = validateManifold(mesh);
    const stlBytes = meshToBinaryStl(
      mesh,
      `GetMeAnAlt ${part.id} (${overrideMesh ? "openscad-wasm" : part.shape})`
    );

    const dims_mm: [number, number, number] = [
      round2(mesh.bbox.size[0]),
      round2(mesh.bbox.size[1]),
      round2(mesh.bbox.size[2]),
    ];
    part.dims_mm = dims_mm;

    const estimate = estimatePartPrint(mesh, {
      printer,
      infillRatio:
        typeof part.infillPercent === "number"
          ? Math.max(0.05, Math.min(1, part.infillPercent / 100))
          : 0.15,
      layerHeightMm: part.layerHeightMm ?? 0.2,
    });

    const fileName = `${part.id}.stl`;
    const stlFile = `parts/${fileName}`;
    const scadFile = scadSource ? `parts/${part.id}.scad` : undefined;

    meshesById.set(part.id, mesh);
    stlArtifacts.push({
      partId: part.id,
      name: part.name,
      shape: part.shape,
      material: part.material ?? "PLA",
      color: part.color,
      quantity: part.quantity ?? 1,
      fileName,
      stlFile,
      scadFile,
      scadSource,
      cadEngine: overrideMesh ? "openscad-wasm" : "procedural",
      bytes: stlBytes,
      byteLength: stlBytes.byteLength,
      dims_mm,
      weightGrams: estimate.filamentGrams,
      filamentGrams: estimate.filamentGrams,
      filamentMeters: estimate.filamentMeters,
      estimatedMinutes: estimate.printTimeMinutes,
      printTimeMinutes: estimate.printTimeMinutes,
      formattedTime: estimate.formattedTime,
      surfaceAreaMm2: estimate.surfaceAreaMm2,
      estimate,
      mesh,
      manifold,
    });
  }

  const packResult = packPrintedParts(
    printedParts,
    printer.bed,
    options.packOptions ?? { margin: 5, spacing: 5, allowRotation: true },
    meshesById
  );

  const stlById = new Map(stlArtifacts.map((a) => [a.partId, a]));
  const plate3mfArtifacts: GeneratedPlate3mfArtifact[] = [];
  const multiPlateSpecs: MultiPlate3mfSpec[] = [];

  const plates = packResult.plates.map((plate) => {
    const plateNumber = plate.index + 1;
    const plateTitle = `${design.objectName ?? "Object"} - Plate ${plateNumber}`;
    const plateItems3mf: Plate3mfItem[] = plate.items.map((item) => {
      const art = stlById.get(item.partId)!;
      return {
        partId: item.partId,
        name: art.name,
        copy: item.copy,
        mesh: art.mesh,
        x: item.x,
        y: item.y,
        centerX: item.centerX,
        centerY: item.centerY,
        rotated: item.rotated,
        color: art.color,
      };
    });

    multiPlateSpecs.push({
      plateIndex: plate.index,
      plateNumber,
      name: plateTitle,
      items: plateItems3mf,
    });

    const fileName = `plate-${plateNumber}.3mf`;
    const relativePath = `parts/${fileName}`;
    const zipBytes = writePlate3mf(plateItems3mf, {
      title: plateTitle,
      printerName: printer.name,
      plateIndex: plate.index,
      bedDimensionsMm: [printer.bed.x, printer.bed.y, printer.bed.z],
    });

    plate3mfArtifacts.push({
      plateNumber,
      index: plate.index,
      fileName,
      relativePath,
      bytes: zipBytes,
      byteLength: zipBytes.byteLength,
    });

    const plateEstimate = estimatePlatePrint(
      plate.items.map((item) => {
        const art = stlById.get(item.partId)!;
        return {
          estimate: art.estimate,
          heightMm: item.height,
          count: 1,
        };
      }),
      { printer }
    );

    const placements = plate.items.map((item) => {
      const art = stlById.get(item.partId)!;
      return {
        partId: item.partId,
        name: art.name,
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
        color: art.color,
        stlFile: art.stlFile,
        weightGrams: art.filamentGrams,
        estimatedMinutes: art.printTimeMinutes,
      };
    });

    return {
      plateNumber,
      index: plate.index,
      name: `Plate ${plateNumber} — ${printer.name} (${placements.length} items)`,
      printerId: printer.id,
      printerName: `${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm)`,
      bedDimensionsMm: [printer.bed.x, printer.bed.y, printer.bed.z] as [
        number,
        number,
        number,
      ],
      utilizationPercent: round2(plate.utilization * 100),
      utilization: plate.utilization,
      maxHeight: plate.maxHeight,
      estimatedMinutes: plateEstimate.printTimeMinutes,
      printTimeMinutes: plateEstimate.printTimeMinutes,
      formattedTime: plateEstimate.formattedTime,
      weightGrams: plateEstimate.filamentGrams,
      filamentGrams: plateEstimate.filamentGrams,
      filamentMeters: plateEstimate.filamentMeters,
      layers: plateEstimate.layers,
      stlFile: relativePath,
      file: relativePath,
      bytes: zipBytes.byteLength,
      placements,
      items: placements,
    };
  });

  const multiPlateFileName = "all-plates.3mf";
  const multiPlateRelPath = `parts/${multiPlateFileName}`;
  const multiPlateBytes = writeMultiPlate3mf(multiPlateSpecs, {
    title: `${design.objectName ?? "Object"} — All Plates (${printer.name})`,
    printerName: printer.name,
    bedDimensionsMm: [printer.bed.x, printer.bed.y, printer.bed.z],
  });
  const multiPlate3mfArtifact: GeneratedMultiPlate3mfArtifact = {
    fileName: multiPlateFileName,
    relativePath: multiPlateRelPath,
    plateCount: plates.length,
    bytes: multiPlateBytes,
    byteLength: multiPlateBytes.byteLength,
  };

  const partsSummary = stlArtifacts.map((art) => {
    const totalPartGrams = round2(art.filamentGrams * art.quantity);
    const totalPartMeters = round2(art.filamentMeters * art.quantity);
    const totalPartMinutes = Math.round(art.printTimeMinutes * art.quantity);
    return {
      partId: art.partId,
      name: art.name,
      shape: art.shape,
      stlFile: art.stlFile,
      file: art.stlFile,
      scadFile: art.scadFile,
      cadEngine: art.cadEngine,
      bytes: art.byteLength,
      dims_mm: art.dims_mm,
      dimensionsMm: art.dims_mm,
      weightGrams: totalPartGrams,
      filamentGrams: totalPartGrams,
      filamentMeters: totalPartMeters,
      estimatedMinutes: totalPartMinutes,
      printTimeMinutes: totalPartMinutes,
      formattedTime: formatPrintDuration(totalPartMinutes),
      color: art.color,
      material: art.material,
      quantity: art.quantity,
      triangleCount: art.manifold.triangleCount,
      vertexCount: art.manifold.vertexCount,
      edgeCount: art.manifold.edgeCount,
      volumeMm3: round2(art.manifold.volumeMm3),
      surfaceAreaMm2: round2(art.surfaceAreaMm2),
      isManifold: art.manifold.isManifold,
    };
  });

  const totalWeightGrams = round2(
    plates.reduce((sum, p) => sum + p.weightGrams, 0)
  );
  const totalFilamentMeters = round2(
    plates.reduce((sum, p) => sum + p.filamentMeters, 0)
  );
  const totalPrintTimeMinutes = Math.round(
    plates.reduce((sum, p) => sum + p.estimatedMinutes, 0)
  );
  const totalPrintedItems = printedParts.reduce(
    (sum, p) => sum + (p.quantity ?? 1),
    0
  );

  const platesJson: UnifiedPlatesArtifact = {
    objectId: options.objectId,
    printerId: printer.id,
    printerName: `${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm)`,
    bedDimensionsMm: [printer.bed.x, printer.bed.y, printer.bed.z],
    totalPlates: plates.length,
    totalUniqueParts: printedParts.length,
    totalPrintedItems,
    totalWeightGrams,
    totalFilamentGrams: totalWeightGrams,
    totalFilamentMeters,
    totalPrintTimeMinutes,
    formattedTotalPrintTime: formatPrintDuration(totalPrintTimeMinutes),
    multiPlate3mfFile: multiPlateRelPath,
    multiPlate3mfBytes: multiPlateBytes.byteLength,
    printer,
    margin: packResult.margin,
    spacing: packResult.spacing,
    heuristicUsed: packResult.heuristicUsed,
    parts: partsSummary,
    partFiles: partsSummary,
    plates,
    rejected: packResult.rejected,
  };

  return {
    design,
    printer,
    packResult,
    stlArtifacts,
    plate3mfArtifacts,
    multiPlate3mfArtifact,
    platesJson,
  };
}
