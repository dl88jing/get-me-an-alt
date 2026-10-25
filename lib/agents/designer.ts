import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  DesignPart,
  DesignSpec,
  ObjectAnalysis,
  ResearchData,
} from '../types';
import { SAMPLE_DESIGN } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';

export interface DesignerInput {
  analysis: ObjectAnalysis;
  sources: ResearchData;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
}

const PALETTE = [
  '#0ea5e9',
  '#10b981',
  '#6366f1',
  '#f59e0b',
  '#14b8a6',
  '#a855f7',
  '#38bdf8',
  '#f97316',
  '#ec4899',
  '#eab308',
];

export async function runDesignerAgent(
  input: DesignerInput
): Promise<RunAgentResult<DesignSpec>> {
  const { analysis, sources } = input;

  const prompt = `You are the Designer / Architect Agent (Stage 3 of 6) in "Get Me An Alt", powered by Gemini 4 Argon.
Decompose "${analysis.objectName}" into 6 to 7 3D-printed parts ("kind": "printed") AND 3 to 4 off-the-shelf purchased parts ("kind": "purchased").

Context from Analyst & Researcher:
- Overall dimensions (mm): ${JSON.stringify(analysis.overallDimensionsMm)}
- Printed parts planned: ${JSON.stringify(analysis.whatGetsPrinted)}
- Purchased parts planned: ${JSON.stringify(analysis.whatGetsBought)}
- Technical insights: ${JSON.stringify(sources.technicalInsights)}

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
  "color": "#0ea5e9",
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

  const result = await runGeminiAgent<DesignSpec>({
    stageName: 'Designer',
    prompt,
    cwd: input.cwd,
    artifactFilename: 'design.json',
    onLog: input.onLog,
    fallbackGenerator: () => ({
      ...SAMPLE_DESIGN,
      objectName: analysis.objectName,
    }),
  });

  const d = result.data;
  const rawParts =
    Array.isArray(d?.parts) && d.parts.length >= 4
      ? d.parts
      : SAMPLE_DESIGN.parts;

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

  const normalized: DesignSpec = {
    objectName: analysis.objectName,
    designPhilosophy: d?.designPhilosophy || SAMPLE_DESIGN.designPhilosophy,
    overallBoundingBoxMm: analysis.overallDimensionsMm,
    printedPartsCount: printedCount,
    purchasedPartsCount: purchasedCount,
    assemblyNotes:
      Array.isArray(d?.assemblyNotes) && d.assemblyNotes.length > 0
        ? d.assemblyNotes
        : SAMPLE_DESIGN.assemblyNotes,
    parts: normalizedParts,
  };

  fs.writeFileSync(
    path.join(input.cwd, 'design.json'),
    JSON.stringify(normalized, null, 2)
  );

  return {
    ...result,
    data: normalized,
  };
}
