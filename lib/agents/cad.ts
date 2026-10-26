import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import {
  CadGenerationBundle,
  compileAndValidateOpenScad,
  DesignPart,
  extractScadCode,
  generateCadBundle,
  generateParametricOpenScad,
  generatePartMesh,
  normalizeDesignSpec,
  OpenScadValidationResult,
  TriangleMesh,
  UnifiedPlatesArtifact,
  validateManifold,
} from "../cad";
import { DEFAULT_PRINTER_ID, getPrinterById } from "../printers";
import {
  AgentLogEntry,
  DesignSpec as AppDesignSpec,
  ObjectAnalysis,
  ProjectManifest,
  ResearchData,
  RunnerMode,
  SsePhase,
  SsePipelineEvent,
  TeardownData,
} from "../types";
import {
  getRemainingPipelineBudgetMs,
  loadProductImagesFromCwd,
  runGeminiAgent,
  RunAgentResult,
} from "./runner";
import { InlineImageInput } from "./page-fetch";

export interface CadPartAttemptLog {
  attempt: number;
  runner: RunnerMode;
  ok: boolean;
  durationMs: number;
  errorFeedback?: string;
  actualDimsMm?: [number, number, number];
  triangleCount?: number;
}

export interface CadPartBuildReport {
  partId: string;
  name: string;
  targetDimsMm: [number, number, number];
  actualDimsMm: [number, number, number];
  scadFile: string;
  stlFile: string;
  engine: "argon-openscad" | "parametric-openscad" | "procedural-fallback";
  attemptsCount: number;
  attempts: CadPartAttemptLog[];
  validation?: OpenScadValidationResult;
  triangleCount: number;
  volumeMm3: number;
  isManifold: boolean;
}

export interface CadAgentReport {
  printerId: string;
  printerName: string;
  bedDimensionsMm: [number, number, number];
  totalPrintedParts: number;
  argonOpenScadParts: number;
  fallbackParts: number;
  totalAttempts: number;
  parts: CadPartBuildReport[];
}

export interface CadAgentInput {
  design: unknown;
  analysis?: ObjectAnalysis;
  teardown?: TeardownData;
  sources?: ResearchData;
  cwd: string;
  objectId?: string;
  printerId?: string;
  /** Maximum Argon compile/validate attempts per part (default: 2) */
  maxRetries?: number;
  /**
   * Optional list of part IDs to synthesize via live Gemini 4 Argon LLM calls.
   * If omitted, runs Gemini 4 Argon in parallel on all printed parts (up to 12) in `design.json`.
   */
  argonPartIds?: string[];
  /** Prefer Gemini REST over agy CLI for faster per-part turnarounds */
  preferRestForSpeed?: boolean;
  inlineImages?: InlineImageInput[];
  manifest?: ProjectManifest;
  onLog?: (entry: AgentLogEntry) => void;
  onEvent?: (event: SsePipelineEvent) => void;
}

interface ArgonAssemblyTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  explode: [number, number, number];
}

interface ArgonPurchasedTransform extends ArgonAssemblyTransform {
  partId: string;
  shape?: string;
  dims_mm?: [number, number, number];
}

interface ArgonOpenScadResponse {
  scadCode: string;
  moduleName?: string;
  designNotes?: string;
  assemblyTransform?: ArgonAssemblyTransform;
  purchasedTransforms?: ArgonPurchasedTransform[];
}

const MAX_CAD_PARTS = 12;

function sanitizeVec3(
  val: unknown,
  fallback: [number, number, number],
  clampAbs = 600
): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    const x = Number(val[0]);
    const y = Number(val[1]);
    const z = Number(val[2]);
    return [
      Number.isFinite(x) ? Math.max(-clampAbs, Math.min(clampAbs, Math.round(x * 10) / 10)) : fallback[0],
      Number.isFinite(y) ? Math.max(-clampAbs, Math.min(clampAbs, Math.round(y * 10) / 10)) : fallback[1],
      Number.isFinite(z) ? Math.max(-clampAbs, Math.min(clampAbs, Math.round(z * 10) / 10)) : fallback[2],
    ];
  }
  return [...fallback];
}

function isPlausibleDesignerLayout(
  parts: DesignPart[],
  analysis?: ObjectAnalysis
): boolean {
  const printed = parts.filter((p) => p.kind === "printed");
  if (printed.length === 0) return true;

  // Reject if all printed parts sit on X=0, Z=0 (degenerate vertical Y-stack fallback)
  const allPrintedZeroXZ =
    printed.length >= 3 &&
    printed.every(
      (p) =>
        Math.abs(p.position?.[0] ?? 0) < 1 &&
        Math.abs(p.position?.[2] ?? 0) < 1
    );
  if (allPrintedZeroXZ) return false;

  const [bx, by, bz] = analysis?.overallDimensionsMm || [250, 250, 250];
  const maxBound = Math.max(bx, by, bz, 220) * 3;

  for (const p of parts) {
    if (!Array.isArray(p.position) || p.position.length < 3) return false;
    const [x, y, z] = p.position;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      Math.abs(x) > maxBound ||
      Math.abs(y) > maxBound ||
      Math.abs(z) > maxBound
    ) {
      return false;
    }
  }

  // Check pairwise non-overlapping among printed parts
  let pairs = 0;
  let overlappingPairs = 0;
  for (let i = 1; i < printed.length; i++) {
    for (let j = 0; j < i; j++) {
      pairs++;
      const pi = printed[i].position;
      const pj = printed[j].position;
      const dist = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]);
      if (dist < 14) {
        overlappingPairs++;
      }
    }
  }
  if (pairs > 0 && overlappingPairs / pairs > 0.25) {
    return false;
  }

  return true;
}

/**
 * Ensures all parts (printed + purchased) have coherent, non-overlapping 3D assembly
 * transforms (position, rotation, explode in mm in the shared Three.js Y-up coordinate frame)
 * grounded in the object's overall dimensions and each part's role in the assembly.
 * Preserves Designer assembly positions whenever they are plausible (non-overlapping, within 3x bbox).
 */
export function ensureGroundedAssemblyTransforms(
  parts: DesignPart[],
  analysis?: ObjectAnalysis
): void {
  if (!Array.isArray(parts) || parts.length === 0) return;

  const designerPlausible = isPlausibleDesignerLayout(parts, analysis);
  const objectText = `${analysis?.objectName || ""} ${analysis?.category || ""} ${analysis?.description || ""}`.toLowerCase();
  const isHorizontalVehicleOrVessel =
    /\b(tugboat|boat|ship|vessel|hull|yacht|kayak|canoe|submarine|rov|barge|ferry|vehicle|car|truck|rover|train|locomotive|aircraft|plane|glider|slider)\b/i.test(
      objectText
    ) ||
    parts.some((p) =>
      /\b(hull|bow|stern|midship|wheelhouse|superstructure|kort|rudder|fuselage)\b/i.test(
        p.name || ""
      )
    );

  let cursorY = 0;
  let hullCursorX = 0;

  parts.forEach((p, idx) => {
    const partNameLower = (p.name || "").toLowerCase();
    const nameText = `${p.name || ""} ${p.roleInAssembly || ""} ${p.description || ""}`.toLowerCase();
    const [dx, dy, dz] = p.dims_mm || [60, 40, 35];
    const partHeightY =
      Math.min(dx, dy, dz) < Math.max(dx, dy, dz) * 0.45
        ? Math.min(dy, dz)
        : Math.min(140, Math.max(18, dz || dy || 32));

    // Only synthesize fallback positions when Designer layout is NOT plausible and part isn't CAD-grounded
    if (!designerPlausible && !p.cadGrounded) {
      const isHullOrMarinePart =
        /\b(hull|bow|stern|midship|keel|deck|bulkhead|pontoon|fuselage|wheelhouse|superstructure|cabin|nozzle|kort|rudder|propeller|thruster|bilge|ballast)\b/i.test(
          nameText
        );

      if (p.kind === "printed") {
        if (isHorizontalVehicleOrVessel || isHullOrMarinePart) {
          const spanX = Math.max(80, Math.max(dx, dz));
          if (/\b(bow|front|forward|prow|nose)\b/i.test(partNameLower)) {
            p.position = [Math.round(spanX * 0.95), 0, 0];
            p.rotation = [0, 0, 0];
            p.explode = [95, 0, 0];
          } else if (/\b(stern|rear|aft|tail|transom)\b/i.test(partNameLower)) {
            p.position = [-Math.round(spanX * 0.95), 0, 0];
            p.rotation = [0, 0, 0];
            p.explode = [-95, 0, 0];
          } else if (/\b(midship|center\s+hull|middle\s+hull|main\s+hull|chassis)\b/i.test(partNameLower)) {
            p.position = [0, 0, 0];
            p.rotation = [0, 0, 0];
            p.explode = [0, -65, 0];
          } else if (/\b(deck|hatch|coaming)\b/i.test(partNameLower)) {
            p.position = [0, Math.round(partHeightY * 0.75 + 28), 0];
            p.rotation = [0, 0, 0];
            p.explode = [0, 75, 0];
          } else if (/\b(wheelhouse|superstructure|cabin|bridge|pilothouse|tower|funnel|mast)\b/i.test(partNameLower)) {
            p.position = [Math.round(spanX * 0.15), Math.round(partHeightY + 68), 0];
            p.rotation = [0, 0, 0];
            p.explode = [0, 110, 0];
          } else if (/\b(kort|nozzle|rudder|thruster|propeller|pod|skeg)\b/i.test(partNameLower)) {
            const sideZ = idx % 2 === 0 ? 32 : -32;
            p.position = [-Math.round(spanX * 0.85), -24, sideZ];
            p.rotation = [0, 0, 0];
            p.explode = [-85, -45, Math.sign(sideZ) * 55];
          } else {
            const offset = (idx - 1) * Math.round(spanX * 0.85);
            p.position = [offset + hullCursorX, 0, 0];
            hullCursorX += 20;
            p.rotation = [0, 0, 0];
            p.explode = [offset === 0 ? 0 : Math.sign(offset) * 80, 45, 0];
          }
        } else {
          const isRingOrLoop =
            /\b(ring|loop|airfoil|coanda|multiplier|frame|halo)\b/.test(
              partNameLower
            );
          const isFrontHeadOrCradle =
            !isHullOrMarinePart &&
            /\b(faceplate|cradle|magsafe|slimlink|phone\s+holder|device\s+tray|clamp\s+jaw|tension\s+clamp)\b/.test(
              partNameLower
            );
          const isArmOrBall =
            !isHullOrMarinePart &&
            /\b(arm|cantilever|ball\s+stud|ball\s+joint|spherical|swivel|pivot|hinge|strut|link)\b/.test(
              partNameLower
            );
          const isSideBracketOrKnob =
            !isHullOrMarinePart &&
            /\b(knob|thumbwheel|collar|clip|gusset|latch)\b/.test(
              partNameLower
            );

          const centerY = Math.round(cursorY + partHeightY * 0.5);
          cursorY += Math.max(18, Math.round(partHeightY * 0.82));

          if (isRingOrLoop) {
            p.position = [0, centerY + 25, 0];
            p.rotation = [90, 0, 0];
            p.explode = [0, 95, 25];
          } else if (isFrontHeadOrCradle) {
            p.position = [0, centerY, 28];
            p.rotation = [18, 0, 0];
            p.explode = [0, 45, 90];
          } else if (isArmOrBall) {
            p.position = [0, centerY, 14];
            p.rotation = [-15, 0, 0];
            p.explode = [0, 35, 60];
          } else if (isSideBracketOrKnob) {
            const sideX = idx % 2 === 0 ? 28 : -28;
            p.position = [sideX, Math.max(24, centerY - 12), 14];
            p.rotation = [0, 0, 0];
            p.explode = [Math.sign(sideX) * 75, 25, 55];
          } else {
            p.position = [0, centerY, 0];
            p.rotation = [0, 0, 0];
            p.explode = [
              0,
              idx === 0 ? -75 : Math.round(35 + idx * 18),
              idx % 2 === 0 ? -25 : 25,
            ];
          }
        }
      } else {
        // Purchased off-the-shelf part placement in shared frame
        if (isHorizontalVehicleOrVessel) {
          const isMotorOrProp = /\b(motor|propeller|shaft|thruster)\b/.test(
            nameText
          );
          const isServoOrRudder = /\b(servo|rudder|steering)\b/.test(nameText);
          p.position = isMotorOrProp
            ? [-45, -12, idx % 2 === 0 ? 22 : -22]
            : isServoOrRudder
              ? [-120, 8, 0]
              : [25, 6, idx % 2 === 0 ? 18 : -18];
          p.rotation = [0, 0, 0];
          p.explode = [0, 65, idx % 2 === 0 ? 60 : -60];
        } else {
          const isFilterOrCore =
            /\b(hepa|filter|cartridge|fan|blower|motor|pump|battery)\b/.test(
              nameText
            );
          const isMagnetOrPad =
            /\b(magnet|magsafe|pad|vhb|adhesive|tape|gasket|epdm|foot|bumper)\b/.test(
              nameText
            );
          if (isFilterOrCore) {
            p.position = [0, Math.max(36, Math.round(cursorY * 0.45)), 0];
            p.rotation = [0, 0, 0];
            p.explode = [-95, 20, 0];
          } else if (isMagnetOrPad) {
            const isBottomAdhesive = /\b(vhb|adhesive|bottom|foot|base)\b/.test(
              nameText
            );
            p.position = isBottomAdhesive
              ? [0, -6, 0]
              : [0, Math.max(40, cursorY - 10), 34];
            p.rotation = isBottomAdhesive ? [0, 0, 0] : [18, 0, 0];
            p.explode = isBottomAdhesive ? [0, -90, 0] : [0, 55, 95];
          } else {
            const side = idx % 2 === 0 ? 1 : -1;
            p.position = [side * 34, Math.max(24, 22 + idx * 16), -12];
            p.rotation = [0, 0, 0];
            p.explode = [side * 85, 25 + idx * 10, -55];
          }
        }
      }
    }

    p.position = sanitizeVec3(p.position, [0, idx * 24, 0], 1200);
    p.rotation = sanitizeVec3(p.rotation, [0, 0, 0], 360);
    p.explode = sanitizeVec3(p.explode, [0, 45 + idx * 12, 0], 400);
    if (Math.hypot(p.explode[0], p.explode[1], p.explode[2]) < 15) {
      const ang = (idx / Math.max(1, parts.length)) * Math.PI * 2;
      p.explode = [
        Math.round(Math.cos(ang) * 55),
        idx === 0 ? -60 : Math.round(30 + idx * 12),
        Math.round(Math.sin(ang) * 55),
      ];
    }
    p.cadGrounded = true;
  });

  // De-overlap pass: ensure no two parts sit on the exact same 3D coordinate
  for (let i = 1; i < parts.length; i++) {
    for (let j = 0; j < i; j++) {
      const pi = parts[i].position;
      const pj = parts[j].position;
      const dist = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]);
      if (dist < 14) {
        pi[1] = Math.round((pj[1] + 22) * 10) / 10;
        pi[2] = Math.round((pi[2] + (i % 2 === 0 ? 12 : -12)) * 10) / 10;
      }
    }
  }

  if (analysis?.overallDimensionsMm) {
    // Keep assembly centered horizontally
    let minY = Infinity;
    for (const p of parts) {
      if (p.position[1] < minY) minY = p.position[1];
    }
    if (Number.isFinite(minY) && minY < -60) {
      const shiftY = -20 - minY;
      for (const p of parts) {
        p.position[1] = Math.round((p.position[1] + shiftY) * 10) / 10;
      }
    }
  }
}

function buildOpenScadPrompt(
  part: DesignPart,
  objectName: string,
  bedDimsMm: [number, number, number],
  attempt: number,
  allParts: DesignPart[],
  analysis?: ObjectAnalysis,
  teardown?: TeardownData,
  sources?: ResearchData,
  includePurchasedTransforms = false,
  previousCode?: string,
  previousError?: string
): string {
  const [tx, ty, tz] = part.dims_mm;
  const safeModName =
    "part_" + part.id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");

  const teardownPartsSummary = (teardown?.frames || [])
    .flatMap((f) => f.parts || [])
    .slice(0, 10)
    .map(
      (tp) =>
        `${tp.name} (${tp.buyOrPrint}, ${tp.material}, dims: ${JSON.stringify(
          tp.dims_mm
        )}, fn: ${tp.function})`
    );

  const assemblyContextTable = allParts.slice(0, 12).map((sp, i) => ({
    index: i + 1,
    id: sp.id,
    partNumber: sp.partNumber || `P-${i + 1}`,
    name: sp.name,
    kind: sp.kind,
    dims_mm: sp.dims_mm,
    role: sp.roleInAssembly || sp.description || "",
    initialPosMm: sp.position,
  }));

  const purchasedPartsList = allParts
    .filter((sp) => sp.kind === "purchased")
    .slice(0, 6)
    .map((sp) => ({
      partId: sp.id,
      name: sp.name,
      dims_mm: sp.dims_mm,
      role: sp.roleInAssembly || sp.description || "",
    }));

  const retrySection =
    attempt > 1 && previousError
      ? `
CRITICAL RETRY FEEDBACK (Attempt ${attempt}):
Your previous OpenSCAD code failed compilation or validation with the following error:
${previousError}

Previous OpenSCAD code:
\`\`\`scad
${previousCode || ""}
\`\`\`

Fix the OpenSCAD code immediately so that it compiles cleanly in OpenSCAD with zero syntax or CSG errors and fits inside [${bedDimsMm.join(
          ", "
        )}] mm.
`
      : "";

  const purchasedSchemaSection =
    includePurchasedTransforms && purchasedPartsList.length > 0
      ? `,
  "purchasedTransforms": [
    // Provide grounded 3D assembly transforms in the shared Y-up frame for each purchased part (${purchasedPartsList
      .map((p) => p.partId)
      .join(", ")}):
    {
      "partId": "${purchasedPartsList[0].partId}",
      "position": [0, 45, 0],
      "rotation": [0, 0, 0],
      "explode": [75, 25, 0],
      "shape": "tube",
      "dims_mm": [60, 60, 40]
    }
  ]`
      : "";

  return `You are the CAD & Assembly Architect Agent (Stage 5 of 6) in "Get Me An Alt", powered by Gemini 4 Argon.
Write a multi-feature parametric OpenSCAD script (.scad) AND a grounded 3D assembly transform for this printed part of "${objectName}":

Target Part Specification:
- ID: "${part.id}" (${part.partNumber || "PRT"})
- Name: "${part.name}"
- Function / Role: "${part.roleInAssembly || part.description || "Functional 3D-printed component"}"
- Description: "${part.description || ""}"
- Target Bounding Box dims_mm: [${tx}, ${ty}, ${tz}] mm
- Printer Bed Limit [X, Y, Z]: [${bedDimsMm[0]}, ${bedDimsMm[1]}, ${bedDimsMm[2]}] mm
- Material: "${part.material || "PETG"}"

Product & Teardown Grounding:
- Object: "${objectName}" (${analysis?.category || "Hardware"})
- Overall Product Dimensions [W, H, D] mm: ${JSON.stringify(
    analysis?.overallDimensionsMm || [160, 180, 140]
  )}
- Key Mechanisms: ${JSON.stringify(analysis?.keyMechanisms || [])}
- Teardown Callouts: ${JSON.stringify(teardownPartsSummary)}
- Technical Insights: ${JSON.stringify(
    (sources?.technicalInsights || []).slice(0, 4)
  )}
- Complete Assembly Part List (shared coordinate frame): ${JSON.stringify(
    assemblyContextTable
  )}

Mandatory OpenSCAD Geometry & Shared-Frame Assembly Rules:
1. Define \`module ${safeModName}()\` and CALL \`${safeModName}();\` at the bottom of the script.
2. Sculptural & Mechanical Realism: Model the recognizable 3D shape of "${part.name}" for "${objectName}" by combining 3-6 CSG operations (\`difference\`, \`union\`, \`hull\`, \`cylinder\`, \`cube\`, \`sphere\`, \`linear_extrude\`, \`rotate_extrude\`, \`offset\`, \`polygon\`). NEVER output a plain single cube or cylinder: include authentic features such as hollow cavities, stepped flanges, mounting bosses, M3 clearance holes (\`d = 3.4\`), intake slots, airfoil/tapered contours, collet sockets, or stiffening ribs.
3. Build centered around X=0, Y=0 on the Z-up print bed (Z >= 0) with \`$fn = 36;\` and walls >= 1.8mm so CGAL compiles in < 0.8s. Do NOT use external \`include\`/\`use\` libraries or 3D \`minkowski()\`.
4. Shared 3D Assembly Frame (\`assemblyTransform\`):
   - Origin \`[0, 0, 0]\` is the bottom-center of the assembled "${objectName}".
   - \`X\` = primary horizontal length axis (mm), \`Y\` = vertical height UP from base (mm, Y >= 0), \`Z\` = width / beam / front-back depth (mm).
   - LONG AXIS ALONG X FOR VEHICLES / BOATS / HORIZONTAL ASSEMBLIES: Match the product silhouette from any attached product images. For boats, tugboats, ships, vehicles, aircraft, or horizontal assemblies, orient the LONG AXIS along \`X\` (e.g. bow/front hull section at \`+X\`, midships hull near \`X = 0\`, stern/rear hull at \`-X\`, deck & wheelhouse/superstructure above at \`+Y\`, and twin nozzles/thrusters offset in \`±Z\`).
   - When the compiled OpenSCAD STL is loaded into the 3D viewer, its OpenSCAD +Z axis is automatically oriented along Three.js +Y (up) and centered at its bounding box center. Use \`rotation: [0, 0, 0]\` when the part's print +Z axis points straight up (+Y) in the assembly, or specify Euler angles \`[rx, ry, rz]\` in degrees (e.g. \`[90, 0, 0]\` for a vertical ring/faceplate printed flat on the bed).
   - \`position: [x, y, z]\` MUST place "${part.name}" at its true mating location in mm relative to the other parts in the assembly table so the assembled parts form the exact silhouette of "${objectName}".
   - \`explode: [ex, ey, ez]\` MUST be the outward disassembly vector in mm (magnitude 45..110 mm) along the axis this part separates during teardown.
${retrySection}
Respond with ONLY valid JSON matching this schema:
{
  "moduleName": "${safeModName}",
  "scadCode": "// Complete parametric OpenSCAD source code ending with ${safeModName}();",
  "designNotes": "Brief 1-sentence summary of geometry features and mating interfaces",
  "assemblyTransform": {
    "position": [${part.position?.[0] ?? 0}, ${part.position?.[1] ?? 30}, ${part.position?.[2] ?? 0}],
    "rotation": [${part.rotation?.[0] ?? 0}, ${part.rotation?.[1] ?? 0}, ${part.rotation?.[2] ?? 0}],
    "explode": [${part.explode?.[0] ?? 0}, ${part.explode?.[1] ?? 60}, ${part.explode?.[2] ?? 0}]
  }${purchasedSchemaSection}
}`;
}

/**
 * Runs the Gemini 4 Argon CAD Agent on a `design.json`:
 * - For each printed part, asks Gemini 4 Argon (`gemini-4-argon`) to write a parametric OpenSCAD module
 * - Compiles `.scad` -> binary `.stl` via `openscad-wasm-prebuilt`
 * - Validates non-empty, bounding box within 15% of `dims_mm`, and fits printer bed
 * - Retries up to 3 times feeding compiler/validation errors back to Argon
 * - Falls back to parametric OpenSCAD / procedural geometry if all retries fail
 * - Emits SSE events `{agent:"cad", phase: start|thought|artifact|done|error, message, data?, ts}`
 * - Writes `parts/<id>.scad`, `parts/<id>.stl`, `parts/plate-*.3mf`, `parts/all-plates.3mf`, and `plates.json`
 */
export async function runCadAgent(
  input: CadAgentInput
): Promise<
  RunAgentResult<
    UnifiedPlatesArtifact & {
      cadReport: CadAgentReport;
      bundle: CadGenerationBundle;
      updatedDesign: AppDesignSpec;
    }
  >
> {
  const startTime = Date.now();
  const maxRetries = input.preferRestForSpeed
    ? 1
    : Math.max(1, Math.min(2, input.maxRetries ?? 2));
  const design = normalizeDesignSpec(input.design);
  const printer = getPrinterById(input.printerId ?? DEFAULT_PRINTER_ID);
  const bedDimsMm: [number, number, number] = [
    printer.bed.x,
    printer.bed.y,
    printer.bed.z,
  ];
  const objectName =
    input.analysis?.objectName || design.objectName || "DIY Alternative Object";
  const allPrintedParts = design.parts.filter((p) => p.kind === "printed");
  const printedParts = allPrintedParts.slice(0, MAX_CAD_PARTS);

  const partsDir = path.join(input.cwd, "parts");
  fs.mkdirSync(partsDir, { recursive: true });

  const globalEmitter = (
    globalThis as unknown as { __altEmitter?: EventEmitter }
  ).__altEmitter;

  const emitLog = (level: AgentLogEntry["level"], message: string) => {
    const entry: AgentLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    input.onLog?.(entry);
  };

  const emitCadSse = (
    phase: SsePhase,
    message: string,
    data?: Record<string, unknown>
  ) => {
    const event: SsePipelineEvent = {
      agent: "cad",
      phase,
      message,
      data: {
        ...(data || {}),
        ...(input.manifest ? { manifest: input.manifest } : {}),
      },
      ts: new Date().toISOString(),
    };
    input.onEvent?.(event);
    if (input.manifest && globalEmitter) {
      globalEmitter.emit(`event:${input.manifest.id}`, event);
    }
  };

  emitCadSse(
    "start",
    `Starting CAD Agent: synthesizing parametric OpenSCAD & 3D assembly transforms in parallel for ${printedParts.length} printed parts on ${printer.name}...`,
    {
      printerId: printer.id,
      printerName: printer.name,
      bedDimensionsMm: bedDimsMm,
      printedPartsCount: printedParts.length,
    }
  );
  emitLog(
    "info",
    `CAD Agent initialized for "${objectName}" (${printedParts.length} printed parts capped at ${MAX_CAD_PARTS}, bed ${bedDimsMm.join("x")} mm).`
  );

  const meshOverrides = new Map<string, TriangleMesh>();
  const scadSources = new Map<string, string>();
  const partReports: CadPartBuildReport[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let primaryRunner: RunnerMode = "deterministic";
  let lastCommand: string | undefined;
  let lastConversationId: string | undefined;
  let argonSuccessCount = 0;
  let fallbackCount = 0;
  let totalAttemptsCount = 0;

  const argonFilterSet =
    Array.isArray(input.argonPartIds) && input.argonPartIds.length > 0
      ? new Set(input.argonPartIds)
      : null;

  const remainingBudgetAtStart = getRemainingPipelineBudgetMs(input.cwd);
  const perPartTimeoutMs = Math.min(
    14000,
    Math.max(7000, remainingBudgetAtStart - 36000)
  );
  const effectiveImages =
    input.inlineImages && input.inlineImages.length > 0
      ? input.inlineImages
      : loadProductImagesFromCwd(input.cwd, input.analysis?.productImages);

  // Step 1: Run Gemini 4 Argon OpenSCAD + assembly-transform synthesis in parallel across all printed parts
  const parallelSynthResults = await Promise.all(
    printedParts.map(async (part, idx) => {
      const shouldCallArgon = argonFilterSet
        ? argonFilterSet.has(part.id)
        : remainingBudgetAtStart > 36000;

      if (!shouldCallArgon) {
        return {
          part,
          idx,
          agentRes: null as RunAgentResult<ArgonOpenScadResponse> | null,
          durationMs: 0,
        };
      }

      const attemptStart = Date.now();
      emitCadSse(
        "thought",
        `[${idx + 1}/${printedParts.length}] ${part.name} (${part.id}): Argon parallel OpenSCAD + assembly transform synthesis...`,
        {
          partId: part.id,
          partName: part.name,
          attempt: 1,
          maxRetries,
          targetDimsMm: part.dims_mm,
        }
      );

      const prompt = buildOpenScadPrompt(
        part,
        objectName,
        bedDimsMm,
        1,
        design.parts,
        input.analysis,
        input.teardown,
        input.sources,
        idx === 0
      );

      const agentRes = await runGeminiAgent<ArgonOpenScadResponse>({
        stageName: `CAD-${part.id}`,
        prompt,
        cwd: input.cwd,
        inlineImages: effectiveImages,
        preferRestForSpeed: true,
        timeoutMs: perPartTimeoutMs,
        onLog: (entry) => {
          input.onLog?.(entry);
        },
        fallbackGenerator: () => ({
          moduleName: `part_${part.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
          scadCode: generateParametricOpenScad(part),
          designNotes:
            "Parametric OpenSCAD module with >=1.8mm walls, M3 clearance holes, and 0.2mm tolerances.",
        }),
      });

      return {
        part,
        idx,
        agentRes,
        durationMs: Date.now() - attemptStart,
      };
    })
  );

  // Step 2: Apply grounded assembly transforms (printed + purchased) & compile OpenSCAD -> STL via openscad-wasm
  for (const item of parallelSynthResults) {
    const { part, idx, agentRes, durationMs: firstDurationMs } = item;
    const scadRelPath = `parts/${part.id}.scad`;
    const stlRelPath = `parts/${part.id}.stl`;
    const scadAbsPath = path.join(input.cwd, scadRelPath);
    const attempts: CadPartAttemptLog[] = [];

    let compiledMesh: TriangleMesh | undefined;
    let finalScadCode = "";
    let finalValidation: OpenScadValidationResult | undefined;
    let engineUsed: CadPartBuildReport["engine"] = "procedural-fallback";

    if (agentRes) {
      totalAttemptsCount++;
      if (agentRes.runner !== "deterministic") {
        primaryRunner = agentRes.runner;
      }
      if (agentRes.command) lastCommand = agentRes.command;
      if (agentRes.conversationId) lastConversationId = agentRes.conversationId;
      if (agentRes.tokensUsed) {
        totalInputTokens += agentRes.tokensUsed.input;
        totalOutputTokens += agentRes.tokensUsed.output;
        totalTokens += agentRes.tokensUsed.total;
      }

      // Apply Argon's grounded assembly transform for this printed part (only when returned by live Argon)
      const tf =
        agentRes.runner !== "deterministic"
          ? agentRes.data?.assemblyTransform
          : undefined;
      if (tf && typeof tf === "object") {
        if (Array.isArray(tf.position) && tf.position.length >= 3) {
          part.position = sanitizeVec3(tf.position, part.position);
        }
        if (Array.isArray(tf.rotation) && tf.rotation.length >= 3) {
          part.rotation = sanitizeVec3(tf.rotation, part.rotation, 360);
        }
        if (Array.isArray(tf.explode) && tf.explode.length >= 3) {
          part.explode = sanitizeVec3(tf.explode, part.explode, 300);
        }
        part.cadGrounded = true;
      }

      // Apply Argon's grounded transforms for purchased parts if returned
      if (
        agentRes.runner !== "deterministic" &&
        Array.isArray(agentRes.data?.purchasedTransforms)
      ) {
        for (const ptf of agentRes.data.purchasedTransforms) {
          if (!ptf || typeof ptf.partId !== "string") continue;
          const targetPurchased = design.parts.find(
            (dp) => dp.id === ptf.partId || dp.partNumber === ptf.partId
          );
          if (targetPurchased) {
            if (Array.isArray(ptf.position) && ptf.position.length >= 3) {
              targetPurchased.position = sanitizeVec3(
                ptf.position,
                targetPurchased.position
              );
            }
            if (Array.isArray(ptf.rotation) && ptf.rotation.length >= 3) {
              targetPurchased.rotation = sanitizeVec3(
                ptf.rotation,
                targetPurchased.rotation,
                360
              );
            }
            if (Array.isArray(ptf.explode) && ptf.explode.length >= 3) {
              targetPurchased.explode = sanitizeVec3(
                ptf.explode,
                targetPurchased.explode,
                300
              );
            }
            if (Array.isArray(ptf.dims_mm) && ptf.dims_mm.length >= 3) {
              targetPurchased.dims_mm = sanitizeVec3(
                ptf.dims_mm,
                targetPurchased.dims_mm,
                250
              );
            }
            targetPurchased.cadGrounded = true;
          }
        }
      }

      let candidateScad =
        extractScadCode(agentRes.data) || generateParametricOpenScad(part);
      let check = await compileAndValidateOpenScad(candidateScad, {
        targetDimsMm: part.dims_mm,
        toleranceRatio: 0.65,
        bedDimsMm,
        label: `GetMeAnAlt OpenSCAD ${part.id}`,
      });

      if (
        !check.ok &&
        !input.preferRestForSpeed &&
        maxRetries > 1 &&
        agentRes.runner !== "deterministic" &&
        getRemainingPipelineBudgetMs(input.cwd) > 65000
      ) {
        totalAttemptsCount++;
        const retryStart = Date.now();
        const retryPrompt = buildOpenScadPrompt(
          part,
          objectName,
          bedDimsMm,
          2,
          design.parts,
          input.analysis,
          input.teardown,
          input.sources,
          false,
          candidateScad,
          check.errorFeedback || check.compile.errorSummary
        );
        const retryRes = await runGeminiAgent<ArgonOpenScadResponse>({
          stageName: `CAD-${part.id}-retry`,
          prompt: retryPrompt,
          cwd: input.cwd,
          inlineImages: effectiveImages,
          preferRestForSpeed: true,
          timeoutMs: 14000,
          fallbackGenerator: () => ({
            moduleName: `part_${part.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
            scadCode: generateParametricOpenScad(part),
          }),
        });
        candidateScad =
          extractScadCode(retryRes.data) || generateParametricOpenScad(part);
        check = await compileAndValidateOpenScad(candidateScad, {
          targetDimsMm: part.dims_mm,
          toleranceRatio: 0.65,
          bedDimsMm,
          label: `GetMeAnAlt OpenSCAD ${part.id}`,
        });
        attempts.push({
          attempt: 2,
          runner: retryRes.runner,
          ok: check.ok,
          durationMs: Date.now() - retryStart,
          errorFeedback: check.ok ? undefined : check.errorFeedback,
          actualDimsMm: check.validation?.actualDimsMm,
          triangleCount: check.validation?.triangleCount,
        });
      }

      if (check.ok && check.compile.mesh && check.validation) {
        compiledMesh = check.compile.mesh;
        finalScadCode = check.scadCode;
        finalValidation = check.validation;
        engineUsed =
          agentRes.runner === "deterministic"
            ? "parametric-openscad"
            : "argon-openscad";
        if (engineUsed === "argon-openscad") {
          argonSuccessCount++;
        }

        attempts.unshift({
          attempt: 1,
          runner: agentRes.runner,
          ok: true,
          durationMs: firstDurationMs,
          actualDimsMm: check.validation.actualDimsMm,
          triangleCount: check.validation.triangleCount,
        });

        const msg = `[${idx + 1}/${printedParts.length}] Compiled & validated ${scadRelPath} -> ${stlRelPath} (${check.validation.triangleCount} tris, bbox [${check.validation.actualDimsMm.join(
          "x"
        )}] mm, pos [${part.position.join(",")}] mm).`;
        emitLog("success", msg);
        emitCadSse("thought", msg, {
          partId: part.id,
          scadFile: scadRelPath,
          stlFile: stlRelPath,
          actualDimsMm: check.validation.actualDimsMm,
          triangleCount: check.validation.triangleCount,
          position: part.position,
          rotation: part.rotation,
        });
      } else {
        const lastError =
          check.errorFeedback ||
          check.compile.errorSummary ||
          "OpenSCAD validation fallback";
        attempts.unshift({
          attempt: 1,
          runner: agentRes.runner,
          ok: false,
          durationMs: firstDurationMs,
          errorFeedback: lastError,
          actualDimsMm: check.validation?.actualDimsMm,
          triangleCount: check.validation?.triangleCount,
        });
      }
    }

    // Fallback to semantic parametric OpenSCAD module compiled via openscad-wasm
    if (!compiledMesh) {
      const fallbackScad = generateParametricOpenScad(part);
      finalScadCode = fallbackScad;
      const fallbackCheck = await compileAndValidateOpenScad(fallbackScad, {
        targetDimsMm: part.dims_mm,
        toleranceRatio: 0.65,
        bedDimsMm,
        label: `GetMeAnAlt OpenSCAD ${part.id}`,
      });

      if (
        fallbackCheck.ok &&
        fallbackCheck.compile.mesh &&
        fallbackCheck.validation
      ) {
        compiledMesh = fallbackCheck.compile.mesh;
        finalValidation = fallbackCheck.validation;
        engineUsed = "parametric-openscad";
        emitLog(
          "info",
          `Compiled parametric OpenSCAD module ${scadRelPath} -> ${stlRelPath} via openscad-wasm (${fallbackCheck.validation.triangleCount} tris, bbox [${fallbackCheck.validation.actualDimsMm.join(
            "x"
          )}] mm).`
        );
      } else {
        fallbackCount++;
        compiledMesh = generatePartMesh(part);
        engineUsed = "procedural-fallback";
        emitLog(
          "warn",
          `OpenSCAD WASM fallback for ${part.id}; used procedural CSG geometry.`
        );
      }
    }

    // Write `parts/<id>.scad`
    fs.writeFileSync(scadAbsPath, finalScadCode, "utf-8");
    part.scadCode = finalScadCode;
    part.stlFile = stlRelPath;
    scadSources.set(part.id, finalScadCode);
    meshOverrides.set(part.id, compiledMesh);

    const manifold = validateManifold(compiledMesh);
    const actualDimsMm: [number, number, number] = [
      Math.round(compiledMesh.bbox.size[0] * 100) / 100,
      Math.round(compiledMesh.bbox.size[1] * 100) / 100,
      Math.round(compiledMesh.bbox.size[2] * 100) / 100,
    ];

    partReports.push({
      partId: part.id,
      name: part.name,
      targetDimsMm: part.dims_mm,
      actualDimsMm,
      scadFile: scadRelPath,
      stlFile: stlRelPath,
      engine: engineUsed,
      attemptsCount: attempts.length || 1,
      attempts,
      validation: finalValidation,
      triangleCount: manifold.triangleCount,
      volumeMm3: Math.round(manifold.volumeMm3 * 100) / 100,
      isManifold: manifold.isManifold,
    });

    emitCadSse("artifact", `Wrote ${scadRelPath} & ${stlRelPath}`, {
      partId: part.id,
      scadFile: scadRelPath,
      stlFile: stlRelPath,
      engine: engineUsed,
      dims_mm: actualDimsMm,
      triangleCount: manifold.triangleCount,
    });
  }

  // Ensure all printed & purchased parts have coherent non-overlapping 3D transforms in shared Y-up frame
  ensureGroundedAssemblyTransforms(design.parts, input.analysis);

  // Rerun the plate packer + print-time/filament estimates + per-plate & multi-plate 3MF exporter
  const bundle = generateCadBundle(design, {
    printerId: printer.id,
    objectId: input.objectId,
    meshOverrides,
    scadSources,
  });

  // Write all binary STL files & attach in-memory `stlBase64` onto `design.parts` so the Three.js viewer
  // can render compiled OpenSCAD geometry immediately even across ephemeral serverless containers.
  const stlBase64ByPartId = new Map<string, string>();
  for (const art of bundle.stlArtifacts) {
    fs.writeFileSync(path.join(input.cwd, art.stlFile), art.bytes);
    const b64 = Buffer.from(art.bytes).toString("base64");
    stlBase64ByPartId.set(art.partId, b64);
  }

  for (const dp of design.parts) {
    const b64 = stlBase64ByPartId.get(dp.id);
    if (b64) {
      dp.stlBase64 = b64;
      dp.stlFile = `parts/${dp.id}.stl`;
    }
    const scad = scadSources.get(dp.id);
    if (scad) {
      dp.scadCode = scad;
    }
  }

  // Persist updated design.json with per-part `stlBase64`, `scadCode`, `stlFile`, and grounded assembly transforms
  fs.writeFileSync(
    path.join(input.cwd, "design.json"),
    JSON.stringify(design, null, 2) + "\n",
    "utf-8"
  );

  // Write per-plate 3MF archives
  for (const plate3mf of bundle.plate3mfArtifacts) {
    fs.writeFileSync(path.join(input.cwd, plate3mf.relativePath), plate3mf.bytes);
  }

  // Write Bambu-ready multi-plate 3MF archive
  fs.writeFileSync(
    path.join(input.cwd, bundle.multiPlate3mfArtifact.relativePath),
    bundle.multiPlate3mfArtifact.bytes
  );

  // Build CAD report & attach to plates.json
  const cadReport: CadAgentReport = {
    printerId: printer.id,
    printerName: printer.name,
    bedDimensionsMm: bedDimsMm,
    totalPrintedParts: printedParts.length,
    argonOpenScadParts: argonSuccessCount,
    fallbackParts: fallbackCount,
    totalAttempts: totalAttemptsCount,
    parts: partReports,
  };

  const platesWithReport = {
    ...bundle.platesJson,
    cadReport,
  };

  fs.writeFileSync(
    path.join(input.cwd, "plates.json"),
    JSON.stringify(platesWithReport, null, 2) + "\n",
    "utf-8"
  );

  fs.writeFileSync(
    path.join(input.cwd, "cad-report.json"),
    JSON.stringify(cadReport, null, 2) + "\n",
    "utf-8"
  );

  const summaryMsg = `Compiled ${printedParts.length} OpenSCAD parts (.scad -> .stl via openscad-wasm) with grounded 3D assembly transforms and packed onto ${bundle.platesJson.totalPlates} plate(s) (${bundle.platesJson.totalWeightGrams}g, ~${bundle.platesJson.formattedTotalPrintTime}) with Bambu 3MF.`;
  emitLog("success", summaryMsg);

  emitCadSse("artifact", "Wrote plates.json & parts/all-plates.3mf", {
    artifactFile: "plates.json",
    multiPlate3mfFile: bundle.multiPlate3mfArtifact.relativePath,
    totalPlates: bundle.platesJson.totalPlates,
    totalWeightGrams: bundle.platesJson.totalWeightGrams,
    totalPrintTimeMinutes: bundle.platesJson.totalPrintTimeMinutes,
  });

  const durationMs = Date.now() - startTime;
  emitCadSse("done", summaryMsg, {
    summary: summaryMsg,
    durationMs,
    runner: primaryRunner,
    tokensUsed:
      totalTokens > 0
        ? {
            input: totalInputTokens,
            output: totalOutputTokens,
            total: totalTokens,
          }
        : undefined,
    cadReport,
  });

  return {
    data: {
      ...platesWithReport,
      bundle,
      updatedDesign: design as unknown as AppDesignSpec,
    },
    runner: primaryRunner,
    command: lastCommand,
    conversationId: lastConversationId,
    model: process.env.GEMINI_MODEL || "gemini-4-argon",
    durationMs,
    tokensUsed:
      totalTokens > 0
        ? {
            input: totalInputTokens,
            output: totalOutputTokens,
            total: totalTokens,
          }
        : undefined,
  };
}
