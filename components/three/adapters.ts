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

export const DEFAULT_PRINTED_PALETTE = [
  "#E6D3B3", // Warm Parchment
  "#C5A059", // Burnished Olive-Bronze
  "#C86D51", // Florentine Terracotta
  "#D4BC94", // Aged Ivory Vellum
  "#B89B4A", // Antique Gilded Bronze
  "#A65E44", // Warm Sienna Clay
  "#DFC9A3", // Pale Vellum Ivory
  "#9C7A4C", // Sepia Bronze
];

export const DEFAULT_PURCHASED_PALETTE = [
  "#D4AF37", // Brushed Florentine Brass
  "#8C857B", // Warm Pewter
  "#4A443D", // Warm Forged Graphite
  "#B8860B", // Burnished Dark Brass
  "#6E665E", // Aged Pewter Alloy
  "#A07848", // Brushed Hardware Bronze
];

const PRESET_KNOWN_PART_IDS = new Set<string>([
  // plant-auto-waterer / plant-waterer
  "reservoir-tank",
  "reservoir-lid",
  "pump-mount",
  "refill-funnel",
  "controller-box",
  "controller-bracket",
  "tube-clip",
  "drip-stake",
  "flow-wheel",
  "pump-cradle",
  "drip-manifold",
  "controller-enclosure",
  "enclosure-cover",
  "emitter-spike",
  "reservoir_base",
  "pump_mount_plate",
  "inner_planter_cup",
  "float_guide_tube",
  "refill_funnel",
  "sensor_bracket",
  "flow_dosing_gear",
  "drip_rim_clip",
  // art-easel preset
  "easel-base-hub",
  "ratchet-tilt-hinge",
  "lower-canvas-tray",
  "upper-canvas-clamp",
  "rear-strut-collar",
  "knurled-lock-knobs",
  "extrusion-spine-2020",
  // iphone-magnifier preset
  "phone-clamp-chassis",
  "doublet-lens-barrel",
  "xyz-focus-sled",
  // liquid-handler preset
  "deck-base-96well",
  "gantry-upright-left",
  "gantry-upright-right",
  "x-carriage-shuttle",
  // desktop-robot-arm preset
  "weighted-turntable-base",
  "lower-arm-link",
  "elbow-housing",
  "forearm-tube",
  // bladeless-air-purifier preset
  "weighted-base-pan",
  "hepa-h13-cylinder",
  "hepa-intake-shell",
  "coanda-airfoil-lower",
  // camera-slider-3axis preset
  "extrusion-2020-1m",
  "motor-end-block",
  "idler-end-block",
  "pan-turntable-housing",
]);

export function isPresetDesignSpec(
  parts: Array<{ id?: string }> | undefined
): boolean {
  if (!Array.isArray(parts) || parts.length === 0) return false;
  return parts.some(
    (p) => typeof p?.id === "string" && PRESET_KNOWN_PART_IDS.has(p.id.trim())
  );
}

type LivePartRole =
  | "coanda_loop_full"
  | "coanda_loop_lower"
  | "coanda_loop_upper"
  | "coanda_plenum"
  | "perforated_shroud"
  | "hepa_filter"
  | "purifier_base"
  | "stator_ring"
  | "blower_fan"
  | "h_frame"
  | "long_bar"
  | "caster"
  | "gusset"
  | "hinge"
  | "shelf"
  | "clamp"
  | "knob"
  | "pad"
  | "fastener"
  | "cover"
  | "enclosure"
  | "bracket";

function classifyLivePartRole(
  name: string,
  roleInAssembly?: string,
  description?: string,
  isTallFrameObject = false,
  isBladelessFanObject = false
): LivePartRole {
  const nameLower = (name || "").toLowerCase();
  const fullText = `${name || ""} ${roleInAssembly || ""} ${description || ""}`.toLowerCase();

  // Bladeless fan / air multiplier / HEPA purifier specialized roles
  if (
    /\b(coanda|air\s+multiplier|bladeless|airfoil)\b.*\b(loop|ring|oval|nozzle|halo|torus|arch)\b|\b(outer\s+loop|outer\s+ring|multiplier\s+loop|multiplier\s+ring|discharge\s+loop|jet\s+loop)\b/.test(
      nameLower
    ) ||
    (isBladelessFanObject && /\b(loop|outer\s+ring|airfoil\s+ring|nozzle\s+ring)\b/.test(nameLower))
  ) {
    if (/\b(upper|top\s+half|arch\s+top)\b/.test(nameLower)) {
      return "coanda_loop_upper";
    }
    if (/\b(lower\s+half|bottom\s+half)\b/.test(nameLower)) {
      return "coanda_loop_lower";
    }
    return "coanda_loop_full";
  }
  if (
    /\b(plenum|transition\s+collar|airfoil\s+.*transition|airfoil\s+.*collar|throat\s+collar|diffuser\s+neck|y-duct)\b/.test(
      nameLower
    )
  ) {
    return "coanda_plenum";
  }
  if (
    /\b(perforated\s+.*shroud|filter\s+shroud|intake\s+shroud|intake\s+drum|intake\s+shell|360.*shroud|perforated\s+.*shell|intake\s+grille)\b/.test(
      nameLower
    )
  ) {
    return "perforated_shroud";
  }
  if (
    /\b(hepa|true-hepa|filter\s+cartridge|pleated\s+filter|activated\s+carbon\s+filter|cylindrical\s+.*filter)\b/.test(
      nameLower
    )
  ) {
    return "hepa_filter";
  }
  if (
    /\b(stator|diffuser\s+cone|fan\s+mount|impeller\s+mount|seal\s+ring|acoustic\s+ring)\b/.test(
      nameLower
    )
  ) {
    return "stator_ring";
  }
  if (
    /\b(weighted\s+.*base|intake\s+base|filter\s+seal\s+plate|base\s+pan|bottom\s+intake\s+base)\b/.test(
      nameLower
    )
  ) {
    return "purifier_base";
  }
  if (
    /\b(pwm\s+fan|brushless.*fan|static-pressure.*fan|blower\s+fan|120mm.*fan|axial\s+fan|mixed-flow\s+impeller)\b/.test(
      nameLower
    )
  ) {
    return "blower_fan";
  }

  if (/\b(caster|wheel|roller|pulley|tire)\b/.test(nameLower)) {
    return "caster";
  }
  if (
    /\b(gusset|corner\s+brace|corner\s+plate|corner\s+bracket|joiner|splice\s+plate|t-plate|l-plate)\b/.test(
      nameLower
    )
  ) {
    return "gusset";
  }
  if (
    /\b(hinge|pivot|trunnion|clevis|knuckle|ratchet|quadrant|tilt|articulated\s+joint|ball\s+stud|ball\s+joint|spherical\s+ball)\b/.test(
      nameLower
    )
  ) {
    return "hinge";
  }
  if (
    /\b(shelf|ledge|tray|panel|canvas\s+rest|brush\s+rest|support\s+bar|platform|deck|stage|platen|holder\s+tray)\b/.test(
      nameLower
    )
  ) {
    return "shelf";
  }
  if (
    /\b(knob|thumbwheel|thumb\s*screw|rosette|dial|handwheel|star\s+knob|tensioning\s+collar|collet\s+.*collar)\b/.test(
      nameLower
    )
  ) {
    return "knob";
  }
  if (
    /\b(pad|foot|feet|bumper|gasket|cushion|epdm|vhb|adhesive|rubber\s+pad|silicone\s+pad|isolation\s+pad|anti-slip|contact\s+face)\b/.test(
      nameLower
    )
  ) {
    return "pad";
  }
  if (
    /\b(lumber|pine|wood|2x4|1x2|1x3|dimensional|h-frame\s+base|frame\s+rail|wood\s+rail)\b/.test(
      nameLower
    )
  ) {
    return "h_frame";
  }
  if (
    /\b(mast|spine|extrusion|2020|v-slot|t-slot|rail|leg|strut|stanchion|beam|bar|stile|upright|post|column)\b/.test(
      nameLower
    ) &&
    !/\b(clamp|bracket|hinge|gusset|collar|cap|knob|holder|mount|adapter)\b/.test(
      nameLower
    )
  ) {
    return "long_bar";
  }
  if (
    /\b(clamp|jaw|holder|cradle|retainer|carriage|slider|clip|collar|hook|latch|top\s+mount|upper\s+mount|head\s+housing|magsafe|slimlink)\b/.test(
      nameLower
    )
  ) {
    return "clamp";
  }
  if (
    /\b(screw|bolt|nut|insert|heat-set|t-nut|washer|spring|pin|dowel|rod|shaft|bearing|bushing|standoff|magnet|rivet|fastener|hardware\s+kit|speed\s+controller|potentiometer|pcb|board)\b/.test(
      nameLower
    )
  ) {
    return "fastener";
  }
  if (
    /\b(cover|cap|lid|faceplate|bezel|shroud|guard|shell|backplate|base\s+plate)\b/.test(
      nameLower
    )
  ) {
    return "cover";
  }
  if (
    !isTallFrameObject &&
    /\b(reservoir|tank|enclosure|housing|container|chamber|basin)\b/.test(
      nameLower
    )
  ) {
    return "enclosure";
  }
  if (/\b(caster|wheel|roller)\b/.test(fullText)) return "caster";
  if (/\b(gusset|corner\s+brace)\b/.test(fullText)) return "gusset";
  if (/\b(hinge|pivot|tilt)\b/.test(fullText)) return "hinge";
  if (/\b(shelf|ledge|tray|panel)\b/.test(fullText)) return "shelf";
  if (/\b(lumber|pine|wood)\b/.test(fullText)) return "h_frame";
  if (/\b(mast|spine|extrusion|rail|leg|post|column)\b/.test(fullText)) {
    return "long_bar";
  }
  return "bracket";
}

const RENAISSANCE_APPROVED_HEX = new Set([
  "#e6d3b3",
  "#c5a059",
  "#c86d51",
  "#d4bc94",
  "#b89b4a",
  "#a65e44",
  "#dfc9a3",
  "#9c7a4c",
  "#f5ebd6",
  "#f3d478",
  "#d4af37",
  "#c84b31",
  "#8c857b",
  "#4a443d",
  "#b8860b",
  "#6e665e",
  "#a07848",
]);

export function toRenaissancePartColor(
  rawColor: string | undefined,
  category: "printed" | "purchased",
  index: number
): string {
  const palette =
    category === "purchased"
      ? DEFAULT_PURCHASED_PALETTE
      : DEFAULT_PRINTED_PALETTE;
  if (rawColor && RENAISSANCE_APPROVED_HEX.has(rawColor.trim().toLowerCase())) {
    return rawColor.trim();
  }
  return palette[index % palette.length];
}

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
    id?: string;
    position?: [number, number, number];
    explode?: [number, number, number];
    cadGrounded?: boolean;
  }>
): boolean {
  if (!parts || parts.length === 0) return false;
  if (parts.some((p) => p?.cadGrounded)) return false;

  let yZeroZNonZero = 0;
  let zZeroYNonZero = 0;
  let sumAbsExplodeY = 0;
  let sumAbsExplodeZ = 0;
  let maxAbsPosY = 0;
  let maxAbsPosZ = 0;

  for (const p of parts) {
    const pos = p.position ?? [0, 0, 0];
    const exp = p.explode ?? [0, 0, 0];
    if (Math.abs(pos[1]) < 0.01 && Math.abs(pos[2]) > 0.5) yZeroZNonZero++;
    if (Math.abs(pos[2]) < 0.01 && Math.abs(pos[1]) > 0.5) zZeroYNonZero++;
    sumAbsExplodeY += Math.abs(exp[1]);
    sumAbsExplodeZ += Math.abs(exp[2]);
    maxAbsPosY = Math.max(maxAbsPosY, Math.abs(pos[1]));
    maxAbsPosZ = Math.max(maxAbsPosZ, Math.abs(pos[2]));
  }

  if (zZeroYNonZero > yZeroZNonZero && maxAbsPosY > maxAbsPosZ) {
    return false;
  }
  if (maxAbsPosZ > maxAbsPosY * 1.35 && zZeroYNonZero === 0) {
    return true;
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
          color: toRenaissancePartColor(p.color, "printed", idx),
          material: p.material || "PETG",
          quantity: Number(p.quantity) || 1,
          description: p.description,
          roleInAssembly: p.roleInAssembly,
          bomRef: p.bomRef,
          step: p.step ?? firstStepByPartId.get(p.id),
          stlFile: p.stlFile,
          stlBase64: p.stlBase64,
          scadCode: p.scadCode,
          cadGrounded: p.cadGrounded,
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
        color: toRenaissancePartColor(p.color, "purchased", idx),
        material: p.material || "Off-the-Shelf Hardware",
        quantity: Number(p.quantity) || 1,
        dims_mm: p.dims_mm,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        step: p.step ?? firstStepByPartId.get(p.id),
        stlFile: p.stlFile,
        stlBase64: p.stlBase64,
        scadCode: p.scadCode,
        cadGrounded: p.cadGrounded,
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
  const isPreset = isPresetDesignSpec(spec.parts);

  // Track raw explicit step per partId so we know whether `part.step` was explicitly provided
  const rawPartsArray = Array.isArray(raw.parts) ? raw.parts : [];
  const explicitStepByPartId = new Map<string, number>();
  rawPartsArray.forEach((rp: any) => {
    if (rp && typeof rp.id === "string" && typeof rp.step === "number") {
      explicitStepByPartId.set(rp.id, rp.step);
    }
  });

  const objectContext = `${spec.objectName || ""} ${spec.designPhilosophy || ""} ${spec.summary || ""} ${spec.parts.map((p) => p.name).join(" ")}`.toLowerCase();
  const isBladelessFanObject =
    !isPreset &&
    /\b(dyson|bladeless|coanda|air\s+multiplier|hepa\s+purifier|pure\s+cool|aeroloop|tower\s+fan)\b/.test(
      objectContext
    );
  const isTallFrameObject =
    !isPreset &&
    !isBladelessFanObject &&
    /\b(easel|h-frame|a-frame|canvas|stand|tripod|mast|lumber|rack|gantry|column|tower)\b/.test(
      objectContext
    );

  const liveRoles: LivePartRole[] = !isPreset
    ? spec.parts.map((p) =>
        classifyLivePartRole(
          p.name,
          p.roleInAssembly,
          p.description,
          isTallFrameObject,
          isBladelessFanObject
        )
      )
    : [];

  if (!isPreset && isTallFrameObject && !liveRoles.includes("h_frame")) {
    const barIdx = liveRoles.indexOf("long_bar");
    if (barIdx >= 0) {
      liveRoles[barIdx] = "h_frame";
    } else if (liveRoles.length > 0) {
      liveRoles[0] = "h_frame";
    }
  }

  // Compute median part scale across raw live parts so unit mix-ups and outlier giant parts can be clamped
  const rawMaxDims: number[] = [];
  const rawFootprints: number[] = [];
  const rawHeights: number[] = [];
  const rawVolumes: number[] = [];
  if (!isPreset) {
    for (const p of spec.parts) {
      let [dx, dy, dz] = p.dims_mm || [50, 35, 50];
      const maxRaw = Math.max(dx, dy, dz);
      // Unit mix-up: meters -> mm
      if (maxRaw > 0 && maxRaw <= 3.5) {
        dx *= 1000;
        dy *= 1000;
        dz *= 1000;
      } else if (maxRaw > 380) {
        // 10x mm / micrometers -> mm
        dx *= 0.1;
        dy *= 0.1;
        dz *= 0.1;
      }
      rawMaxDims.push(Math.max(12, Math.min(220, Math.max(dx, dy, dz))));
      rawFootprints.push(Math.max(12, Math.min(200, Math.max(dx, dz))));
      rawHeights.push(Math.max(8, Math.min(180, dy)));
      rawVolumes.push(Math.max(1000, dx * dy * dz));
    }
  }
  const getMedian = (arr: number[], fallback: number): number => {
    if (arr.length === 0) return fallback;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) * 0.5
      : sorted[mid];
  };
  const cmUnitMixup = !isPreset && getMedian(rawMaxDims, 70) < 16;
  const medianMaxDim = Math.max(
    48,
    Math.min(125, getMedian(rawMaxDims, 76) * (cmUnitMixup ? 10 : 1))
  );
  const medianFootprint = Math.max(
    44,
    Math.min(115, getMedian(rawFootprints, 68) * (cmUnitMixup ? 10 : 1))
  );
  const medianHeight = Math.max(
    24,
    Math.min(72, getMedian(rawHeights, 38) * (cmUnitMixup ? 10 : 1))
  );
  const medianVolume = Math.max(
    24000,
    getMedian(rawVolumes, 95000) * (cmUnitMixup ? 1000 : 1)
  );

  const roleCounters: Record<string, number> = {};
  const nextRoleIdx = (r: string) => {
    const c = roleCounters[r] ?? 0;
    roleCounters[r] = c + 1;
    return c;
  };

  const VISUAL_PRESET_ROLES = new Set<LivePartRole>([
    "coanda_loop_full",
    "coanda_loop_lower",
    "coanda_loop_upper",
    "coanda_plenum",
    "perforated_shroud",
    "hepa_filter",
    "purifier_base",
    "stator_ring",
    "blower_fan",
    "h_frame",
    "caster",
    "shelf",
  ]);

  const printed: PrintedPartSpec[] = [];
  const purchased: PurchasedPartSpec[] = [];
  const assembly: AssemblyNode[] = [];
  const adaptedParts: SharedDesignPart[] = [];

  spec.parts.forEach((p, idx) => {
    let shape = normalizePartShape(p.shape) as PartShape;
    let dims_mm: [number, number, number] = [...p.dims_mm];

    if (!isPreset) {
      // 1. Unit mix-up normalization on dims_mm
      const maxD = Math.max(dims_mm[0], dims_mm[1], dims_mm[2]);
      if (maxD > 0 && maxD <= 3.5) {
        dims_mm = [dims_mm[0] * 1000, dims_mm[1] * 1000, dims_mm[2] * 1000];
      } else if (cmUnitMixup && maxD < 25) {
        dims_mm = [dims_mm[0] * 10, dims_mm[1] * 10, dims_mm[2] * 10];
      } else if (maxD > 360) {
        const shrink = 180 / maxD;
        dims_mm = [
          Math.round(dims_mm[0] * shrink),
          Math.round(dims_mm[1] * shrink),
          Math.round(dims_mm[2] * shrink),
        ];
      }
      dims_mm = [
        Math.max(10, Math.min(210, Math.round(dims_mm[0]))),
        Math.max(6, Math.min(210, Math.round(dims_mm[1]))),
        Math.max(10, Math.min(210, Math.round(dims_mm[2]))),
      ];
    }

    let params = enrichPartParams(shape, p.params, dims_mm, zUp);
    let position = toThreeVec3(p.position, zUp);
    let explode = toThreeVec3(p.explode, zUp);

    // Normalize rotation: if explicit Three.js eulerDeg is provided in params, use it directly;
    // otherwise if Z-up CAD coordinates had 90/180 X flips for Z-extruded shapes,
    // our Three.js geometry builders already orient heights along +Y.
    const explicitEuler = Array.isArray(p.params?.eulerDeg) && p.params.eulerDeg.length >= 3
      ? ([
          Number(p.params.eulerDeg[0]) || 0,
          Number(p.params.eulerDeg[1]) || 0,
          Number(p.params.eulerDeg[2]) || 0,
        ] as [number, number, number])
      : null;
    let rotation: [number, number, number] = explicitEuler
      ? explicitEuler
      : zUp
      ? [0, p.rotation[2] || 0, 0]
      : [...p.rotation];

    let step =
      explicitStepByPartId.get(p.id) ??
      firstStepByPartId.get(p.id) ??
      p.step ??
      idx + 1;

    const isPartCadGrounded = Boolean(
      p.cadGrounded || p.stlBase64 || p.scadCode
    );
    const role = !isPreset ? liveRoles[idx] || "bracket" : "bracket";

    if (!isPreset && (!isPartCadGrounded || VISUAL_PRESET_ROLES.has(role))) {
      const rIdx = nextRoleIdx(role);

      switch (role) {
        case "coanda_loop_full": {
          shape = "tube";
          dims_mm = [186, 232, 48];
          params = {
            ...params,
            rolePreset: "coanda_airfoil_loop",
            width: 186,
            height: 232,
            depth: 48,
          };
          position = [0, 214, 0];
          rotation = [0, 0, 0];
          explode = [0, 105, 0];
          break;
        }
        case "coanda_loop_lower": {
          shape = "tube";
          dims_mm = [186, 128, 46];
          params = {
            ...params,
            rolePreset: "coanda_airfoil_lower",
            width: 186,
            height: 128,
            depth: 46,
          };
          position = [0, 162, 0];
          rotation = [0, 0, 0];
          explode = [0, 58, 28];
          break;
        }
        case "coanda_loop_upper": {
          shape = "tube";
          dims_mm = [186, 128, 46];
          params = {
            ...params,
            rolePreset: "coanda_airfoil_upper",
            width: 186,
            height: 128,
            depth: 46,
          };
          position = [0, 252, 0];
          rotation = [0, 0, 0];
          explode = [0, 120, 0];
          break;
        }
        case "coanda_plenum": {
          shape = "tube";
          dims_mm = [108, 46, 54];
          params = {
            ...params,
            rolePreset: "coanda_plenum_neck",
            width: 108,
            height: 46,
            depth: 54,
          };
          position = [0, 88, 0];
          rotation = [0, 0, 0];
          explode = [0, 44, 38];
          break;
        }
        case "stator_ring": {
          shape = "tube";
          dims_mm = [142, 20, 142];
          params = {
            ...params,
            rolePreset: "annular_retainer_ring",
            outerRadius: 71,
            innerRadius: 46,
            height: 20,
          };
          position = [0, 58, 0];
          rotation = [0, 0, 0];
          explode = [0, 26, -56];
          break;
        }
        case "perforated_shroud": {
          shape = "tube";
          dims_mm = [148, 102, 148];
          params = {
            ...params,
            rolePreset: "perforated_intake_drum",
            outerRadius: 74,
            innerRadius: 68,
            height: 102,
          };
          position = [0, 10, 0];
          rotation = [0, 0, 0];
          explode = [-76, 0, 52];
          break;
        }
        case "hepa_filter": {
          shape = "tube";
          dims_mm = [128, 92, 128];
          params = {
            ...params,
            rolePreset: "hepa_pleated_filter",
            outerRadius: 64,
            innerRadius: 44,
            height: 92,
          };
          position = [0, 10, 0];
          rotation = [0, 0, 0];
          explode = [78, 0, 52];
          break;
        }
        case "purifier_base": {
          shape = "cylinder";
          dims_mm = [158, 28, 158];
          params = {
            ...params,
            rolePreset: "purifier_base_pan",
            width: 158,
            height: 28,
            depth: 158,
          };
          position = [0, -42, 0];
          rotation = [0, 0, 0];
          explode = [0, -76, 0];
          break;
        }
        case "blower_fan": {
          shape = "gear_simple";
          dims_mm = [108, 24, 108];
          params = {
            ...params,
            outerRadius: 52,
            thickness: 22,
            teeth: 9,
            boreRadius: 15,
          };
          position = [0, 42, 0];
          rotation = [0, 0, 0];
          explode = [74, 22, -44];
          break;
        }
        case "h_frame": {
          shape = "box";
          dims_mm = [136, 204, 96];
          params = {
            ...params,
            rolePreset: "h_frame",
            width: 136,
            height: 204,
            depth: 96,
            hollow: false,
          };
          position = [0, 78, 0];
          rotation = [0, 0, 0];
          explode = [0, 35, -55];
          step = 1;
          break;
        }
        case "long_bar": {
          const isHorizontal = /\b(crossbar|beam|horizontal|ledge|bottom\s+bar|top\s+bar)\b/i.test(
            p.name
          );
          shape = "box";
          dims_mm = isHorizontal ? [142, 22, 24] : [24, 196, 24];
          params = {
            ...params,
            width: dims_mm[0],
            height: dims_mm[1],
            depth: dims_mm[2],
            hollow: false,
          };
          position = isHorizontal
            ? [0, 12 + rIdx * 65, 8]
            : [rIdx === 0 ? 0 : (rIdx % 2 === 1 ? -58 : 58), 84, -14];
          rotation = isHorizontal ? [0, 0, 0] : [rIdx === 0 ? -10 : 0, 0, 0];
          explode = [
            position[0] === 0 ? 0 : Math.sign(position[0]) * 75,
            65,
            -60,
          ];
          break;
        }
        case "caster": {
          const isQuad =
            /\b(set\s+of\s+4|4-pack|4x|wheels|casters)\b/i.test(p.name) ||
            (p.quantity ?? 1) >= 4 ||
            rIdx === 0;
          shape = "cylinder";
          dims_mm = isQuad ? [136, 42, 96] : [36, 42, 36];
          params = {
            ...params,
            rolePreset: "caster_wheel",
            radius: 18,
            wheelWidth: 12,
            isQuadSet: isQuad,
            spanX: 59,
            spanZ: 38,
          };
          position = isQuad
            ? [0, -24, 0]
            : [(rIdx % 2 === 0 ? 1 : -1) * 59, -24, rIdx < 2 ? 38 : -38];
          rotation = [0, 0, 0];
          explode = [0, -78, 25];
          break;
        }
        case "gusset": {
          shape = "plate_with_holes";
          dims_mm = [48, 48, 8];
          params = {
            ...params,
            width: 48,
            depth: 48,
            thickness: 8,
            holes: 4,
          };
          const gx = rIdx % 2 === 0 ? -56 : 56;
          const gy = rIdx < 2 ? 22 : 124;
          position = [gx, gy, 12];
          rotation = [90, 0, 0];
          explode = [Math.sign(gx) * 80, 15, 60];
          break;
        }
        case "hinge": {
          shape = "bracketL";
          dims_mm = [36, 46, 42];
          params = {
            ...params,
            leg1: 46,
            leg2: 42,
            width: 36,
            thickness: 6,
          };
          const hx = rIdx === 0 ? 0 : (rIdx % 2 === 1 ? -56 : 56);
          position = [hx, 18 + rIdx * 16, 16];
          rotation = [0, 0, 0];
          explode = [hx === 0 ? 0 : Math.sign(hx) * 75, -25, 78];
          break;
        }
        case "shelf": {
          shape = "box";
          dims_mm = [158, 24, 42];
          params = {
            ...params,
            rolePreset: "shelf_ledge",
            width: 158,
            height: 24,
            depth: 42,
            hollow: false,
          };
          position = [0, 52 + rIdx * 42, 26];
          rotation = [0, 0, 0];
          explode = [0, 18, 96];
          break;
        }
        case "clamp": {
          shape = "bracketL";
          dims_mm = [38, 50, 42];
          params = {
            ...params,
            leg1: 50,
            leg2: 42,
            width: 38,
            thickness: 6,
          };
          position = [
            rIdx === 0 ? 0 : (rIdx % 2 === 1 ? -42 : 42),
            154 - rIdx * 28,
            20,
          ];
          rotation = [0, 0, 0];
          explode = [
            position[0] === 0 ? 0 : Math.sign(position[0]) * 70,
            85,
            78,
          ];
          break;
        }
        case "knob": {
          shape = "gear_simple";
          dims_mm = [34, 34, 14];
          params = {
            ...params,
            outerRadius: 17,
            thickness: 14,
            teeth: 8,
            boreRadius: 3,
          };
          const kx = rIdx % 2 === 0 ? 32 : -32;
          position = [kx, 96 - rIdx * 26, 22];
          rotation = [90, 0, 0];
          explode = [Math.sign(kx) * 88, 25, 65];
          break;
        }
        case "pad": {
          shape = "box";
          dims_mm = [32, 6, 32];
          params = {
            ...params,
            width: 32,
            height: 6,
            depth: 32,
            hollow: false,
          };
          const px = rIdx % 2 === 0 ? -56 : 56;
          position = [px, -20, 34];
          rotation = [0, 0, 0];
          explode = [Math.sign(px) * 75, -58, 55];
          break;
        }
        case "fastener": {
          shape = "cylinder";
          dims_mm = [14, 26, 14];
          params = {
            ...params,
            radius: 7,
            height: 26,
          };
          const fx = rIdx % 2 === 0 ? 38 : -38;
          position = [fx, 44 + rIdx * 24, -14];
          rotation = [90, 0, 0];
          explode = [Math.sign(fx) * 82, 22, -68];
          break;
        }
        case "cover": {
          shape = "plate_with_holes";
          dims_mm = [68, 48, 8];
          params = {
            ...params,
            width: 68,
            depth: 48,
            thickness: 8,
            holes: 4,
          };
          position = [0, 88 + rIdx * 24, -18];
          rotation = [90, 0, 0];
          explode = [0, 35, -88];
          break;
        }
        case "enclosure": {
          shape = "enclosure";
          params = {
            ...params,
            hollow: true,
          };
          break;
        }
        default: {
          shape = "bracketL";
          dims_mm = [44, 42, 34];
          params = {
            ...params,
            leg1: 42,
            leg2: 34,
            width: 32,
            thickness: 5.5,
          };
          const bx = rIdx % 2 === 0 ? -48 : 48;
          position = [bx, 64 + rIdx * 28, 16];
          rotation = [0, 0, 0];
          explode = [Math.sign(bx) * 78, 35, 65];
          break;
        }
      }
    } else if (!isPreset && isPartCadGrounded) {
      // CAD-grounded live part without a specialized rolePreset:
      // 1. Clamp any giant/enclosing part down to median part scale
      const vol = dims_mm[0] * dims_mm[1] * dims_mm[2];
      const maxPartDim = Math.max(dims_mm[0], dims_mm[1], dims_mm[2]);
      const isEnclosingOutlier =
        vol > medianVolume * 2.4 ||
        maxPartDim > medianMaxDim * 1.55 ||
        (Math.max(dims_mm[0], dims_mm[2]) > 125 && dims_mm[1] > 90);
      if (isEnclosingOutlier) {
        const capW = Math.round(Math.min(128, medianFootprint * 1.15));
        const capH = Math.round(Math.min(74, medianHeight * 1.15));
        dims_mm = [
          Math.min(dims_mm[0], capW),
          Math.min(dims_mm[1], capH),
          Math.min(dims_mm[2], capW),
        ];
      }

      // 2. Refine proxy shapes for purchased off-the-shelf hardware
      if (p.kind === "purchased" && shape === "box") {
        const nameLower = `${p.name || ""} ${p.roleInAssembly || ""}`.toLowerCase();
        const r = Math.max(5, Math.min(dims_mm[0], dims_mm[2]) / 2);
        const h = Math.max(4, dims_mm[1]);
        if (
          /\b(hepa|filter|cartridge|sleeve|collar|tube|bushing|bearing|ring)\b/.test(
            nameLower
          )
        ) {
          shape = "tube";
          params = {
            ...params,
            outerRadius: r,
            innerRadius: Math.max(2, r * 0.68),
            height: h,
          };
        } else if (
          /\b(fan|blower|motor|pump|magnet|magsafe|disc|screw|bolt|insert|heat-set|pin|rod|shaft|spring|standoff|sensor|lens)\b/.test(
            nameLower
          )
        ) {
          shape = "cylinder";
          params = {
            ...params,
            radius: r,
            height: h,
          };
        }
      }

      // 3. Synchronize params with clamped dims_mm so radius never equals diameter (2x bug)
      const clampedR = Math.max(4, Math.round(Math.min(dims_mm[0], dims_mm[2]) * 0.5));
      const clampedH = Math.max(4, Math.round(dims_mm[1]));
      params = {
        ...params,
        width: dims_mm[0],
        w: dims_mm[0],
        height: clampedH,
        h: clampedH,
        depth: dims_mm[2],
        d: dims_mm[2],
      };
      if (
        shape === "cylinder" ||
        shape === "tube" ||
        shape === "cone" ||
        shape === "funnel" ||
        shape === "gear_simple" ||
        shape === "sphere"
      ) {
        const curOuterR = Number(
          params.outerRadius ?? params.rOuter ?? params.radius ?? params.r ?? clampedR
        );
        const safeOuterR =
          curOuterR > clampedR * 1.05 || curOuterR < 3 ? clampedR : curOuterR;
        params.radius = safeOuterR;
        params.r = safeOuterR;
        params.outerRadius = safeOuterR;
        params.rOuter = safeOuterR;
        if (typeof params.diameter === "number") {
          params.diameter = safeOuterR * 2;
        }
        if (typeof params.od === "number") {
          params.od = safeOuterR * 2;
        }
        if (shape === "tube") {
          const curInner = Number(params.innerRadius ?? params.rInner ?? safeOuterR * 0.72);
          const safeInner = Math.max(
            2,
            Math.min(safeOuterR - 2.4, curInner > safeOuterR - 2 ? safeOuterR * 0.74 : curInner)
          );
          params.innerRadius = safeInner;
          params.rInner = safeInner;
        }
      }

      // 4. Sanity-clamp live positions & explode vectors (handle meter unit mix-ups and wild coordinates)
      const posMag = Math.hypot(position[0], position[1], position[2]);
      if (posMag > 0 && posMag < 2.5) {
        position = [position[0] * 1000, position[1] * 1000, position[2] * 1000];
      }
      position = [
        Math.max(-160, Math.min(160, Math.round(position[0]))),
        Math.max(-65, Math.min(280, Math.round(position[1]))),
        Math.max(-160, Math.min(160, Math.round(position[2]))),
      ];
      const expMag = Math.hypot(explode[0], explode[1], explode[2]);
      if (expMag > 190 && expMag > 0) {
        const s = 140 / expMag;
        explode = [
          Math.round(explode[0] * s),
          Math.round(explode[1] * s),
          Math.round(explode[2] * s),
        ];
      } else if (expMag < 18) {
        const ang = (idx / Math.max(1, spec.parts.length)) * Math.PI * 2;
        explode = [
          Math.round(Math.cos(ang) * 55),
          idx === 0 ? -55 : Math.round(30 + idx * 14),
          Math.round(Math.sin(ang) * 55),
        ];
      }
    }

    const resolvedColor = toRenaissancePartColor(
      p.color,
      p.kind === "purchased" ? "purchased" : "printed",
      idx
    );

    if (p.kind === "printed") {
      printed.push({
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        shape,
        params,
        dims_mm,
        color: resolvedColor,
        material: p.material,
        quantity: p.quantity ?? 1,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        bomRef: p.bomRef,
        step,
        stlFile: p.stlFile,
        stlBase64: p.stlBase64,
        scadCode: p.scadCode,
        cadGrounded: p.cadGrounded,
      });
    } else {
      purchased.push({
        id: p.id,
        partNumber: p.partNumber,
        name: p.name,
        bomLine: p.bomRef ?? p.id,
        bomRef: p.bomRef,
        color: resolvedColor,
        material: p.material,
        quantity: p.quantity ?? 1,
        dims_mm,
        description: p.description,
        roleInAssembly: p.roleInAssembly,
        step,
        stlFile: p.stlFile,
        stlBase64: p.stlBase64,
        scadCode: p.scadCode,
        cadGrounded: p.cadGrounded,
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
      dims_mm,
      color: resolvedColor,
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

  const adaptedDesign = rawDesign ? adaptDesign(rawDesign, rawInput) : null;
  const adaptedNodeByPartId = new Map<string, AssemblyNode>();
  if (adaptedDesign) {
    for (const node of adaptedDesign.assembly) {
      if (!adaptedNodeByPartId.has(node.partId)) {
        adaptedNodeByPartId.set(node.partId, node);
      }
    }
  }

  const steps: InstructionStep[] = normalized.steps.map((s) => {
    const action = normalizeAssemblyAction(
      s.action,
      s.actionType,
      s.title,
      s.tools
    );
    const motion: StepMotion[] = (s.motion ?? []).map((m) => {
      const adaptedNode = adaptedNodeByPartId.get(m.partId);
      if (adaptedNode) {
        return {
          partId: m.partId,
          to: [...adaptedNode.position],
          from: [
            adaptedNode.position[0] + adaptedNode.explode[0],
            adaptedNode.position[1] + adaptedNode.explode[1],
            adaptedNode.position[2] + adaptedNode.explode[2],
          ],
        };
      }
      return {
        partId: m.partId,
        from: toThreeVec3(m.from, zUp),
        to: toThreeVec3(m.to, zUp),
      };
    });

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
          color: toRenaissancePartColor(item?.color, "printed", iIdx),
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
      const color = toRenaissancePartColor(printed.color, "printed", idx);
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
        stlFile: printed.stlFile,
        stlBase64: printed.stlBase64,
        scadCode: printed.scadCode,
        cadGrounded: printed.cadGrounded,
        bomRef: printed.bomRef,
        bomItem: matchedBom,
        stepInfo,
      });
    } else if (purchased) {
      const color = toRenaissancePartColor(purchased.color, "purchased", idx);
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
        stlFile: purchased.stlFile,
        stlBase64: purchased.stlBase64,
        scadCode: purchased.scadCode,
        cadGrounded: purchased.cadGrounded,
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
        color: toRenaissancePartColor(p.color, "printed", idx),
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
        color: toRenaissancePartColor(p.color, "purchased", idx),
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

  return results.map((item, index) => ({
    ...item,
    calloutNumber: item.calloutNumber ?? index + 1,
    stlFile:
      item.stlFile ??
      (item.category === "printed" ? `${item.partId}.stl` : undefined),
  }));
}

export { normalizeDesignPart, normalizeDesignSpec, normalizeInstructions, normalizePartShape };
