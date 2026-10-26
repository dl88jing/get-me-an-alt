import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  CritiqueIssue,
  DesignPart,
  DesignSpec,
  ObjectAnalysis,
  ResearchData,
  TeardownData,
} from '../types';
import { SAMPLE_DESIGN } from '../sample-data';
import { getPrinterById } from '../printers';
import { applyCritiqueFixesToDesign } from './critic';
import { InlineImageInput } from './page-fetch';
import {
  loadProductImagesFromCwd,
  runGeminiAgent,
  RunAgentResult,
} from './runner';

export interface DesignerInput {
  analysis: ObjectAnalysis;
  sources: ResearchData;
  teardown?: TeardownData;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
  previousDesign?: DesignSpec;
  critiqueIssues?: CritiqueIssue[];
  revisionRound?: number;
  printerId?: string;
  inlineImages?: InlineImageInput[];
}

const PALETTE = [
  '#d4af37',
  '#b89b4a',
  '#c87d4b',
  '#d4af37',
  '#9c7a4c',
  '#b87333',
  '#e6c365',
  '#b45309',
  '#c84b31',
  '#e6c365',
];

export async function runDesignerAgent(
  input: DesignerInput
): Promise<RunAgentResult<DesignSpec>> {
  const { analysis, sources } = input;
  const isRevision = Boolean(
    input.revisionRound &&
      input.revisionRound > 0 &&
      input.previousDesign &&
      input.critiqueIssues
  );
  const printer = getPrinterById(input.printerId);
  const effectiveImages =
    input.inlineImages && input.inlineImages.length > 0
      ? input.inlineImages
      : loadProductImagesFromCwd(input.cwd, analysis.productImages);

  const silhouetteInstruction = `SILHOUETTE & 3D TRANSFORM RULES (Shared Three.js Y-up coordinate frame in mm):
- Match the real product's visual silhouette, proportions, and sub-assembly layout shown in the attached product image(s) and description.
- Give all part "dims_mm": [x, y, z], "position": [x, y, z], "rotation": [rx, ry, rz], and "explode": [ex, ey, ez] in millimeters (mm).
- Coordinate convention: Y = vertical height UP from base (mm), X = primary horizontal length axis (mm), Z = width / beam / lateral depth (mm).
- LONG AXIS ALONG X FOR VEHICLES / BOATS / HORIZONTAL ASSEMBLIES: For boats, tugboats, ships, vehicles, aircraft, trains, or horizontal sliders, orient the LONG AXIS along X (e.g., bow/front hull at +X, midships hull near X=0, stern/rear hull at -X; deck, cabin/wheelhouse, and superstructure above at +Y; port/starboard nozzles, thrusters, or outriggers offset in ±Z). NEVER stack horizontal hull sections vertically along Y.`;

  const prompt = isRevision
    ? `You are the Designer / Architect Agent in "Get Me An Alt", powered by Gemini 4 Argon.
This is Revision Round ${input.revisionRound} for "${analysis.objectName}" targeting printer ${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm bed).

The Printability Critic Agent reviewed design.json and found these issues:
${JSON.stringify(
  (input.critiqueIssues || []).map((i) => ({
    part: i.part,
    severity: i.severity,
    category: i.category,
    problem: i.problem,
    fix: i.fix,
  })),
  null,
  2
)}

Current design.json:
${JSON.stringify(input.previousDesign, null, 2)}

Revise design.json to fix every Critic issue above:
1. Fit every printed part's dims_mm within [${printer.bed.x - 10}, ${printer.bed.z - 10}, ${printer.bed.y - 10}] mm.
2. Ensure params.wallThickness >= 2.4 (or 3.2 for fluid tubes), params.clearanceMm = 0.30, params.fastenerHoleClearanceMm = 0.20, params.maxOverhangDeg = 42, params.dfmVerified = true, and supportsRequired = false on all printed parts.
3. Preserve all part IDs, partNumbers, positions, explode vectors, and the exact shared design.json contract.
${silhouetteInstruction}

Return ONLY valid JSON matching the DesignSpec schema.`
    : `You are the Designer / Architect Agent (Stage 3 of 7) in "Get Me An Alt", powered by Gemini 4 Argon.
Decompose "${analysis.objectName}" into 6 to 7 3D-printed parts ("kind": "printed") AND 3 to 4 off-the-shelf purchased parts ("kind": "purchased").
Target 3D Printer: ${printer.name} (${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm build volume).

Context from Analyst & Researcher:
- Overall dimensions (mm): ${JSON.stringify(analysis.overallDimensionsMm)}
- Printed parts planned: ${JSON.stringify(analysis.whatGetsPrinted)}
- Purchased parts planned: ${JSON.stringify(analysis.whatGetsBought)}
- Technical insights: ${JSON.stringify(sources.technicalInsights)}

${silhouetteInstruction}

Follow the exact shared contract for design.json parts:
Each part in "parts" MUST have:
{
  "id": "kebab-case-id",
  "partNumber": "PRT-01 or OTS-01",
  "name": "Descriptive Part Name",
  "kind": "printed" | "purchased",
  "dims_mm": [width, height, depth],
  "shape": "box" | "cylinder" | "tube" | "cone" | "sphere" | "bracket" | "enclosure",
  "params": { "outerRadius": 55, "innerRadius": 51, "height": 95 },
  "position": [x, y, z],
  "rotation": [rx, ry, rz],
  "explode": [ex, ey, ez],
  "color": "#d4af37",
  "bomRef": "bom-item-id",
  "material": "PETG or PLA+ or Purchased Hardware",
  "quantity": 1,
  "description": "Engineering description of part features",
  "roleInAssembly": "Function in assembly"
}

Return ONLY valid JSON matching:
{
  "objectName": "${analysis.objectName}",
  "designPhilosophy": "1-sentence modular design summary",
  "overallBoundingBoxMm": [150, 145, 120],
  "printedPartsCount": 7,
  "purchasedPartsCount": 4,
  "assemblyNotes": ["3 key assembly and print orientation notes"],
  "parts": [ ... ]
}`;

  const isPlantWaterer =
    /\b(plant|waterer|auto-waterer|blumat|sustee|hydropulse|terracotta)\b/i.test(
      `${analysis.objectName} ${analysis.slug}`
    );

  const cleanLabel = (s: string, fallback: string) =>
    s.replace(/^(PRT|OTS)-\d+\s*[:·-]?\s*/i, '').trim() || fallback;

  const defaultPrintedLabels =
    Array.isArray(analysis.whatGetsPrinted) && analysis.whatGetsPrinted.length > 0
      ? analysis.whatGetsPrinted
      : [
          `PRT-01 ${analysis.objectName} Primary Base Chassis`,
          `PRT-02 ${analysis.objectName} Articulated Mounting Bracket`,
          `PRT-03 ${analysis.objectName} Tension Clamp Jaw`,
          `PRT-04 ${analysis.objectName} Retention Cradle & Faceplate`,
          `PRT-05 ${analysis.objectName} Locking Collar & Thumbwheel`,
          `PRT-06 ${analysis.objectName} Protective Back Cover`,
        ];

  const defaultBoughtLabels =
    Array.isArray(analysis.whatGetsBought) && analysis.whatGetsBought.length > 0
      ? analysis.whatGetsBought
      : [
          'OTS-01 M3×12mm Stainless Socket Head Cap Screws & Brass Heat-Set Inserts',
          'OTS-02 N52 Neodymium Disc Magnets (10×3mm, 12-Pack)',
          'OTS-03 High-Friction 2mm EPDM Rubber Grip Pads',
          'OTS-04 Stainless Steel Compression Spring & Detent Pin Set',
        ];

  const fallbackParts: DesignPart[] =
    isRevision && input.previousDesign
      ? input.previousDesign.parts
      : isPlantWaterer
      ? SAMPLE_DESIGN.parts
      : [
          ...defaultPrintedLabels.slice(0, 6).map((label, i) => ({
            id: `prt-part-${i + 1}`,
            partNumber: `PRT-0${i + 1}`,
            name: cleanLabel(label, `Printed Part ${i + 1}`),
            kind: 'printed' as const,
            dims_mm: [
              Math.max(40, 110 - i * 10),
              Math.max(20, 45 - i * 4),
              Math.max(40, 95 - i * 8),
            ] as [number, number, number],
            shape: (
              ['enclosure', 'bracket', 'cylinder', 'box', 'tube', 'cone'] as const
            )[i % 6],
            params: {
              wallThickness: 2.4,
              clearanceMm: 0.3,
              maxOverhangDeg: 42,
              dfmVerified: true,
            },
            position: [0, 18 + i * 22, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            explode: [
              Math.round(Math.cos(i) * 65),
              (i - 2) * 30,
              Math.round(Math.sin(i) * 65),
            ] as [number, number, number],
            color: PALETTE[i % PALETTE.length],
            material: 'PETG / PLA+',
            quantity: 1,
            description: `3D-printed structural component for ${analysis.objectName}.`,
            roleInAssembly: cleanLabel(label, `Printed Part ${i + 1}`),
          })),
          ...defaultBoughtLabels.slice(0, 4).map((label, i) => ({
            id: `ots-part-${i + 1}`,
            partNumber: `OTS-0${i + 1}`,
            name: cleanLabel(label, `Hardware Module ${i + 1}`),
            kind: 'purchased' as const,
            dims_mm: [45, 25, 45] as [number, number, number],
            shape: 'box' as const,
            params: { width: 45, height: 25, depth: 45 },
            position: [
              20 * (i % 2 ? 1 : -1),
              30 + i * 20,
              0,
            ] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            explode: [i % 2 ? 80 : -80, 25 + i * 15, 40] as [
              number,
              number,
              number,
            ],
            color: '#9c7a4c',
            bomRef: `bom-${i + 1}`,
            material: 'Off-the-Shelf Hardware',
            quantity: 1,
            description: `Off-the-shelf component for ${analysis.objectName}.`,
            roleInAssembly: cleanLabel(label, `Hardware Module ${i + 1}`),
          })),
        ];

  const genericPhilosophy = isPlantWaterer
    ? SAMPLE_DESIGN.designPhilosophy
    : `Modular 3D-printed structural architecture for ${analysis.objectName} combining support-free PETG parts with standard metric off-the-shelf hardware.`;
  const genericAssemblyNotes = isPlantWaterer
    ? SAMPLE_DESIGN.assemblyNotes
    : [
        `Print all structural parts for ${analysis.objectName} in PETG or PLA+ at 0.20mm layer height with 4 perimeters (2.4mm walls) and 25% gyroid infill.`,
        'Install M3 brass heat-set inserts into mounting bosses before bolting structural brackets together.',
        'Apply non-slip EPDM rubber pads and verify smooth clamp/hinge motion before final torque.',
      ];

  const fallbackDesign: DesignSpec = {
    objectName: analysis.objectName,
    designPhilosophy: genericPhilosophy,
    overallBoundingBoxMm: analysis.overallDimensionsMm || [145, 120, 110],
    printedPartsCount: fallbackParts.filter((p) => p.kind === 'printed').length,
    purchasedPartsCount: fallbackParts.filter((p) => p.kind === 'purchased')
      .length,
    assemblyNotes: genericAssemblyNotes,
    parts: fallbackParts,
  };

  const retryPrompt = `Decompose "${analysis.objectName}" into 5 3D-printed parts ("kind":"printed", PRT-01..PRT-05) and 3 off-the-shelf parts ("kind":"purchased", OTS-01..OTS-03) for printer ${printer.name}. Planned printed: ${JSON.stringify(defaultPrintedLabels.slice(0, 5))}. Planned purchased: ${JSON.stringify(defaultBoughtLabels.slice(0, 3))}. Match the product silhouette and give mm transforms in Y-up coordinates (long axis along X for vehicles/boats: bow +X, midships 0, stern -X, superstructure +Y). Return ONLY valid JSON with keys: objectName, designPhilosophy, overallBoundingBoxMm, printedPartsCount, purchasedPartsCount, assemblyNotes (3 strings), parts (each with id, partNumber, name, kind, dims_mm:[w,h,d], shape, params, position:[x,y,z], rotation:[0,0,0], explode:[ex,ey,ez], color, material, quantity:1, description, roleInAssembly).`;

  const result = await runGeminiAgent<DesignSpec>({
    stageName: isRevision
      ? `Designer-Rev-${input.revisionRound}`
      : 'Designer',
    prompt,
    retryPrompt: isRevision ? undefined : retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'design.json',
    inlineImages: effectiveImages,
    preferRestForSpeed: true,
    timeoutMs: isRevision ? 20000 : 30000,
    onLog: input.onLog,
    fallbackGenerator: () =>
      isRevision && input.previousDesign && input.critiqueIssues
        ? applyCritiqueFixesToDesign(
            input.previousDesign,
            input.critiqueIssues,
            input.printerId,
            input.revisionRound
          ).updatedDesign
        : fallbackDesign,
  });

  const d = result.data;
  const rawParts =
    Array.isArray(d?.parts) && d.parts.length >= 4 ? d.parts : fallbackParts;

  let prtCounter = 1;
  let otsCounter = 1;

  const normalizedParts: DesignPart[] = rawParts.map((raw, idx) => {
    const p = raw as unknown as Record<string, unknown>;
    const kind: 'printed' | 'purchased' =
      p.kind === 'purchased' || p.type === 'purchased' ? 'purchased' : 'printed';
    const partNumber =
      (typeof p.partNumber === 'string' && p.partNumber) ||
      (kind === 'printed' ? `PRT-0${prtCounter++}` : `OTS-0${otsCounter++}`);

    const rawDims = (p.dims_mm || p.dimensionsMm) as number[] | undefined;
    const dims_mm: [number, number, number] =
      Array.isArray(rawDims) && rawDims.length === 3
        ? [
            Math.max(8, Math.min(240, Number(rawDims[0]) || 50)),
            Math.max(8, Math.min(220, Number(rawDims[1]) || 30)),
            Math.max(8, Math.min(240, Number(rawDims[2]) || 50)),
          ]
        : [60, 35, 60];

    const rawPos = p.position as number[] | undefined;
    const position: [number, number, number] =
      Array.isArray(rawPos) && rawPos.length === 3
        ? [
            Number(rawPos[0]) || 0,
            Number(rawPos[1]) || idx * 18,
            Number(rawPos[2]) || 0,
          ]
        : [0, 20 + idx * 18, 0];

    const rawRot = p.rotation as number[] | undefined;
    const rotation: [number, number, number] =
      Array.isArray(rawRot) && rawRot.length === 3
        ? [
            Number(rawRot[0]) || 0,
            Number(rawRot[1]) || 0,
            Number(rawRot[2]) || 0,
          ]
        : [0, 0, 0];

    const angle = (idx / rawParts.length) * Math.PI * 2;
    const rawExp = (p.explode || p.explodeVector) as number[] | undefined;
    const explode: [number, number, number] =
      Array.isArray(rawExp) && rawExp.length === 3
        ? [
            Number(rawExp[0]) || Math.round(Math.cos(angle) * 65),
            Number(rawExp[1]) || Math.round((idx - rawParts.length / 2) * 32),
            Number(rawExp[2]) || Math.round(Math.sin(angle) * 65),
          ]
        : [
            Math.round(Math.cos(angle) * 70),
            Math.round((idx - rawParts.length / 2) * 32),
            Math.round(Math.sin(angle) * 70),
          ];

    const shapeVal = String(p.shape || 'box');
    const shape: DesignPart['shape'] =
      shapeVal === 'cylinder' ||
      shapeVal === 'tube' ||
      shapeVal === 'cone' ||
      shapeVal === 'sphere' ||
      shapeVal === 'bracket' ||
      shapeVal === 'enclosure'
        ? shapeVal
        : 'box';

    return {
      id:
        (typeof p.id === 'string' && p.id) ||
        `part-${idx + 1}`,
      partNumber,
      name: (typeof p.name === 'string' && p.name) || `Component ${idx + 1}`,
      kind,
      dims_mm,
      shape,
      params:
        p.params && typeof p.params === 'object'
          ? (p.params as DesignPart['params'])
          : { width: dims_mm[0], height: dims_mm[1], depth: dims_mm[2] },
      position,
      rotation,
      explode,
      color:
        typeof p.color === 'string' && p.color.startsWith('#')
          ? p.color
          : PALETTE[idx % PALETTE.length],
      bomRef: typeof p.bomRef === 'string' ? p.bomRef : undefined,
      material:
        typeof p.material === 'string'
          ? p.material
          : kind === 'printed'
          ? 'PETG / PLA+'
          : 'Off-the-Shelf Hardware',
      quantity: Math.max(1, Math.min(8, Number(p.quantity) || 1)),
      description:
        typeof p.description === 'string'
          ? p.description
          : `${kind === 'printed' ? '3D printed' : 'Off-the-shelf'} component for ${analysis.objectName}.`,
      roleInAssembly:
        typeof p.roleInAssembly === 'string'
          ? p.roleInAssembly
          : 'Core functional component in assembly.',
      infillPercent: Number(p.infillPercent) || 25,
      layerHeightMm: Number(p.layerHeightMm) || 0.2,
      supportsRequired: Boolean(p.supportsRequired),
    };
  });

  const printedCount = normalizedParts.filter((p) => p.kind === 'printed').length;
  const purchasedCount = normalizedParts.filter((p) => p.kind === 'purchased').length;

  const baseNormalized: DesignSpec = {
    objectName: analysis.objectName,
    designPhilosophy: d?.designPhilosophy || genericPhilosophy,
    overallBoundingBoxMm: analysis.overallDimensionsMm,
    printedPartsCount: printedCount,
    purchasedPartsCount: purchasedCount,
    assemblyNotes:
      Array.isArray(d?.assemblyNotes) && d.assemblyNotes.length > 0
        ? d.assemblyNotes
        : genericAssemblyNotes,
    parts: normalizedParts,
  };

  const normalized =
    isRevision && input.critiqueIssues
      ? applyCritiqueFixesToDesign(
          baseNormalized,
          input.critiqueIssues,
          input.printerId,
          input.revisionRound
        ).updatedDesign
      : baseNormalized;

  fs.writeFileSync(
    path.join(input.cwd, 'design.json'),
    JSON.stringify(normalized, null, 2)
  );

  return {
    ...result,
    data: normalized,
  };
}
