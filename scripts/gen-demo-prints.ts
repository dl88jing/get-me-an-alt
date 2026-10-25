import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PRINTER_ID } from "../lib/printers";
import {
  DesignPartShape,
  generateCadBundle,
  generatePartMesh,
  normalizeDesignSpec,
  normalizeInstructions,
  PRINTED_PART_SHAPES,
  validateManifold,
} from "../lib/cad";

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

function verifyLegacyAdapterCompatibility(): void {
  console.log("\n=== Verifying dual-schema adapter compatibility ===");
  const legacyDesign = {
    objectName: "Legacy Schema Test",
    printedParts: [
      {
        id: "base-box",
        name: "Base Box",
        shape: "box",
        params: { width: 50, depth: 40, height: 20 },
        color: "#0ea5e9",
        quantity: 1,
      },
    ],
    purchasedParts: [
      {
        id: "motor-1",
        name: "5V Motor",
        bomLine: "bom-motor-1",
        proxyShape: { shape: "cylinder", params: { radius: 10, height: 25 } },
      },
    ],
    assembly: [
      { partId: "base-box", position: [0, 0, 0], rotation: [0, 0, 0], explode: [0, 0, -30], step: 1 },
      { partId: "motor-1", position: [0, 0, 20], rotation: [0, 0, 0], explode: [0, 0, 40], step: 2 },
    ],
  };

  const normalized = normalizeDesignSpec(legacyDesign);
  if (normalized.parts.length !== 2 || normalized.parts[0].kind !== "printed" || normalized.parts[1].kind !== "purchased") {
    throw new Error("Legacy design adapter failed to produce flat parts[] array.");
  }

  const legacyInstructions = {
    steps: [
      { step: 1, title: "Place Base", description: "Put base on table", partIds: ["base-box"], tools: [] },
      { step: 2, title: "Insert Motor", description: "Drop motor in", partIds: ["motor-1", "base-box"], tools: ["M3 Hex"] },
    ],
  };
  const normInst = normalizeInstructions(legacyInstructions, normalized);
  if (
    normInst.steps.length !== 2 ||
    normInst.steps[1].motion.length !== 1 ||
    normInst.steps[1].motion[0].partId !== "motor-1"
  ) {
    throw new Error("Legacy instructions adapter failed to synthesize motion[].");
  }
  console.log("  [OK] Adapters accept both shared-contract and legacy schemas.");
}

function generateArtifactsForFolder(targetDir: string, objectId: string, printerId = DEFAULT_PRINTER_ID): void {
  const partsDir = path.join(targetDir, "parts");
  fs.mkdirSync(partsDir, { recursive: true });

  // Remove stale legacy `prints/` directory if present
  const legacyPrintsDir = path.join(targetDir, "prints");
  if (fs.existsSync(legacyPrintsDir)) {
    fs.rmSync(legacyPrintsDir, { recursive: true, force: true });
  }

  const designPath = path.join(targetDir, "design.json");
  const rawDesign = JSON.parse(fs.readFileSync(designPath, "utf-8"));
  const bundle = generateCadBundle(rawDesign, { printerId, objectId });

  console.log(`\n=== Generating STLs & Plates for '${bundle.design.objectName}' in ${targetDir} ===`);
  console.log(
    `Target Printer: ${bundle.printer.name} (${bundle.printer.bed.x}x${bundle.printer.bed.y}x${bundle.printer.bed.z} mm)`
  );

  for (const art of bundle.stlArtifacts) {
    if (!art.manifold.isManifold) {
      throw new Error(
        `Part '${art.partId}' (${art.shape}) failed manifold validation: ${JSON.stringify(art.manifold)}`
      );
    }

    const view = new DataView(art.bytes.buffer, art.bytes.byteOffset, art.bytes.byteLength);
    const headerTriCount = view.getUint32(80, true);
    const expectedByteLen = 84 + headerTriCount * 50;
    if (headerTriCount !== art.manifold.triangleCount || art.byteLength !== expectedByteLen) {
      throw new Error(
        `Invalid STL binary structure for ${art.partId}: tris=${headerTriCount}, bytes=${art.byteLength}`
      );
    }

    const stlAbsPath = path.join(targetDir, art.stlFile);
    fs.writeFileSync(stlAbsPath, art.bytes);
    console.log(
      `  [STL] ${art.stlFile.padEnd(28)} | qty=${art.quantity} | dims=${art.dims_mm
        .map((d) => d.toFixed(1))
        .join("x")} mm | tris=${art.manifold.triangleCount} | manifold=true`
    );
  }

  if (bundle.packResult.rejected.length > 0) {
    throw new Error(
      `Unexpected rejected parts on printer bed: ${JSON.stringify(bundle.packResult.rejected)}`
    );
  }

  for (const plate3mf of bundle.plate3mfArtifacts) {
    if (
      plate3mf.byteLength < 22 ||
      plate3mf.bytes[0] !== 0x50 ||
      plate3mf.bytes[1] !== 0x4b ||
      plate3mf.bytes[2] !== 0x03 ||
      plate3mf.bytes[3] !== 0x04
    ) {
      throw new Error(`Generated 3MF ${plate3mf.fileName} is not a valid ZIP archive.`);
    }
    const outPath = path.join(targetDir, plate3mf.relativePath);
    fs.writeFileSync(outPath, plate3mf.bytes);
    console.log(
      `  [3MF] ${plate3mf.relativePath.padEnd(28)} | size=${plate3mf.byteLength} B (${bundle.packResult.heuristicUsed})`
    );
  }

  const platesJsonPath = path.join(targetDir, "plates.json");
  fs.writeFileSync(platesJsonPath, JSON.stringify(bundle.platesJson, null, 2) + "\n", "utf-8");

  // Validate instructions.json motion vectors against design.json
  const instructionsPath = path.join(targetDir, "instructions.json");
  if (fs.existsSync(instructionsPath)) {
    const rawInstructions = JSON.parse(fs.readFileSync(instructionsPath, "utf-8"));
    const normInstructions = normalizeInstructions(rawInstructions, bundle.design);
    fs.writeFileSync(instructionsPath, JSON.stringify(normInstructions, null, 2) + "\n", "utf-8");
    console.log(`  [OK] Verified instructions.json (${normInstructions.steps.length} steps with motion:{partId,from,to}[]).`);
  }

  console.log(
    `\nWrote ${platesJsonPath} (${bundle.platesJson.totalPlates} plate(s), ${bundle.platesJson.totalPrintedItems} total printed items, ${bundle.platesJson.totalWeightGrams}g total).`
  );
}

function main(): void {
  verifyAllParametricShapes();
  verifyLegacyAdapterCompatibility();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const nodeProcess = (globalThis as { process?: { argv?: string[]; cwd?: () => string } }).process;
  const cliTarget = nodeProcess?.argv?.[2];
  const targetDir = cliTarget
    ? path.resolve(nodeProcess?.cwd ? nodeProcess.cwd() : rootDir, cliTarget)
    : path.join(rootDir, "data", "demo", "plant-waterer");
  const objectId = path.basename(targetDir);

  generateArtifactsForFolder(targetDir, objectId, DEFAULT_PRINTER_ID);
}

main();
