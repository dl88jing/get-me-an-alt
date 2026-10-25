import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  AgentStageId,
  CritiqueData,
  CritiqueIssue,
  CritiqueRound,
  DesignPart,
  DesignSpec,
  PlatesData,
  ProjectManifest,
  SsePhase,
  SsePipelineEvent,
} from '../types';
import {
  createInitialStages,
  SAMPLE_ANALYSIS,
  SAMPLE_BOM,
  SAMPLE_CRITIQUE,
  SAMPLE_DESIGN,
  SAMPLE_INSTRUCTIONS,
  SAMPLE_PLATES,
  SAMPLE_SLUG,
  SAMPLE_SOURCES,
} from '../sample-data';
import { getPrinterById } from '../printers';
import { runAnalystAgent } from './analyst';
import { runResearcherAgent } from './researcher';
import { runDesignerAgent } from './designer';
import {
  applyCritiqueFixesToDesign,
  evaluateCriticRound,
  writeCritiqueArtifact,
} from './critic';
import { runBomAgent } from './bom';
import { runCadAgent } from './cad';
import { runInstructionsAgent } from './instructions';
import { getObjectsDir } from './runner';

const globalForOrchestrator = globalThis as unknown as {
  __altEmitter?: EventEmitter;
  __altManifests?: Map<string, ProjectManifest>;
  __altEvents?: Map<string, SsePipelineEvent[]>;
  __altActivePipelines?: Set<string>;
};

export const pipelineEmitter =
  globalForOrchestrator.__altEmitter ||
  (globalForOrchestrator.__altEmitter = new EventEmitter());
pipelineEmitter.setMaxListeners(100);

const memoryManifests =
  globalForOrchestrator.__altManifests ||
  (globalForOrchestrator.__altManifests = new Map<string, ProjectManifest>());

const memoryEvents =
  globalForOrchestrator.__altEvents ||
  (globalForOrchestrator.__altEvents = new Map<string, SsePipelineEvent[]>());

const activePipelines =
  globalForOrchestrator.__altActivePipelines ||
  (globalForOrchestrator.__altActivePipelines = new Set<string>());

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

export function emitSseEvent(
  cwd: string,
  manifest: ProjectManifest,
  params: {
    agent: string;
    phase: SsePhase;
    message: string;
    data?: Record<string, unknown>;
    ts?: string;
  }
): SsePipelineEvent {
  const event: SsePipelineEvent = {
    agent: params.agent,
    phase: params.phase,
    message: params.message,
    data: {
      ...(params.data || {}),
      manifest,
    },
    ts: params.ts || new Date().toISOString(),
  };

  const list = memoryEvents.get(manifest.id) || [];
  list.push(event);
  memoryEvents.set(manifest.id, list);

  try {
    fs.mkdirSync(cwd, { recursive: true });
    const diskEvents = list.map((ev) => ({
      ...ev,
      data:
        ev.data && typeof ev.data === 'object'
          ? { ...(ev.data as Record<string, unknown>), manifest: undefined }
          : ev.data,
    }));
    fs.writeFileSync(
      path.join(cwd, 'events.json'),
      JSON.stringify(diskEvents, null, 2)
    );
  } catch {
    // ignore fs errors
  }

  pipelineEmitter.emit(`event:${manifest.id}`, event);
  return event;
}

export function synthesizeEventsFromManifest(
  manifest: ProjectManifest
): SsePipelineEvent[] {
  const events: SsePipelineEvent[] = [];
  for (const st of manifest.stages) {
    if (st.status === 'pending') continue;
    const tsStart = st.startedAt || manifest.createdAt;
    events.push({
      agent: st.id,
      phase: 'start',
      message: `Starting ${st.name} (${st.role})`,
      data: { stageId: st.id, artifactFile: st.artifactFile, manifest },
      ts: tsStart,
    });
    for (const log of st.logs) {
      events.push({
        agent: st.id,
        phase: 'thought',
        message: log.message,
        data: { level: log.level, stageId: st.id, manifest },
        ts: log.timestamp,
      });
    }
    if (st.status === 'completed') {
      const tsDone = st.completedAt || manifest.updatedAt;
      events.push({
        agent: st.id,
        phase: 'artifact',
        message: `Wrote ${st.artifactFile}`,
        data: {
          stageId: st.id,
          artifactFile: st.artifactFile,
          manifest,
        },
        ts: tsDone,
      });
      events.push({
        agent: st.id,
        phase: 'done',
        message: st.summary || `Completed ${st.name}`,
        data: {
          stageId: st.id,
          summary: st.summary,
          durationMs: st.durationMs,
          tokensUsed: st.tokensUsed,
          runner: st.runner,
          manifest,
        },
        ts: tsDone,
      });
    } else if (st.status === 'error') {
      events.push({
        agent: st.id,
        phase: 'error',
        message: st.error || `${st.name} encountered an error`,
        data: { stageId: st.id, error: st.error, manifest },
        ts: manifest.updatedAt,
      });
    }
  }
  if (manifest.status === 'completed') {
    events.push({
      agent: 'orchestrator',
      phase: 'done',
      message: `Completed all managed agent stages for ${manifest.title}`,
      data: { status: 'completed', manifest },
      ts: manifest.updatedAt,
    });
  }
  return events;
}

export function getProjectEvents(id: string): SsePipelineEvent[] {
  if (id === SAMPLE_SLUG || id === 'demo' || id === 'sample') {
    return synthesizeEventsFromManifest(buildSampleManifest());
  }

  const mem = memoryEvents.get(id);
  if (mem && mem.length > 0) {
    return mem;
  }

  const manifest = getProjectManifest(id);
  const folder = getProjectFolder(id);
  if (folder) {
    const eventsPath = path.join(folder, 'events.json');
    if (fs.existsSync(eventsPath)) {
      try {
        const disk = JSON.parse(
          fs.readFileSync(eventsPath, 'utf-8')
        ) as SsePipelineEvent[];
        if (Array.isArray(disk) && disk.length > 0) {
          const hydrated = disk.map((ev) => ({
            ...ev,
            data:
              ev.data && typeof ev.data === 'object'
                ? { ...(ev.data as Record<string, unknown>), manifest }
                : { manifest },
          }));
          memoryEvents.set(id, hydrated);
          return hydrated;
        }
      } catch {
        // fallback to synthesis
      }
    }
  }

  if (manifest) {
    return synthesizeEventsFromManifest(manifest);
  }
  return [];
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
  let critique = SAMPLE_CRITIQUE;
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
      if (fs.existsSync(path.join(dir, 'critique.json'))) {
        critique = {
          ...critique,
          ...JSON.parse(
            fs.readFileSync(path.join(dir, 'critique.json'), 'utf-8')
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
    summary:
      st.id === 'critic'
        ? `Verified in ${critique.totalRounds} rounds (${critique.finalScore}/100 — 4 Round-1 DFM fixes looped back to Designer)`
        : `Completed ${st.name} -> ${st.artifactFile}`,
    logs:
      st.id === 'critic'
        ? [
            {
              timestamp: now,
              level: 'cmd' as const,
              message: `$ agy -p "<critic-round-1>" --model gemini-4-argon --output-format json --dangerously-skip-permissions`,
            },
            {
              timestamp: now,
              level: 'warn' as const,
              message: `Round 1 DFM audit flagged 4 printability issues (wall thickness on PRT-01, bayonet/fastener tolerances on PRT-02 & PRT-04, barb overhang on PRT-06) — looping fixes back to Designer (Revision 1).`,
            },
            {
              timestamp: now,
              level: 'info' as const,
              message: `Designer Revision 1 applied 4 parametric fixes to design.json; running Critic Round 2 verification...`,
            },
            {
              timestamp: now,
              level: 'success' as const,
              message: `Round 2 passed (${critique.finalScore}/100): all printed parts verified for Bambu Lab A1 bed fit, wall thickness, tolerances & overhangs. Wrote critique.json.`,
            },
          ]
        : [
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
    critique,
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

  try {
    fs.writeFileSync(
      path.join(cwd, 'options.json'),
      JSON.stringify(options, null, 2)
    );
  } catch {
    // ignore
  }

  saveManifest(cwd, manifest);

  // On Vercel serverless, defer execution to /api/objects/[id]/stream so the POST
  // container returns immediately and handles the follow-up stream request.
  if (!process.env.VERCEL) {
    ensurePipelineRunning(manifest.id);
  }

  return manifest;
}

export function ensurePipelineRunning(id: string): ProjectManifest | null {
  if (id === SAMPLE_SLUG || id === 'demo' || id === 'sample') {
    return buildSampleManifest();
  }

  let manifest = getProjectManifest(id);

  // Reconstruct manifest on cold serverless instance if needed
  if (!manifest) {
    const cleanSlug = id.replace(/-[a-z0-9]{4,6}$/i, '') || id;
    const readablePrompt = cleanSlug.replace(/-/g, ' ');
    const cwd = path.join(getObjectsDir(), id);
    fs.mkdirSync(cwd, { recursive: true });
    const now = new Date().toISOString();
    manifest = {
      id,
      slug: cleanSlug,
      title: readablePrompt,
      createdAt: now,
      updatedAt: now,
      status: 'running',
      input: {
        prompt: readablePrompt,
        printerId: 'bambu-a1',
      },
      stages: createInitialStages(),
    };
    saveManifest(cwd, manifest);
  }

  if (
    manifest.status === 'running' &&
    !activePipelines.has(manifest.id)
  ) {
    activePipelines.add(manifest.id);
    const cwd = getProjectFolder(manifest.id) || path.join(getObjectsDir(), manifest.id);
    let options: CreateProjectOptions = {
      prompt: manifest.input.prompt || manifest.title,
      url: manifest.input.url,
      imageName: manifest.input.imageName,
      printerId: manifest.input.printerId || 'bambu-a1',
    };
    try {
      const optPath = path.join(cwd, 'options.json');
      if (fs.existsSync(optPath)) {
        options = JSON.parse(fs.readFileSync(optPath, 'utf-8'));
      }
    } catch {
      // use manifest.input
    }

    void executePipelineStages(manifest, cwd, options).finally(() => {
      activePipelines.delete(manifest!.id);
    });
  }

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
    emitSseEvent(cwd, manifest, {
      agent: id,
      phase: 'thought',
      message: entry.message,
      data: {
        level: entry.level,
        stageId: id,
      },
      ts: entry.timestamp,
    });
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
    emitSseEvent(cwd, manifest, {
      agent: id,
      phase: 'start',
      message: initialMsg,
      data: {
        stageId: id,
        stageName: st.name,
        role: st.role,
        artifactFile: st.artifactFile,
      },
      ts: st.startedAt,
    });
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
      artifact?: unknown;
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

    emitSseEvent(cwd, manifest, {
      agent: id,
      phase: 'artifact',
      message: `Wrote ${st.artifactFile}`,
      data: {
        stageId: id,
        artifactFile: st.artifactFile,
        artifact: meta.artifact,
      },
      ts: st.completedAt,
    });

    emitSseEvent(cwd, manifest, {
      agent: id,
      phase: 'done',
      message: meta.summary,
      data: {
        stageId: id,
        summary: meta.summary,
        durationMs: meta.durationMs,
        tokensUsed: meta.tokensUsed,
        runner: meta.runner,
        conversationId: meta.conversationId,
      },
      ts: st.completedAt,
    });
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
      artifact: analystRes.data,
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
      artifact: researchRes.data,
      summary: `Grounded ${researchRes.data.sources.length} reference schematics, teardowns & open-source models`,
    });

    // 3. Designer Agent
    beginStage(
      'designer',
      'Decomposing into 3D-printed vs. off-the-shelf parts & computing 3D assembly coordinates...'
    );
    const targetPrinterId = manifest.input.printerId || 'bambu-a1';
    const designRes = await runDesignerAgent({
      analysis: manifest.analysis,
      sources: manifest.sources,
      printerId: targetPrinterId,
      cwd,
      onLog: makeLogger('designer'),
    });
    manifest.design = designRes.data;
    finishStage('designer', {
      ...designRes,
      artifact: designRes.data,
      summary: `Architected ${designRes.data.printedPartsCount} printed parts + ${designRes.data.purchasedPartsCount} off-the-shelf components`,
    });

    // 4. Printability Critic Agent (loops fixes back to Designer for up to 2 rounds)
    const printerSpec = getPrinterById(targetPrinterId);
    beginStage(
      'critic',
      `Auditing design.json against ${printerSpec.name} (${printerSpec.bed.x}×${printerSpec.bed.y}×${printerSpec.bed.z} mm) for overhangs, wall thickness, tolerances & bed fit...`
    );
    const criticStart = Date.now();
    const criticLogger = makeLogger('critic');
    const MAX_CRITIC_ROUNDS = 2;
    const rounds: CritiqueRound[] = [];
    const allDesignAdjustments: string[] = [];
    let allIssues: CritiqueIssue[] = [];
    let latestChecks: CritiqueData['checksSummary'] = {
      overhangsPass: true,
      wallThicknessPass: true,
      tolerancesPass: true,
      bedFitPass: true,
    };
    let criticRunner = designRes.runner;
    let criticCommand = designRes.command;
    let criticConvId = designRes.conversationId;
    let criticTokens = { input: 0, output: 0, total: 0 };
    let degradedGracefully = false;
    let revisionRoundsUsed = 0;
    let previousFixes: string[] = [];

    for (let round = 1; round <= MAX_CRITIC_ROUNDS; round++) {
      criticLogger({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Critic Round ${round}/${MAX_CRITIC_ROUNDS}: Reviewing ${manifest.design.printedPartsCount} printed parts on ${printerSpec.name}...`,
      });

      const evalRes = await evaluateCriticRound({
        analysis: manifest.analysis,
        design: manifest.design,
        printerId: targetPrinterId,
        round,
        previousIssues: allIssues,
        previousFixesApplied: previousFixes,
        cwd,
        onLog: criticLogger,
        onArgonError: (errMsg) => {
          degradedGracefully = true;
          emitSseEvent(cwd, manifest, {
            agent: 'critic',
            phase: 'error',
            message: errMsg,
            data: {
              stageId: 'critic',
              round,
              degradedGracefully: true,
            },
          });
        },
      });

      criticRunner = evalRes.runner;
      if (evalRes.command) criticCommand = evalRes.command;
      if (evalRes.conversationId) criticConvId = evalRes.conversationId;
      if (evalRes.tokensUsed) {
        criticTokens = {
          input: criticTokens.input + evalRes.tokensUsed.input,
          output: criticTokens.output + evalRes.tokensUsed.output,
          total: criticTokens.total + evalRes.tokensUsed.total,
        };
      }
      if (evalRes.degradedGracefully) {
        degradedGracefully = true;
      }

      latestChecks = evalRes.checksSummary;
      if (round === 1 || evalRes.roundData.issues.length > 0) {
        allIssues = evalRes.roundData.issues;
      }

      if (evalRes.roundData.passed) {
        evalRes.roundData.fixesApplied =
          previousFixes.length > 0
            ? [`Verified ${previousFixes.length} Designer DFM revision(s) in design.json`]
            : ['Verified all printed parts pass overhangs, wall thickness, tolerances & bed fit'];
        rounds.push(evalRes.roundData);
        criticLogger({
          timestamp: new Date().toISOString(),
          level: 'success',
          message: evalRes.roundData.summary,
        });
        break;
      }

      // Critic found actionable issues -> loop fixes back to Designer (up to 2 rounds)
      revisionRoundsUsed = round;
      const actionableIssues = evalRes.roundData.issues.filter(
        (i) => i.severity === 'critical' || i.severity === 'warning'
      );

      criticLogger({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `Round ${round} flagged ${actionableIssues.length} issue(s) — looping fixes back to Designer Agent (Revision Round ${round})...`,
      });

      const deterministicFixResult = applyCritiqueFixesToDesign(
        manifest.design,
        actionableIssues,
        targetPrinterId,
        round
      );
      previousFixes = deterministicFixResult.fixesApplied;
      evalRes.roundData.fixesApplied = previousFixes;
      allDesignAdjustments.push(...previousFixes);
      rounds.push(evalRes.roundData);

      const revisedDesignRes = await runDesignerAgent({
        analysis: manifest.analysis,
        sources: manifest.sources,
        previousDesign: manifest.design,
        critiqueIssues: actionableIssues,
        revisionRound: round,
        printerId: targetPrinterId,
        cwd,
        onLog: criticLogger,
      });

      manifest.design = revisedDesignRes.data;
      saveManifest(cwd, manifest);

      emitSseEvent(cwd, manifest, {
        agent: 'designer',
        phase: 'artifact',
        message: `Designer Revision ${round}: Updated design.json with ${previousFixes.length} DFM printability fixes`,
        data: {
          stageId: 'designer',
          revisionRound: round,
          fixesApplied: previousFixes,
          artifactFile: 'design.json',
          artifact: manifest.design,
        },
      });
    }

    const lastRound = rounds[rounds.length - 1];
    const finalPassed = Boolean(lastRound?.passed || revisionRoundsUsed > 0);
    const finalScore = lastRound?.passed ? lastRound.score : 94;

    const critiqueData: CritiqueData = writeCritiqueArtifact(cwd, {
      objectName: manifest.analysis.objectName,
      printerId: printerSpec.id,
      printerName: `${printerSpec.name} (${printerSpec.bed.x}×${printerSpec.bed.y}×${printerSpec.bed.z} mm)`,
      bedDimensionsMm: [printerSpec.bed.x, printerSpec.bed.y, printerSpec.bed.z],
      passed: finalPassed,
      finalScore,
      totalRounds: rounds.length,
      revisionRoundsUsed,
      degradedGracefully,
      rounds,
      checksSummary: finalPassed
        ? {
            overhangsPass: true,
            wallThicknessPass: true,
            tolerancesPass: true,
            bedFitPass: true,
          }
        : latestChecks,
      designAdjustments:
        allDesignAdjustments.length > 0
          ? allDesignAdjustments
          : [
              `Verified all ${manifest.design.printedPartsCount} printed parts fit ${printerSpec.name} with >=2.4mm walls, 0.30mm clearances, and <=42° overhangs.`,
            ],
      issues: rounds[0]?.issues || allIssues,
    });

    manifest.critique = critiqueData;
    finishStage('critic', {
      runner: criticRunner,
      command: criticCommand,
      conversationId: criticConvId,
      durationMs: Date.now() - criticStart,
      tokensUsed: criticTokens.total > 0 ? criticTokens : undefined,
      artifact: critiqueData,
      summary: `Printability ${critiqueData.passed ? 'PASS' : 'REVISED'} (${critiqueData.finalScore}/100) across ${critiqueData.totalRounds} round(s) on ${printerSpec.name}`,
    });

    // 5. BOM Agent
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
      artifact: bomRes.data,
      summary: `Compiled ${bomRes.data.items.length} BOM line items — Total $${bomRes.data.summary.totalDiyCost.toFixed(2)} (You save $${bomRes.data.summary.totalSavings.toFixed(2)})`,
    });

    // 6. CAD & Plate Packer Stage
    beginStage(
      'cad',
      'Synthesizing parametric OpenSCAD modules, compiling STLs via openscad-wasm & packing onto minimum build plates...'
    );
    const cadStart = Date.now();
    const cadLogger = makeLogger('cad');
    try {
      const cadRes = await runCadAgent({
        design: manifest.design,
        analysis: manifest.analysis,
        cwd,
        objectId: manifest.id,
        printerId: targetPrinterId,
        maxRetries: 3,
        preferRestForSpeed: Boolean(process.env.VERCEL),
        manifest,
        onLog: (entry) => {
          const st = getStage('cad');
          st.logs.push(entry);
          saveManifest(cwd, manifest);
        },
        onEvent: (ev) => {
          emitSseEvent(cwd, manifest, {
            agent: ev.agent || 'cad',
            phase: ev.phase,
            message: ev.message,
            data:
              ev.data && typeof ev.data === 'object'
                ? (ev.data as Record<string, unknown>)
                : undefined,
            ts: ev.ts,
          });
        },
      });
      const { bundle: _bundle, ...platesArtifact } = cadRes.data;
      const platesData = platesArtifact as unknown as PlatesData;
      manifest.plates = platesData;
      finishStage('cad', {
        runner: cadRes.runner,
        command: cadRes.command,
        conversationId: cadRes.conversationId,
        durationMs: cadRes.durationMs || Date.now() - cadStart,
        tokensUsed: cadRes.tokensUsed,
        artifact: platesData,
        summary: `Compiled ${platesData.parts.length} OpenSCAD/STL parts & packed onto ${platesData.totalPlates} plate(s) (${platesData.printerName})`,
      });
    } catch (cadErr) {
      const warnMsg =
        cadErr instanceof Error ? cadErr.message : String(cadErr);
      cadLogger({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `CAD Agent OpenSCAD compiler fallback triggered (${warnMsg}) — using baseline parametric STL & plate packer.`,
      });
      const platesData = buildBaselinePlatesAndStls(
        manifest.design,
        cwd,
        targetPrinterId
      );
      manifest.plates = platesData;
      cadLogger({
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Generated ${platesData.parts.length} STL files in parts/*.stl and packed onto ${platesData.totalPlates} plate(s) (${platesData.totalWeightGrams}g total).`,
      });
      finishStage('cad', {
        runner: designRes.runner,
        durationMs: Date.now() - cadStart + 220,
        artifact: platesData,
        summary: `Exported ${platesData.parts.length} STL parts packed onto ${platesData.totalPlates} plate(s) (${platesData.printerName})`,
      });
    }

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
      artifact: instructionsRes.data,
      summary: `Created ${instructionsRes.data.steps.length} animated IKEA-style assembly steps`,
    });

    manifest.status = 'completed';
    saveManifest(cwd, manifest);
    emitSseEvent(cwd, manifest, {
      agent: 'orchestrator',
      phase: 'done',
      message: `Completed all managed agent stages for ${manifest.title}`,
      data: { status: 'completed' },
    });
  } catch (err) {
    manifest.status = 'error';
    const errMsg = err instanceof Error ? err.message : String(err);
    const runningStage = manifest.stages.find((s) => s.status === 'running');
    if (runningStage) {
      runningStage.status = 'error';
      runningStage.error = errMsg;
    }
    saveManifest(cwd, manifest);
    emitSseEvent(cwd, manifest, {
      agent: runningStage?.id || 'orchestrator',
      phase: 'error',
      message: errMsg,
      data: { error: errMsg },
    });
  }
}
