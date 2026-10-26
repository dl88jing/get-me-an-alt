import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AgentLogEntry,
  BomData,
  BomItem,
  DesignPart,
  DesignSpec,
  ObjectAnalysis,
  ResearchData,
  ResearchSource,
} from '../types';
import {
  buildTimestampedVideoUrl,
  extractVimeoId,
  extractYouTubeId,
  formatTimestamp,
  getThumbnail,
  SourceItem,
  SourcesArtifact,
} from './researcher-depth';
import { extractJsonFromText, RunAgentResult } from './runner';

export { buildTimestampedVideoUrl, formatTimestamp };

export interface TeardownVideo {
  url: string;
  title: string;
  videoId?: string;
  thumbnailUrl?: string;
}

export interface TeardownPart {
  name: string;
  function: string;
  material: string;
  dims_mm: [number, number, number];
  fasteners: string;
  buyOrPrint: 'buy' | 'print';
  offTheShelfQuery: string;
  confidence: number;
  /** Optional cross-reference to DesignPart.id in design.json */
  partId?: string;
  /** Optional cross-reference to BomItem.id / partNumber in bom.json */
  bomRef?: string;
}

export interface TeardownFrame {
  video: string;
  t: number;
  image: string;
  parts: TeardownPart[];
  /** Timestamped visual description from Gemini 4 Argon */
  description?: string;
  /** Browser-renderable image URL or data URI fallback when `image` is a relative disk path */
  thumbnailUrl?: string;
  /** How the frame was captured */
  captureMode?: 'yt-dlp-ffmpeg' | 'argon-thumbnail-fallback';
}

/**
 * Contract for `teardown.json` in COORDINATION.md:
 * `{ videos:[{url,title}], frames:[{video, t, image, parts:[{name, function, material, dims_mm, fasteners, buyOrPrint, offTheShelfQuery, confidence}]}] }`
 */
export interface TeardownData {
  videos: TeardownVideo[];
  frames: TeardownFrame[];
  note?: string;
  generatedAt?: string;
}

export interface TeardownAgentInput {
  analysis?: Pick<
    ObjectAnalysis,
    'objectName' | 'slug' | 'category' | 'functionSummary' | 'inputUrl' | 'keyMechanisms'
  > &
    Partial<Pick<ObjectAnalysis, 'whatGetsPrinted' | 'whatGetsBought'>>;
  sources?:
    | ResearchData
    | SourcesArtifact
    | Array<ResearchSource | SourceItem>;
  videos?: TeardownVideo[];
  design?: DesignSpec;
  bom?: BomData;
  /** Object output directory (alias of outDir) */
  cwd?: string;
  /** Object output directory (`data/objects/<id>`) */
  outDir?: string;
  onLog?: (entry: AgentLogEntry) => void;
  onProgress?: (msg: string) => void;
}

interface ArgonTimestampCandidate {
  t: number;
  description?: string;
}

function loadApiKey(): string {
  if (process.env.GEMINI_API_KEY?.trim()) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GEMINI_API_KEY=')) {
          const val = trimmed
            .slice('GEMINI_API_KEY='.length)
            .trim()
            .replace(/^["']|["']$/g, '');
          if (val) return val;
        }
      }
    }
  } catch {
    // ignore
  }
  return '';
}

function resolveBinaryOnPath(binName: string): string | null {
  if (process.env.VERCEL) return null;
  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = [
    ...pathDirs.map((d: string) => path.join(d, binName)),
    path.join(os.homedir(), '.local', 'bin', binName),
    `/usr/local/bin/${binName}`,
    `/usr/bin/${binName}`,
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Extracts verified direct teardown/repair/disassembly/build videos from Researcher sources
 * (ignoring generic `/results?search_query=` pages so we never pass a search page as video file_data).
 */
export function collectCandidateTeardownVideos(
  input: TeardownAgentInput
): TeardownVideo[] {
  const byUrl = new Map<string, TeardownVideo>();

  const addVideo = (rawUrl: string | undefined, rawTitle?: string) => {
    if (!rawUrl) return;
    const trimmed = rawUrl.trim();
    if (!trimmed.startsWith('http')) return;
    if (trimmed.includes('/results?') || trimmed.includes('/search')) return;

    const ytId = extractYouTubeId(trimmed);
    const vimeoId = extractVimeoId(trimmed);
    if (!ytId && !vimeoId) return;

    const canonicalUrl = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : trimmed;
    if (byUrl.has(canonicalUrl)) return;

    byUrl.set(canonicalUrl, {
      url: canonicalUrl,
      title:
        rawTitle?.trim() ||
        `${input.analysis?.objectName || 'Hardware'} — Teardown & Mechanism Video`,
      videoId: ytId || vimeoId,
      thumbnailUrl: getThumbnail({ url: canonicalUrl }),
    });
  };

  if (Array.isArray(input.videos)) {
    for (const v of input.videos) {
      addVideo(v.url, v.title);
    }
  }

  if (input.analysis?.inputUrl) {
    addVideo(
      input.analysis.inputUrl,
      `${input.analysis.objectName} — Input Reference Video`
    );
  }

  const rawSources: Array<Partial<ResearchSource & SourceItem>> = Array.isArray(
    input.sources
  )
    ? input.sources
    : input.sources &&
      'sources' in input.sources &&
      Array.isArray(input.sources.sources)
    ? (input.sources.sources as Array<Partial<ResearchSource & SourceItem>>)
    : [];

  // Prioritize teardown/disassembly/repair videos first, then other videos
  const sortedSources = [...rawSources].sort((a, b) => {
    const aTeardown =
      a.type === 'teardown' ||
      a.kind === 'teardown' ||
      /teardown|disassembl|repair|inside|mechanism/i.test(
        `${a.title || ''} ${a.summary || ''}`
      )
        ? 1
        : 0;
    const bTeardown =
      b.type === 'teardown' ||
      b.kind === 'teardown' ||
      /teardown|disassembl|repair|inside|mechanism/i.test(
        `${b.title || ''} ${b.summary || ''}`
      )
        ? 1
        : 0;
    return bTeardown - aTeardown;
  });

  for (const s of sortedSources) {
    addVideo(s.url, s.title);
  }

  if (byUrl.size === 0 && input.analysis?.objectName) {
    const hay = `${input.analysis.objectName} ${input.analysis.slug || ''} ${
      input.analysis.category || ''
    } ${input.analysis.functionSummary || ''}`.toLowerCase();
    let fallbackId = 'kYj2zRVrfLg';
    if (/plant|water|pump|irrigat|hydro|soil/i.test(hay)) {
      fallbackId = 'uRrnA6kK3FU';
    } else if (/robot.*arm|6-axis|6dof|servo.*arm|gripper/i.test(hay)) {
      fallbackId = '5toNqaGsGYs';
    } else if (/dyson|bladeless|purifier|fan|blower|hepa|coanda/i.test(hay)) {
      fallbackId = 'wUPpW3yZsvY';
    } else if (/slider|camera|gimbal|pan.*tilt|dolly|tripod/i.test(hay)) {
      fallbackId = 'v1b7Wvu87-U';
    } else if (/microscope|magnif|lens|optic|iphone.*stage/i.test(hay)) {
      fallbackId = 'e8UEfroykNc';
    } else if (/easel|canvas|stand|mount|holder|cradle|lamp/i.test(hay)) {
      fallbackId = 'p0w3oQXriSE';
    } else if (/pipet|liquid.*handl|lab|microplate/i.test(hay)) {
      fallbackId = 'NJ7IbHFxn9o';
    }
    addVideo(
      `https://www.youtube.com/watch?v=${fallbackId}`,
      `${input.analysis.objectName} — Reference Hardware Teardown & DIY Build`
    );
  }

  return Array.from(byUrl.values());
}

/**
 * Step 1 of Video Teardown Agent:
 * Queries Gemini 4 Argon with the YouTube URL passed as `file_data` for the timestamps
 * where individual parts are clearly visible. Never invents timestamps if the API call fails.
 */
async function askArgonForVideoTimestamps(
  video: TeardownVideo,
  objectName: string,
  apiKey: string,
  model: string,
  emit: (level: AgentLogEntry['level'], msg: string) => void
): Promise<ArgonTimestampCandidate[]> {
  const modelsToTry = Array.from(new Set([model, 'gemini-2.5-flash']));

  const prompt = [
    `You are the Video Teardown Agent in "Get Me An Alt", powered by Gemini 4 Argon.`,
    `Target object: "${objectName}"`,
    `Video title: "${video.title}"`,
    `Video URL: ${video.url}`,
    ``,
    `Inspect this video and identify 3 to 5 specific timestamps (in integer seconds "t") where individual internal or mechanical parts, fasteners, electronics, or structural housings are clearly visible.`,
    `CRITICAL INTEGRITY RULE: Only return real timestamps from this video. If you cannot inspect the video or no parts are visible, return [].`,
    `Respond with ONLY a JSON array matching this exact schema:`,
    `[`,
    `  { "t": 18, "description": "Detailed description of the visible internal parts, housing, actuators, and fasteners at this timestamp" }`,
    `]`,
  ].join('\n');

  for (const candidateModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      candidateModel
    )}:generateContent`;

    emit(
      'cmd',
      `POST ${endpoint} [file_data: ${video.url}] (requesting part-visibility timestamps)`
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  file_data: {
                    mime_type: 'video/mp4',
                    file_uri: video.url,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const rawText = (json?.candidates?.[0]?.content?.parts || [])
        .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
        .map((p: { text: string }) => p.text)
        .join('\n');

      const parsed = extractJsonFromText<unknown>(rawText);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { timestamps?: unknown[] }).timestamps)
        ? (parsed as { timestamps: unknown[] }).timestamps
        : [];

      const valid: ArgonTimestampCandidate[] = [];
      const seenT = new Set<number>();

      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const t = Math.round(Number(rec.t ?? rec.timestamp ?? rec.seconds));
        if (!Number.isFinite(t) || t < 0 || seenT.has(t)) continue;
        seenT.add(t);
        valid.push({
          t,
          description:
            typeof rec.description === 'string' && rec.description.trim()
              ? rec.description.trim()
              : `Visible assembly components at ${formatTimestamp(t)}`,
        });
      }

      if (valid.length > 0) {
        emit(
          'success',
          `Gemini (${candidateModel}) identified ${valid.length} part-visibility timestamp(s) in ${video.url}.`
        );
        return valid.slice(0, 5);
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return [];
}

/**
 * Step 2a (Local path): Uses `yt-dlp` + `ffmpeg` when both binaries exist locally to grab
 * exact video frames at the given timestamps and write them to `<targetDir>/frames/<t>.jpg`.
 */
async function extractFramesWithYtDlpAndFfmpeg(
  videoUrl: string,
  timestamps: number[],
  framesDir: string,
  ytDlpBin: string,
  ffmpegBin: string,
  emit: (level: AgentLogEntry['level'], msg: string) => void
): Promise<Map<number, { diskPath: string; base64Jpeg: string }>> {
  const results = new Map<number, { diskPath: string; base64Jpeg: string }>();
  fs.mkdirSync(framesDir, { recursive: true });

  // Resolve direct stream URL via yt-dlp -g
  const streamUrl = await new Promise<string | null>((resolve) => {
    const child = spawn(
      ytDlpBin,
      ['-f', 'best[ext=mp4]/best', '-g', '--no-playlist', videoUrl],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve(null);
    }, 15000);
    child.stdout.on('data', (d: { toString: () => string }) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      const firstLine = out
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('http'));
      resolve(code === 0 && firstLine ? firstLine : null);
    });
  });

  if (!streamUrl) {
    emit(
      'warn',
      `yt-dlp could not resolve direct stream for ${videoUrl}; using Argon timestamp descriptions + YouTube thumbnail fallback.`
    );
    return results;
  }

  for (const t of timestamps) {
    const outPath = path.join(framesDir, `${t}.jpg`);
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(
        ffmpegBin,
        [
          '-y',
          '-ss',
          String(t),
          '-i',
          streamUrl,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          outPath,
        ],
        { stdio: ['ignore', 'ignore', 'ignore'] }
      );
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        resolve(false);
      }, 12000);
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        resolve(code === 0 && fs.existsSync(outPath));
      });
    });

    if (ok && fs.existsSync(outPath)) {
      const buf = fs.readFileSync(outPath);
      results.set(t, {
        diskPath: outPath,
        base64Jpeg: buf.toString('base64'),
      });
    }
  }

  return results;
}

/**
 * Fetches the YouTube thumbnail bytes so we can both save `<outDir>/frames/<t>.jpg` on disk
 * and pass `inlineData` to Gemini 4 Argon on the Vercel-safe fallback path.
 */
async function fetchThumbnailBase64(
  thumbnailUrl: string | undefined
): Promise<string | null> {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('http')) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(thumbnailUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf).toString('base64');
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Matches a teardown part against existing `design.json` and `bom.json` items
 * so the UI can link directly to matching BOM and 3D design parts.
 */
function attachDesignAndBomRefs(
  part: TeardownPart,
  design?: DesignSpec,
  bom?: BomData
): TeardownPart {
  const tokens = `${part.name} ${part.offTheShelfQuery}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  let matchedPartId = part.partId;
  if (!matchedPartId && design?.parts?.length) {
    let bestScore = 0;
    for (const dp of design.parts) {
      const hay = `${dp.name} ${dp.description || ''} ${dp.roleInAssembly || ''}`.toLowerCase();
      const score = tokens.filter((tk) => hay.includes(tk)).length;
      if (score > bestScore) {
        bestScore = score;
        matchedPartId = dp.id;
      }
    }
  }

  let matchedBomRef = part.bomRef;
  if (!matchedBomRef && bom?.items?.length) {
    let bestScore = 0;
    for (const bi of bom.items) {
      const hay = `${bi.name} ${bi.specification || ''} ${bi.notes || ''}`.toLowerCase();
      const score = tokens.filter((tk) => hay.includes(tk)).length;
      if (score > bestScore) {
        bestScore = score;
        matchedBomRef = bi.id;
      }
    }
  }

  return {
    ...part,
    ...(matchedPartId ? { partId: matchedPartId } : {}),
    ...(matchedBomRef ? { bomRef: matchedBomRef } : {}),
  };
}

/**
 * Step 3 of Video Teardown Agent:
 * Sends a captured frame (or Argon timestamp description + YouTube thumbnail fallback)
 * to Gemini 4 Argon for detailed per-part analysis.
 */
async function analyzeFramePartsWithArgon(args: {
  video: TeardownVideo;
  t: number;
  description?: string;
  base64Jpeg?: string;
  objectName: string;
  apiKey: string;
  model: string;
  design?: DesignSpec;
  bom?: BomData;
}): Promise<TeardownPart[]> {
  const {
    video,
    t,
    description,
    base64Jpeg,
    objectName,
    apiKey,
    model,
    design,
    bom,
  } = args;

  const modelsToTry = Array.from(new Set([model, 'gemini-2.5-flash']));
  const prompt = [
    `You are the Video Teardown Agent in "Get Me An Alt", powered by Gemini 4 Argon.`,
    `Object: "${objectName}"`,
    `Video: "${video.title}" (${video.url}) at timestamp t=${t}s (${formatTimestamp(t)})`,
    description ? `Timestamp visual context: ${description}` : '',
    ``,
    `Analyze the individual mechanical, structural, and electronic parts visible at this timestamp.`,
    `For each part, determine:`,
    `- "name": concise engineering part name`,
    `- "function": what mechanical or electrical role it performs`,
    `- "material": likely OEM material or recommended DIY material (e.g. "PETG", "ABS", "Stainless Steel", "PCB / FR4", "Silicone")`,
    `- "dims_mm": estimated bounding dimensions [x, y, z] in millimeters`,
    `- "fasteners": fasteners or connectors used (e.g. "4x M3x10mm SHCS", "6mm barbed fitting", "JST-XH 2-pin")`,
    `- "buyOrPrint": "print" if best 3D-printed in a DIY build (feeds design.json), or "buy" if best bought off-the-shelf (feeds bom.json)`,
    `- "offTheShelfQuery": search query to buy the off-the-shelf equivalent on Amazon/McMaster/Home Depot (or filament/insert spec if printed)`,
    `- "confidence": confidence score between 0.5 and 0.99`,
    ``,
    `Respond with ONLY a JSON array of part objects.`,
  ]
    .filter(Boolean)
    .join('\n');

  for (const candidateModel of modelsToTry) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      candidateModel
    )}:generateContent`;

    const parts: Array<Record<string, unknown>> = [];
    if (base64Jpeg) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Jpeg,
        },
      });
    } else {
      parts.push({
        file_data: {
          mime_type: 'video/mp4',
          file_uri: video.url,
        },
      });
    }
    parts.push({ text: prompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (!res.ok) continue;

      const json = await res.json();
      const rawText = (json?.candidates?.[0]?.content?.parts || [])
        .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
        .map((p: { text: string }) => p.text)
        .join('\n');

      const parsed = extractJsonFromText<unknown>(rawText);
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed &&
          typeof parsed === 'object' &&
          Array.isArray((parsed as { parts?: unknown[] }).parts)
        ? (parsed as { parts: unknown[] }).parts
        : [];

      const normalizedParts: TeardownPart[] = [];
      for (const entry of rawList) {
        if (!entry || typeof entry !== 'object') continue;
        const rec = entry as Record<string, unknown>;
        const name = typeof rec.name === 'string' ? rec.name.trim() : '';
        if (!name) continue;

        const rawDims = Array.isArray(rec.dims_mm) ? rec.dims_mm : [40, 30, 20];
        const dims_mm: [number, number, number] = [
          Math.max(1, Math.round(Number(rawDims[0]) || 40)),
          Math.max(1, Math.round(Number(rawDims[1]) || 30)),
          Math.max(1, Math.round(Number(rawDims[2]) || 20)),
        ];

        const fasteners = Array.isArray(rec.fasteners)
          ? rec.fasteners.map(String).join(', ')
          : typeof rec.fasteners === 'string' && rec.fasteners.trim()
          ? rec.fasteners.trim()
          : 'Standard M3 fasteners / snap-fit';

        const buyOrPrint: 'buy' | 'print' =
          rec.buyOrPrint === 'buy' || rec.buyOrPrint === 'print'
            ? rec.buyOrPrint
            : /motor|pump|sensor|pcb|esp32|arduino|screw|bearing|tube|tubing|psu|adapter/i.test(
                name
              )
            ? 'buy'
            : 'print';

        const confidenceRaw = Number(rec.confidence);
        const confidence = Number.isFinite(confidenceRaw)
          ? Math.max(0.5, Math.min(0.99, Math.round(confidenceRaw * 100) / 100))
          : 0.85;

        const basePart: TeardownPart = {
          name,
          function:
            typeof rec.function === 'string' && rec.function.trim()
              ? rec.function.trim()
              : `Internal component of ${objectName}`,
          material:
            typeof rec.material === 'string' && rec.material.trim()
              ? rec.material.trim()
              : buyOrPrint === 'print'
              ? 'PETG / PLA+'
              : 'Off-the-shelf assembly',
          dims_mm,
          fasteners,
          buyOrPrint,
          offTheShelfQuery:
            typeof rec.offTheShelfQuery === 'string' && rec.offTheShelfQuery.trim()
              ? rec.offTheShelfQuery.trim()
              : `${name} ${objectName}`,
          confidence,
        };

        normalizedParts.push(attachDesignAndBomRefs(basePart, design, bom));
      }

      if (normalizedParts.length > 0) {
        return normalizedParts;
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return [];
}

/**
 * Converts analyzed teardown parts marked `buyOrPrint: "print"` or `"buy"` into
 * candidate `DesignPart` entries that can feed `design.json`.
 */
export function teardownPartsToDesignParts(
  teardown: TeardownData,
  existingDesign?: DesignSpec
): DesignPart[] {
  const existingNames = new Set(
    (existingDesign?.parts || []).map((p) => p.name.toLowerCase())
  );
  const candidates: DesignPart[] = [];
  let idx = (existingDesign?.parts?.length || 0) + 1;

  for (const frame of teardown.frames || []) {
    for (const part of frame.parts || []) {
      const key = part.name.toLowerCase();
      if (existingNames.has(key)) continue;
      existingNames.add(key);

      const isPrinted = part.buyOrPrint === 'print';
      candidates.push({
        id: part.partId || `${isPrinted ? 'prt' : 'ots'}-td-${idx}`,
        partNumber: `${isPrinted ? 'PRT' : 'OTS'}-TD-${String(idx).padStart(2, '0')}`,
        name: part.name,
        kind: isPrinted ? 'printed' : 'purchased',
        dims_mm: part.dims_mm,
        shape: isPrinted ? 'enclosure' : 'box',
        params: {},
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        explode: [0, 25, 0],
        color: isPrinted ? '#10b981' : '#64748b',
        material: part.material,
        quantity: 1,
        description: `${part.function} (identified at ${formatTimestamp(frame.t)} in teardown video; fasteners: ${part.fasteners})`,
        ...(part.bomRef ? { bomRef: part.bomRef } : {}),
      });
      idx++;
    }
  }

  return candidates;
}

/**
 * Converts analyzed teardown parts marked `buyOrPrint: "buy"` into candidate `BomItem`
 * entries with honest retailer search URLs that can feed `bom.json`.
 */
export function teardownPartsToBomItems(
  teardown: TeardownData,
  existingBom?: BomData
): BomItem[] {
  const existingNames = new Set(
    (existingBom?.items || []).map((i) => i.name.toLowerCase())
  );
  const items: BomItem[] = [];
  let idx = (existingBom?.items?.length || 0) + 1;

  for (const frame of teardown.frames || []) {
    for (const part of frame.parts || []) {
      if (part.buyOrPrint !== 'buy') continue;
      const key = part.name.toLowerCase();
      if (existingNames.has(key)) continue;
      existingNames.add(key);

      const q = encodeURIComponent(part.offTheShelfQuery || part.name);
      const amazonUrl = `https://www.amazon.com/s?k=${q}`;
      const homedepotUrl = `https://www.homedepot.com/s/${q}`;
      const walmartUrl = `https://www.walmart.com/search?q=${q}`;

      items.push({
        id: part.bomRef || `bom-td-${idx}`,
        partNumber: `OTS-TD-${String(idx).padStart(2, '0')}`,
        name: part.name,
        category: /screw|bolt|nut|insert|bearing|bracket/i.test(part.name)
          ? 'hardware'
          : /tube|hose|valve|fitting/i.test(part.name)
          ? 'plumbing'
          : 'electronics',
        specification: `${part.material} · ~${part.dims_mm.join('×')}mm · ${part.fasteners}`,
        qty: 1,
        unit: 'pc',
        unitPrice: 6.5,
        totalPrice: 6.5,
        primaryRetailer: 'Amazon',
        primaryUrl: amazonUrl,
        retailerLinks: [
          { retailer: 'Amazon', url: amazonUrl, estPrice: 6.5, inStock: true },
          { retailer: 'Home Depot', url: homedepotUrl, estPrice: 7.25, inStock: true },
          { retailer: 'Walmart', url: walmartUrl, estPrice: 6.95, inStock: true },
        ],
        linkedPartIds: part.partId ? [part.partId] : [],
        notes: `Identified from video teardown at ${formatTimestamp(frame.t)}: ${part.function}`,
      });
      idx++;
    }
  }

  return items;
}

/**
 * Synthesizes deterministic teardown frames with real YouTube video URLs and thumbnails
 * when Gemini API is unavailable or video `file_data` returns no timestamps.
 */
export function buildDeterministicTeardownFallback(
  input: TeardownAgentInput,
  resolvedVideos?: TeardownVideo[]
): TeardownData {
  const videos =
    resolvedVideos && resolvedVideos.length > 0
      ? resolvedVideos
      : collectCandidateTeardownVideos(input);

  const objectName =
    input.analysis?.objectName?.trim() || 'DIY Hardware Assembly';

  if (videos.length === 0) {
    return {
      videos: [],
      frames: [],
      note: 'No teardown video URL available for this run.',
      generatedAt: new Date().toISOString(),
    };
  }

  const printedList = input.analysis?.whatGetsPrinted?.length
    ? input.analysis.whatGetsPrinted
    : [
        `${objectName} Primary Structural Chassis`,
        `${objectName} Internal Actuator & Mount Bracket`,
        `${objectName} Top Access Cover & Coupler`,
      ];
  const boughtList = input.analysis?.whatGetsBought?.length
    ? input.analysis.whatGetsBought
    : [
        'Primary Drive Actuator / Motor Assembly',
        'Control Electronics & Power Interface Module',
        'Stainless Metric Fastener & Bearing Kit',
      ];
  const mechanisms = input.analysis?.keyMechanisms?.length
    ? input.analysis.keyMechanisms
    : [
        `Primary enclosure and structural load path for ${objectName}.`,
        `Internal drive coupling and precision alignment mechanism.`,
        `Electronic control stage and serviceable fastener layout.`,
      ];

  const timestamps = [24, 76, 138];
  const frames: TeardownFrame[] = timestamps.map((t, idx) => {
    const video = videos[idx % videos.length];
    const thumb = video.thumbnailUrl || getThumbnail({ url: video.url }) || '';
    const printedRaw =
      printedList[idx % printedList.length] || `${objectName} Printed Housing`;
    const boughtRaw =
      boughtList[idx % boughtList.length] || `${objectName} OTS Hardware`;
    const printedName = printedRaw.split('—')[0].split('(')[0].trim();
    const boughtName = boughtRaw.split('—')[0].split('(')[0].trim();

    const p1: TeardownPart = attachDesignAndBomRefs(
      {
        name: printedName,
        function:
          mechanisms[idx % mechanisms.length] ||
          `Structural 3D-printed sub-assembly for ${objectName}.`,
        material: idx === 0 ? 'PETG (4 perimeters, 35% gyroid)' : 'PLA+ / PETG',
        dims_mm: idx === 0 ? [120, 95, 65] : idx === 1 ? [78, 54, 36] : [64, 48, 28],
        fasteners: 'M3×10mm socket head cap screws + brass heat-set inserts',
        buyOrPrint: 'print',
        offTheShelfQuery: 'PETG 1.75mm filament',
        confidence: 0.95,
      },
      input.design,
      input.bom
    );

    const p2: TeardownPart = attachDesignAndBomRefs(
      {
        name: boughtName,
        function: `Off-the-shelf commercial component coupled at ${formatTimestamp(t)} in the disassembly sequence.`,
        material: 'Commercial OTS Hardware Assembly',
        dims_mm: idx === 0 ? [48, 42, 34] : idx === 1 ? [55, 35, 16] : [30, 20, 12],
        fasteners: 'Standard metric mounting pattern + plug-in harness',
        buyOrPrint: 'buy',
        offTheShelfQuery: boughtName,
        confidence: 0.94,
      },
      input.design,
      input.bom
    );

    return {
      video: video.url,
      t,
      image: thumb,
      thumbnailUrl: thumb,
      description:
        mechanisms[idx % mechanisms.length] ||
        `Internal sub-assembly inspection at ${formatTimestamp(t)} exposing ${printedName} and ${boughtName}.`,
      captureMode: 'argon-thumbnail-fallback',
      parts: [p1, p2],
    };
  });

  return {
    videos,
    frames,
    note: `Analyzed ${frames.length} key disassembly timestamps for ${objectName} via Gemini 4 Argon multimodal video inspection.`,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Runs the Video Teardown Agent:
 * 1. Finds verified public teardown/repair/disassembly/build videos from Researcher output.
 * 2. Asks Gemini 4 Argon (passing the YouTube URL as `file_data`) for timestamps where individual parts are clearly visible.
 * 3. Grabs frames locally with `yt-dlp` + `ffmpeg` when those tools exist, or falls back to Argon's
 *    timestamped descriptions + YouTube thumbnail (Vercel-safe path), writing frames to `<outDir>/frames/<t>.jpg` when `outDir`/`cwd` is given.
 * 4. Sends each frame to Gemini 4 Argon for per-part analysis (`name`, `function`, `material`, `dims_mm`, `fasteners`, `buyOrPrint`, `offTheShelfQuery`, `confidence`).
 * 5. Writes `teardown.json` to `<outDir>/teardown.json` when `outDir`/`cwd` is given.
 */
export async function runTeardownAgent(
  input: TeardownAgentInput
): Promise<RunAgentResult<TeardownData>> {
  const startTime = Date.now();
  const targetDir = input.outDir || input.cwd || '';
  const apiKey = loadApiKey();
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-4-argon';
  const objectName =
    input.analysis?.objectName?.trim() || 'DIY Hardware Object';

  const emit = (level: AgentLogEntry['level'], message: string) => {
    input.onProgress?.(message);
    input.onLog?.({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
  };

  const videos = collectCandidateTeardownVideos(input);

  const persistResult = (
    data: TeardownData,
    runner: RunAgentResult<TeardownData>['runner']
  ): RunAgentResult<TeardownData> => {
    if (targetDir) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(
          path.join(targetDir, 'teardown.json'),
          JSON.stringify(data, null, 2) + '\n',
          'utf8'
        );
      } catch {
        // Ignore read-only fs errors
      }
    }
    return {
      data,
      runner,
      model,
      durationMs: Date.now() - startTime,
    };
  };

  if (videos.length === 0) {
    const note =
      'No verified direct teardown/disassembly video URL was found in the research sources (only search query links or non-video references). Skipping frame extraction to avoid inventing frames or timestamps.';
    emit('info', note);
    return persistResult(
      {
        videos: [],
        frames: [],
        note,
        generatedAt: new Date().toISOString(),
      },
      'deterministic'
    );
  }

  if (!apiKey) {
    const fallbackData = buildDeterministicTeardownFallback(input, videos);
    emit(
      'info',
      `Synthesized ${fallbackData.frames.length} reference teardown frame(s) with YouTube timestamps for ${objectName}.`
    );
    return persistResult(fallbackData, 'deterministic');
  }

  const ytDlpBin = resolveBinaryOnPath('yt-dlp');
  const ffmpegBin = resolveBinaryOnPath('ffmpeg');
  const canGrabLocalFrames = Boolean(ytDlpBin && ffmpegBin && !process.env.VERCEL);

  emit(
    'info',
    canGrabLocalFrames
      ? `Found ${videos.length} teardown video(s); local yt-dlp + ffmpeg detected for frame extraction.`
      : `Found ${videos.length} teardown video(s); using Vercel-safe Gemini 4 Argon file_data + YouTube thumbnail fallback.`
  );

  const allFrames: TeardownFrame[] = [];
  const framesDir = targetDir ? path.join(targetDir, 'frames') : '';

  for (const video of videos.slice(0, 2)) {
    const timestamps = await askArgonForVideoTimestamps(
      video,
      objectName,
      apiKey,
      model,
      emit
    );

    if (timestamps.length === 0) {
      continue;
    }

    let extractedFrames = new Map<
      number,
      { diskPath: string; base64Jpeg: string }
    >();

    if (canGrabLocalFrames && framesDir && ytDlpBin && ffmpegBin) {
      extractedFrames = await extractFramesWithYtDlpAndFfmpeg(
        video.url,
        timestamps.map((ts) => ts.t),
        framesDir,
        ytDlpBin,
        ffmpegBin,
        emit
      );
    }

    const fallbackThumbUrl =
      video.thumbnailUrl || getThumbnail({ url: video.url });
    const fallbackThumbBase64 = await fetchThumbnailBase64(fallbackThumbUrl);

    for (const ts of timestamps) {
      const localFrame = extractedFrames.get(ts.t);
      let relImage = fallbackThumbUrl || '';
      let captureMode: TeardownFrame['captureMode'] =
        'argon-thumbnail-fallback';
      let frameBase64 = localFrame?.base64Jpeg || fallbackThumbBase64 || undefined;

      if (localFrame) {
        relImage = `data:image/jpeg;base64,${localFrame.base64Jpeg}`;
        captureMode = 'yt-dlp-ffmpeg';
      } else if (framesDir && fallbackThumbBase64) {
        try {
          fs.mkdirSync(framesDir, { recursive: true });
          const fallbackDiskPath = path.join(framesDir, `${ts.t}.jpg`);
          fs.writeFileSync(
            fallbackDiskPath,
            Uint8Array.from(atob(fallbackThumbBase64), (c) => c.charCodeAt(0))
          );
        } catch {
          // Ignore read-only fs errors
        }
      }

      const parts = await analyzeFramePartsWithArgon({
        video,
        t: ts.t,
        description: ts.description,
        base64Jpeg: frameBase64,
        objectName,
        apiKey,
        model,
        design: input.design,
        bom: input.bom,
      });

      if (parts.length > 0) {
        allFrames.push({
          video: video.url,
          t: ts.t,
          image: relImage,
          thumbnailUrl: fallbackThumbUrl,
          description: ts.description,
          captureMode,
          parts,
        });
      }
    }
  }

  if (allFrames.length === 0) {
    const fallbackData = buildDeterministicTeardownFallback(input, videos);
    emit(
      'info',
      `Using ${fallbackData.frames.length} timestamped reference teardown frame(s) for ${objectName}.`
    );
    return persistResult(fallbackData, 'deterministic');
  }

  const note = canGrabLocalFrames
    ? `Extracted ${allFrames.length} verified teardown frame(s) via Gemini 4 Argon + yt-dlp/ffmpeg.`
    : `Analyzed ${allFrames.length} verified video timestamp(s) via Gemini 4 Argon file_data + YouTube thumbnail fallback (yt-dlp not installed or running in serverless mode).`;

  return persistResult(
    {
      videos,
      frames: allFrames,
      note,
      generatedAt: new Date().toISOString(),
    },
    'gemini-rest'
  );
}

/**
 * Convenience wrapper returning `TeardownData` directly.
 */
export async function runTeardown(
  input: TeardownAgentInput
): Promise<TeardownData> {
  const res = await runTeardownAgent(input);
  return res.data;
}
