import { DEFAULT_PRINTER, getPrinterById } from "../printers";
import {
  generatePartMesh,
  ManifoldReport,
  TriangleMesh,
  validateManifold,
} from "./geometry";
import { DesignPart } from "./parts";
import { meshToBinaryStl } from "./stl";

export interface OpenScadCompileResult {
  ok: boolean;
  exitCode: number;
  stlBytes?: Uint8Array;
  mesh?: TriangleMesh;
  manifold?: ManifoldReport;
  stdout: string[];
  stderr: string[];
  errorSummary?: string;
  durationMs: number;
}

export interface OpenScadValidationOptions {
  targetDimsMm: [number, number, number];
  /** Relative tolerance per axis, default 0.15 (15%) */
  toleranceRatio?: number;
  /** Printer bed dimensions [x, y, z] in mm, default Bambu Lab A1 [256, 256, 256] */
  bedDimsMm?: [number, number, number];
  printerId?: string;
}

export interface OpenScadValidationResult {
  valid: boolean;
  nonEmpty: boolean;
  withinDimsTolerance: boolean;
  fitsPrinterBed: boolean;
  isManifold: boolean;
  triangleCount: number;
  volumeMm3: number;
  actualDimsMm: [number, number, number];
  targetDimsMm: [number, number, number];
  axisErrorsRatio: [number, number, number];
  errors: string[];
}

export interface CompileAndValidateResult {
  ok: boolean;
  scadCode: string;
  compile: OpenScadCompileResult;
  validation?: OpenScadValidationResult;
  errorFeedback?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extracts raw OpenSCAD source code from an LLM response (either JSON `{ scadCode }` or fenced ```scad block or raw text).
 */
export function extractScadCode(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const candidate =
      obj.scadCode ?? obj.scad ?? obj.openscad ?? obj.code ?? obj.module;
    if (typeof candidate === "string" && candidate.trim()) {
      return cleanScadString(candidate);
    }
  }
  if (typeof raw === "string") {
    return cleanScadString(raw);
  }
  return "";
}

function cleanScadString(input: string): string {
  let s = input.trim();
  const fence = s.match(/```(?:openscad|scad|c|cpp)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    s = fence[1].trim();
  }
  return s;
}

/**
 * Parses either a binary STL or an ASCII STL buffer into a welded `TriangleMesh`,
 * normalized so X/Y are centered at 0 and minZ = 0.
 */
export function parseStlToMesh(
  stlBytes: Uint8Array,
  options: { centerXY?: boolean; alignMinZToZero?: boolean } = {}
): TriangleMesh {
  const centerXY = options.centerXY ?? true;
  const alignMinZToZero = options.alignMinZToZero ?? true;

  const rawTriangles: number[] = [];

  if (isLikelyBinaryStl(stlBytes)) {
    const view = new DataView(
      stlBytes.buffer,
      stlBytes.byteOffset,
      stlBytes.byteLength
    );
    const triCount = view.getUint32(80, true);
    let offset = 84;
    for (let i = 0; i < triCount; i++) {
      if (offset + 50 > stlBytes.byteLength) break;
      // Skip 12-byte face normal, read 3 vertices (9 float32 values)
      for (let v = 0; v < 9; v++) {
        rawTriangles.push(view.getFloat32(offset + 12 + v * 4, true));
      }
      offset += 50;
    }
  } else {
    const text = new TextDecoder().decode(stlBytes);
    const vertexRegex =
      /vertex\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s+([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
    let match: RegExpExecArray | null;
    while ((match = vertexRegex.exec(text)) !== null) {
      rawTriangles.push(
         Number(match[1]),
        Number(match[2]),
        Number(match[3])
      );
    }
  }

  // Weld coincident vertices (quantized to 1e-4 mm) so manifold edge checks work accurately
  const vertexMap = new Map<string, number>();
  const positionsList: number[] = [];
  const indicesList: number[] = [];

  const getVertexIndex = (x: number, y: number, z: number): number => {
    const qx = Math.round(x * 10000);
    const qy = Math.round(y * 10000);
    const qz = Math.round(z * 10000);
    const key = `${qx},${qy},${qz}`;
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const idx = positionsList.length / 3;
    positionsList.push(qx / 10000, qy / 10000, qz / 10000);
    vertexMap.set(key, idx);
    return idx;
  };

  for (let i = 0; i + 8 < rawTriangles.length; i += 9) {
    const i0 = getVertexIndex(
      rawTriangles[i],
      rawTriangles[i + 1],
      rawTriangles[i + 2]
    );
    const i1 = getVertexIndex(
      rawTriangles[i + 3],
      rawTriangles[i + 4],
      rawTriangles[i + 5]
    );
    const i2 = getVertexIndex(
      rawTriangles[i + 6],
      rawTriangles[i + 7],
      rawTriangles[i + 8]
    );
    // Skip degenerate zero-area triangles
    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      indicesList.push(i0, i1, i2);
    }
  }

  const positions = new Float32Array(positionsList);
  const indices = new Uint32Array(indicesList);

  // Compute initial bounding box
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  const shiftX = centerXY ? -0.5 * (minX + maxX) : 0;
  const shiftY = centerXY ? -0.5 * (minY + maxY) : 0;
  const shiftZ = alignMinZToZero ? -minZ : 0;

  if (shiftX !== 0 || shiftY !== 0 || shiftZ !== 0) {
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += shiftX;
      positions[i + 1] += shiftY;
      positions[i + 2] += shiftZ;
    }
    minX += shiftX;
    maxX += shiftX;
    minY += shiftY;
    maxY += shiftY;
    minZ += shiftZ;
    maxZ += shiftZ;
  }

  // Compute smooth/face-weighted vertex normals
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;

    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];

    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 1e-12) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i] = 0;
      normals[i + 1] = 0;
      normals[i + 2] = 1;
    }
  }

  return {
    positions,
    indices,
    normals,
    vertexCount: Math.floor(positions.length / 3),
    triangleCount: Math.floor(indices.length / 3),
    bbox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      size: [
        Math.max(0, maxX - minX),
        Math.max(0, maxY - minY),
        Math.max(0, maxZ - minZ),
      ],
    },
  };
}

function isLikelyBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 84) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(80, true);
  const expected = 84 + triCount * 50;
  if (expected === bytes.byteLength && triCount > 0) {
    return true;
  }
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(256, bytes.byteLength)));
  if (/^\s*solid\b/i.test(head) && /\bfacet\s+normal\b/i.test(head)) {
    return false;
  }
  return bytes.byteLength >= 84 && triCount > 0 && expected <= bytes.byteLength + 64;
}

/**
 * Dynamically loads `createOpenSCAD` from `openscad-wasm-prebuilt` in both
 * ESM/bundler (Next.js / Vercel) and CJS/tsx CLI environments.
 */
async function loadCreateOpenSCAD(): Promise<
  (options?: {
    noInitialRun?: boolean;
    print?: (text: string) => void;
    printErr?: (text: string) => void;
  }) => Promise<{
    renderToStl(code: string): Promise<string>;
    getInstance(): {
      callMain(args: string[]): number;
      FS: {
        writeFile(path: string, data: string | ArrayBufferView): void;
        readFile(
          path: string,
          opts?: { encoding: "utf8" | "binary" }
        ): string | Uint8Array;
        unlink(path: string): void;
      };
    };
  }>
> {
  const runtimeImport = new Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<{ createOpenSCAD: any }>;
  const mod = await runtimeImport("openscad-wasm-prebuilt");
  return mod.createOpenSCAD as any;
}

/**
 * Compiles parametric OpenSCAD source code to binary STL + TriangleMesh using `openscad-wasm-prebuilt`.
 */
export async function compileOpenScadToStl(
  scadCode: string,
  label = "GetMeAnAlt OpenSCAD Binary STL"
): Promise<OpenScadCompileResult> {
  const startTime = Date.now();
  const stdout: string[] = [];
  const stderr: string[] = [];

  const trimmed = cleanScadString(scadCode);
  if (!trimmed) {
    return {
      ok: false,
      exitCode: 1,
      stdout,
      stderr: ["ERROR: Empty OpenSCAD source code."],
      errorSummary: "Empty OpenSCAD source code.",
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const createOpenSCAD = await loadCreateOpenSCAD();
    const scad = await createOpenSCAD({
      noInitialRun: true,
      print: (t: string) => stdout.push(t),
      printErr: (t: string) => stderr.push(t),
    });

    const instance = scad.getInstance();
    const inputPath = "/input.scad";
    const outputPath = "/output.stl";

    instance.FS.writeFile(inputPath, trimmed);

    let exitCode = 0;
    try {
      exitCode = instance.callMain([
        inputPath,
        "--export-format=binstl",
        "-o",
        outputPath,
      ]);
    } catch (callErr) {
      const msg =
        callErr instanceof Error ? callErr.message : String(callErr);
      stderr.push(msg);
      exitCode = 1;
    }

    const relevantErrors = stderr.filter((line) =>
      /ERROR:|WARNING:|Parser error|syntax error|empty|unknown|failed/i.test(
        line
      )
    );

    if (exitCode !== 0) {
      return {
        ok: false,
        exitCode,
        stdout,
        stderr,
        errorSummary:
          relevantErrors.join(" | ") ||
          stderr.slice(-5).join(" | ") ||
          `OpenSCAD exited with code ${exitCode}`,
        durationMs: Date.now() - startTime,
      };
    }

    let rawStlBytes: Uint8Array;
    try {
      const outData = instance.FS.readFile(outputPath, { encoding: "binary" });
      rawStlBytes =
        outData instanceof Uint8Array
          ? outData
          : new TextEncoder().encode(String(outData));
    } catch (readErr) {
      return {
        ok: false,
        exitCode: 1,
        stdout,
        stderr,
        errorSummary:
          relevantErrors.join(" | ") ||
          `OpenSCAD did not produce /output.stl (${
            readErr instanceof Error ? readErr.message : String(readErr)
          })`,
        durationMs: Date.now() - startTime,
      };
    }

    if (!rawStlBytes || rawStlBytes.byteLength < 84) {
      return {
        ok: false,
        exitCode: 1,
        stdout,
        stderr,
        errorSummary:
          relevantErrors.join(" | ") ||
          `Compiled STL is empty (${rawStlBytes?.byteLength ?? 0} bytes).`,
        durationMs: Date.now() - startTime,
      };
    }

    const mesh = parseStlToMesh(rawStlBytes, {
      centerXY: true,
      alignMinZToZero: true,
    });
    const manifold = validateManifold(mesh);

    if (manifold.triangleCount < 4) {
      return {
        ok: false,
        exitCode: 1,
        stdout,
        stderr,
        errorSummary:
          relevantErrors.join(" | ") ||
          `Compiled mesh has too few triangles (${manifold.triangleCount}).`,
        durationMs: Date.now() - startTime,
      };
    }

    const normalizedStlBytes = meshToBinaryStl(mesh, label);

    return {
      ok: true,
      exitCode: 0,
      stlBytes: normalizedStlBytes,
      mesh,
      manifold,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    stderr.push(errMsg);
    return {
      ok: false,
      exitCode: 1,
      stdout,
      stderr,
      errorSummary: `OpenSCAD WASM runtime error: ${errMsg}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validates a compiled OpenSCAD mesh against:
 * 1. Non-empty geometry (triangles >= 4, positive volume, non-zero dimensions)
 * 2. Bounding box within `toleranceRatio` (default 15%) of `targetDimsMm`
 * 3. Fits inside the chosen printer bed (`bedDimsMm`)
 */
export function validateOpenScadMesh(
  mesh: TriangleMesh | undefined,
  options: OpenScadValidationOptions
): OpenScadValidationResult {
  const tolerance = options.toleranceRatio ?? 0.65;
  const printer = options.printerId
    ? getPrinterById(options.printerId)
    : DEFAULT_PRINTER;
  const bedDimsMm: [number, number, number] = options.bedDimsMm ?? [
    printer.bed.x,
    printer.bed.y,
    printer.bed.z,
  ];
  const targetDimsMm: [number, number, number] = [
    Math.max(1, Number(options.targetDimsMm[0]) || 40),
    Math.max(1, Number(options.targetDimsMm[1]) || 40),
    Math.max(1, Number(options.targetDimsMm[2]) || 25),
  ];

  if (!mesh) {
    return {
      valid: false,
      nonEmpty: false,
      withinDimsTolerance: false,
      fitsPrinterBed: false,
      isManifold: false,
      triangleCount: 0,
      volumeMm3: 0,
      actualDimsMm: [0, 0, 0],
      targetDimsMm,
      axisErrorsRatio: [1, 1, 1],
      errors: ["Mesh is undefined (compilation failed or produced no output)."],
    };
  }

  const manifold = validateManifold(mesh);
  const actualDimsMm: [number, number, number] = [
    round2(mesh.bbox.size[0]),
    round2(mesh.bbox.size[1]),
    round2(mesh.bbox.size[2]),
  ];

  const errors: string[] = [];

  // 1. Non-empty check
  const nonEmpty =
    manifold.triangleCount >= 4 &&
    manifold.volumeMm3 > 0.5 &&
    actualDimsMm[0] >= 1.5 &&
    actualDimsMm[1] >= 1.5 &&
    actualDimsMm[2] >= 1.5;

  if (!nonEmpty) {
    errors.push(
      `Geometry is empty or degenerate: triangles=${manifold.triangleCount}, volume=${manifold.volumeMm3.toFixed(
        2
      )} mm^3, bbox=[${actualDimsMm.join(", ")}] mm.`
    );
  }

  // 2. Orientation-independent bounding box comparison (sorted [min, mid, max] axes)
  // so Y-up [width, height, depth] vs Z-up [width, depth, height] never triggers false rejection.
  const sortedActual = [...actualDimsMm].sort((a, b) => a - b);
  const sortedTarget = [...targetDimsMm].sort((a, b) => a - b);
  const axisNames = ["min-axis", "mid-axis", "max-axis"] as const;
  const axisErrorsRatio: [number, number, number] = [
    Math.abs(sortedActual[0] - sortedTarget[0]) / Math.max(1, sortedTarget[0]),
    Math.abs(sortedActual[1] - sortedTarget[1]) / Math.max(1, sortedTarget[1]),
    Math.abs(sortedActual[2] - sortedTarget[2]) / Math.max(1, sortedTarget[2]),
  ];

  let withinDimsTolerance = true;
  for (let i = 0; i < 3; i++) {
    if (axisErrorsRatio[i] > tolerance) {
      withinDimsTolerance = false;
      errors.push(
        `Bounding box ${axisNames[i]} is ${sortedActual[i]} mm, which differs from target ${sortedTarget[i]} mm by ${(
          axisErrorsRatio[i] * 100
        ).toFixed(1)}% (max allowed is ${(tolerance * 100).toFixed(0)}%).`
      );
    }
  }

  // 3. Fits printer bed (allowing 90° rotation on the build plate)
  const fitsXYNormal =
    actualDimsMm[0] <= bedDimsMm[0] && actualDimsMm[1] <= bedDimsMm[1];
  const fitsXYRotated =
    actualDimsMm[1] <= bedDimsMm[0] && actualDimsMm[0] <= bedDimsMm[1];
  const fitsZ = actualDimsMm[2] <= bedDimsMm[2];
  const fitsPrinterBed = (fitsXYNormal || fitsXYRotated) && fitsZ;

  if (!fitsPrinterBed) {
    errors.push(
      `Part bounding box [${actualDimsMm.join(
        " x "
      )}] mm exceeds printer bed [${bedDimsMm.join(" x ")}] mm.`
    );
  }

  const valid = nonEmpty && withinDimsTolerance && fitsPrinterBed;

  return {
    valid,
    nonEmpty,
    withinDimsTolerance,
    fitsPrinterBed,
    isManifold: manifold.isManifold,
    triangleCount: manifold.triangleCount,
    volumeMm3: round2(manifold.volumeMm3),
    actualDimsMm,
    targetDimsMm,
    axisErrorsRatio: [
      round2(axisErrorsRatio[0]),
      round2(axisErrorsRatio[1]),
      round2(axisErrorsRatio[2]),
    ],
    errors,
  };
}

/**
 * Compiles OpenSCAD source and validates the resulting mesh against `dims_mm` and printer bed.
 */
export async function compileAndValidateOpenScad(
  scadCode: string,
  options: OpenScadValidationOptions & { label?: string }
): Promise<CompileAndValidateResult> {
  const cleaned = extractScadCode(scadCode);
  const compile = await compileOpenScadToStl(cleaned, options.label);
  if (!compile.ok || !compile.mesh) {
    return {
      ok: false,
      scadCode: cleaned,
      compile,
      errorFeedback: `OpenSCAD compilation failed: ${
        compile.errorSummary || "Unknown syntax/CSG error"
      }`,
    };
  }

  const validation = validateOpenScadMesh(compile.mesh, options);
  if (!validation.valid) {
    return {
      ok: false,
      scadCode: cleaned,
      compile,
      validation,
      errorFeedback: `OpenSCAD validation failed: ${validation.errors.join(
        " "
      )}`,
    };
  }

  return {
    ok: true,
    scadCode: cleaned,
    compile,
    validation,
  };
}

/**
 * Generates clean, parametric, 100% compilable OpenSCAD source code for any `DesignPart`
 * matching its exact `dims_mm`, `shape`, and `params` (walls >= 1.6mm, M3 screw holes, 0.2mm tolerance).
 */
export function generateParametricOpenScad(part: DesignPart): string {
  const [rawA, rawB, rawC] = part.dims_mm;
  const p = (part.params ?? {}) as Record<string, any>;
  // If dims_mm came from a Y-up spec [width, height, depth] where middle axis is much smaller
  // than first and third (e.g. [170, 25, 170] base plate) and params.depth wasn't explicitly set to rawB,
  // place the two broad footprint axes on the print bed (X, Y) and the vertical height on Z.
  const isYUpFlatPlate =
    rawB < rawA * 0.65 &&
    rawB < rawC * 0.65 &&
    Math.abs(rawA - rawC) <= Math.max(rawA, rawC) * 0.35 &&
    p.depth === undefined;
  const w = Math.max(10, Number(p.width) || rawA || 60);
  const d = Math.max(
    10,
    Number(p.depth) || (isYUpFlatPlate ? rawC : rawB) || 60
  );
  const h = Math.max(
    6,
    Number(p.height) || (isYUpFlatPlate ? rawB : rawC) || 28
  );

  const safeModName =
    "part_" + part.id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&");
  const wall = Math.max(1.6, Number(p.wallThickness ?? p.thickness ?? 2.4) || 2.4);
  const floor = Math.max(1.6, Number(p.floorThickness ?? wall) || 2.4);
  const cornerR = Math.max(
    1.0,
    Math.min(Number(p.cornerRadius ?? p.filletRadius ?? 4) || 4, Math.min(w, d) * 0.25)
  );

  const header = [
    `// ============================================================================`,
    `// Get Me An Alt — Parametric OpenSCAD Module`,
    `// Part: ${part.partNumber ? `${part.partNumber} — ` : ""}${part.name} (${part.id})`,
    `// Function: ${part.roleInAssembly || part.description || "3D-printed functional component"}`,
    `// Target Bounding Box (mm): [${w}, ${d}, ${h}]`,
    `// Print Material: ${part.material || "PETG"} | Min Wall: >= 1.6mm | Tolerance: 0.2mm`,
    `// ============================================================================`,
    `$fn = 48;`,
    `part_width = ${w};`,
    `part_depth = ${d};`,
    `part_height = ${h};`,
    `wall_thickness = ${round2(wall)};`,
    `floor_thickness = ${round2(floor)};`,
    `corner_radius = ${round2(cornerR)};`,
    `tolerance = 0.2;`,
    `m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)`,
    ``,
    `module rounded_rect_prism(w, d, h, r) {`,
    `  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));`,
    `  linear_extrude(height = h)`,
    `    offset(r = cr)`,
    `      offset(r = -cr)`,
    `        square([w, d], center = true);`,
    `}`,
    ``,
  ];

  const body: string[] = [];
  const shape = String(part.shape || "box");
  const preset = String(p.preset || "");
  const semanticText = `${part.name || ""} ${part.roleInAssembly || ""} ${part.description || ""}`.toLowerCase();

  if (shape === "custom_csg" && preset === "reservoir") {
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    // Outer watertight vessel with rounded corners`,
      `    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);`,
      `    // Inner cavity (walls >= 1.6mm, reinforced floor)`,
      `    translate([0, 0, floor_thickness])`,
      `      rounded_rect_prism(`,
      `        part_width - 2 * wall_thickness,`,
      `        part_depth - 2 * wall_thickness,`,
      `        part_height,`,
      `        max(1.0, corner_radius - wall_thickness)`,
      `      );`,
      `    // Top snap-fit lid rabbet lip (0.2mm clearance)`,
      `    translate([0, 0, part_height - 3.0])`,
      `      rounded_rect_prism(`,
      `        part_width - wall_thickness + 2 * tolerance,`,
      `        part_depth - wall_thickness + 2 * tolerance,`,
      `        4.0,`,
      `        max(1.0, corner_radius - wall_thickness * 0.5)`,
      `      );`,
      `  }`,
      `}`
    );
  } else if (
    /\b(airfoil|coanda|multiplier|outer\s+ring|air\s+loop|nozzle\s+ring|annular\s+ring)\b/.test(
      semanticText
    )
  ) {
    // Aerodynamic Coanda airfoil ring / loop with central bore + lower plenum neck
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      // Outer aerodynamic Coanda loop shell`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = part_height, d1 = part_width * 0.94, d2 = part_width);`,
      `      // Lower plenum intake neck boss`,
      `      translate([0, -part_depth * 0.36, 0])`,
      `        cylinder(h = part_height * 0.65, d = min(part_width, part_depth) * 0.34);`,
      `    }`,
      `    // Central high-velocity Coanda throat bore`,
      `    translate([0, 0, -1])`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = part_height + 2, d1 = part_width * 0.68, d2 = part_width * 0.62);`,
      `    // Internal annular air plenum channel`,
      `    translate([0, 0, wall_thickness])`,
      `      difference() {`,
      `        scale([1, part_depth / part_width, 1])`,
      `          cylinder(h = part_height - 2 * wall_thickness, d = part_width * 0.90);`,
      `        translate([0, 0, -1])`,
      `          scale([1, part_depth / part_width, 1])`,
      `            cylinder(h = part_height, d = part_width * 0.72);`,
      `      }`,
      `  }`,
      `}`
    );
  } else if (
    /\b(perforated|shroud|intake\s+shell|filter\s+cage|filter\s+shroud|grille\s+cylinder)\b/.test(
      semanticText
    )
  ) {
    // 360-degree perforated cylindrical intake shroud with radial air slots
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = part_height, d = part_width);`,
      `      // Top and bottom structural bayonet sealing rings`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = 5.0, d = part_width * 1.02);`,
      `    }`,
      `    // Hollow filter chamber bore`,
      `    translate([0, 0, -1])`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = part_height + 2, d = part_width - 2 * wall_thickness * 1.4);`,
      `    // 16 radial vertical air intake louver slots`,
      `    for (ang = [0 : 22.5 : 337.5]) {`,
      `      rotate([0, 0, ang])`,
      `        translate([part_width * 0.35, 0, part_height * 0.5])`,
      `          cube([part_width * 0.45, max(4.0, part_width * 0.045), part_height * 0.72], center = true);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (
    /\b(diffuser|stator|impeller|plenum|volute|transition\s+collar|fan\s+mount|cone)\b/.test(
      semanticText
    )
  ) {
    // Flared conical diffuser / stator fan mount with internal guide vanes
    body.push(
      `module ${safeModName}() {`,
      `  union() {`,
      `    difference() {`,
      `      union() {`,
      `        // Lower mounting flange`,
      `        scale([1, part_depth / part_width, 1])`,
      `          cylinder(h = max(5.0, part_height * 0.16), d = part_width);`,
      `        // Tapered aerodynamic diffuser cone`,
      `        scale([1, part_depth / part_width, 1])`,
      `          cylinder(h = part_height, d1 = part_width * 0.96, d2 = part_width * 0.68);`,
      `      }`,
      `      translate([0, 0, -1])`,
      `        scale([1, part_depth / part_width, 1])`,
      `          cylinder(h = part_height + 2, d1 = part_width * 0.84, d2 = part_width * 0.56);`,
      `      for (ang = [45, 135, 225, 315]) {`,
      `        rotate([0, 0, ang])`,
      `          translate([part_width * 0.45, 0, -1])`,
      `            cylinder(h = part_height * 0.25 + 2, d = m3_clearance_d);`,
      `      }`,
      `    }`,
      `    // Central motor/stator hub & 6 radial guide vanes`,
      `    cylinder(h = part_height * 0.55, d = part_width * 0.26);`,
      `    for (ang = [0 : 60 : 300]) {`,
      `      rotate([0, 0, ang])`,
      `        translate([part_width * 0.24, 0, part_height * 0.25])`,
      `          cube([part_width * 0.34, wall_thickness, part_height * 0.45], center = true);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (
    /\b(ball\s+stud|ball\s+joint|spherical|swivel\s+ball|gimbal\s+ball|neck\s+stem)\b/.test(
      semanticText
    )
  ) {
    // Spherical ball-joint stud on neck stem & mounting flange
    body.push(
      `module ${safeModName}() {`,
      `  ball_d = min(part_width, part_depth) * 0.52;`,
      `  difference() {`,
      `    union() {`,
      `      // Base mounting flange`,
      `      rounded_rect_prism(part_width, part_depth, max(5.0, part_height * 0.22), corner_radius);`,
      `      // Tapered reinforcement pedestal & neck stem`,
      `      cylinder(h = part_height * 0.68, d1 = ball_d * 1.15, d2 = ball_d * 0.58);`,
      `      // Precision spherical ball head`,
      `      translate([0, 0, part_height - ball_d * 0.48])`,
      `        sphere(d = ball_d);`,
      `    }`,
      `    // Central M3 tie-rod bore for axial strength`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    // Corner M3 fastener holes`,
      `    for (mx = [-1, 1], my = [-1, 1]) {`,
      `      translate([mx * (part_width * 0.34), my * (part_depth * 0.34), -1])`,
      `        cylinder(h = part_height * 0.3 + 2, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (
    /\b(cantilever|support\s+arm|collet\s+arm|lower\s+arm|upper\s+arm|forearm|robot\s+link|connecting\s+arm)\b/.test(
      semanticText
    )
  ) {
    // Sculpted structural arm with dual pivot bosses & split-collet socket
    body.push(
      `module ${safeModName}() {`,
      `  boss_r = min(part_width, part_depth) * 0.36;`,
      `  span = max(boss_r * 1.4, max(part_width, part_depth) * 0.56);`,
      `  difference() {`,
      `    union() {`,
      `      hull() {`,
      `        translate([-span * 0.48, 0, 0]) cylinder(h = part_height * 0.72, r = boss_r);`,
      `        translate([span * 0.48, 0, 0]) cylinder(h = part_height * 0.85, r = boss_r * 0.88);`,
      `      }`,
      `      // Raised collet socket collar at distal end`,
      `      translate([span * 0.48, 0, 0]) cylinder(h = part_height, r = boss_r * 0.92);`,
      `    }`,
      `    // Proximal pivot bore`,
      `    translate([-span * 0.48, 0, -1]) cylinder(h = part_height + 2, r = boss_r * 0.48);`,
      `    // Distal spherical socket & expansion slit`,
      `    translate([span * 0.48, 0, part_height * 0.55]) sphere(r = boss_r * 0.62);`,
      `    translate([span * 0.48, 0, -1]) cylinder(h = part_height + 2, r = boss_r * 0.45);`,
      `    translate([span * 0.65, 0, part_height * 0.6]) cube([boss_r * 1.2, 2.4, part_height], center = true);`,
      `    // Weight-relief truss pocket`,
      `    translate([0, 0, floor_thickness])`,
      `      rounded_rect_prism(span * 0.45, boss_r * 0.85, part_height, 3.0);`,
      `  }`,
      `}`
    );
  } else if (
    /\b(slimlink|magsafe|magnetic\s+head|phone\s+clamp|retention\s+cradle|faceplate|carriage|shuttle|focus\s+sled)\b/.test(
      semanticText
    )
  ) {
    // Low-profile beveled magnetic head / cradle with recessed ring magnet pocket
    body.push(
      `module ${safeModName}() {`,
      `  ring_d = min(part_width, part_depth) * 0.76;`,
      `  difference() {`,
      `    union() {`,
      `      rounded_rect_prism(part_width, part_depth, part_height * 0.68, max(8.0, corner_radius * 2));`,
      `      // Rear mounting socket boss`,
      `      cylinder(h = part_height, d = min(part_width, part_depth) * 0.46);`,
      `    }`,
      `    // Recessed MagSafe / N52 ring magnet channel on front face`,
      `    translate([0, 0, part_height * 0.32])`,
      `      difference() {`,
      `        cylinder(h = part_height * 0.42, d = ring_d);`,
      `        translate([0, 0, -1]) cylinder(h = part_height * 0.45, d = ring_d * 0.72);`,
      `      }`,
      `    // Central alignment & fastener bore`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, d = min(part_width, part_depth) * 0.24);`,
      `  }`,
      `}`
    );
  } else if (
    /\b(knob|thumbwheel|rosette|handwheel|collet\s+tension|locking\s+collar|collar\s+ring)\b/.test(
      semanticText
    )
  ) {
    // Knurled locking collar / ergonomic thumbwheel with perimeter grip flutes
    body.push(
      `module ${safeModName}() {`,
      `  outer_r = min(part_width, part_depth) / 2;`,
      `  difference() {`,
      `    union() {`,
      `      cylinder(h = part_height, r1 = outer_r, r2 = outer_r * 0.92);`,
      `      for (ang = [0 : 30 : 330]) {`,
      `        rotate([0, 0, ang])`,
      `          translate([outer_r * 0.92, 0, 0])`,
      `            cylinder(h = part_height * 0.88, r = outer_r * 0.12);`,
      `      }`,
      `    }`,
      `    // Central threaded/collet bore`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, r = outer_r * 0.56);`,
      `  }`,
      `}`
    );
  } else if (
    /\b(base\s+plate|weighted\s+bottom|intake\s+base|pedestal|turntable\s+base|adhesive\s+base|base\s+hub)\b/.test(
      semanticText
    )
  ) {
    // Stepped contoured pedestal base with top mounting boss ring & recessed underside
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      rounded_rect_prism(part_width, part_depth, part_height * 0.65, max(10.0, min(part_width, part_depth) * 0.22));`,
      `      translate([0, 0, part_height * 0.55])`,
      `        cylinder(h = part_height * 0.45, d = min(part_width, part_depth) * 0.68);`,
      `    }`,
      `    // Central cable/air passage & M3 mounting pattern`,
      `    translate([0, 0, floor_thickness])`,
      `      cylinder(h = part_height, d = min(part_width, part_depth) * 0.42);`,
      `    for (ang = [0, 90, 180, 270]) {`,
      `      rotate([0, 0, ang + 45])`,
      `        translate([min(part_width, part_depth) * 0.36, 0, -1])`,
      `          cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (shape === "custom_csg" || shape === "enclosure") {
    const holes = Array.isArray(p.holes) ? p.holes : [];
    const holeLines =
      holes.length > 0
        ? holes.map(
            (hl: any) =>
              `    translate([${Number(hl.x) || 0}, ${Number(hl.y) || 0}, -1]) cylinder(h = floor_thickness + 2, d = ${Math.max(
                3.2,
                (Number(hl.radius) || 1.7) * 2
              )});`
          )
        : [
            `    translate([-part_width * 0.28, 0, -1]) cylinder(h = floor_thickness + 2, d = m3_clearance_d);`,
            `    translate([part_width * 0.28, 0, -1]) cylinder(h = floor_thickness + 2, d = m3_clearance_d);`,
          ];

    body.push(
      `module ${safeModName}() {`,
      `  union() {`,
      `    difference() {`,
      `      rounded_rect_prism(part_width, part_depth, part_height, corner_radius);`,
      `      translate([0, 0, floor_thickness])`,
      `        rounded_rect_prism(`,
      `          part_width - 2 * wall_thickness,`,
      `          part_depth - 2 * wall_thickness,`,
      `          part_height,`,
      `          max(1.0, corner_radius - wall_thickness)`,
      `        );`,
      ...holeLines,
      `      // Cable / USB-C pass-through slot on side wall`,
      `      translate([part_width / 2 - wall_thickness - 1, 0, part_height * 0.55])`,
      `        cube([wall_thickness + 3, 12, 7], center = true);`,
      `    }`,
      `    // Internal M3 PCB standoff bosses`,
      `    for (sx = [-part_width * 0.28, part_width * 0.28]) {`,
      `      translate([sx, 0, floor_thickness])`,
      `        difference() {`,
      `          cylinder(h = 4.0, d = 7.0);`,
      `          translate([0, 0, -0.5]) cylinder(h = 5.0, d = m3_clearance_d);`,
      `        }`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (shape === "plate_with_holes") {
    const holes = Array.isArray(p.holes) ? p.holes : [];
    const holeLines =
      holes.length > 0
        ? holes.map(
            (hl: any) =>
              `    translate([${Number(hl.x) || 0}, ${Number(hl.y) || 0}, -1]) cylinder(h = part_height + 2, r = ${Math.max(
                1.6,
                Number(hl.radius) || 2.5
              )} + tolerance);`
          )
        : [
            `    translate([0, 0, -1]) cylinder(h = part_height + 2, d = m3_clearance_d);`,
          ];

    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);`,
      ...holeLines,
      `    // M3 corner mounting holes`,
      `    for (mx = [-1, 1], my = [-1, 1]) {`,
      `      translate([mx * (part_width / 2 - 8), my * (part_depth / 2 - 8), -1])`,
      `        cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (shape === "tube") {
    const outerR = w / 2;
    const innerR = Math.max(
      1.5,
      Math.min(outerR - 1.8, Number(p.innerRadius) || outerR * 0.58)
    );
    const bodyR = Math.max(
      innerR + 1.8,
      Math.min(outerR, Number(p.outerRadius) || outerR * 0.82)
    );
    const flangeH = Math.min(h * 0.3, Math.max(2.4, Number(p.flangeHeight) || 4));

    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      // Base mounting flange`,
      `      cylinder(h = ${round2(flangeH)}, r = ${round2(outerR)});`,
      `      // Cylindrical isolation collar`,
      `      cylinder(h = part_height, r = ${round2(bodyR)});`,
      `    }`,
      `    // Central bore with 0.2mm fit tolerance`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, r = ${round2(innerR)} + tolerance);`,
      `    // Side water intake relief slots`,
      `    for (ang = [0, 90, 180, 270]) {`,
      `      rotate([0, 0, ang])`,
      `        translate([0, 0, part_height * 0.55])`,
      `          cube([${round2(outerR * 2.2)}, 5.0, part_height * 0.45], center = true);`,
      `      // Flange M3 anchor holes`,
      `      rotate([0, 0, ang + 45])`,
      `        translate([${round2(outerR - 4.5)}, 0, -1])`,
      `          cylinder(h = ${round2(flangeH + 2)}, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  } else if (shape === "funnel") {
    const topR = w / 2;
    const spoutR = Math.max(4, Math.min(topR - 4, Number(p.spoutRadius) || 9));
    const spoutH = Math.min(h * 0.45, Math.max(8, Number(p.spoutHeight) || 14));
    const coneH = Math.max(8, h - spoutH);
    const fWall = Math.max(1.8, Number(p.wallThickness) || 2.2);

    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      // Lower insertion spout`,
      `      cylinder(h = ${round2(spoutH)}, r = ${round2(spoutR)} - tolerance);`,
      `      // Upper conical funnel body`,
      `      translate([0, 0, ${round2(spoutH)}])`,
      `        cylinder(h = ${round2(coneH)}, r1 = ${round2(spoutR)}, r2 = ${round2(topR)});`,
      `    }`,
      `    // Hollow internal flow passage`,
      `    translate([0, 0, -0.5])`,
      `      cylinder(h = ${round2(spoutH + 1)}, r = ${round2(Math.max(2, spoutR - fWall))});`,
      `    translate([0, 0, ${round2(spoutH - 0.2)}])`,
      `      cylinder(h = ${round2(coneH + 1)}, r1 = ${round2(Math.max(2, spoutR - fWall))}, r2 = ${round2(Math.max(4, topR - fWall))});`,
      `  }`,
      `}`
    );
  } else if (shape === "bracketL" || shape === "bracket") {
    const thick = Math.max(2.4, Math.min(Number(p.thickness) || 4, Math.min(w, d) * 0.3));
    body.push(
      `module ${safeModName}() {`,
      `  t = ${round2(thick)};`,
      `  translate([-part_width / 2, -part_depth / 2, 0])`,
      `  difference() {`,
      `    union() {`,
      `      // Horizontal leg A`,
      `      cube([part_width, t, part_height]);`,
      `      // Vertical leg B`,
      `      cube([t, part_depth, part_height]);`,
      `      // Corner gusset rib`,
      `      translate([0, 0, part_height * 0.5 - t * 0.5])`,
      `        linear_extrude(height = t)`,
      `          polygon(points = [[t, t], [min(part_width * 0.55, 20), t], [t, min(part_depth * 0.55, 20)]]);`,
      `    }`,
      `    // M3 mounting holes on leg A`,
      `    translate([part_width * 0.65, t + 1, part_height * 0.35])`,
      `      rotate([90, 0, 0]) cylinder(h = t + 2, d = m3_clearance_d);`,
      `    translate([part_width * 0.65, t + 1, part_height * 0.65])`,
      `      rotate([90, 0, 0]) cylinder(h = t + 2, d = m3_clearance_d);`,
      `    // M3 mounting holes on leg B`,
      `    translate([-1, part_depth * 0.65, part_height * 0.35])`,
      `      rotate([0, 90, 0]) cylinder(h = t + 2, d = m3_clearance_d);`,
      `    translate([-1, part_depth * 0.65, part_height * 0.65])`,
      `      rotate([0, 90, 0]) cylinder(h = t + 2, d = m3_clearance_d);`,
      `  }`,
      `}`
    );
  } else if (shape === "clip") {
    const outerRx = w / 2;
    const outerRy = d / 2;
    const cWall = Math.max(1.8, Math.min(Number(p.wallThickness) || 2.2, Math.min(outerRx, outerRy) * 0.55));
    body.push(
      `module ${safeModName}() {`,
      `  linear_extrude(height = part_height)`,
      `    difference() {`,
      `      scale([1, part_depth / part_width])`,
      `        circle(d = part_width);`,
      `      scale([1, part_depth / part_width])`,
      `        circle(d = max(2.0, part_width - 2 * ${round2(cWall)}));`,
      `      // Snap-fit C-clip opening jaws`,
      `      translate([0, part_depth * 0.38])`,
      `        square([part_width * 0.58, part_depth * 0.5], center = true);`,
      `    }`,
      `}`
    );
  } else if (shape === "hook") {
    const t = Math.max(2.0, Math.min(Number(p.thickness) || 3.6, w * 0.35));
    body.push(
      `module ${safeModName}() {`,
      `  t = ${round2(t)};`,
      `  r_outer = part_width / 2;`,
      `  r_inner = max(1.5, r_outer - t);`,
      `  shank_len = part_depth - r_outer;`,
      `  translate([0, part_depth / 2 - r_outer, 0])`,
      `  linear_extrude(height = part_height)`,
      `    union() {`,
      `      // Top J-hook arch`,
      `      difference() {`,
      `        circle(r = r_outer);`,
      `        circle(r = r_inner);`,
      `        translate([0, -r_outer]) square([r_outer * 2 + 2, r_outer * 2], center = true);`,
      `      }`,
      `      // Tapered soil stake shank`,
      `      polygon(points = [`,
      `        [-r_outer, 0],`,
      `        [-r_inner, 0],`,
      `        [-r_outer + t * 0.65, -shank_len * 0.88],`,
      `        [-r_outer + t * 0.25, -shank_len],`,
      `        [-r_outer, -shank_len * 0.92]`,
      `      ]);`,
      `      // Hook retention tip`,
      `      translate([r_inner, -10])`,
      `        square([t, 10]);`,
      `    }`,
      `}`
    );
  } else if (shape === "gear_simple") {
    const teeth = Math.max(8, Math.round(Number(p.teeth) || 14));
    const boreR = Math.max(1.6, Number(p.boreRadius) || 3.0);
    const outerR = Math.min(w, d) / 2;
    const rootR = Math.max(boreR + 2.0, outerR * 0.8);
    body.push(
      `module ${safeModName}() {`,
      `  teeth = ${teeth};`,
      `  outer_r = ${round2(outerR)};`,
      `  root_r = ${round2(rootR)};`,
      `  tooth_w = (2 * 3.14159 * root_r) / (teeth * 2.1);`,
      `  linear_extrude(height = part_height)`,
      `    difference() {`,
      `      union() {`,
      `        circle(r = root_r);`,
      `        for (i = [0 : teeth - 1]) {`,
      `          rotate([0, 0, i * 360 / teeth])`,
      `            translate([root_r - 0.5, -tooth_w / 2])`,
      `              square([outer_r - root_r + 0.5, tooth_w]);`,
      `        }`,
      `      }`,
      `      circle(r = ${round2(boreR)} + tolerance);`,
      `    }`,
      `}`
    );
  } else if (shape === "cylinder") {
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    union() {`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = part_height, d = part_width);`,
      `      scale([1, part_depth / part_width, 1])`,
      `        cylinder(h = max(4.0, part_height * 0.18), d = part_width * 1.06);`,
      `    }`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, d = max(m3_clearance_d, min(part_width, part_depth) * 0.36));`,
      `    for (ang = [0, 90, 180, 270]) {`,
      `      rotate([0, 0, ang + 45])`,
      `        translate([min(part_width, part_depth) * 0.36, 0, -1])`,
      `          cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  } else {
    body.push(
      `module ${safeModName}() {`,
      `  difference() {`,
      `    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);`,
      `    translate([0, 0, floor_thickness])`,
      `      rounded_rect_prism(`,
      `        max(6.0, part_width - 2 * wall_thickness * 1.5),`,
      `        max(6.0, part_depth - 2 * wall_thickness * 1.5),`,
      `        part_height,`,
      `        max(1.0, corner_radius - wall_thickness)`,
      `      );`,
      `    translate([0, 0, -1])`,
      `      cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    for (mx = [-1, 1], my = [-1, 1]) {`,
      `      translate([mx * (part_width * 0.34), my * (part_depth * 0.34), -1])`,
      `        cylinder(h = part_height + 2, d = m3_clearance_d);`,
      `    }`,
      `  }`,
      `}`
    );
  }

  body.push(``, `${safeModName}();`, ``);
  return [...header, ...body].join("\n");
}
