import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  BomData,
  DesignSpec,
  InstructionsData,
  InstructionStep,
  ObjectAnalysis,
} from '../types';
import { SAMPLE_INSTRUCTIONS } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';

export interface InstructionsAgentInput {
  analysis: ObjectAnalysis;
  design: DesignSpec;
  bom: BomData;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
}

export async function runInstructionsAgent(
  input: InstructionsAgentInput
): Promise<RunAgentResult<InstructionsData>> {
  const { analysis, design } = input;

  const prompt = `You are the Instructions Agent (Stage 6 of 6) in "Get Me An Alt", powered by Gemini 4 Argon.
Produce an ordered IKEA-style animated 3D assembly script for "${analysis.objectName}".

Parts in design.json:
${JSON.stringify(
  design.parts.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    position: p.position,
    explode: p.explode,
  }))
)}

Follow the exact shared contract in COORDINATION.md for instructions.json:
{
  "objectName": "${analysis.objectName}",
  "estimatedTotalMinutes": ${analysis.estimatedAssemblyMinutes || 25},
  "difficulty": "${analysis.difficulty}",
  "safetyNotes": ["2 concise safety/leak/wiring notes"],
  "steps": [
    {
      "n": 1,
      "title": "Short IKEA-style action title",
      "partIds": ["part-id-1"],
      "tools": ["2.0mm Hex Driver"],
      "note": "Clear 1-2 sentence instruction explaining how the parts assemble in this step",
      "motion": [
        {
          "partId": "part-id-1",
          "from": [0, 120, 0],
          "to": [0, 47.5, 0]
        }
      ]
    }
  ]
}
Include 5 to 7 logical assembly steps covering all parts in design.json.`;

  const isPlantWaterer =
    /\b(plant|waterer|auto-waterer|blumat|sustee|hydropulse|terracotta)\b/i.test(
      `${analysis.objectName} ${analysis.slug}`
    );

  const fallbackSteps: InstructionStep[] = isPlantWaterer
    ? SAMPLE_INSTRUCTIONS.steps
    : design.parts.slice(0, 7).map((part, idx) => ({
        n: idx + 1,
        title: `Install ${part.name}`,
        partIds: [part.id],
        tools:
          part.kind === 'purchased'
            ? ['2.5mm Hex Key']
            : ['Hand Fit (Tool-Free)'],
        note: `Align ${part.name} (${part.partNumber}) with the mating registration features on ${analysis.objectName} and secure into position.`,
        motion: [
          {
            partId: part.id,
            from: [
              part.position[0] + part.explode[0],
              part.position[1] + Math.max(60, part.explode[1]),
              part.position[2] + part.explode[2],
            ],
            to: part.position,
          },
        ],
      }));

  const genericSafetyNotes = isPlantWaterer
    ? SAMPLE_INSTRUCTIONS.safetyNotes
    : [
        'Dry-fit all 3D-printed mating interfaces before installing fasteners to verify smooth clearance.',
        'Do not over-torque M3 screws in PETG/PLA+ bosses; tighten until snug against the mating shoulder.',
      ];

  const fallbackInstructions: InstructionsData = {
    objectName: analysis.objectName,
    estimatedTotalMinutes: analysis.estimatedAssemblyMinutes || 20,
    difficulty: analysis.difficulty || 'Beginner',
    safetyNotes: genericSafetyNotes,
    steps: fallbackSteps,
  };

  const retryPrompt = `Create 5 to 6 IKEA-style 3D assembly steps for "${analysis.objectName}" using these exact part IDs: ${JSON.stringify(design.parts.map((p) => ({ id: p.id, name: p.name, position: p.position })))}. Return ONLY valid JSON with keys: objectName, estimatedTotalMinutes, difficulty, safetyNotes (2 strings), steps (each with n, title, partIds, tools, note, motion:[{partId, from:[x,y,z], to:[x,y,z]}]).`;

  const result = await runGeminiAgent<InstructionsData>({
    stageName: 'Instructions',
    prompt,
    retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'instructions.json',
    preferRestForSpeed: true,
    timeoutMs: 30000,
    onLog: input.onLog,
    fallbackGenerator: () => fallbackInstructions,
  });

  const d = result.data;
  const partsById = new Map(design.parts.map((p) => [p.id, p]));

  let normalizedSteps: InstructionStep[] = [];
  if (Array.isArray(d?.steps) && d.steps.length >= 3) {
    normalizedSteps = d.steps.map((rawStep, idx) => {
      const s = rawStep as unknown as Record<string, unknown>;
      const n = Number(s.n || s.stepNumber) || idx + 1;
      const partIds: string[] = Array.isArray(s.partIds)
        ? (s.partIds as string[])
        : Array.isArray(s.activePartIds)
        ? (s.activePartIds as string[])
        : [design.parts[idx % design.parts.length]?.id || 'part-1'];

      const rawMotion = Array.isArray(s.motion) ? s.motion : [];
      const motion =
        rawMotion.length > 0
          ? rawMotion.map((m: Record<string, unknown>) => {
              const pid = String(m.partId || partIds[0] || 'part-1');
              const part = partsById.get(pid);
              const toPos: [number, number, number] =
                Array.isArray(m.to) && m.to.length === 3
                  ? [Number(m.to[0]) || 0, Number(m.to[1]) || 0, Number(m.to[2]) || 0]
                  : part
                  ? part.position
                  : [0, 40, 0];
              const fromPos: [number, number, number] =
                Array.isArray(m.from) && m.from.length === 3
                  ? [
                      Number(m.from[0]) || 0,
                      Number(m.from[1]) || 100,
                      Number(m.from[2]) || 0,
                    ]
                  : part
                  ? [
                      part.position[0] + part.explode[0],
                      part.position[1] + Math.max(60, part.explode[1]),
                      part.position[2] + part.explode[2],
                    ]
                  : [toPos[0], toPos[1] + 80, toPos[2]];
              return { partId: pid, from: fromPos, to: toPos };
            })
          : partIds.map((pid) => {
              const part = partsById.get(pid);
              const toPos: [number, number, number] = part
                ? part.position
                : [0, 40, 0];
              const fromPos: [number, number, number] = part
                ? [
                    part.position[0] + part.explode[0],
                    part.position[1] + Math.max(60, part.explode[1]),
                    part.position[2] + part.explode[2],
                  ]
                : [0, 120, 0];
              return { partId: pid, from: fromPos, to: toPos };
            });

      return {
        n,
        title: String(s.title || `Step ${n}`),
        partIds,
        tools: Array.isArray(s.tools) ? (s.tools as string[]) : [],
        note: String(
          s.note ||
            s.description ||
            `Position and secure ${partIds.join(', ')} into the assembly.`
        ),
        motion,
      };
    });
  } else {
    normalizedSteps = fallbackSteps;
  }

  const normalized: InstructionsData = {
    objectName: analysis.objectName,
    estimatedTotalMinutes:
      Number(d?.estimatedTotalMinutes) || analysis.estimatedAssemblyMinutes || 25,
    difficulty: d?.difficulty || analysis.difficulty || 'Beginner',
    safetyNotes:
      Array.isArray(d?.safetyNotes) && d.safetyNotes.length > 0
        ? d.safetyNotes
        : genericSafetyNotes,
    steps: normalizedSteps,
  };

  fs.writeFileSync(
    path.join(input.cwd, 'instructions.json'),
    JSON.stringify(normalized, null, 2)
  );

  return {
    ...result,
    data: normalized,
  };
}
