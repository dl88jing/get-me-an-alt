import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PRINTER_ID, getPrinterById } from "../lib/printers";
import {
  DesignSpec,
  generatePartMesh,
  meshToBinaryStl,
  packPrintedParts,
  Plate3mfItem,
  PRINTED_PART_SHAPES,
  TriangleMesh,
  validateManifold,
  writePlate3mf,
} from "../lib/cad";

function verifyAllParametricShapes(): void {
  console.log("=== Verifying all 10 parametric shape generators (2-manifold check) ===");
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
  };

  for (const shape of PRINTED_PART_SHAPES) {
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

function main(): void {
  verifyAllParametricShapes();

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, "..");
  const demoDir = path.join(rootDir, "data", "demo", "plant-waterer");
  const printsDir = path.join(demoDir, "prints");
  fs.mkdirSync(printsDir, { recursive: true });

  const designPath = path.join(demoDir, "design.json");
  const design: DesignSpec = JSON.parse(fs.readFileSync(designPath, "utf-8"));
  const printer = getPrinterById(DEFAULT_PRINTER_ID);

  console.log(`\n=== Generating Demo STLs for '${design.objectName}' ===`);
  console.log(
    `Target Printer: ${printer.name} (${printer.bed.x}x${printer.bed.y}x${printer.bed.z} mm)`
  );

  const meshesById = new Map<string, TriangleMesh>();
  const partFilesMeta: Array<{
    partId: string;
    name: string;
    shape: string;
    material: string;
    color: string;
    quantity: number;
    file: string;
    bytes: number;
    dimensionsMm: [number, number, number];
    triangleCount: number;
    vertexCount: number;
    edgeCount: number;
    volumeMm3: number;
    isManifold: boolean;
  }> = [];

  for (const part of design.printedParts) {
    const mesh = generatePartMesh(part);
    const report = validateManifold(mesh);

    if (!report.isManifold) {
      throw new Error(
        `Demo part '${part.id}' (${part.shape}) failed manifold validation: ${JSON.stringify(
          report
        )}`
      );
    }

    const stlBytes = meshToBinaryStl(mesh, `GetMeAnAlt ${part.id} (${part.shape})`);
    const view = new DataView(stlBytes.buffer, stlBytes.byteOffset, stlBytes.byteLength);
    const headerTriCount = view.getUint32(80, true);
    const expectedByteLen = 84 + headerTriCount * 50;

    if (headerTriCount !== mesh.triangleCount || stlBytes.byteLength !== expectedByteLen) {
      throw new Error(
        `Invalid STL binary structure for ${part.id}: tris=${headerTriCount}, bytes=${stlBytes.byteLength}`
      );
    }

    const fileName = `part-${part.id}.stl`;
    const filePath = path.join(printsDir, fileName);
    fs.writeFileSync(filePath, stlBytes);

    meshesById.set(part.id, mesh);
    const dims: [number, number, number] = [
      Math.round(mesh.bbox.size[0] * 100) / 100,
      Math.round(mesh.bbox.size[1] * 100) / 100,
      Math.round(mesh.bbox.size[2] * 100) / 100,
    ];

    partFilesMeta.push({
      partId: part.id,
      name: part.name,
      shape: part.shape,
      material: part.material ?? "PLA",
      color: part.color,
      quantity: part.quantity,
      file: fileName,
      bytes: stlBytes.byteLength,
      dimensionsMm: dims,
      triangleCount: report.triangleCount,
      vertexCount: report.vertexCount,
      edgeCount: report.edgeCount,
      volumeMm3: Math.round(report.volumeMm3 * 100) / 100,
      isManifold: report.isManifold,
    });

    console.log(
      `  [STL] ${fileName.padEnd(28)} | qty=${part.quantity} | size=${dims
        .map((d) => d.toFixed(1))
        .join("x")} mm | tris=${report.triangleCount} | manifold=true`
    );
  }

  console.log(`\n=== Packing Parts onto ${printer.name} Plates ===`);
  const packResult = packPrintedParts(
    design.printedParts,
    printer.bed,
    { margin: 5, spacing: 5, allowRotation: true },
    meshesById
  );

  if (packResult.rejected.length > 0) {
    throw new Error(
      `Unexpected rejected parts on default printer bed: ${JSON.stringify(
        packResult.rejected
      )}`
    );
  }

  const partsById = new Map(design.printedParts.map((p) => [p.id, p]));
  const platesMeta = packResult.plates.map((plate) => {
    const plateItems3mf: Plate3mfItem[] = plate.items.map((item) => {
      const partDef = partsById.get(item.partId)!;
      const mesh = meshesById.get(item.partId)!;
      return {
        partId: item.partId,
        name: partDef.name,
        copy: item.copy,
        mesh,
        x: item.x,
        y: item.y,
        centerX: item.centerX,
        centerY: item.centerY,
        rotated: item.rotated,
        color: partDef.color,
      };
    });

    const plateFileName = `plate-${plate.index + 1}.3mf`;
    const plateFilePath = path.join(printsDir, plateFileName);
    const zipBytes = writePlate3mf(plateItems3mf, {
      title: `${design.objectName} - Plate ${plate.index + 1}`,
      printerName: printer.name,
      plateIndex: plate.index,
    });

    // Verify PKZIP magic bytes
    if (
      zipBytes.length < 22 ||
      zipBytes[0] !== 0x50 ||
      zipBytes[1] !== 0x4b ||
      zipBytes[2] !== 0x03 ||
      zipBytes[3] !== 0x04
    ) {
      throw new Error(`Generated 3MF ${plateFileName} is not a valid ZIP archive.`);
    }

    fs.writeFileSync(plateFilePath, zipBytes);
    console.log(
      `  [3MF] ${plateFileName} | items=${plate.items.length} | utilization=${(
        plate.utilization * 100
      ).toFixed(1)}% | maxHeight=${plate.maxHeight} mm | size=${zipBytes.byteLength} B (${
        packResult.heuristicUsed
      })`
    );

    return {
      index: plate.index,
      file: plateFileName,
      bytes: zipBytes.byteLength,
      utilization: plate.utilization,
      maxHeight: plate.maxHeight,
      items: plate.items,
    };
  });

  const totalItems = design.printedParts.reduce((sum, p) => sum + p.quantity, 0);
  const platesJson = {
    objectId: "plant-waterer",
    printer: {
      id: printer.id,
      name: printer.name,
      brand: printer.brand,
      bed: printer.bed,
      multiColor: printer.multiColor,
    },
    margin: packResult.margin,
    spacing: packResult.spacing,
    heuristicUsed: packResult.heuristicUsed,
    totalUniqueParts: design.printedParts.length,
    totalPrintedItems: totalItems,
    partFiles: partFilesMeta,
    plates: platesMeta,
    rejected: packResult.rejected,
  };

  const platesJsonPath = path.join(printsDir, "plates.json");
  fs.writeFileSync(platesJsonPath, JSON.stringify(platesJson, null, 2) + "\n", "utf-8");
  console.log(`\nWrote ${platesJsonPath} (${platesMeta.length} plate(s), ${totalItems} total printed items).`);
}

main();
