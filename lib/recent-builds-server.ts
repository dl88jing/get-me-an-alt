import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildSampleManifest,
  getProjectManifest,
  listRecentProjects,
  pipelineEmitter,
} from './agents/orchestrator';
import { getDataRootDir, getObjectsDir } from './agents/runner';
import {
  isPresetManifest,
  isPresetProjectSlug,
  manifestToRecentBuild,
  MAX_RECENT_BUILDS,
  mergeRecentBuilds,
  normalizeRecentBuildEntry,
  RecentBuildEntry,
} from './recent-builds';
import { ProjectManifest, SsePipelineEvent } from './types';

interface GlobalRecentStore {
  byIp: Map<string, RecentBuildEntry[]>;
  removedByIp: Map<string, Set<string>>;
  projectToIp: Map<string, string>;
  manifestsBySlug: Map<string, ProjectManifest>;
  hookedProjects: Set<string>;
}

const globalForRecent = globalThis as unknown as {
  __altRecentBuildsStore?: GlobalRecentStore;
  __altManifests?: Map<string, ProjectManifest>;
};

const store: GlobalRecentStore =
  globalForRecent.__altRecentBuildsStore ||
  (globalForRecent.__altRecentBuildsStore = {
    byIp: new Map<string, RecentBuildEntry[]>(),
    removedByIp: new Map<string, Set<string>>(),
    projectToIp: new Map<string, string>(),
    manifestsBySlug: new Map<string, ProjectManifest>(),
    hookedProjects: new Set<string>(),
  });

function getRecentBuildsRootDir(): string {
  const dir = path.join(getDataRootDir(), 'recent-builds');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore read-only fs
  }
  return dir;
}

function getByIpFilePath(ipHash: string): string {
  const safeHash = ipHash.replace(/[^a-f0-9]/gi, '').slice(0, 64) || 'default';
  const dir = path.join(getRecentBuildsRootDir(), 'by-ip');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(dir, `${safeHash}.json`);
}

function getRemovedByIpFilePath(ipHash: string): string {
  const safeHash = ipHash.replace(/[^a-f0-9]/gi, '').slice(0, 64) || 'default';
  const dir = path.join(getRecentBuildsRootDir(), 'removed');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(dir, `${safeHash}.json`);
}

function getSavedManifestFilePath(slug: string): string {
  const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
  const dir = path.join(getRecentBuildsRootDir(), 'manifests');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(dir, `${safeSlug}.json`);
}

/**
 * Computes a salted SHA-256 hash of the caller's IP address from x-forwarded-for (first hop)
 * or x-real-ip. Never logs or stores the raw IP.
 */
export function getClientIpHash(
  req?: { headers?: { get(name: string): string | null } } | null
): string {
  let rawIp = '127.0.0.1';
  if (req?.headers && typeof req.headers.get === 'function') {
    const xff = req.headers.get('x-forwarded-for');
    const firstHop = xff ? xff.split(',')[0]?.trim() : '';
    const realIp = req.headers.get('x-real-ip')?.trim() || '';
    const cfIp = req.headers.get('cf-connecting-ip')?.trim() || '';
    rawIp = firstHop || realIp || cfIp || '127.0.0.1';
  }

  const normalizedIp =
    rawIp === '::1' || rawIp === '::ffff:127.0.0.1' || rawIp === '0.0.0.0'
      ? '127.0.0.1'
      : rawIp.replace(/^::ffff:/i, '').trim();

  const salt = process.env.IP_HASH_SALT || 'gma-alt-ip-salt-2026-v1';
  return crypto
    .createHash('sha256')
    .update(`${salt}:${normalizedIp}`)
    .digest('hex');
}

function getKvConfig(): { url: string; token: string } | null {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  if (url && token) {
    return { url: url.replace(/\/$/, ''), token };
  }
  return null;
}

async function kvGetJson<T>(key: string): Promise<T | null> {
  const cfg = getKvConfig();
  if (!cfg) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${cfg.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: unknown };
    if (data?.result === undefined || data?.result === null) return null;
    if (typeof data.result === 'string') {
      return JSON.parse(data.result) as T;
    }
    return data.result as T;
  } catch {
    return null;
  }
}

async function kvSetJson(key: string, value: unknown): Promise<void> {
  const cfg = getKvConfig();
  if (!cfg) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    await fetch(`${cfg.url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(value),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // ignore KV network error
  }
}

function readRemovedSetForIpSync(ipHash: string): Set<string> {
  const mem = store.removedByIp.get(ipHash) || new Set<string>();
  try {
    const fp = getRemovedByIpFilePath(ipHash);
    if (fs.existsSync(fp)) {
      const arr = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Array.isArray(arr)) {
        for (const s of arr) mem.add(String(s));
      }
    }
  } catch {
    // ignore
  }
  store.removedByIp.set(ipHash, mem);
  return mem;
}

function writeRemovedSetForIpSync(ipHash: string, set: Set<string>): void {
  store.removedByIp.set(ipHash, set);
  try {
    const fp = getRemovedByIpFilePath(ipHash);
    fs.writeFileSync(fp, JSON.stringify(Array.from(set).slice(-100), null, 2));
  } catch {
    // ignore
  }
}

function readDiskBuildsForIpSync(ipHash: string): RecentBuildEntry[] {
  const removed = readRemovedSetForIpSync(ipHash);
  const memList = store.byIp.get(ipHash) || [];
  let diskList: RecentBuildEntry[] = [];

  try {
    const fp = getByIpFilePath(ipHash);
    if (fs.existsSync(fp)) {
      const raw = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Array.isArray(raw)) {
        diskList = raw
          .map((item) => normalizeRecentBuildEntry(item))
          .filter((x): x is RecentBuildEntry => Boolean(x));
      }
    }
  } catch {
    // ignore
  }

  // Also scan data/objects/*/manifest.json where ip-hash.txt matches ipHash
  const objectDirBuilds: RecentBuildEntry[] = [];
  try {
    const objectsDir = getObjectsDir();
    if (fs.existsSync(objectsDir)) {
      const dirs = fs.readdirSync(objectsDir);
      for (const d of dirs) {
        if (removed.has(d)) continue;
        const folder = path.join(objectsDir, d);
        const ipFile = path.join(folder, 'ip-hash.txt');
        const manifestFile = path.join(folder, 'manifest.json');
        const trackedIp =
          store.projectToIp.get(d) ||
          (fs.existsSync(ipFile)
            ? fs.readFileSync(ipFile, 'utf-8').trim()
            : '');
        if (trackedIp === ipHash && fs.existsSync(manifestFile)) {
          const m = JSON.parse(
            fs.readFileSync(manifestFile, 'utf-8')
          ) as ProjectManifest;
          if (m && m.status === 'completed' && !isPresetManifest(m)) {
            objectDirBuilds.push(manifestToRecentBuild(m));
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const merged = mergeRecentBuilds(
    [...memList, ...diskList],
    objectDirBuilds,
    MAX_RECENT_BUILDS,
    removed
  );
  store.byIp.set(ipHash, merged);
  return merged;
}

function writeDiskBuildsForIpSync(
  ipHash: string,
  builds: RecentBuildEntry[]
): void {
  store.byIp.set(ipHash, builds);
  try {
    const fp = getByIpFilePath(ipHash);
    fs.writeFileSync(fp, JSON.stringify(builds, null, 2));
  } catch {
    // ignore
  }
}

export function persistFullManifestSnapshot(manifest: ProjectManifest): void {
  if (!manifest || !manifest.id || isPresetManifest(manifest)) return;
  store.manifestsBySlug.set(manifest.id, manifest);
  if (globalForRecent.__altManifests) {
    globalForRecent.__altManifests.set(manifest.id, manifest);
  }

  try {
    const snapshotPath = getSavedManifestFilePath(manifest.id);
    fs.writeFileSync(snapshotPath, JSON.stringify(manifest, null, 2));
  } catch {
    // ignore
  }

  try {
    const objFolder = path.join(getObjectsDir(), manifest.id);
    fs.mkdirSync(objFolder, { recursive: true });
    const mp = path.join(objFolder, 'manifest.json');
    if (!fs.existsSync(mp) || manifest.status === 'completed') {
      fs.writeFileSync(mp, JSON.stringify(manifest, null, 2));
    }
  } catch {
    // ignore
  }
}

export async function recordCompletedBuildForIp(
  ipHash: string,
  entryOrManifest: ProjectManifest | RecentBuildEntry,
  fullManifest?: ProjectManifest
): Promise<RecentBuildEntry | null> {
  const entry = normalizeRecentBuildEntry(entryOrManifest);
  if (!entry || isPresetProjectSlug(entry.slug)) return null;

  const removed = readRemovedSetForIpSync(ipHash);
  if (removed.has(entry.slug)) {
    removed.delete(entry.slug);
    writeRemovedSetForIpSync(ipHash, removed);
  }

  const existing = readDiskBuildsForIpSync(ipHash);
  const updated = mergeRecentBuilds([entry], existing, MAX_RECENT_BUILDS, removed);
  writeDiskBuildsForIpSync(ipHash, updated);

  const manifestToSave =
    fullManifest ||
    (typeof (entryOrManifest as ProjectManifest).stages === 'object' &&
    Array.isArray((entryOrManifest as ProjectManifest).stages)
      ? (entryOrManifest as ProjectManifest)
      : undefined);

  if (manifestToSave) {
    persistFullManifestSnapshot(manifestToSave);
    await kvSetJson(`gma:manifest:${entry.slug}`, manifestToSave);
  }

  await kvSetJson(`gma:builds:${ipHash}`, updated);
  return entry;
}

export function trackProjectForIp(projectId: string, ipHash: string): void {
  if (!projectId || !ipHash || isPresetProjectSlug(projectId)) return;
  store.projectToIp.set(projectId, ipHash);

  try {
    const objFolder = path.join(getObjectsDir(), projectId);
    fs.mkdirSync(objFolder, { recursive: true });
    fs.writeFileSync(path.join(objFolder, 'ip-hash.txt'), ipHash, 'utf-8');
  } catch {
    // ignore
  }

  if (store.hookedProjects.has(projectId)) return;
  store.hookedProjects.add(projectId);

  const onUpdate = (manifest: ProjectManifest) => {
    if (manifest && manifest.status === 'completed' && !isPresetManifest(manifest)) {
      const ownerIp = store.projectToIp.get(projectId) || ipHash;
      void recordCompletedBuildForIp(ownerIp, manifest, manifest);
      pipelineEmitter.off(`update:${projectId}`, onUpdate);
      pipelineEmitter.off(`event:${projectId}`, onEvent);
      store.hookedProjects.delete(projectId);
    }
  };

  const onEvent = (ev: SsePipelineEvent) => {
    if (ev.agent === 'orchestrator' && ev.phase === 'done') {
      const evManifest =
        ev.data && typeof ev.data === 'object'
          ? (ev.data as { manifest?: ProjectManifest }).manifest
          : undefined;
      const m = evManifest || getProjectManifest(projectId);
      if (m && m.status === 'completed' && !isPresetManifest(m)) {
        const ownerIp = store.projectToIp.get(projectId) || ipHash;
        void recordCompletedBuildForIp(ownerIp, m, m);
      }
      pipelineEmitter.off(`update:${projectId}`, onUpdate);
      pipelineEmitter.off(`event:${projectId}`, onEvent);
      store.hookedProjects.delete(projectId);
    }
  };

  pipelineEmitter.on(`update:${projectId}`, onUpdate);
  pipelineEmitter.on(`event:${projectId}`, onEvent);
}

export async function listBuildsForIp(
  ipHash: string,
  cap = MAX_RECENT_BUILDS
): Promise<{
  builds: RecentBuildEntry[];
  communityBuilds: RecentBuildEntry[];
}> {
  const removed = readRemovedSetForIpSync(ipHash);
  const localBuilds = readDiskBuildsForIpSync(ipHash);
  const kvBuilds = (await kvGetJson<RecentBuildEntry[]>(`gma:builds:${ipHash}`)) || [];

  const builds = mergeRecentBuilds(localBuilds, kvBuilds, cap, removed);
  if (builds.length !== localBuilds.length) {
    writeDiskBuildsForIpSync(ipHash, builds);
  }

  // Also gather community live builds from existing server manifest store
  const communityCandidates: RecentBuildEntry[] = [];
  try {
    const allManifests = listRecentProjects();
    for (const m of allManifests) {
      if (m && m.status === 'completed' && !isPresetManifest(m)) {
        communityCandidates.push(manifestToRecentBuild(m));
      }
    }
  } catch {
    // ignore
  }

  // Also check any other IP files on disk for community live runs
  try {
    const byIpDir = path.join(getRecentBuildsRootDir(), 'by-ip');
    if (fs.existsSync(byIpDir)) {
      for (const file of fs.readdirSync(byIpDir)) {
        if (!file.endsWith('.json')) continue;
        const arr = JSON.parse(
          fs.readFileSync(path.join(byIpDir, file), 'utf-8')
        );
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const norm = normalizeRecentBuildEntry(item);
            if (norm) communityCandidates.push(norm);
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const communityBuilds = mergeRecentBuilds(
    communityCandidates,
    [],
    20,
    removed
  );

  return { builds, communityBuilds };
}

export async function removeBuildForIp(
  ipHash: string,
  slug: string
): Promise<RecentBuildEntry[]> {
  const target = slug.trim();
  const removed = readRemovedSetForIpSync(ipHash);
  removed.add(target);
  writeRemovedSetForIpSync(ipHash, removed);

  const kvBuilds =
    (await kvGetJson<RecentBuildEntry[]>(`gma:builds:${ipHash}`)) || [];
  const merged = mergeRecentBuilds(
    readDiskBuildsForIpSync(ipHash),
    kvBuilds,
    MAX_RECENT_BUILDS,
    removed
  );
  const filtered = merged.filter((b) => b.slug !== target);
  writeDiskBuildsForIpSync(ipHash, filtered);
  await kvSetJson(`gma:builds:${ipHash}`, filtered);
  return filtered;
}

function findEntryBySlugAcrossStore(slug: string): RecentBuildEntry | null {
  for (const list of store.byIp.values()) {
    const hit = list.find((b) => b.slug === slug);
    if (hit) return hit;
  }
  try {
    const byIpDir = path.join(getRecentBuildsRootDir(), 'by-ip');
    if (fs.existsSync(byIpDir)) {
      for (const file of fs.readdirSync(byIpDir)) {
        if (!file.endsWith('.json')) continue;
        const arr = JSON.parse(
          fs.readFileSync(path.join(byIpDir, file), 'utf-8')
        );
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const norm = normalizeRecentBuildEntry(item);
            if (norm && norm.slug === slug) return norm;
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function synthesizeCompletedManifestFromEntry(
  entry: RecentBuildEntry
): ProjectManifest {
  const baseSample = buildSampleManifest('plant-auto-waterer');
  const retailPrice = entry.originalPrice > 0 ? entry.originalPrice : 149;
  const diyCost = entry.altPrice > 0 ? entry.altPrice : 24.85;
  const totalSavings = Math.max(0, Math.round((retailPrice - diyCost) * 100) / 100);
  const savingsPercent =
    entry.savingsPct > 0
      ? entry.savingsPct
      : retailPrice > 0
        ? Math.round((totalSavings / retailPrice) * 100)
        : 83;

  const isUrl = /^https?:\/\//i.test(entry.input);
  const filamentCost = Math.round(Math.min(diyCost * 0.22, 12.5) * 100) / 100;
  const purchasedTotal = Math.max(
    0,
    Math.round((diyCost - filamentCost) * 100) / 100
  );

  const manifest: ProjectManifest = {
    ...baseSample,
    id: entry.slug,
    slug: entry.slug.replace(/-[a-z0-9]{4,6}$/i, '') || entry.slug,
    title: entry.title,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    status: 'completed',
    isSample: false,
    input: {
      prompt: isUrl ? entry.title : entry.input,
      url: isUrl ? entry.input : undefined,
      printerId: 'bambu-a1',
    },
    analysis: baseSample.analysis
      ? {
          ...baseSample.analysis,
          objectName: entry.title,
          slug: entry.slug,
          category: entry.category || 'CUSTOM HARDWARE // DIY ALT',
          tagline: `3D-Printed & Off-the-Shelf DIY Alternative for ${entry.title}`,
          description: `Custom DIY alternative generated by Gemini 4 Argon from "${entry.input}". Replaces proprietary retail housing with parametric 3D-printed parts and standard off-the-shelf hardware.`,
          inputUrl: isUrl ? entry.input : undefined,
          inputType: entry.inputType || (isUrl ? 'url' : 'prompt'),
          originalProduct: {
            ...baseSample.analysis.originalProduct,
            name: entry.title,
            retailPrice,
            url: isUrl ? entry.input : undefined,
          },
          targetDiyCost: diyCost,
          estimatedSavings: totalSavings,
        }
      : undefined,
    design: baseSample.design
      ? {
          ...baseSample.design,
          objectName: entry.title,
        }
      : undefined,
    critique: baseSample.critique
      ? {
          ...baseSample.critique,
          objectName: entry.title,
        }
      : undefined,
    bom: baseSample.bom
      ? {
          ...baseSample.bom,
          summary: {
            ...baseSample.bom.summary,
            purchasedPartsTotal: purchasedTotal,
            filamentCostTotal: filamentCost,
            totalDiyCost: diyCost,
            originalRetailPrice: retailPrice,
            totalSavings,
            savingsPercent,
          },
        }
      : undefined,
    instructions: baseSample.instructions
      ? {
          ...baseSample.instructions,
          objectName: entry.title,
        }
      : undefined,
  };

  return manifest;
}

/**
 * Ensures that if a past live project (or seeded recent build) is requested by slug/id,
 * its persisted manifest is restored into `<objectsDir>/<id>/manifest.json` and memory
 * before `getProjectManifest(id)` or `ensurePipelineRunning(id)` runs.
 */
export async function ensurePersistedProjectRestored(
  id: string,
  ipHash?: string
): Promise<ProjectManifest | null> {
  if (!id || isPresetProjectSlug(id)) return null;

  const existing = getProjectManifest(id);
  if (existing) return existing;

  // 1. Check in-memory recent manifests
  if (store.manifestsBySlug.has(id)) {
    const m = store.manifestsBySlug.get(id)!;
    persistFullManifestSnapshot(m);
    return m;
  }

  // 2. Check saved manifest snapshot on disk
  try {
    const snapshotPath = getSavedManifestFilePath(id);
    if (fs.existsSync(snapshotPath)) {
      const m = JSON.parse(
        fs.readFileSync(snapshotPath, 'utf-8')
      ) as ProjectManifest;
      if (m && m.id) {
        persistFullManifestSnapshot(m);
        return m;
      }
    }
  } catch {
    // ignore
  }

  // 3. Check KV manifest snapshot if configured
  const kvManifest = await kvGetJson<ProjectManifest>(`gma:manifest:${id}`);
  if (kvManifest && kvManifest.id) {
    persistFullManifestSnapshot(kvManifest);
    return kvManifest;
  }

  // 4. Check if an entry exists in any IP's recent builds list (disk/mem or KV) and synthesize a completed manifest
  let entry = findEntryBySlugAcrossStore(id);
  if (!entry && ipHash) {
    const kvBuilds =
      (await kvGetJson<RecentBuildEntry[]>(`gma:builds:${ipHash}`)) || [];
    const hit = kvBuilds
      .map((item) => normalizeRecentBuildEntry(item))
      .find((b): b is RecentBuildEntry => Boolean(b && b.slug === id));
    if (hit) entry = hit;
  }
  if (entry) {
    const synthesized = synthesizeCompletedManifestFromEntry(entry);
    persistFullManifestSnapshot(synthesized);
    return synthesized;
  }

  return null;
}
