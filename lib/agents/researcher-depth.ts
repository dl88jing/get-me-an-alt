import type { ResearchSource } from '../types';

export type SourceKind =
  | 'video'
  | 'schematic'
  | 'pdf'
  | 'open-design'
  | 'teardown'
  | 'instructions'
  | 'product';

export const ALL_SOURCE_KINDS: readonly SourceKind[] = [
  'video',
  'schematic',
  'pdf',
  'open-design',
  'teardown',
  'instructions',
  'product',
] as const;

/**
 * Extended source item compatible with both the leader's `ResearchSource` contract
 * (`domain`, `type`, `keyTakeaways`, `thumbnailUrl`) and the research-depth fields
 * (`kind`, `source`, `thumbnail`, `embedUrl`, `license`).
 */
export interface EnrichedResearchSource extends ResearchSource {
  kind?: SourceKind;
  source?: string;
  thumbnail?: string;
  embedUrl?: string;
  license?: string;
}

export interface SourceItem {
  id: string;
  title: string;
  url: string;
  kind: SourceKind;
  source: string;
  summary: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  relevanceScore: number;
  license?: string;
  domain?: string;
  type?: ResearchSource['type'];
  keyTakeaways?: string[];
}

export interface SourcesArtifact {
  objectSlug: string;
  generatedAt: string;
  inputKind: 'product-url' | 'video-url' | 'image' | 'text';
  sources: SourceItem[];
  fallbackUsed: boolean;
}

export interface ResearchInput {
  url?: string;
  imageDataUrl?: string;
  text?: string;
  objectSlug?: string;
}

export interface AnalysisSummary {
  name: string;
  function: string;
  keywords: string[];
  dimensionsMm?: [number, number, number];
  slug?: string;
}

export interface ParsedInput {
  kind: 'product-url' | 'video-url' | 'image' | 'text';
  platform?: string;
  videoId?: string;
  domain?: string;
}

const IMAGE_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif|bmp|avif);base64,/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?.*)?$/i;

/**
 * Extracts a YouTube video ID from standard watch, short, embed, live, or youtu.be URLs.
 */
export function extractYouTubeId(rawUrl: string): string | undefined {
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^[a-zA-Z0-9_-]{6,15}$/.test(id)) return id;
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{6,15}$/.test(v)) return v;

      const parts = u.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        (parts[0] === 'shorts' ||
          parts[0] === 'embed' ||
          parts[0] === 'live' ||
          parts[0] === 'v')
      ) {
        const id = parts[1];
        if (id && /^[a-zA-Z0-9_-]{6,15}$/.test(id)) return id;
      }
    }
  } catch {
    // Ignore malformed URLs
  }
  return undefined;
}

/**
 * Extracts a numeric Vimeo video ID from Vimeo URLs.
 */
export function extractVimeoId(rawUrl: string): string | undefined {
  try {
    const u = new URL(rawUrl.trim());
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (/^\d{5,15}$/.test(parts[i])) {
          return parts[i];
        }
      }
    }
  } catch {
    // Ignore malformed URLs
  }
  return undefined;
}

/**
 * Parses a user input object or string (product URL, video URL, image data URL, or text)
 * and detects YouTube, Vimeo, Amazon, Walmart, Home Depot, McMaster, Printables, Thingiverse, and GitHub.
 */
export function parseInput(
  input:
    | {
        url?: string;
        imageDataUrl?: string;
        text?: string;
      }
    | string
): ParsedInput {
  const normalized =
    typeof input === 'string'
      ? input.trim().startsWith('data:image/')
        ? { imageDataUrl: input.trim() }
        : /^https?:\/\//i.test(input.trim())
        ? { url: input.trim() }
        : { text: input.trim() }
      : input || {};

  const trimmedImage = normalized.imageDataUrl?.trim();
  const trimmedUrl = normalized.url?.trim();

  if (
    trimmedImage &&
    (IMAGE_DATA_URL_RE.test(trimmedImage) || trimmedImage.startsWith('data:image/'))
  ) {
    const mimeMatch = trimmedImage.match(/^data:image\/([a-zA-Z0-9+.-]+)/i);
    return {
      kind: 'image',
      platform: mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : 'image',
    };
  }

  if (trimmedUrl) {
    if (
      IMAGE_DATA_URL_RE.test(trimmedUrl) ||
      trimmedUrl.startsWith('data:image/')
    ) {
      const mimeMatch = trimmedUrl.match(/^data:image\/([a-zA-Z0-9+.-]+)/i);
      return {
        kind: 'image',
        platform: mimeMatch ? `image/${mimeMatch[1].toLowerCase()}` : 'image',
      };
    }

    try {
      const parsed = new URL(trimmedUrl);
      const domain = parsed.hostname.replace(/^www\./i, '').toLowerCase();

      const ytId = extractYouTubeId(trimmedUrl);
      if (
        ytId ||
        domain === 'youtube.com' ||
        domain === 'youtu.be' ||
        domain === 'm.youtube.com' ||
        domain === 'youtube-nocookie.com'
      ) {
        return {
          kind: 'video-url',
          platform: 'YouTube',
          videoId: ytId,
          domain: 'youtube.com',
        };
      }

      const vimeoId = extractVimeoId(trimmedUrl);
      if (vimeoId || domain === 'vimeo.com' || domain === 'player.vimeo.com') {
        return {
          kind: 'video-url',
          platform: 'Vimeo',
          videoId: vimeoId,
          domain: 'vimeo.com',
        };
      }

      if (IMAGE_EXT_RE.test(parsed.pathname)) {
        return {
          kind: 'image',
          platform: 'Image URL',
          domain,
        };
      }

      if (domain.includes('amazon.') || domain === 'a.co' || domain === 'amzn.to') {
        return { kind: 'product-url', platform: 'Amazon', domain };
      }
      if (domain.includes('walmart.com')) {
        return { kind: 'product-url', platform: 'Walmart', domain };
      }
      if (domain.includes('homedepot.com')) {
        return { kind: 'product-url', platform: 'Home Depot', domain };
      }
      if (domain.includes('mcmaster.com')) {
        return { kind: 'product-url', platform: 'McMaster-Carr', domain };
      }
      if (domain.includes('printables.com')) {
        return { kind: 'product-url', platform: 'Printables', domain };
      }
      if (domain.includes('thingiverse.com')) {
        return { kind: 'product-url', platform: 'Thingiverse', domain };
      }
      if (domain.includes('github.com')) {
        return { kind: 'product-url', platform: 'GitHub', domain };
      }

      return {
        kind: 'product-url',
        platform: 'Web Product',
        domain,
      };
    } catch {
      // Fall through if URL cannot be parsed
    }
  }

  if (trimmedImage) {
    return {
      kind: 'image',
      platform: 'Image Upload',
    };
  }

  return {
    kind: 'text',
  };
}

/**
 * Returns a privacy-enhanced embed URL (`youtube-nocookie.com/embed/...` or `player.vimeo.com/video/...`)
 * for direct YouTube and Vimeo video URLs, or `null` for search pages / non-video links.
 */
export function getEmbedUrl(
  item: { url: string; embedUrl?: string } | string
): string | null {
  const rawUrl = typeof item === 'string' ? item : item?.url;
  const existingEmbed = typeof item === 'string' ? undefined : item?.embedUrl;
  if (!rawUrl) return null;

  if (rawUrl.includes('/results?') || rawUrl.includes('/search')) {
    return null;
  }

  const ytId = extractYouTubeId(rawUrl);
  if (ytId) {
    return `https://www.youtube-nocookie.com/embed/${ytId}`;
  }

  const vimeoId = extractVimeoId(rawUrl);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}`;
  }

  if (existingEmbed) {
    const embedYt = extractYouTubeId(existingEmbed);
    if (embedYt) return `https://www.youtube-nocookie.com/embed/${embedYt}`;
    const embedVimeo = extractVimeoId(existingEmbed);
    if (embedVimeo) return `https://player.vimeo.com/video/${embedVimeo}`;
  }

  return null;
}

/**
 * Returns a thumbnail URL for a `ResearchSource`, `SourceItem`, or URL string.
 * Prefers explicit `thumbnailUrl` or `thumbnail`, else derives a YouTube HQ thumbnail
 * for direct YouTube video links.
 */
export function getThumbnail(
  item:
    | { url: string; thumbnailUrl?: string; thumbnail?: string }
    | string
): string | undefined {
  if (typeof item !== 'string') {
    if (item?.thumbnailUrl && item.thumbnailUrl.trim().length > 0) {
      return item.thumbnailUrl.trim();
    }
    if (item?.thumbnail && item.thumbnail.trim().length > 0) {
      return item.thumbnail.trim();
    }
  }

  const rawUrl = typeof item === 'string' ? item : item?.url;
  if (!rawUrl) return undefined;

  const ytId = extractYouTubeId(rawUrl);
  if (ytId) {
    return `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
  }

  return undefined;
}

/**
 * Extracts a clean domain label from a URL.
 */
export function extractDomainLabel(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube.com';
    if (host.includes('vimeo.com')) return 'vimeo.com';
    if (host.includes('printables.com')) return 'printables.com';
    if (host.includes('thingiverse.com')) return 'thingiverse.com';
    if (host.includes('github.com')) return 'github.com';
    if (host.includes('ifixit.com')) return 'ifixit.com';
    if (host.includes('instructables.com')) return 'instructables.com';
    if (host.includes('hackaday.io') || host.includes('hackaday.com')) return 'hackaday.io';
    if (host.includes('mcmaster.com')) return 'mcmaster.com';
    if (host.includes('amazon.')) return 'amazon.com';
    if (host.includes('homedepot.com')) return 'homedepot.com';
    if (host.includes('walmart.com')) return 'walmart.com';
    return host;
  } catch {
    return 'web';
  }
}

/**
 * Normalizes a URL for deduplication.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = '';
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'si',
      'feature',
    ];
    for (const p of trackingParams) {
      u.searchParams.delete(p);
    }
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    const search = u.searchParams.toString();
    return `${u.protocol}//${host}${pathname}${search ? `?${search}` : ''}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Infers one of the 7 detailed `SourceKind` categories (`video`, `schematic`, `pdf`,
 * `open-design`, `teardown`, `instructions`, `product`) from any `ResearchSource` or `SourceItem`.
 */
export function inferSourceKind(
  item: Partial<ResearchSource & SourceItem>
): SourceKind {
  if (
    item.kind &&
    (ALL_SOURCE_KINDS as readonly string[]).includes(item.kind)
  ) {
    return item.kind;
  }

  const lowerUrl = (item.url || '').toLowerCase();
  const lowerTitle = (item.title || '').toLowerCase();
  const lowerSummary = (item.summary || '').toLowerCase();

  if (
    lowerUrl.endsWith('.pdf') ||
    lowerUrl.includes('filetype:pdf') ||
    lowerTitle.includes('pdf') ||
    lowerTitle.includes('datasheet') ||
    lowerTitle.includes('service manual') ||
    lowerTitle.includes('reference manual')
  ) {
    return 'pdf';
  }

  if (item.type === 'teardown') {
    return 'teardown';
  }

  if (item.type === 'schematic') {
    return 'schematic';
  }

  if (
    lowerUrl.includes('ifixit.com') ||
    lowerTitle.includes('teardown') ||
    lowerTitle.includes('disassembly')
  ) {
    if (
      lowerUrl.includes('youtube.com') ||
      lowerUrl.includes('youtu.be') ||
      lowerUrl.includes('vimeo.com') ||
      item.type === 'video'
    ) {
      return lowerTitle.includes('ifixit') ? 'teardown' : 'video';
    }
    return 'teardown';
  }

  if (
    item.type === 'video' ||
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('vimeo.com')
  ) {
    return 'video';
  }

  if (
    lowerUrl.includes('amazon.') ||
    lowerUrl.includes('mcmaster.com') ||
    lowerUrl.includes('homedepot.com') ||
    lowerUrl.includes('walmart.com') ||
    lowerUrl.includes('aliexpress.com') ||
    lowerUrl.includes('adafruit.com') ||
    lowerUrl.includes('sparkfun.com')
  ) {
    return 'product';
  }

  if (
    item.type === 'printable' ||
    item.type === 'github' ||
    lowerUrl.includes('printables.com') ||
    lowerUrl.includes('thingiverse.com') ||
    lowerUrl.includes('makerworld.com') ||
    lowerUrl.includes('cults3d.com') ||
    lowerUrl.includes('thangs.com') ||
    lowerUrl.includes('github.com')
  ) {
    return 'open-design';
  }

  if (
    lowerTitle.includes('schematic') ||
    lowerTitle.includes('wiring') ||
    lowerTitle.includes('circuit') ||
    lowerTitle.includes('pinout') ||
    lowerTitle.includes('diagram') ||
    lowerUrl.includes('tbm=isch')
  ) {
    return 'schematic';
  }

  if (
    lowerUrl.includes('instructables.com') ||
    lowerUrl.includes('hackaday.io') ||
    lowerTitle.includes('step-by-step') ||
    lowerTitle.includes('how to') ||
    lowerTitle.includes('instructions') ||
    lowerTitle.includes('build guide') ||
    lowerTitle.includes('watertight') ||
    lowerSummary.includes('step-by-step')
  ) {
    return 'instructions';
  }

  return 'instructions';
}

/**
 * Maps a `SourceKind` onto the leader's `ResearchSource['type']` union.
 */
export function mapKindToResearchType(
  kind: SourceKind,
  url = ''
): ResearchSource['type'] {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('github.com')) return 'github';
  switch (kind) {
    case 'video':
      return 'video';
    case 'open-design':
      return lowerUrl.includes('github.com') ? 'github' : 'printable';
    case 'schematic':
      return 'schematic';
    case 'teardown':
      return 'teardown';
    case 'pdf':
    case 'instructions':
    case 'product':
    default:
      return 'article';
  }
}

/**
 * Checks whether a URL is an honest search starting-point URL rather than an unverified deep link.
 */
export function isHonestSearchUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const full = u.href.toLowerCase();
    return (
      full.includes('/results?search_query=') ||
      full.includes('/search?') ||
      full.includes('/search/') ||
      full.includes('?q=') ||
      full.includes('&q=') ||
      full.includes('?query=') ||
      full.includes('?k=') ||
      full.includes('/s?k=') ||
      full.includes('/s/') ||
      full.includes('/topics/') ||
      full.includes('/products/')
    );
  } catch {
    return false;
  }
}

/**
 * Formats seconds into `M:SS` or `H:MM:SS`.
 */
export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Builds a deep link to a video at a specific timestamp in seconds
 * (e.g. `https://www.youtube.com/watch?v=ID&t=42s`).
 */
export function buildTimestampedVideoUrl(
  videoUrl: string,
  seconds: number
): string {
  const t = Math.max(0, Math.floor(Number(seconds) || 0));
  const ytId = extractYouTubeId(videoUrl);
  if (ytId) {
    return `https://www.youtube.com/watch?v=${ytId}&t=${t}s`;
  }
  const vimeoId = extractVimeoId(videoUrl);
  if (vimeoId) {
    return `https://vimeo.com/${vimeoId}#t=${t}s`;
  }
  try {
    const u = new URL(videoUrl);
    u.searchParams.set('t', `${t}s`);
    return u.toString();
  } catch {
    return videoUrl;
  }
}
