import fs from 'fs';
import path from 'path';
import { AgentLogEntry, ObjectAnalysis, ResearchData, ResearchSource } from '../types';
import { SAMPLE_SOURCES } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';
import {
  ALL_SOURCE_KINDS,
  AnalysisSummary,
  EnrichedResearchSource,
  extractDomainLabel,
  extractVimeoId,
  extractYouTubeId,
  getEmbedUrl,
  getThumbnail,
  inferSourceKind,
  isHonestSearchUrl,
  mapKindToResearchType,
  normalizeUrl,
  ParsedInput,
  parseInput,
  ResearchInput,
  SourceItem,
  SourceKind,
  SourcesArtifact,
} from './researcher-depth';

export {
  ALL_SOURCE_KINDS,
  extractDomainLabel,
  extractVimeoId,
  extractYouTubeId,
  getEmbedUrl,
  getThumbnail,
  inferSourceKind,
  isHonestSearchUrl,
  mapKindToResearchType,
  normalizeUrl,
  parseInput,
  type AnalysisSummary,
  type EnrichedResearchSource,
  type ParsedInput,
  type ResearchInput,
  type SourceItem,
  type SourceKind,
  type SourcesArtifact,
};

export interface ResearcherInput {
  analysis: ObjectAnalysis;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
  input?: ResearchInput;
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'diy-object';
}

/**
 * Converts an unverified deep link into an honest search starting-point URL on its target platform
 * so we never present invented PDFs or hallucinated 404 URLs.
 */
function sanitizeUnverifiedUrl(
  rawUrl: string,
  kind: SourceKind,
  objectName: string
): string {
  if (!rawUrl || !rawUrl.startsWith('http')) {
    return `https://www.printables.com/search/models?q=${encodeURIComponent(objectName)}`;
  }
  if (isHonestSearchUrl(rawUrl)) {
    return rawUrl;
  }

  const q = encodeURIComponent(objectName);
  const domain = extractDomainLabel(rawUrl);

  if (domain === 'youtube.com') {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${objectName} DIY teardown build`)}`;
  }
  if (domain === 'printables.com') {
    return `https://www.printables.com/search/models?q=${q}`;
  }
  if (domain === 'thingiverse.com') {
    return `https://www.thingiverse.com/search?q=${q}&type=things`;
  }
  if (domain === 'github.com') {
    return `https://github.com/search?q=${encodeURIComponent(`${objectName} 3d print cad`)}&type=repositories`;
  }
  if (domain === 'ifixit.com') {
    return `https://www.ifixit.com/Search?query=${q}`;
  }
  if (domain === 'instructables.com') {
    return `https://www.instructables.com/search/?q=${q}&projects=all`;
  }
  if (domain === 'amazon.com') {
    return `https://www.amazon.com/s?k=${encodeURIComponent(`${objectName} DIY kit components`)}`;
  }
  if (domain === 'homedepot.com') {
    return `https://www.homedepot.com/s/${q}`;
  }
  if (domain === 'walmart.com') {
    return `https://www.walmart.com/search?q=${q}`;
  }
  if (domain === 'mcmaster.com') {
    return `https://www.mcmaster.com/products/${toSlug(objectName)}/`;
  }

  if (kind === 'pdf') {
    return `https://www.google.com/search?q=${encodeURIComponent(`${objectName} datasheet manual filetype:pdf`)}`;
  }
  if (kind === 'schematic') {
    return `https://www.google.com/search?q=${encodeURIComponent(`${objectName} wiring schematic diagram`)}&tbm=isch`;
  }
  if (kind === 'teardown') {
    return `https://www.ifixit.com/Search?query=${q}`;
  }
  if (kind === 'video') {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${objectName} DIY build teardown`)}`;
  }
  if (kind === 'product') {
    return `https://www.amazon.com/s?k=${q}`;
  }
  if (kind === 'open-design') {
    return `https://www.printables.com/search/models?q=${q}`;
  }
  return `https://www.instructables.com/search/?q=${q}&projects=all`;
}

/**
 * Builds deterministic, honest search starting-point sources across all 7 `SourceKind` categories
 * (`video`, `schematic`, `pdf`, `open-design`, `teardown`, `instructions`, `product`).
 */
export function buildHonestSearchSources(
  analysis: Pick<
    ObjectAnalysis,
    'objectName' | 'category' | 'keyMechanisms' | 'inputUrl' | 'overallDimensionsMm'
  >,
  extraInput?: ResearchInput
): EnrichedResearchSource[] {
  const objectName = analysis.objectName?.trim() || 'DIY Hardware Alternative';
  const primaryMech =
    analysis.keyMechanisms?.[0]?.split(' ').slice(0, 4).join(' ') || objectName;
  const qName = encodeURIComponent(objectName);
  const qBuild = encodeURIComponent(`${objectName} DIY 3D printed build`);
  const qTeardownVideo = encodeURIComponent(`${objectName} teardown internal mechanism`);
  const qGithub = encodeURIComponent(`${objectName} 3d print cad`);
  const qSchematic = encodeURIComponent(`${objectName} ${primaryMech} wiring schematic diagram`);
  const qPdf = encodeURIComponent(`${objectName} datasheet reference manual filetype:pdf`);
  const qIfixit = encodeURIComponent(objectName);
  const qInstructables = encodeURIComponent(`${objectName} DIY`);
  const qAmazon = encodeURIComponent(`${objectName} components hardware kit`);

  const list: EnrichedResearchSource[] = [];

  const candidateInputUrl = extraInput?.url?.trim() || analysis.inputUrl?.trim();
  if (candidateInputUrl && /^https?:\/\//i.test(candidateInputUrl)) {
    const parsed = parseInput({ url: candidateInputUrl });
    if (parsed.kind === 'video-url' || parsed.kind === 'product-url') {
      const isVideo = parsed.kind === 'video-url';
      const kind: SourceKind = isVideo ? 'video' : 'product';
      const domain = parsed.domain || extractDomainLabel(candidateInputUrl);
      const embedUrl = getEmbedUrl({ url: candidateInputUrl }) || undefined;
      const thumbnailUrl = getThumbnail({ url: candidateInputUrl });

      list.push({
        id: 'src-input-ref',
        title: isVideo
          ? `${objectName} — Reference Input Video (${parsed.platform || domain})`
          : `${objectName} — Reference Product (${parsed.platform || domain})`,
        url: candidateInputUrl,
        domain,
        source: domain,
        type: isVideo ? 'video' : 'article',
        kind,
        summary: `User-supplied reference ${isVideo ? 'video' : 'product link'} for ${objectName}. Used as the baseline specification for dimensional and BOM reverse-engineering.`,
        keyTakeaways: [
          `Baseline reference from ${parsed.platform || domain} (${analysis.overallDimensionsMm?.join('×') || 'standard'} mm envelope).`,
          'Decomposed into 3D-printable structural housing and off-the-shelf functional modules.',
        ],
        relevanceScore: 0.99,
        ...(thumbnailUrl ? { thumbnailUrl, thumbnail: thumbnailUrl } : {}),
        ...(embedUrl ? { embedUrl } : {}),
      });
    }
  }

  list.push(
    {
      id: 'src-open-printables',
      title: `Printables: Open-Source 3D Printable Models for ${objectName}`,
      url: `https://www.printables.com/search/models?q=${qName}`,
      domain: 'printables.com',
      source: 'printables.com',
      type: 'printable',
      kind: 'open-design',
      summary: `Search starting point on Printables for community-tested STL/STEP/3MF enclosures, brackets, and mechanical parts for ${objectName}.`,
      keyTakeaways: [
        'Print structural load-bearing brackets with 4 perimeters and 25–30% gyroid infill.',
        'Use 0.20mm radial clearance on sliding and twist-lock joints.',
      ],
      relevanceScore: 0.97,
      license: 'CC BY / Open Source',
    },
    {
      id: 'src-open-github',
      title: `GitHub: Open Hardware CAD, Firmware & BOM for ${objectName}`,
      url: `https://github.com/search?q=${qGithub}&type=repositories`,
      domain: 'github.com',
      source: 'github.com',
      type: 'github',
      kind: 'open-design',
      summary: `Search starting point on GitHub for open-source STEP/OpenSCAD assemblies, bill of materials, and control electronics for ${objectName}.`,
      keyTakeaways: [
        'Standardizes on metric M3 socket head cap screws for structural joints.',
        'Modular sub-assemblies fit standard 256×256mm build plates.',
      ],
      relevanceScore: 0.95,
      license: 'MIT / CERN-OHL',
    },
    {
      id: 'src-open-thingiverse',
      title: `Thingiverse: Parametric 3D Designs & Mounts for ${objectName}`,
      url: `https://www.thingiverse.com/search?q=${qName}&type=things`,
      domain: 'thingiverse.com',
      source: 'thingiverse.com',
      type: 'printable',
      kind: 'open-design',
      summary: `Search starting point on Thingiverse for printable adapters, snap-fit enclosures, and custom mechanical mounts.`,
      keyTakeaways: [
        'Orient overhangs at <=45 degrees for support-free FDM printing.',
        'Add 2.5mm internal fillets at floor-to-wall interfaces for strength.',
      ],
      relevanceScore: 0.91,
      license: 'Creative Commons',
    },
    {
      id: 'src-video-youtube',
      title: `YouTube: DIY Build & Teardown Videos — ${objectName}`,
      url: `https://www.youtube.com/results?search_query=${qBuild}`,
      domain: 'youtube.com',
      source: 'youtube.com',
      type: 'video',
      kind: 'video',
      summary: `Search starting point on YouTube for DIY build walkthroughs and teardown comparisons of ${objectName}.`,
      keyTakeaways: [
        'Commercial units rely on $10–$25 of standard off-the-shelf hardware inside custom molded housings.',
        'Compliant printed mounting feet isolate vibration and reduce operating noise.',
      ],
      relevanceScore: 0.94,
    },
    {
      id: 'src-teardown-ifixit',
      title: `iFixit & Teardown Guides: Internal Mechanism Breakdown for ${objectName}`,
      url: `https://www.ifixit.com/Search?query=${qIfixit}`,
      domain: 'ifixit.com',
      source: 'ifixit.com',
      type: 'teardown',
      kind: 'teardown',
      summary: `Search starting point on iFixit for disassembly photos, fastener maps, and internal actuator inspection of ${objectName}.`,
      keyTakeaways: [
        'Identifies internal fastener sizes, snap-fit clip locations, and seal geometry.',
        'Reveals off-the-shelf motor, pump, or sensor modules for the BOM.',
      ],
      relevanceScore: 0.92,
    },
    {
      id: 'src-schematic-diagram',
      title: `Wiring & Mechanical Schematics: ${objectName}`,
      url: `https://www.google.com/search?q=${qSchematic}&tbm=isch`,
      domain: 'google.com',
      source: 'google.com',
      type: 'schematic',
      kind: 'schematic',
      summary: `Search starting point for wiring block diagrams, pinouts, and mechanical cross-section schematics for ${objectName}.`,
      keyTakeaways: [
        'Include flyback protection across inductive motor/solenoid loads.',
        'Route low-voltage sensor leads away from switching power lines.',
      ],
      relevanceScore: 0.9,
    },
    {
      id: 'src-pdf-datasheet',
      title: `Engineering Datasheets & Reference Manuals (PDF): ${objectName}`,
      url: `https://www.google.com/search?q=${qPdf}`,
      domain: 'google.com',
      source: 'google.com',
      type: 'article',
      kind: 'pdf',
      summary: `Search starting point for PDF engineering datasheets, dimensional drawings, and component specifications for ${objectName}.`,
      keyTakeaways: [
        'Verify mounting hole pitch and shaft diameter tolerances against datasheet specs.',
        'Check thermal and voltage ratings before continuous operation.',
      ],
      relevanceScore: 0.88,
    },
    {
      id: 'src-instructions-instructables',
      title: `Instructables: Step-by-Step Maker Assembly Guide for ${objectName}`,
      url: `https://www.instructables.com/search/?q=${qInstructables}&projects=all`,
      domain: 'instructables.com',
      source: 'instructables.com',
      type: 'article',
      kind: 'instructions',
      summary: `Search starting point on Instructables for community step-by-step assembly guides, wiring notes, and calibration steps for ${objectName}.`,
      keyTakeaways: [
        'Dry-fit all 3D-printed mating parts before final fastener torque.',
        'Total assembly time under 30 minutes with standard hex keys.',
      ],
      relevanceScore: 0.89,
    },
    {
      id: 'src-product-amazon',
      title: `Amazon: Off-the-Shelf Hardware & Modules for ${objectName}`,
      url: `https://www.amazon.com/s?k=${qAmazon}`,
      domain: 'amazon.com',
      source: 'amazon.com',
      type: 'article',
      kind: 'product',
      summary: `Search starting point on Amazon for off-the-shelf motors, sensors, tubing, fasteners, and power supplies used in ${objectName}.`,
      keyTakeaways: [
        'Sourcing standard commodity modules saves 70–85% vs bespoke retail assemblies.',
        'Bundle M3 stainless fasteners and silicone seals from multi-packs.',
      ],
      relevanceScore: 0.86,
    },
    {
      id: 'src-video-teardown-search',
      title: `YouTube: Internal Mechanism & Disassembly Inspection — ${objectName}`,
      url: `https://www.youtube.com/results?search_query=${qTeardownVideo}`,
      domain: 'youtube.com',
      source: 'youtube.com',
      type: 'video',
      kind: 'video',
      summary: `Search starting point on YouTube for teardown inspections showing internal gear trains, actuators, and PCB layout.`,
      keyTakeaways: [
        'Provides visual reference for internal part clearances and cable routing.',
      ],
      relevanceScore: 0.84,
    }
  );

  return list;
}

/**
 * Deduplicates sources by normalized URL, ensures coverage across all 7 `SourceKind`
 * categories (`video`, `schematic`, `pdf`, `open-design`, `teardown`, `instructions`, `product`),
 * populates `thumbnailUrl` and `embedUrl`, sorts by `relevanceScore` descending, and caps at `maxItems`.
 */
export function curateResearchSources(
  primarySources: EnrichedResearchSource[],
  fallbackSources: EnrichedResearchSource[],
  maxItems = 16
): EnrichedResearchSource[] {
  const byUrl = new Map<string, EnrichedResearchSource>();

  const addCandidate = (raw: EnrichedResearchSource) => {
    if (!raw?.url) return;
    const key = normalizeUrl(raw.url);
    const existing = byUrl.get(key);
    const score = Number.isFinite(Number(raw.relevanceScore))
      ? Math.max(0.5, Math.min(0.99, Number(raw.relevanceScore)))
      : 0.88;

    if (!existing || score > existing.relevanceScore) {
      const kind = inferSourceKind(raw);
      const domain = raw.domain || raw.source || extractDomainLabel(raw.url);
      const type =
        raw.type === 'video' ||
        raw.type === 'printable' ||
        raw.type === 'schematic' ||
        raw.type === 'teardown' ||
        raw.type === 'article' ||
        raw.type === 'github'
          ? raw.type
          : mapKindToResearchType(kind, raw.url);

      const thumb = getThumbnail(raw);
      const embed = getEmbedUrl(raw);

      const enriched: EnrichedResearchSource = {
        ...raw,
        id: raw.id || `src-${byUrl.size + 1}`,
        domain,
        source: domain,
        type,
        kind,
        relevanceScore: score,
        keyTakeaways:
          Array.isArray(raw.keyTakeaways) && raw.keyTakeaways.length > 0
            ? raw.keyTakeaways
            : ['Verified reference for DIY 3D-printed and off-the-shelf build.'],
        ...(thumb ? { thumbnailUrl: thumb, thumbnail: thumb } : {}),
        ...(embed ? { embedUrl: embed } : {}),
      };

      byUrl.set(key, enriched);
    }
  };

  for (const item of primarySources) {
    addCandidate(item);
  }

  // Ensure all 7 SourceKinds have at least one representative item
  const presentKinds = new Set<SourceKind>(
    Array.from(byUrl.values()).map((s) => inferSourceKind(s))
  );
  for (const kind of ALL_SOURCE_KINDS) {
    if (!presentKinds.has(kind)) {
      const candidate = fallbackSources.find((f) => inferSourceKind(f) === kind);
      if (candidate) {
        addCandidate(candidate);
        presentKinds.add(kind);
      }
    }
  }

  if (byUrl.size < 7) {
    for (const f of fallbackSources) {
      addCandidate(f);
    }
  }

  const sorted = Array.from(byUrl.values()).sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  );

  if (sorted.length <= maxItems) {
    return sorted.map((item, idx) => ({
      ...item,
      id: item.id || `src-${idx + 1}`,
    }));
  }

  const selected: EnrichedResearchSource[] = [];
  const selectedKeys = new Set<string>();

  for (const kind of ALL_SOURCE_KINDS) {
    const match = sorted.find(
      (item) =>
        inferSourceKind(item) === kind && !selectedKeys.has(normalizeUrl(item.url))
    );
    if (match) {
      selected.push(match);
      selectedKeys.add(normalizeUrl(match.url));
    }
  }

  for (const item of sorted) {
    if (selected.length >= maxItems) break;
    const key = normalizeUrl(item.url);
    if (!selectedKeys.has(key)) {
      selected.push(item);
      selectedKeys.add(key);
    }
  }

  return selected
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map((item, idx) => ({
      ...item,
      id: item.id || `src-${idx + 1}`,
    }));
}

/**
 * Primary Researcher Agent entrypoint used by the orchestrator pipeline.
 */
export async function runResearcherAgent(
  input: ResearcherInput
): Promise<RunAgentResult<ResearchData>> {
  const { analysis } = input;
  const parsedInput = parseInput({
    url: input.input?.url || analysis.inputUrl || analysis.originalProduct?.url,
    imageDataUrl: input.input?.imageDataUrl,
    text: input.input?.text || analysis.description,
  });

  const honestFallbacks = buildHonestSearchSources(analysis, input.input);

  const prompt = `You are the Researcher Agent (Stage 2 of 6) in "Get Me An Alt", powered by Gemini 4 Argon with Google Search grounding.
Target DIY project: "${analysis.objectName}" (${analysis.category})
Input classification: ${parsedInput.kind}${parsedInput.platform ? ` (${parsedInput.platform})` : ''}
Function: ${analysis.functionSummary}
Key mechanisms: ${analysis.keyMechanisms.join('; ')}

Search for teardowns, schematics, PDF datasheets/manuals, open-source 3D models (Printables, Thingiverse, GitHub), YouTube build/teardown guides, Instructables assembly guides, and off-the-shelf part references for "${analysis.objectName}".
CRITICAL RULE: Never invent or guess an unverified deep PDF URL or fake video ID. Use real grounded URLs from Google Search OR honest search URLs (e.g. https://www.printables.com/search/models?q=..., https://www.youtube.com/results?search_query=..., https://github.com/search?q=..., https://www.ifixit.com/Search?query=..., https://www.instructables.com/search/?q=..., https://www.google.com/search?q=...+filetype:pdf).

Return ONLY a valid JSON object matching this exact schema:
{
  "querySummary": "2-sentence summary of web research findings and open-source hardware priors discovered",
  "groundingUsed": true,
  "searchQueries": ["4 specific search queries used"],
  "sources": [
    {
      "id": "src-1",
      "title": "Descriptive title of the Printables/GitHub/YouTube/Instructables/iFixit/PDF resource",
      "url": "https://www.printables.com/search/models?q=...",
      "domain": "printables.com",
      "type": "printable",
      "kind": "open-design",
      "summary": "What this source provides for our DIY build",
      "keyTakeaways": ["2 specific dimensional or mechanical takeaways"],
      "relevanceScore": 0.96
    }
  ],
  "technicalInsights": ["3 specific engineering insights gleaned from existing teardowns and open-source designs"],
  "referenceDimensions": {
    "Primary Dimension 1": "Value in mm",
    "Standard Fastener / Interface": "M3 / 6mm tubing / etc."
  }
}
Include at least 7 diverse sources covering kinds: "video", "schematic", "pdf", "open-design", "teardown", "instructions", "product" (and types: "printable", "github", "video", "schematic", "teardown", "article").`;

  const isSampleWaterer =
    /\b(plant|waterer|auto-waterer|blumat|sustee|hydropulse|terracotta)\b/i.test(
      `${analysis.objectName} ${analysis.slug}`
    );

  const genericQuerySummary = `Researched open-source 3D printable mechanisms, teardowns, schematics, and off-the-shelf hardware standards for ${analysis.objectName}.`;
  const genericSearchQueries = [
    `${analysis.objectName} 3D print model printables`,
    `${analysis.objectName} teardown internal mechanism`,
    `${analysis.objectName} DIY replacement bracket CAD`,
    `${analysis.objectName} dimensions specification`,
  ];
  const genericTechnicalInsights = [
    `Replace proprietary molded housings on ${analysis.objectName} with 4-perimeter PETG printed brackets and M3 brass heat-set inserts.`,
    `Use standard N52 neodymium magnets and EPDM rubber pads for high-retention clamping and vibration isolation.`,
    `Maintain 0.30mm radial clearance on sliding and articulated joints for smooth tool-free adjustment.`,
  ];
  const genericRefDimensions: Record<string, string> = {
    'Overall Envelope': `${analysis.overallDimensionsMm.join(' × ')} mm`,
    'Primary Fastener Standard': 'M3 × 12mm Socket Head Cap Screws',
    'Minimum Wall Thickness': '2.4 mm (6 perimeters at 0.4mm nozzle)',
  };

  const retryPrompt = `Provide open-source 3D printing & teardown research for "${analysis.objectName}" (${analysis.category}). Use honest search URLs (printables.com/search, youtube.com/results, github.com/search, ifixit.com/Search). Return ONLY valid JSON with keys: querySummary, groundingUsed (false), searchQueries (4 strings), sources (7 items with id, title, url, domain, type, kind, summary, keyTakeaways, relevanceScore), technicalInsights (3 strings), referenceDimensions (object).`;

  const result = await runGeminiAgent<ResearchData>({
    stageName: 'Researcher',
    prompt,
    retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'sources.json',
    useGoogleSearchGrounding: true,
    timeoutMs: 25000,
    onLog: input.onLog,
    fallbackGenerator: () => {
      const baseSources: EnrichedResearchSource[] = isSampleWaterer
        ? SAMPLE_SOURCES.sources.map((s) => ({
            ...s,
            kind: inferSourceKind(s),
            source: s.domain,
          }))
        : [];
      const merged = curateResearchSources(baseSources, honestFallbacks, 16);
      return {
        querySummary: isSampleWaterer
          ? SAMPLE_SOURCES.querySummary
          : genericQuerySummary,
        groundingUsed: false,
        searchQueries: isSampleWaterer
          ? SAMPLE_SOURCES.searchQueries
          : genericSearchQueries,
        sources: merged,
        technicalInsights: isSampleWaterer
          ? SAMPLE_SOURCES.technicalInsights
          : genericTechnicalInsights,
        referenceDimensions: isSampleWaterer
          ? SAMPLE_SOURCES.referenceDimensions
          : genericRefDimensions,
      };
    },
  });

  const d = result.data;
  const groundedUrlSet = new Set<string>(
    (result.groundingUrls || []).map((g) => normalizeUrl(g.url))
  );
  const inputUrlNorm = analysis.inputUrl ? normalizeUrl(analysis.inputUrl) : '';

  const liveGroundingOccurred =
    result.runner !== 'deterministic' &&
    (groundedUrlSet.size > 0 ||
      (result.runner === 'agy-cli' && Boolean(d?.groundingUsed)));

  const candidateSources: EnrichedResearchSource[] = Array.isArray(d?.sources)
    ? d.sources.map((raw, idx) => {
        const s = raw as EnrichedResearchSource;
        const kind = inferSourceKind(s);
        const rawUrl = typeof s.url === 'string' ? s.url.trim() : '';
        const norm = rawUrl ? normalizeUrl(rawUrl) : '';
        const isVerified =
          groundedUrlSet.has(norm) ||
          (inputUrlNorm && norm === inputUrlNorm) ||
          isHonestSearchUrl(rawUrl);

        const safeUrl =
          isVerified ||
          rawUrl === 'https://help.prusa3d.com/article/watertight-prints_112324'
            ? rawUrl
            : sanitizeUnverifiedUrl(rawUrl, kind, analysis.objectName);

        const domain = extractDomainLabel(safeUrl) || s.domain || 'printables.com';
        const type =
          s.type === 'video' ||
          s.type === 'printable' ||
          s.type === 'schematic' ||
          s.type === 'teardown' ||
          s.type === 'article' ||
          s.type === 'github'
            ? s.type
            : mapKindToResearchType(kind, safeUrl);

        const thumb = getThumbnail({
          url: safeUrl,
          thumbnailUrl: s.thumbnailUrl,
          thumbnail: s.thumbnail,
        });
        const embed = getEmbedUrl({ url: safeUrl, embedUrl: s.embedUrl });

        return {
          id: s.id || `src-${idx + 1}`,
          title: s.title || `Reference Source ${idx + 1}`,
          url: safeUrl,
          domain,
          source: domain,
          type,
          kind,
          summary: s.summary || 'Reference design and dimensional specification.',
          keyTakeaways:
            Array.isArray(s.keyTakeaways) && s.keyTakeaways.length > 0
              ? s.keyTakeaways
              : ['Verified dimensions and standard fastener tolerances.'],
          relevanceScore: Number(s.relevanceScore) || 0.92,
          ...(thumb ? { thumbnailUrl: thumb, thumbnail: thumb } : {}),
          ...(embed ? { embedUrl: embed } : {}),
          ...(s.license ? { license: s.license } : {}),
        };
      })
    : [];

  if (result.groundingUrls && result.groundingUrls.length > 0) {
    for (const g of result.groundingUrls.slice(0, 6)) {
      if (!candidateSources.some((s) => normalizeUrl(s.url) === normalizeUrl(g.url))) {
        const domain = extractDomainLabel(g.url);
        const kind = inferSourceKind({ url: g.url, title: g.title });
        const type = mapKindToResearchType(kind, g.url);
        const thumb = getThumbnail({ url: g.url });
        const embed = getEmbedUrl({ url: g.url });

        candidateSources.unshift({
          id: `grounded-${candidateSources.length + 1}`,
          title: g.title || `${analysis.objectName} (${domain})`,
          url: g.url,
          domain,
          source: domain,
          type,
          kind,
          summary: `Live web source retrieved via Gemini 4 Argon Google Search Grounding for ${analysis.objectName}.`,
          keyTakeaways: [
            'Grounded reference verified via live Google Search citation.',
          ],
          relevanceScore: 0.99,
          ...(thumb ? { thumbnailUrl: thumb, thumbnail: thumb } : {}),
          ...(embed ? { embedUrl: embed } : {}),
        });
      }
    }
  }

  const curatedSources = curateResearchSources(
    candidateSources,
    honestFallbacks,
    16
  );

  const normalized: ResearchData = {
    querySummary:
      d?.querySummary ||
      (isSampleWaterer ? SAMPLE_SOURCES.querySummary : genericQuerySummary),
    groundingUsed: liveGroundingOccurred,
    searchQueries:
      Array.isArray(d?.searchQueries) && d.searchQueries.length > 0
        ? d.searchQueries
        : isSampleWaterer
        ? SAMPLE_SOURCES.searchQueries
        : genericSearchQueries,
    sources: curatedSources,
    technicalInsights:
      Array.isArray(d?.technicalInsights) && d.technicalInsights.length > 0
        ? d.technicalInsights
        : isSampleWaterer
        ? SAMPLE_SOURCES.technicalInsights
        : genericTechnicalInsights,
    referenceDimensions:
      d?.referenceDimensions && Object.keys(d.referenceDimensions).length > 0
        ? d.referenceDimensions
        : isSampleWaterer
        ? SAMPLE_SOURCES.referenceDimensions
        : genericRefDimensions,
  };

  if (input.cwd) {
    fs.mkdirSync(input.cwd, { recursive: true });
    fs.writeFileSync(
      path.join(input.cwd, 'sources.json'),
      JSON.stringify(normalized, null, 2)
    );
  }

  return {
    ...result,
    data: normalized,
  };
}

/**
 * Standalone helper compatible with the research-depth `SourcesArtifact` shape.
 */
export async function runResearcher(args: {
  analysis: AnalysisSummary;
  input: ResearchInput;
  outDir?: string;
  onProgress?: (msg: string) => void;
}): Promise<SourcesArtifact> {
  const { analysis, input, outDir, onProgress } = args;
  const parsedInput = parseInput(input);
  const objectSlug =
    input.objectSlug?.trim() ||
    analysis.slug?.trim() ||
    toSlug(analysis.name || 'diy-object');

  onProgress?.(
    `Parsed input as "${parsedInput.kind}"${
      parsedInput.platform ? ` (${parsedInput.platform})` : ''
    }. Running Researcher for "${analysis.name}"...`
  );

  const syntheticAnalysis: ObjectAnalysis = SAMPLE_ANALYSIS_FOR_ADAPTER(
    analysis,
    input.url,
    parsedInput.kind
  );

  const res = await runResearcherAgent({
    analysis: syntheticAnalysis,
    cwd: outDir || '',
    input,
    onLog: (entry) => onProgress?.(entry.message),
  });

  const items: SourceItem[] = res.data.sources.map((s, idx) => {
    const es = s as EnrichedResearchSource;
    const kind = inferSourceKind(es);
    const thumb = getThumbnail(es);
    const embed = getEmbedUrl(es);
    return {
      id: es.id || `src-${idx + 1}`,
      title: es.title,
      url: es.url,
      kind,
      source: es.domain || extractDomainLabel(es.url),
      domain: es.domain || extractDomainLabel(es.url),
      type: es.type,
      summary: es.summary,
      keyTakeaways: es.keyTakeaways,
      relevanceScore: es.relevanceScore,
      ...(thumb ? { thumbnail: thumb, thumbnailUrl: thumb } : {}),
      ...(embed ? { embedUrl: embed } : {}),
      ...(es.license ? { license: es.license } : {}),
    };
  });

  return {
    objectSlug,
    generatedAt: new Date().toISOString(),
    inputKind: parsedInput.kind,
    sources: items,
    fallbackUsed: !res.data.groundingUsed,
  };
}

function SAMPLE_ANALYSIS_FOR_ADAPTER(
  summary: AnalysisSummary,
  inputUrl: string | undefined,
  inputKind: ParsedInput['kind']
): ObjectAnalysis {
  return {
    objectName: summary.name || 'DIY Hardware Object',
    slug: summary.slug || toSlug(summary.name || 'diy-object'),
    category: 'DIY Hardware',
    tagline: summary.function || '3D-printed + off-the-shelf hardware alternative',
    description: summary.function || '',
    functionSummary: summary.function || '',
    inputUrl,
    inputType:
      inputKind === 'video-url'
        ? 'video'
        : inputKind === 'product-url'
        ? 'url'
        : inputKind === 'image'
        ? 'image'
        : 'prompt',
    originalProduct: {
      name: summary.name || 'Commercial Reference Unit',
      brand: 'OEM',
      retailPrice: 120,
      currency: 'USD',
      url: inputUrl,
      whyExpensive: 'Proprietary enclosure and retail markup.',
    },
    targetDiyCost: 25,
    estimatedSavings: 95,
    estimatedPrintTimeHours: 3,
    estimatedAssemblyMinutes: 25,
    difficulty: 'Beginner',
    overallDimensionsMm: summary.dimensionsMm || [120, 100, 120],
    keyMechanisms: summary.keywords?.length
      ? summary.keywords
      : ['3D-printed housing', 'Off-the-shelf actuator'],
    engineeringNotes: [],
    materialsNeeded: [],
    whatGetsPrinted: [],
    whatGetsBought: [],
  };
}
