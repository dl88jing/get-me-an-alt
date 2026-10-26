import { ProjectManifest } from './types';

export const RECENT_BUILDS_STORAGE_KEY = 'gma-recent-builds';
export const RECENT_BUILDS_REMOVED_KEY = 'gma-recent-builds-removed';
export const RECENT_MANIFESTS_STORAGE_PREFIX = 'gma-manifest:';
export const RECENT_BUILDS_UPDATED_EVENT = 'gma-recent-builds-updated';
export const MAX_RECENT_BUILDS = 50;
export const MAX_CACHED_MANIFESTS = 15;

const FALLBACK_STORAGE_KEYS = [
  RECENT_BUILDS_STORAGE_KEY,
  'recentBuilds',
  'gma_recent_builds',
  'recent-builds',
];

export const PRESET_PROJECT_SLUGS = new Set<string>([
  'plant-auto-waterer',
  'plant-waterer',
  'demo',
  'sample',
  'art-easel',
  'tabletop-studio-art-easel',
  'articulated-tabletop-studio-art-easel',
  'iphone-magnifier',
  'iphone-magnifier-adapter',
  'liquid-handler',
  'liquid-handling-robot',
  'desktop-robot-arm',
  'robot-arm',
  '6-axis-robot-arm',
  'bladeless-air-purifier',
  'bladeless-fan',
  'bladeless-tower-fan',
  'camera-slider-3axis',
  'camera-slider',
  'motorized-camera-slider',
]);

export interface RecentBuildEntry {
  slug: string;
  title: string;
  input: string;
  originalPrice: number;
  altPrice: number;
  savingsPct: number;
  thumbnail?: string | null;
  createdAt: string;
  category?: string;
  partsSpec?: string;
  inputType?: 'url' | 'video' | 'image' | 'prompt';
}

export function isPresetProjectSlug(slug?: string | null): boolean {
  if (!slug) return false;
  return PRESET_PROJECT_SLUGS.has(slug.trim().toLowerCase());
}

export function isPresetManifest(manifest?: ProjectManifest | null): boolean {
  if (!manifest) return false;
  if (manifest.isSample) return true;
  if (isPresetProjectSlug(manifest.id) || isPresetProjectSlug(manifest.slug)) {
    return true;
  }
  return false;
}

function parsePriceNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Math.round(val * 100) / 100;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const n = Number.parseFloat(cleaned);
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return 0;
}

export function extractThumbnailFromManifest(
  manifest: ProjectManifest
): string | null {
  const firstFrame = manifest.teardown?.frames?.find(
    (f) =>
      (typeof f.thumbnailUrl === 'string' && f.thumbnailUrl.trim()) ||
      (typeof f.image === 'string' &&
        f.image.trim() &&
        !f.image.startsWith('data:image/svg+xml'))
  );
  if (firstFrame) {
    return (firstFrame.thumbnailUrl || firstFrame.image || '').trim() || null;
  }

  const videoThumb = manifest.teardown?.videos?.find(
    (v) => typeof v.thumbnailUrl === 'string' && v.thumbnailUrl.trim()
  );
  if (videoThumb?.thumbnailUrl) {
    return videoThumb.thumbnailUrl.trim();
  }

  const sourceThumb = manifest.sources?.sources?.find(
    (s) => typeof s.thumbnailUrl === 'string' && s.thumbnailUrl.trim()
  );
  if (sourceThumb?.thumbnailUrl) {
    return sourceThumb.thumbnailUrl.trim();
  }

  const svgFrame = manifest.teardown?.frames?.find(
    (f) => typeof f.image === 'string' && f.image.trim()
  );
  if (svgFrame?.image) {
    return svgFrame.image.trim();
  }

  return null;
}

export function manifestToRecentBuild(
  manifest: ProjectManifest
): RecentBuildEntry {
  const slug = (manifest.id || manifest.slug || '').trim();
  const title = (
    manifest.analysis?.objectName ||
    manifest.title ||
    slug.replace(/-[a-z0-9]{4,6}$/i, '').replace(/-/g, ' ') ||
    'Custom DIY Build'
  ).trim();

  const rawInput =
    manifest.input?.url ||
    manifest.input?.prompt ||
    manifest.analysis?.inputUrl ||
    (manifest.input?.imageName ? `Photo: ${manifest.input.imageName}` : '') ||
    manifest.title ||
    slug;

  const originalPrice = parsePriceNumber(
    manifest.bom?.summary?.originalRetailPrice ??
      manifest.analysis?.originalProduct?.retailPrice ??
      0
  );

  const altPrice = parsePriceNumber(
    manifest.bom?.summary?.totalDiyCost ??
      manifest.analysis?.targetDiyCost ??
      0
  );

  let savingsPct = Math.round(
    parsePriceNumber(manifest.bom?.summary?.savingsPercent ?? 0)
  );
  if (savingsPct <= 0 && originalPrice > 0 && altPrice >= 0 && originalPrice > altPrice) {
    savingsPct = Math.round(((originalPrice - altPrice) / originalPrice) * 100);
  }

  const printedCount =
    manifest.design?.printedPartsCount ??
    manifest.design?.parts?.filter((p) => p.kind === 'printed').length ??
    0;
  const purchasedCount =
    manifest.design?.purchasedPartsCount ??
    manifest.design?.parts?.filter((p) => p.kind === 'purchased').length ??
    manifest.bom?.items?.length ??
    0;
  const platesCount = manifest.plates?.totalPlates ?? 1;

  const partsSpec =
    printedCount > 0 || purchasedCount > 0
      ? `${printedCount} Printed STLs · ${purchasedCount} BOM Parts · ${platesCount} Plate${platesCount === 1 ? '' : 's'}`
      : undefined;

  const inputType: 'url' | 'video' | 'image' | 'prompt' =
    manifest.analysis?.inputType ||
    (manifest.input?.hasImage || manifest.input?.imageName
      ? 'image'
      : manifest.input?.url && /youtube\.com|youtu\.be/i.test(manifest.input.url)
        ? 'video'
        : manifest.input?.url
          ? 'url'
          : 'prompt');

  return {
    slug,
    title,
    input: String(rawInput).trim(),
    originalPrice,
    altPrice,
    savingsPct,
    thumbnail: extractThumbnailFromManifest(manifest),
    createdAt: manifest.createdAt || manifest.updatedAt || new Date().toISOString(),
    category: manifest.analysis?.category || undefined,
    partsSpec,
    inputType,
  };
}

export function normalizeRecentBuildEntry(
  raw: unknown
): RecentBuildEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (
    typeof obj.id === 'string' &&
    Array.isArray(obj.stages) &&
    (obj.analysis || obj.bom || obj.input)
  ) {
    return manifestToRecentBuild(obj as unknown as ProjectManifest);
  }

  const slug = String(obj.slug || obj.id || '').trim();
  if (!slug) return null;

  const title = String(
    obj.title ||
      obj.objectName ||
      obj.name ||
      slug.replace(/-[a-z0-9]{4,6}$/i, '').replace(/-/g, ' ')
  ).trim();

  let inputStr = '';
  if (typeof obj.input === 'string') {
    inputStr = obj.input.trim();
  } else if (obj.input && typeof obj.input === 'object') {
    const inp = obj.input as Record<string, unknown>;
    inputStr = String(inp.url || inp.prompt || inp.imageName || '').trim();
  }
  if (!inputStr) {
    inputStr = String(obj.url || obj.prompt || title).trim();
  }

  const originalPrice = parsePriceNumber(
    obj.originalPrice ??
      obj['original price'] ??
      obj.retailPrice ??
      obj.retail ??
      0
  );

  const altPrice = parsePriceNumber(
    obj.altPrice ??
      obj['alt price'] ??
      obj.diyPrice ??
      obj.totalDiyCost ??
      obj.diy ??
      0
  );

  let savingsPct = Math.round(
    parsePriceNumber(
      obj.savingsPct ??
        obj.savingsPercent ??
        obj['savings %'] ??
        obj.savings ??
        0
    )
  );
  if (savingsPct <= 0 && originalPrice > 0 && altPrice >= 0 && originalPrice > altPrice) {
    savingsPct = Math.round(((originalPrice - altPrice) / originalPrice) * 100);
  }

  const thumbnail =
    typeof obj.thumbnail === 'string' && obj.thumbnail.trim()
      ? obj.thumbnail.trim()
      : typeof obj.image === 'string' && obj.image.trim()
        ? obj.image.trim()
        : null;

  const createdAtRaw = String(obj.createdAt || obj.updatedAt || '').trim();
  const parsedTime = createdAtRaw ? Date.parse(createdAtRaw) : Number.NaN;
  const createdAt = Number.isFinite(parsedTime)
    ? new Date(parsedTime).toISOString()
    : new Date().toISOString();

  const inputType: 'url' | 'video' | 'image' | 'prompt' =
    obj.inputType === 'url' ||
    obj.inputType === 'video' ||
    obj.inputType === 'image' ||
    obj.inputType === 'prompt'
      ? obj.inputType
      : /youtube\.com|youtu\.be/i.test(inputStr)
        ? 'video'
        : /^https?:\/\//i.test(inputStr)
          ? 'url'
          : /^photo:/i.test(inputStr)
            ? 'image'
            : 'prompt';

  return {
    slug,
    title,
    input: inputStr,
    originalPrice,
    altPrice,
    savingsPct,
    thumbnail,
    createdAt,
    category: typeof obj.category === 'string' ? obj.category : undefined,
    partsSpec: typeof obj.partsSpec === 'string' ? obj.partsSpec : undefined,
    inputType,
  };
}

export function mergeRecentBuilds(
  primary: RecentBuildEntry[],
  secondary: RecentBuildEntry[],
  cap = MAX_RECENT_BUILDS,
  excludeSlugs?: Set<string>
): RecentBuildEntry[] {
  const bySlug = new Map<string, RecentBuildEntry>();

  for (const item of [...primary, ...secondary]) {
    const normalized = normalizeRecentBuildEntry(item);
    if (!normalized) continue;
    if (isPresetProjectSlug(normalized.slug)) continue;
    if (excludeSlugs && excludeSlugs.has(normalized.slug)) continue;

    const existing = bySlug.get(normalized.slug);
    if (!existing) {
      bySlug.set(normalized.slug, normalized);
    } else {
      const existingTime = Date.parse(existing.createdAt) || 0;
      const candidateTime = Date.parse(normalized.createdAt) || 0;
      const merged: RecentBuildEntry = {
        ...existing,
        ...normalized,
        originalPrice: normalized.originalPrice || existing.originalPrice,
        altPrice: normalized.altPrice || existing.altPrice,
        savingsPct: normalized.savingsPct || existing.savingsPct,
        thumbnail: normalized.thumbnail || existing.thumbnail || null,
        category: normalized.category || existing.category,
        partsSpec: normalized.partsSpec || existing.partsSpec,
        createdAt:
          candidateTime >= existingTime
            ? normalized.createdAt
            : existing.createdAt,
      };
      bySlug.set(normalized.slug, merged);
    }
  }

  return Array.from(bySlug.values())
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt) || 0;
      const tb = Date.parse(b.createdAt) || 0;
      return tb - ta;
    })
    .slice(0, cap);
}

export function readRemovedRecentBuildSlugs(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(RECENT_BUILDS_REMOVED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((x) => String(x)));
    }
  } catch {
    // ignore
  }
  return new Set();
}

function writeRemovedRecentBuildSlugs(slugs: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      RECENT_BUILDS_REMOVED_KEY,
      JSON.stringify(Array.from(slugs).slice(-100))
    );
  } catch {
    // ignore
  }
}

export function readLocalRecentBuilds(): RecentBuildEntry[] {
  if (typeof window === 'undefined') return [];
  const collected: RecentBuildEntry[] = [];

  for (const key of FALLBACK_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && Array.isArray(parsed.builds)
          ? parsed.builds
          : [parsed];
      for (const item of list) {
        const norm = normalizeRecentBuildEntry(item);
        if (norm) collected.push(norm);
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return mergeRecentBuilds(collected, [], MAX_RECENT_BUILDS);
}

export function writeLocalRecentBuilds(entries: RecentBuildEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = mergeRecentBuilds(entries, [], MAX_RECENT_BUILDS);
    window.localStorage.setItem(
      RECENT_BUILDS_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // ignore quota errors
  }
}

export function saveLocalRecentBuild(
  entryOrManifest: RecentBuildEntry | ProjectManifest,
  fullManifest?: ProjectManifest
): RecentBuildEntry[] {
  if (typeof window === 'undefined') return [];
  const entry = normalizeRecentBuildEntry(entryOrManifest);
  if (!entry || isPresetProjectSlug(entry.slug)) {
    return readLocalRecentBuilds();
  }

  // Un-mark from removed if re-saved
  const removed = readRemovedRecentBuildSlugs();
  if (removed.has(entry.slug)) {
    removed.delete(entry.slug);
    writeRemovedRecentBuildSlugs(removed);
  }

  const current = readLocalRecentBuilds();
  const updated = mergeRecentBuilds([entry], current, MAX_RECENT_BUILDS);
  writeLocalRecentBuilds(updated);

  if (fullManifest) {
    saveLocalCachedManifest(entry.slug, fullManifest);
  }

  try {
    window.dispatchEvent(new CustomEvent(RECENT_BUILDS_UPDATED_EVENT));
  } catch {
    // ignore
  }

  return updated;
}

export function removeLocalRecentBuild(slug: string): RecentBuildEntry[] {
  if (typeof window === 'undefined') return [];
  const target = slug.trim();
  const removed = readRemovedRecentBuildSlugs();
  removed.add(target);
  writeRemovedRecentBuildSlugs(removed);

  const current = readLocalRecentBuilds().filter((b) => b.slug !== target);
  try {
    for (const key of FALLBACK_STORAGE_KEYS) {
      if (key === RECENT_BUILDS_STORAGE_KEY) {
        window.localStorage.setItem(key, JSON.stringify(current));
      } else if (window.localStorage.getItem(key)) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.removeItem(`${RECENT_MANIFESTS_STORAGE_PREFIX}${target}`);
    window.dispatchEvent(new CustomEvent(RECENT_BUILDS_UPDATED_EVENT));
  } catch {
    // ignore
  }
  return current;
}

export function saveLocalCachedManifest(
  slug: string,
  manifest: ProjectManifest
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${RECENT_MANIFESTS_STORAGE_PREFIX}${slug}`;
    window.localStorage.setItem(key, JSON.stringify(manifest));

    // Prune older cached manifests if over cap
    const manifestKeys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(RECENT_MANIFESTS_STORAGE_PREFIX)) {
        manifestKeys.push(k);
      }
    }
    if (manifestKeys.length > MAX_CACHED_MANIFESTS) {
      const toRemove = manifestKeys.slice(
        0,
        manifestKeys.length - MAX_CACHED_MANIFESTS
      );
      for (const k of toRemove) {
        if (k !== key) window.localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore storage quota errors
  }
}

export function readLocalCachedManifest(slug: string): ProjectManifest | null {
  if (typeof window === 'undefined' || !slug) return null;
  try {
    const raw = window.localStorage.getItem(
      `${RECENT_MANIFESTS_STORAGE_PREFIX}${slug}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectManifest;
    if (parsed && parsed.id && Array.isArray(parsed.stages)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}
