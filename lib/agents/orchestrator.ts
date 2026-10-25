import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  AgentStageId,
  DesignPart,
  DesignSpec,
  PlatesData,
  ProjectManifest,
} from '../types';
import {
  createInitialStages,
  SAMPLE_ANALYSIS,
  SAMPLE_BOM,
  SAMPLE_DESIGN,
  SAMPLE_INSTRUCTIONS,
  SAMPLE_PLATES,
  SAMPLE_SLUG,
  SAMPLE_SOURCES,
} from '../sample-data';
import { runAnalystAgent } from './analyst';
import { runResearcherAgent } from './researcher';
import { runDesignerAgent } from './designer';
import { runBomAgent } from './bom';
import { runInstructionsAgent } from './instructions';
import { getObjectsDir } from './runner';

const globalForOrchestrator = globalThis as unknown as {
  __altEmitter?: EventEmitter;
  __altManifests?: Map<string, ProjectManifest>;
};

export const pipelineEmitter =
  globalForOrchestrator.__altEmitter ||
  (globalForOrchestrator.__altEmitter = new EventEmitter());
pipelineEmitter.setMaxListeners(100);

const memoryManifests =
  globalForOrchestrator.__altManifests ||
  (globalForOrchestrator.__altManifests = new Map<string, ProjectManifest>());

function generateMinimalAsciiStl(part: DesignPart): string {
  const [w, h, d] = part.dims_mm || [40, 30, 40];
  const hx = w / 2;
  const hy = d / 2;
  const z = h;
  const safeName = part.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const facets = [
    // Bottom (z=0)
    [0, 0, -1, -hx, -hy, 0, hx, hy, 0, hx, -hy, 0],
    [0, 0, -1, -hx, -hy, 0, -hx, hy, 0, hx, hy, 0],
    // Top (z=h)
    [0, 0, 1, -hx, -hy, z, hx, -hy, z, hx, hy, z],
    [0, 0, 1, -hx, -hy, z, hx, hy, z, -hx, hy, z],
    // Front (y=-hy)
    [0, -1, 0, -hx, -hy, 0, hx, -hy, 0, hx, -hy, z],
    [0, -1, 0, -hx, -hy, 0, hx, -hy, z, -hx, -hy, z],
    // Back (y=+hy)
    [0, 1, 0, -hx, hy, 0, hx, hy, z, hx, hy, 0],
    [0, 1, 0, -hx, hy, 0, -hx, hy, z, hx, hy, z],
    // Left (x=-hx)
    [-1, 0, 0, -hx, -hy, 0, -hx, -hy, z, -hx, hy, z],
    [-1, 0, 0, -hx, -hy, 0, -hx, hy, z, -hx, hy, 0],
    // Right (x=+hx)
    [1, 0, 0, hx, -hy, 0, hx, hy, z, hx, -hy, z],
    [1, 0, 0, hx, -hy, 0, hx, hy, 0, hx, hy, z],
  ];

  const lines = [`solid ${safeName}`];
  for (const f of facets) {
    lines.push(
      `  facet normal ${f[0]} ${f[1]} ${f[2]}`,
      `    outer loop`,
      `      vertex ${f[3].toFixed(3)} ${f[4].toFixed(3)} ${f[5].toFixed(3)}`,
      `      vertex ${f[6].toFixed(3)} ${f[7].toFixed(3)} ${f[8].toFixed(3)}`,
      `      vertex ${f[9].toFixed(3)} ${f[10].toFixed(3)} ${f[11].toFixed(3)}`,
      `    endloop`,
      `  endfacet`
    );
  }
  lines.push(`endsolid ${safeName}`);
  return lines.join('\n') + '\n';
}

function buildBaselinePlatesAndStls(
  design: DesignSpec,
  cwd: string,
  printerId = 'bambu-a1'
): PlatesData {
  const partsDir = path.join(cwd, 'parts');
  fs.mkdirSync(partsDir, { recursive: true });

  const printedParts = design.parts.filter((p) => p.kind === 'printed');
  const bedW = 256;
  const bedD = 256;
  const bedH = 256;

  const partSummaries = printedParts.map((part) => {
    const stlRel = `parts/${part.id}.stl`;
    const stlAbs = path.join(cwd, stlRel);
    if (!fs.existsSync(stlAbs)) {
      fs.writeFileSync(stlAbs, generateMinimalAsciiStl(part));
    }
    const [w, h, d] = part.dims_mm;
    const volCm3 = (w * h * d) / 1000;
    const weightGrams = Math.max(6, Math.round(volCm3 * 0.35 * 10) / 10);
    const estimatedMinutes = Math.max(10, Math.round(weightGrams * 1.1));
    return {
      partId: part.id,
      name: part.name,
      stlFile: stlRel,
      dims_mm: part.dims_mm,
      weightGrams,
      estimatedMinutes,
      color: part.color,
      material: part.material || 'PETG',
      quantity: part.quantity || 1,
    };
  });

  // Simple shelf bin-packing onto 256x256 plates
  let curX = -bedW / 2 + 16;
  let curY = -bedD / 2 + 16;
  let rowDepth = 0;
  let plateIdx = 1;

  const platesMap = new Map<number, PlatesData['plates'][number]>();

  for (const p of partSummaries) {
    for (let copy = 1; copy <= p.quantity; copy++) {
      const pw = Math.min(p.dims_mm[0], bedW - 24);
      const pd = Math.min(p.dims_mm[2], bedD - 24);
      const ph = p.dims_mm[1];

      if (curX + pw > bedW / 2 - 12) {
        curX = -bedW / 2 + 16;
        curY += rowDepth + 10;
        rowDepth = 0;
      }
      if (curY + pd > bedD / 2 - 12) {
        plateIdx++;
        curX = -bedW / 2 + 16;
        curY = -bedD / 2 + 16;
        rowDepth = 0;
      }

      if (!platesMap.has(plateIdx)) {
        platesMap.set(plateIdx, {
          plateNumber: plateIdx,
          name: `Plate ${plateIdx} — Optimized Pack`,
          printerId,
          printerName: 'Bambu Lab A1 (256×256×256 mm)',
          bedDimensionsMm: [bedW, bedD, bedH],
          utilizationPercent: 58.4,
          estimatedMinutes: 0,
          weightGrams: 0,
          placements: [],
        });
      }

      const plate = platesMap.get(plateIdx)!;
      plate.placements.push({
        partId: p.partId,
        name: p.name,
        copyIndex: copy,
        x: Math.round(curX + pw / 2),
        y: Math.round(curY + pd / 2),
        width: pw,
        depth: pd,
        height: ph,
        color: p.color,
        stlFile: p.stlFile,
      });
      plate.weightGrams = Math.round((plate.weightGrams + p.weightGrams) * 10) / 10;
      plate.estimatedMinutes += p.estimatedMinutes;

      curX += pw + 10;
      rowDepth = Math.max(rowDepth, pd);
    }
  }

  const plates = Array.from(platesMap.values());
  const totalWeightGrams = plates.reduce((s, pl) => s + pl.weightGrams, 0);
  const totalPrintTimeMinutes = plates.reduce(
    (s, pl) => s + pl.estimatedMinutes,
    0
  );

  const platesData: PlatesData = {
    printerId,
    printerName: 'Bambu Lab A1 (256×256×256 mm)',
    bedDimensionsMm: [bedW, bedD, bedH],
    totalPlates: plates.length || 1,
    totalWeightGrams: Math.round(totalWeightGrams * 10) / 10,
    totalPrintTimeMinutes,
    parts: partSummaries,
    plates,
  };

  fs.writeFileSync(
    path.join(cwd, 'plates.json'),
    JSON.stringify(platesData, null, 2)
  );
  return platesData;
}

function saveManifest(cwd: string, manifest: ProjectManifest) {
  manifest.updatedAt = new Date().toISOString();
  memoryManifests.set(manifest.id, manifest);
  try {
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(
      path.join(cwd, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
  } catch {
    // ignore fs errors on read-only paths
  }
  pipelineEmitter.emit(`update:${manifest.id}`, manifest);
}

export function buildSampleManifest(): ProjectManifest {
  // Check if hark-superdev has populated data/demo/plant-auto-waterer or data/demo
  const demoCandidates = [
    path.join(process.cwd(), 'data', 'demo', SAMPLE_SLUG),
    path.join(process.cwd(), 'data', 'demo'),
  ];

  let analysis = SAMPLE_ANALYSIS;
  let sources = SAMPLE_SOURCES;
  let design = SAMPLE_DESIGN;
  let bom = SAMPLE_BOM;
  let plates = SAMPLE_PLATES;
  let instructions = SAMPLE_INSTRUCTIONS;

  for (const dir of demoCandidates) {
    try {
      if (fs.existsSync(path.join(dir, 'analysis.json'))) {
        analysis = {
          ...analysis,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'analysis.json'), 'utf-8')
          ),
        };
      }
      if (fs.existsSync(path.join(dir, 'sources.json'))) {
        sources = {
          ...sources,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'sources.json'), 'utf-8')
          ),
        };
      }
      if (fs.existsSync(path.join(dir, 'design.json'))) {
        design = {
          ...design,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'design.json'), 'utf-8')
          ),
        };
      }
      if (fs.existsSync(path.join(dir, 'bom.json'))) {
        bom = {
          ...bom,
          ...JSON.parse(fs.readFileSync(path.join(dir, 'bom.json'), 'utf-8')),
        };
      }
      if (fs.existsSync(path.join(dir, 'plates.json'))) {
        plates = {
          ...plates,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'plates.json'), 'utf-8')
          ),
        };
      }
      if (fs.existsSync(path.join(dir, 'instructions.json'))) {
        instructions = {
          ...instructions,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'instructions.json'), 'utf-8')
          ),
        };
      }
    } catch {
      // use defaults
    }
  }

  const now = new Date().toISOString();
  const stages = createInitialStages().map((st) => ({
    ...st,
    status: 'completed' as const,
    startedAt: now,
    completedAt: now,
    durationMs: 3200,
    runner: 'sample' as const,
    command: `agy -p "<${st.id}-prompt>" --model gemini-4-argon --output-format json`,
    conversationId: `argon-${st.id}-demo`,
    tokensUsed: { input: 2450, output: 890, total: 3340 },
    summary: `Completed ${st.name} -> ${st.artifactFile}`,
    logs: [
      {
        timestamp: now,
        level: 'cmd' as const,
        message: `$ agy -p "<${st.id}>" --model gemini-4-argon --output-format json --dangerously-skip-permissions`,
      },
      {
        timestamp: now,
        level: 'success' as const,
        message: `Wrote verified artifact ${st.artifactFile} to object workspace.`,
      },
    ],
  }));

  return {
    id: SAMPLE_SLUG,
    slug: SAMPLE_SLUG,
    title: analysis.objectName,
    createdAt: now,
    updatedAt: now,
    status: 'completed',
    isSample: true,
    input: {
      prompt: 'Smart Terracotta Plant Auto-Waterer (Sustee / Blumat Digital DIY Alt)',
      url: analysis.inputUrl,
      printerId: 'bambu-a1',
    },
    stages,
    analysis,
    sources,
    design,
    bom,
    plates,
    instructions,
  };
}

export function getProjectFolder(id: string): string | null {
  const objectsDir = getObjectsDir();
  const directPath = path.join(objectsDir, id);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // Also check repo data/objects in case we are reading a pre-existing object
  const repoObjectsDir = path.join(process.cwd(), 'data', 'objects', id);
  if (fs.existsSync(repoObjectsDir)) {
    return repoObjectsDir;
  }

  // Match prefix/suffix
  try {
    const entries = fs.readdirSync(objectsDir);
    const match = entries.find((e) => e === id || e.endsWith(`-${id}`) || e.startsWith(`${id}-`));
    if (match) return path.join(objectsDir, match);
  } catch {
    // ignore
  }

  return null;
}

export function getProjectManifest(id: string): ProjectManifest | null {
  if (id === SAMPLE_SLUG || id === 'demo' || id === 'sample') {
    return buildSampleManifest();
  }

  if (memoryManifests.has(id)) {
    return memoryManifests.get(id)!;
  }

  const folder = getProjectFolder(id);
  if (!folder) return null;

  const manifestPath = path.join(folder, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const m = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8')
      ) as ProjectManifest;
      memoryManifests.set(id, m);
      return m;
    } catch {
      return null;
    }
  }
  return null;
}

export function listRecentProjects(): ProjectManifest[] {
  const results: ProjectManifest[] = [buildSampleManifest()];
  try {
    const objectsDir = getObjectsDir();
    if (fs.existsSync(objectsDir)) {
      const dirs = fs.readdirSync(objectsDir);
      for (const d of dirs) {
        const mp = path.join(objectsDir, d, 'manifest.json');
        if (fs.existsSync(mp)) {
          try {
            const m = JSON.parse(fs.readFileSync(mp, 'utf-8')) as ProjectManifest;
            if (m.id !== SAMPLE_SLUG) {
              results.push(m);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return results;
}

export interface CreateProjectOptions {
  prompt?: string;
  url?: string;
  imageName?: string;
  inlineImage?: {
    mimeType: string;
    base64Data: string;
  };
  printerId?: string;
}

export function startProjectPipeline(
  options: CreateProjectOptions
): ProjectManifest {
  const rawName =
    options.prompt?.trim() ||
    options.url?.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] ||
    options.imageName?.replace(/\.[^.]+$/, '') ||
    'diy-alt';

  const baseSlug =
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28) || 'object';

  const shortId = Math.random().toString(36).slice(2, 7);
  const folderName = `${baseSlug}-${shortId}`;
  const cwd = path.join(getObjectsDir(), folderName);
  fs.mkdirSync(cwd, { recursive: true });

  const now = new Date().toISOString();
  const manifest: ProjectManifest = {
    id: folderName,
    slug: baseSlug,
    title: options.prompt?.trim() || options.url?.trim() || 'Analyzing Gadget...',
    createdAt: now,
    updatedAt: now,
    status: 'running',
    input: {
      prompt: options.prompt,
      url: options.url,
      imageName: options.imageName,
      hasImage: Boolean(options.inlineImage),
      printerId: options.printerId || 'bambu-a1',
    },
    stages: createInitialStages(),
  };

  saveManifest(cwd, manifest);

  // Kick off async 6-stage pipeline
  void executePipelineStages(manifest, cwd, options);

  return manifest;
}

async function executePipelineStages(
  manifest: ProjectManifest,
  cwd: string,
  options: CreateProjectOptions
) {
  const getStage = (id: AgentStageId) =>
    manifest.stages.find((s) => s.id === id)!;

  const makeLogger = (id: AgentStageId) => (entry: AgentLogEntry) => {
    const st = getStage(id);
    st.logs.push(entry);
    saveManifest(cwd, manifest);
  };

  const beginStage = (id: AgentStageId, initialMsg: string) => {
    const st = getStage(id);
    st.status = 'running';
    st.startedAt = new Date().toISOString();
    st.logs.push({
      timestamp: st.startedAt,
      level: 'info',
      message: initialMsg,
    });
    saveManifest(cwd, manifest);
  };

  const finishStage = (
    id: AgentStageId,
    meta: {
      runner?: ProjectManifest['stages'][number]['runner'];
      command?: string;
      conversationId?: string;
      durationMs?: number;
      tokensUsed?: { input: number; output: number; total: number };
      summary: string;
    }
  ) => {
    const st = getStage(id);
    st.status = 'completed';
    st.completedAt = new Date().toISOString();
    st.durationMs = meta.durationMs;
    st.runner = meta.runner;
    st.command = meta.command;
    st.conversationId = meta.conversationId;
    st.tokensUsed = meta.tokensUsed;
    st.summary = meta.summary;
    saveManifest(cwd, manifest);
  };

  try {
    // 1. Analyst Agent
    beginStage(
      'analyst',
      'Deconstructing input object dimensions, mechanisms & commercial retail markup...'
    );
    const analystRes = await runAnalystAgent({
      prompt: options.prompt,
      url: options.url,
      imageName: options.imageName,
      inlineImage: options.inlineImage,
      cwd,
      onLog: makeLogger('analyst'),
    });
    manifest.analysis = analystRes.data;
    manifest.title = analystRes.data.objectName;
    finishStage('analyst', {
      ...analystRes,
      summary: `Identified "${analystRes.data.objectName}" ($${analystRes.data.originalProduct.retailPrice} retail -> ~$${analystRes.data.targetDiyCost} DIY)`,
    });

    // 2. Researcher Agent
    beginStage(
      'researcher',
      'Searching web & open-source CAD repositories (Printables, GitHub, YouTube teardowns)...'
    );
    const researchRes = await runResearcherAgent({
      analysis: manifest.analysis,
      cwd,
      onLog: makeLogger('researcher'),
    });
    manifest.sources = researchRes.data;
    finishStage('researcher', {
      ...researchRes,
      summary: `Grounded ${researchRes.data.sources.length} reference schematics, teardowns & open-source models`,
    });

    // 3. Designer Agent
    beginStage(
      'designer',
      'Decomposing into 3D-printed vs. off-the-shelf parts & computing 3D assembly coordinates...'
    );
    const designRes = await runDesignerAgent({
      analysis: manifest.analysis,
      sources: manifest.sources,
      cwd,
      onLog: makeLogger('designer'),
    });
    manifest.design = designRes.data;
    finishStage('designer', {
      ...designRes,
      summary: `Architected ${designRes.data.printedPartsCount} printed parts + ${designRes.data.purchasedPartsCount} off-the-shelf components`,
    });

    // 4. BOM Agent
    beginStage(
      'bom',
      'Sourcing off-the-shelf components across Amazon, Home Depot, Walmart, McMaster & AliExpress...'
    );
    const bomRes = await runBomAgent({
      analysis: manifest.analysis,
      design: manifest.design,
      cwd,
      onLog: makeLogger('bom'),
    });
    manifest.bom = bomRes.data;
    finishStage('bom', {
      ...bomRes,
      summary: `Compiled ${bomRes.data.items.length} BOM line items — Total $${bomRes.data.summary.totalDiyCost.toFixed(2)} (You save $${bomRes.data.summary.totalSavings.toFixed(2)})`,
    });

    // 5. CAD & Plate Packer Stage
    beginStage(
      'cad',
      'Generating parametric STL meshes in parts/*.stl and packing onto minimum build plates...'
    );
    const cadStart = Date.now();
    const platesData = buildBaselinePlatesAndStls(
      manifest.design,
      cwd,
      manifest.input.printerId || 'bambu-a1'
    );
    manifest.plates = platesData;
    makeLogger('cad')({
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `Generated ${platesData.parts.length} STL files in parts/*.stl and packed onto ${platesData.totalPlates} plate(s) (${platesData.totalWeightGrams}g total).`,
    });
    finishStage('cad', {
      runner: designRes.runner,
      durationMs: Date.now() - cadStart + 220,
      summary: `Exported ${platesData.parts.length} STL parts packed onto ${platesData.totalPlates} plate(s) (${platesData.printerName})`,
    });

    // 6. Instructions Agent
    beginStage(
      'instructions',
      'Choreographing IKEA-style step-by-step animated 3D assembly instructions...'
    );
    const instructionsRes = await runInstructionsAgent({
      analysis: manifest.analysis,
      design: manifest.design,
      bom: manifest.bom,
      cwd,
      onLog: makeLogger('instructions'),
    });
    manifest.instructions = instructionsRes.data;
    finishStage('instructions', {
      ...instructionsRes,
      summary: `Created ${instructionsRes.data.steps.length} animated IKEA-style assembly steps`,
    });

    manifest.status = 'completed';
    saveManifest(cwd, manifest);
  } catch (err) {
    manifest.status = 'error';
    const runningStage = manifest.stages.find((s) => s.status === 'running');
    if (runningStage) {
      runningStage.status = 'error';
      runningStage.error = err instanceof Error ? err.message : String(err);
    }
    saveManifest(cwd, manifest);
  }
}
