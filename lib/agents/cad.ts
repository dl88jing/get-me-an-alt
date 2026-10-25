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
  ObjectAnalysis,
  ProjectManifest,
  RunnerMode,
  SsePhase,
  SsePipelineEvent,
} from "../types";
import { runGeminiAgent, RunAgentResult } from "./runner";

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
  cwd: string;
  objectId?: string;
  printerId?: string;
  /** Maximum Argon compile/validate attempts per part (default: 3) */
  maxRetries?: number;
  /**
   * Optional list of part IDs to synthesize via live Gemini 4 Argon LLM calls.
   * If omitted, runs Gemini 4 Argon on all printed parts in `design.json`.
   */
  argonPartIds?: string[];
  /** Prefer Gemini REST over agy CLI for faster per-part turnarounds */
  preferRestForSpeed?: boolean;
  manifest?: ProjectManifest;
  onLog?: (entry: AgentLogEntry) => void;
  onEvent?: (event: SsePipelineEvent) => void;
}

interface ArgonOpenScadResponse {
  scadCode: string;
  moduleName?: string;
  designNotes?: string;
}

function buildOpenScadPrompt(
  part: DesignPart,
  objectName: string,
  bedDimsMm: [number, number, number],
  attempt: number,
  previousCode?: string,
  previousError?: string
): string {
  const [tx, ty, tz] = part.dims_mm;
  const safeModName =
    "part_" + part.id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");

  const retrySection =
    attempt > 1 && previousError
      ? `
CRITICAL RETRY FEEDBACK (Attempt ${attempt} of 3):
Your previous OpenSCAD code failed compilation or validation with the following error:
${previousError}

Previous OpenSCAD code:
\`\`\`scad
${previousCode || ""}
\`\`\`

Fix the OpenSCAD code immediately so that:
1. It compiles with zero syntax or CSG errors in OpenSCAD.
2. The rendered top-level 3D object has an outer bounding box [X, Y, Z] within ±15% of [${tx}, ${ty}, ${tz}] mm.
`
      : "";

  return `You are the CAD Agent (Stage 5 of 6) in "Get Me An Alt", powered by Gemini 4 Argon.
Write a parametric OpenSCAD script (.scad) for the following 3D-printed part of "${objectName}":

Part Specification:
- ID: "${part.id}"
- Part Number: "${part.partNumber || "PRT"}"
- Name: "${part.name}"
- Function / Role: "${part.roleInAssembly || part.description || "Functional 3D-printed component"}"
- Description: "${part.description || ""}"
- Target Outer Bounding Box dims_mm [X, Y, Z]: [${tx}, ${ty}, ${tz}] mm
- Printer Bed Limit [X, Y, Z]: [${bedDimsMm[0]}, ${bedDimsMm[1]}, ${bedDimsMm[2]}] mm
- Base Shape Hint: "${part.shape}"
- Parametric Params: ${JSON.stringify(part.params || {})}
- Material: "${part.material || "PETG"}"

Mandatory Engineering & OpenSCAD Rules:
1. Define a parametric module \`module ${safeModName}(...)\` with top-level customizable parameters matching the part's dimensions and features, and CALL \`${safeModName}();\` at the bottom of the script so OpenSCAD renders the 3D geometry.
2. Outer Bounding Box: The rendered geometry's bounding box along X, Y, and Z MUST be within ±15% of [${tx}, ${ty}, ${tz}] mm (X ≈ ${tx}mm, Y ≈ ${ty}mm, Z ≈ ${tz}mm).
3. Wall Thickness: All structural walls and floors MUST be >= 1.6mm thick (e.g., \`wall_thickness = 2.4;\`).
4. Fillets & Rounding: Use 2D \`offset(r=...)\` with \`linear_extrude\`, or \`hull()\` / \`minkowski()\` sparingly so CGAL compilation finishes in under 1 second. Set \`$fn = 40;\`.
5. Fasteners & Tolerances: Include M3 screw clearance holes (\`m3_hole_d = 3.4;\`) or mounting features where appropriate, and declare \`tolerance = 0.2;\` for mating interfaces.
6. Self-Contained: Do NOT use external \`include <...>\` or \`use <...>\` libraries. Use only standard built-in OpenSCAD primitives (\`cube\`, \`cylinder\`, \`sphere\`, \`polyhedron\`, \`square\`, \`circle\`, \`polygon\`, \`linear_extrude\`, \`rotate_extrude\`, \`offset\`, \`difference\`, \`union\`, \`intersection\`, \`hull\`, \`minkowski\`, \`translate\`, \`rotate\`, \`scale\`).
${retrySection}
Respond with ONLY valid JSON matching this schema:
{
  "moduleName": "${safeModName}",
  "scadCode": "// Complete parametric OpenSCAD source code ending with ${safeModName}();",
  "designNotes": "Brief 1-sentence summary of walls, fillets, M3 holes, and tolerances"
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
    }
  >
> {
  const startTime = Date.now();
  const maxRetries = input.preferRestForSpeed
    ? 1
    : Math.max(1, Math.min(3, input.maxRetries ?? 3));
  const design = normalizeDesignSpec(input.design);
  const printer = getPrinterById(input.printerId ?? DEFAULT_PRINTER_ID);
  const bedDimsMm: [number, number, number] = [
    printer.bed.x,
    printer.bed.y,
    printer.bed.z,
  ];
  const objectName =
    input.analysis?.objectName || design.objectName || "DIY Alternative Object";
  const printedParts = design.parts.filter((p) => p.kind === "printed");

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
    `Starting CAD Agent: synthesizing parametric OpenSCAD & compiling STLs for ${printedParts.length} printed parts on ${printer.name}...`,
    {
      printerId: printer.id,
      printerName: printer.name,
      bedDimensionsMm: bedDimsMm,
      printedPartsCount: printedParts.length,
    }
  );
  emitLog(
    "info",
    `CAD Agent initialized for "${objectName}" (${printedParts.length} printed parts, bed ${bedDimsMm.join("x")} mm).`
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
      : input.preferRestForSpeed
      ? new Set<string>()
      : null;

  for (let idx = 0; idx < printedParts.length; idx++) {
    const part = printedParts[idx];
    const scadRelPath = `parts/${part.id}.scad`;
    const stlRelPath = `parts/${part.id}.stl`;
    const scadAbsPath = path.join(input.cwd, scadRelPath);

    const shouldCallArgon = argonFilterSet
      ? argonFilterSet.has(part.id)
      : !input.preferRestForSpeed || idx === 0;
    const attempts: CadPartAttemptLog[] = [];

    let compiledMesh: TriangleMesh | undefined;
    let finalScadCode = "";
    let finalValidation: OpenScadValidationResult | undefined;
    let engineUsed: CadPartBuildReport["engine"] = "procedural-fallback";

    let lastCode = "";
    let lastError = "";

    if (shouldCallArgon) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        totalAttemptsCount++;
        const attemptStart = Date.now();
        emitCadSse(
          "thought",
          `[${idx + 1}/${printedParts.length}] ${part.name} (${part.id}): Argon OpenSCAD synthesis attempt ${attempt}/${maxRetries}...`,
          {
            partId: part.id,
            partName: part.name,
            attempt,
            maxRetries,
            targetDimsMm: part.dims_mm,
          }
        );

        const prompt = buildOpenScadPrompt(
          part,
          objectName,
          bedDimsMm,
          attempt,
          lastCode,
          lastError
        );

        const agentRes = await runGeminiAgent<ArgonOpenScadResponse>({
          stageName: `CAD-${part.id}-attempt-${attempt}`,
          prompt,
          cwd: input.cwd,
          preferRestForSpeed: input.preferRestForSpeed,
          timeoutMs: input.preferRestForSpeed ? 6000 : 30000,
          onLog: (entry) => {
            input.onLog?.(entry);
          },
          fallbackGenerator: () => ({
            moduleName: `part_${part.id.replace(/[^a-zA-Z0-9_]/g, "_")}`,
            scadCode: generateParametricOpenScad(part),
            designNotes:
              "Parametric OpenSCAD module with >=1.6mm walls, M3 clearance holes, and 0.2mm tolerances.",
          }),
        });

        if (agentRes.runner !== "deterministic") {
          primaryRunner = agentRes.runner;
        }
        if (agentRes.command) lastCommand = agentRes.command;
        if (agentRes.conversationId)
          lastConversationId = agentRes.conversationId;
        if (agentRes.tokensUsed) {
          totalInputTokens += agentRes.tokensUsed.input;
          totalOutputTokens += agentRes.tokensUsed.output;
          totalTokens += agentRes.tokensUsed.total;
        }

        const candidateScad =
          extractScadCode(agentRes.data) || generateParametricOpenScad(part);
        lastCode = candidateScad;

        const check = await compileAndValidateOpenScad(candidateScad, {
          targetDimsMm: part.dims_mm,
          toleranceRatio: 0.15,
          bedDimsMm,
          label: `GetMeAnAlt OpenSCAD ${part.id}`,
        });

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

          attempts.push({
            attempt,
            runner: agentRes.runner,
            ok: true,
            durationMs: Date.now() - attemptStart,
            actualDimsMm: check.validation.actualDimsMm,
            triangleCount: check.validation.triangleCount,
          });

          const msg = `Compiled & validated ${scadRelPath} -> ${stlRelPath} on attempt ${attempt} (${check.validation.triangleCount} tris, bbox [${check.validation.actualDimsMm.join(
            "x"
          )}] mm vs target [${part.dims_mm.join("x")}] mm).`;
          emitLog("success", msg);
          emitCadSse("thought", msg, {
            partId: part.id,
            attempt,
            scadFile: scadRelPath,
            stlFile: stlRelPath,
            actualDimsMm: check.validation.actualDimsMm,
            triangleCount: check.validation.triangleCount,
          });
          break;
        } else {
          lastError =
            check.errorFeedback ||
            check.compile.errorSummary ||
            "Unknown OpenSCAD validation failure";
          attempts.push({
            attempt,
            runner: agentRes.runner,
            ok: false,
            durationMs: Date.now() - attemptStart,
            errorFeedback: lastError,
            actualDimsMm: check.validation?.actualDimsMm,
            triangleCount: check.validation?.triangleCount,
          });

          const warnMsg = `Attempt ${attempt}/${maxRetries} for ${part.id} failed check: ${lastError}`;
          emitLog("warn", warnMsg);
          emitCadSse("thought", warnMsg, {
            partId: part.id,
            attempt,
            error: lastError,
          });
          if (agentRes.runner === "deterministic") {
            break;
          }
        }
      }
    }

    // If Argon was skipped for this part or all 3 Argon attempts failed,
    // first try our deterministic parametric OpenSCAD module through openscad-wasm,
    // and if WASM fails, fall back to the existing procedural geometry.
    if (!compiledMesh) {
      const fallbackScad = generateParametricOpenScad(part);
      finalScadCode = fallbackScad;
      const fallbackCheck = await compileAndValidateOpenScad(fallbackScad, {
        targetDimsMm: part.dims_mm,
        toleranceRatio: 0.15,
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
          `All OpenSCAD attempts failed for ${part.id}; fell back to procedural CSG geometry.`
        );
      }
    }

    // Write `parts/<id>.scad`
    fs.writeFileSync(scadAbsPath, finalScadCode, "utf-8");
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

  // Rerun the plate packer + print-time/filament estimates + per-plate & multi-plate 3MF exporter
  const bundle = generateCadBundle(design, {
    printerId: printer.id,
    objectId: input.objectId,
    meshOverrides,
    scadSources,
  });

  // Write all binary STL files
  for (const art of bundle.stlArtifacts) {
    fs.writeFileSync(path.join(input.cwd, art.stlFile), art.bytes);
  }

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

  const summaryMsg = `Compiled ${printedParts.length} OpenSCAD parts (.scad -> .stl via openscad-wasm) and packed onto ${bundle.platesJson.totalPlates} plate(s) (${bundle.platesJson.totalWeightGrams}g, ~${bundle.platesJson.formattedTotalPrintTime}) with Bambu 3MF.`;
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
