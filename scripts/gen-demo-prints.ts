import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCadAgent } from "../lib/agents/cad";
import {
  compileAndValidateOpenScad,
  DesignPartShape,
  generatePartMesh,
  normalizeDesignSpec,
  normalizeInstructions,
  PRINTED_PART_SHAPES,
  validateManifold,
} from "../lib/cad";
import { DEFAULT_PRINTER_ID } from "../lib/printers";

function verifyAllParametricShapes(): void {
  console.log("=== Verifying parametric shape generators & aliases (2-manifold check) ===");
  const sampleParams: Record<string, Record<string, any>> = {
    box: { width: 40, depth: 30, height: 20 },
    cylinder: { radius: 15, height: 30, segments: 36 },
    tube: { outerRadius: 20, innerRadius: 14, height: 30, flangeRadius: 25, flangeHeight: 4 },
    bracketL: { legA: 45, legB: 40, width: 25, thickness: 4, filletRadius: 4 },
    plate_with_holes: {
      width: 80,
      depth: 60,
      thickness: 5,
      cornerRadius: 6,
      holes: [
        { x: -25, y: -15, radius: 3 },
        { x: 25, y: -15, radius: 3 },
        { x: 25, y: 15, radius: 3 },
        { x: -25, y: 15, radius: 3 },
      ],
    },
    hook: { shankLength: 80, throatRadius: 10, width: 8, thickness: 4, tipLength: 10 },
    clip: { innerRadius: 4, wallThickness: 2.5, height: 12, openAngleDeg: 75 },
    funnel: {
      topRadius: 24,
      spoutRadius: 8,
      coneHeight: 22,
      spoutHeight: 12,
      wallThickness: 2.2,
      flangeWidth: 3,
    },
    gear_simple: { teeth: 16, module: 2, boreRadius: 3.5, thickness: 8 },
    custom_csg: {
      preset: "enclosure",
      width: 75,
      depth: 55,
      height: 28,
      wallThickness: 3,
      floorThickness: 3,
      cornerRadius: 6,
      holes: [
        { x: -20, y: 0, radius: 2 },
        { x: 20, y: 0, radius: 2 },
      ],
    },
    cone: { radiusBottom: 15, radiusTop: 3, height: 40 },
    sphere: { radius: 16 },
    bracket: { legA: 40, legB: 35, width: 20, thickness: 4 },
    enclosure: { width: 68, depth: 54, height: 28, wallThickness: 2.5 },
  };

  const allShapes: DesignPartShape[] = [
    ...PRINTED_PART_SHAPES,
    "cone",
    "sphere",
    "bracket",
    "enclosure",
  ];

  for (const shape of allShapes) {
    const mesh = generatePartMesh({ shape, params: sampleParams[shape] ?? {} });
    const report = validateManifold(mesh);
    if (!report.isManifold) {
      throw new Error(
        `Shape '${shape}' failed manifold check: ${JSON.stringify(report)}`
      );
    }
    console.log(
      `  [OK] ${shape.padEnd(17)} | tris=${String(report.triangleCount).padStart(4)} | edges=${String(
        report.edgeCount
      ).padStart(4)} | boundary=${report.boundaryEdges} | nonManifold=${
        report.nonManifoldEdges
      } | vol=${(report.volumeMm3 / 1000).toFixed(2)} cm^3`
    );
  }
}

async function verifyOpenScadWasmCompilerAndValidator(): Promise<void> {
  console.log("\n=== Verifying openscad-wasm compiler & bounding-box validator ===");

  // 1. Valid OpenSCAD script within 15% of [40, 30, 20]
  const validRes = await compileAndValidateOpenScad(
    `$fn=32; difference() { cube([40, 30, 20], center=true); cylinder(h=25, d=3.4, center=true); }`,
    { targetDimsMm: [40, 30, 20], toleranceRatio: 0.15 }
  );
  if (!validRes.ok || !validRes.validation?.valid) {
    throw new Error(`Expected valid OpenSCAD to pass: ${validRes.errorFeedback}`);
  }
  console.log(
    `  [OK] Valid OpenSCAD compiled in ${validRes.compile.durationMs}ms: tris=${validRes.validation.triangleCount}, bbox=[${validRes.validation.actualDimsMm.join("x")}] mm`
  );

  // 2. Syntax error check
  const syntaxRes = await compileAndValidateOpenScad(`cube([40, 30, );`, {
    targetDimsMm: [40, 30, 20],
  });
  if (syntaxRes.ok) {
    throw new Error("Expected syntax error OpenSCAD to fail.");
  }
  console.log(`  [OK] Syntax error caught: ${syntaxRes.errorFeedback}`);

  // 3. Bounding box >15% mismatch check
  const bboxRes = await compileAndValidateOpenScad(`cube([80, 30, 20]);`, {
    targetDimsMm: [40, 30, 20],
    toleranceRatio: 0.15,
  });
  if (bboxRes.ok) {
    throw new Error("Expected oversized bounding box OpenSCAD to fail validation.");
  }
  console.log(`  [OK] BBox 15% tolerance check caught: ${bboxRes.errorFeedback}`);
}

async function generateArtifactsForFolder(
  targetDir: string,
  objectId: string,
  printerId = DEFAULT_PRINTER_ID
): Promise<void> {
  const partsDir = path.join(targetDir, "parts");
  fs.mkdirSync(partsDir, { recursive: true });

  // Remove stale legacy `prints/` directory if present
  const legacyPrintsDir = path.join(targetDir, "prints");
  if (fs.existsSync(legacyPrintsDir)) {
    fs.rmSync(legacyPrintsDir, { recursive: true, force: true });
  }

  const designPath = path.join(targetDir, "design.json");
  const rawDesign = JSON.parse(fs.readFileSync(designPath, "utf-8"));
  const analysisPath = path.join(targetDir, "analysis.json");
  const rawAnalysis = fs.existsSync(analysisPath)
    ? JSON.parse(fs.readFileSync(analysisPath, "utf-8"))
    : undefined;

  console.log(
    `\n=== Running Argon CAD Agent (OpenSCAD -> openscad-wasm -> STL/3MF) in ${targetDir} ===`
  );

  const sseEvents: Array<{ phase: string; message: string }> = [];

  // Run Argon CAD loop on 4 representative printed parts + parametric OpenSCAD WASM on all printed parts
  const cadResult = await runCadAgent({
    design: rawDesign,
    analysis: rawAnalysis,
    cwd: targetDir,
    objectId,
    printerId,
    maxRetries: 3,
    preferRestForSpeed: true,
    argonPartIds: [
      "reservoir-tank",
      "reservoir-lid",
      "controller-box",
      "controller-bracket",
    ],
    onLog: (entry) => {
      console.log(`  [CAD ${entry.level.toUpperCase()}] ${entry.message}`);
    },
    onEvent: (ev) => {
      sseEvents.push({ phase: ev.phase, message: ev.message });
    },
  });

  const { bundle, cadReport } = cadResult.data;

  for (const partRep of cadReport.parts) {
    const scadAbs = path.join(targetDir, partRep.scadFile);
    const stlAbs = path.join(targetDir, partRep.stlFile);
    if (!fs.existsSync(scadAbs) || !fs.existsSync(stlAbs)) {
      throw new Error(`Missing ${partRep.scadFile} or ${partRep.stlFile}`);
    }
    console.log(
      `  [PART] ${partRep.partId.padEnd(20)} | engine=${partRep.engine.padEnd(
        19
      )} | attempts=${partRep.attemptsCount} | bbox=[${partRep.actualDimsMm.join(
        "x"
      )}] mm (target [${partRep.targetDimsMm.join("x")}]) | tris=${
        partRep.triangleCount
      }`
    );
  }

  // Validate instructions.json motion vectors against design.json
  const instructionsPath = path.join(targetDir, "instructions.json");
  if (fs.existsSync(instructionsPath)) {
    const rawInstructions = JSON.parse(fs.readFileSync(instructionsPath, "utf-8"));
    const normInstructions = normalizeInstructions(
      rawInstructions,
      normalizeDesignSpec(rawDesign)
    );
    fs.writeFileSync(
      instructionsPath,
      JSON.stringify(normInstructions, null, 2) + "\n",
      "utf-8"
    );
    console.log(
      `  [OK] Verified instructions.json (${normInstructions.steps.length} steps with motion:{partId,from,to}[]).`
    );
  }

  console.log(
    `\nCompleted CAD Agent in ${(cadResult.durationMs / 1000).toFixed(1)}s (runner=${
      cadResult.runner
    }, SSE events=${sseEvents.length}, plates=${
      bundle.platesJson.totalPlates
    }, weight=${bundle.platesJson.totalWeightGrams}g, time=${
      bundle.platesJson.formattedTotalPrintTime
    }).`
  );
}

async function main(): Promise<void> {
  verifyAllParametricShapes();
  await verifyOpenScadWasmCompilerAndValidator();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const nodeProcess = (
    globalThis as { process?: { argv?: string[]; cwd?: () => string } }
  ).process;
  const cliTarget = nodeProcess?.argv?.[2];
  const targetDir = cliTarget
    ? path.resolve(nodeProcess?.cwd ? nodeProcess.cwd() : rootDir, cliTarget)
    : path.join(rootDir, "data", "demo", "plant-waterer");
  const objectId = path.basename(targetDir);

  await generateArtifactsForFolder(targetDir, objectId, DEFAULT_PRINTER_ID);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
