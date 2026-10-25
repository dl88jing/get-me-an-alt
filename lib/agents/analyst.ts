import fs from 'fs';
import path from 'path';
import { AgentLogEntry, ObjectAnalysis } from '../types';
import { SAMPLE_ANALYSIS } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';

export interface AnalystInput {
  prompt?: string;
  url?: string;
  imageName?: string;
  inlineImage?: {
    mimeType: string;
    base64Data: string;
  };
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'diy-gadget'
  );
}

const KNOWN_BRAND_MAP: Record<string, string> = {
  peakdesign: 'Peak Design',
  ergotron: 'Ergotron',
  dyson: 'Dyson',
  apple: 'Apple',
  logitech: 'Logitech',
  elgato: 'Elgato',
  anker: 'Anker',
  smallrig: 'SmallRig',
  joby: 'Joby',
  lumecube: 'Lume Cube',
  rammount: 'RAM Mounts',
  quadlock: 'Quad Lock',
   quadlockcase: 'Quad Lock',
  bambulab: 'Bambu Lab',
  prusa3d: 'Prusa',
  twelveSouth: 'Twelve South',
  twelvesouth: 'Twelve South',
  nomadgoods: 'Nomad',
  fellowproducts: 'Fellow',
  balmuda: 'Balmuda',
  HermanMiller: 'Herman Miller',
  hermanmiller: 'Herman Miller',
  humanscale: 'Humanscale',
  benq: 'BenQ',
  sony: 'Sony',
  bose: 'Bose',
  garmin: 'Garmin',
};

const GENERIC_MARKETPLACE_HOSTS = new Set([
  'amazon',
  'walmart',
  'homedepot',
  'target',
  'ebay',
  'aliexpress',
  'mcmaster',
  'youtube',
  'youtu',
  'tiktok',
  'printables',
  'thingiverse',
  'github',
  'instructables',
  'ifixit',
]);

function titleCaseWords(raw: string): string {
  const upperAcronyms = new Set([
    'usb',
    'led',
    'pcb',
    '3d',
    'lx',
    'hx',
    'mx',
    'm3',
    'm4',
    'm5',
    'dc',
    'ac',
    'hd',
    '4k',
    'pro',
    'diy',
    'ai',
    'uv',
    'ir',
  ]);
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (upperAcronyms.has(lower)) {
        return lower === 'pro' || lower === 'diy'
          ? lower.charAt(0).toUpperCase() + lower.slice(1)
          : lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function parseUrlProductInfo(rawUrl: string): {
  title: string;
  brand: string;
} {
  try {
    const u = new URL(rawUrl.trim());
    const hostParts = u.hostname
      .replace(/^(www\.|store\.|shop\.|us\.|en\.)/i, '')
      .split('.');
    const hostKey = (hostParts[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const brand =
      KNOWN_BRAND_MAP[hostKey] ||
      (GENERIC_MARKETPLACE_HOSTS.has(hostKey)
        ? ''
        : titleCaseWords(hostParts[0]?.replace(/[-_]+/g, ' ') || ''));

    const segs = u.pathname
      .split('/')
      .map((s) => decodeURIComponent(s).replace(/\.(html?|php|aspx?)$/i, ''))
      .filter(
        (s) =>
          s &&
          s.length > 1 &&
          !/^(products?|collections?|shop|en-us|en-gb|en|us|dp|gp|item|p|buy|store|pages|category|categories|product-details)$/i.test(
            s
          ) &&
          !/^B0[A-Z0-9]{8}$/i.test(s) &&
          !/^\d+$/.test(s)
      );

    const rawSlug = segs
      .join(' ')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const slugTitle = titleCaseWords(rawSlug);

    if (brand && slugTitle) {
      if (slugTitle.toLowerCase().startsWith(brand.toLowerCase())) {
        return { title: slugTitle, brand };
      }
      return { title: `${brand} ${slugTitle}`.trim(), brand };
    }
    if (slugTitle) {
      return { title: slugTitle, brand: brand || 'Commercial OEM' };
    }
    if (brand) {
      return { title: `${brand} Hardware Gadget`, brand };
    }
    return { title: 'Custom Hardware Gadget', brand: 'Commercial OEM' };
  } catch {
    return {
      title: titleCaseWords(
        rawUrl
          .replace(/^https?:\/\/(www\.)?/i, '')
          .replace(/[^a-zA-Z0-9]+/g, ' ')
          .trim()
      ).slice(0, 56),
      brand: 'Commercial OEM',
    };
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, '-')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const m1 = html.match(re1)?.[1];
    if (m1 && m1.trim()) return decodeHtmlEntities(m1);

    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    );
    const m2 = html.match(re2)?.[1];
    if (m2 && m2.trim()) return decodeHtmlEntities(m2);
  }
  return undefined;
}

function isErrorOrBlockTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t || t.length < 3) return true;
  return /^(404\b|page not found|not found|access denied|just a moment|attention required|robot check|security check|error\b|cloudflare|forbidden|verify you are human)/i.test(
    t
  );
}

function cleanPageTitle(rawTitle: string, siteName?: string): string {
  let cleaned = decodeHtmlEntities(rawTitle);
  // Strip common site suffix separators like " | Peak Design Official Site" or " - Amazon.com"
  const parts = cleaned.split(/\s+(?:\||—|–|·|•|-)\s+/);
  if (parts.length > 1) {
    const first = parts[0].trim();
    if (first.length >= 4 && !isErrorOrBlockTitle(first)) {
      cleaned = first;
    }
  }
  if (
    siteName &&
    cleaned.length > 3 &&
    !cleaned.toLowerCase().includes(siteName.toLowerCase()) &&
    cleaned.split(/\s+/).length <= 4
  ) {
    cleaned = `${siteName.trim()} ${cleaned}`.trim();
  }
  return cleaned.slice(0, 72);
}

async function fetchProductPageMetadata(url: string): Promise<{
  title?: string;
  description?: string;
  siteName?: string;
  price?: number;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const isYoutube = /youtube\.com\/watch|youtu\.be\//i.test(url);
    const targetFetchUrl = isYoutube
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      : url;
    const res = await fetch(targetFetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {};
    }
    if (isYoutube) {
      const oembed = await res.json().catch(() => null);
      if (oembed?.title) {
        return {
          title: String(oembed.title).trim().slice(0, 72),
          siteName: oembed.author_name ? String(oembed.author_name).trim() : 'YouTube',
          description: `YouTube video by ${oembed.author_name || 'Creator'}`,
        };
      }
      return {};
    }
    const html = (await res.text()).slice(0, 120000);
    const ogTitle = extractMetaContent(html, ['og:title', 'twitter:title']);
    const rawTitleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const pageTitle = rawTitleTag ? decodeHtmlEntities(rawTitleTag) : undefined;
    const siteName = extractMetaContent(html, [
      'og:site_name',
      'application-name',
    ]);
    const description = extractMetaContent(html, [
      'og:description',
      'description',
      'twitter:description',
    ]);
    const rawPrice = extractMetaContent(html, [
      'product:price:amount',
      'og:price:amount',
    ]);
    const parsedPrice = rawPrice ? Number(rawPrice.replace(/[^0-9.]/g, '')) : NaN;

    const candidateTitle =
      ogTitle && !isErrorOrBlockTitle(ogTitle)
        ? cleanPageTitle(ogTitle, siteName)
        : pageTitle && !isErrorOrBlockTitle(pageTitle)
        ? cleanPageTitle(pageTitle, siteName)
        : undefined;

    return {
      title: candidateTitle,
      description:
        description && !isErrorOrBlockTitle(description)
          ? description.slice(0, 320)
          : undefined,
      siteName: siteName?.slice(0, 40),
      price:
        Number.isFinite(parsedPrice) && parsedPrice > 1 && parsedPrice < 10000
          ? parsedPrice
          : undefined,
    };
  } catch {
    clearTimeout(timer);
    return {};
  }
}

export function isPlantWatererInput(text?: string, url?: string): boolean {
  const combined = `${text || ''} ${url || ''}`.toLowerCase();
  return /\b(plant|waterer|auto-waterer|blumat|sustee|hydropulse|terracotta)\b/i.test(
    combined
  );
}

function inferPriceAndCategory(subject: string, scrapedPrice?: number): {
  category: string;
  retailPrice: number;
  targetDiyCost: number;
  dims: [number, number, number];
} {
  const lower = subject.toLowerCase();
  if (/\b(car mount|phone mount|mobile mount|vent mount|mag-?safe|holder|adapter|cradle)\b/.test(lower)) {
    const retail = scrapedPrice || 69.95;
    return {
      category: 'Mobile & Magnetic Mounting Hardware',
      retailPrice: retail,
      targetDiyCost: 14.5,
      dims: [92, 68, 58],
    };
  }
  if (/\b(fan|purifier|dyson|cooler|blower|air|circulator|heater)\b/.test(lower)) {
    const retail = scrapedPrice || 299.0;
    return {
      category: 'Airflow & Environmental Appliances',
      retailPrice: retail,
      targetDiyCost: 34.5,
      dims: [190, 220, 190],
    };
  }
  if (/\b(arm|ergotron|monitor|stand|easel|tripod|gimbal|desk)\b/.test(lower)) {
    const retail = scrapedPrice || 189.0;
    return {
      category: 'Articulated Desk & Studio Hardware',
      retailPrice: retail,
      targetDiyCost: 27.5,
      dims: [210, 180, 140],
    };
  }
  const retail = scrapedPrice || 89.0;
  return {
    category: 'Consumer Hardware & Gadgets',
    retailPrice: retail,
    targetDiyCost: 18.5,
    dims: [140, 110, 95],
  };
}

function buildGenericObjectAnalysis(params: {
  cleanTitle: string;
  brand: string;
  input: AnalystInput;
  inputType: ObjectAnalysis['inputType'];
  scrapedDesc?: string;
  scrapedPrice?: number;
}): ObjectAnalysis {
  const { cleanTitle, brand, input, inputType, scrapedDesc, scrapedPrice } =
    params;
  const { category, retailPrice, targetDiyCost, dims } = inferPriceAndCategory(
    cleanTitle,
    scrapedPrice
  );
  const estimatedSavings =
    Math.round(Math.max(0, retailPrice - targetDiyCost) * 100) / 100;

  return {
    objectName: cleanTitle,
    slug: slugify(cleanTitle),
    category,
    tagline: `Modular 3D-printed + off-the-shelf engineering alternative to ${cleanTitle}`,
    description:
      scrapedDesc ||
      `Replaces the proprietary injection-molded housing and bespoke brackets of ${cleanTitle} with parametric PETG/PLA+ printed structural components and standard metric off-the-shelf hardware.`,
    functionSummary: `Combines a rigid 3D-printed base chassis, articulated mounting bracket, locking tension clamp, and protective faceplate cover with standard M3 stainless fasteners, N52 neodymium magnets, and EPDM vibration-damping pads.`,
    inputUrl: input.url,
    inputType,
    originalProduct: {
      name: cleanTitle,
      brand: brand || 'Commercial OEM',
      retailPrice,
      currency: 'USD',
      url:
        input.url ||
        `https://www.amazon.com/s?k=${encodeURIComponent(cleanTitle)}`,
      whyExpensive:
        'High brand markup, proprietary injection-molded enclosures, and custom retail packaging.',
    },
    targetDiyCost,
    estimatedSavings,
    estimatedPrintTimeHours: 2.8,
    estimatedAssemblyMinutes: 20,
    difficulty: 'Beginner',
    overallDimensionsMm: dims,
    keyMechanisms: [
      `Parametric 3D-printed primary base & structural bracket for ${cleanTitle}`,
      'Precision tension clamp & locking hinge interface with M3 brass heat-set inserts',
      'Embedded N52 neodymium magnet retention array for quick-release alignment',
      'High-friction EPDM rubber isolation pads for anti-slip grip and vibration damping',
    ],
    engineeringNotes: [
      'Print load-bearing structural parts in PETG or PLA+ with 4 perimeter walls (2.4mm) and 30% gyroid infill.',
      'Maintain 0.30mm radial clearance on moving clamp/hinge joints and 0.20mm offset on M3 fastener bores.',
      'Orient primary mounting faces flat on the PEI build plate for support-free printing (<=42° overhangs).',
    ],
    materialsNeeded: [
      'PETG or PLA+ 1.75mm Filament (~135g)',
      'M3×12mm Stainless Socket Head Cap Screws & Brass Heat-Set Inserts',
      'N52 Neodymium Disc Magnets (10×3mm)',
      '2mm Non-Slip EPDM Rubber Grip Pads',
    ],
    whatGetsPrinted: [
      `PRT-01 ${cleanTitle} Primary Base Chassis`,
      `PRT-02 ${cleanTitle} Articulated Mounting Bracket`,
      `PRT-03 ${cleanTitle} Tension Clamp Jaw`,
      `PRT-04 ${cleanTitle} Retention Cradle & Faceplate`,
      `PRT-05 ${cleanTitle} Locking Collar & Thumbwheel`,
      `PRT-06 ${cleanTitle} Protective Back Cover`,
    ],
    whatGetsBought: [
      'OTS-01 M3×12mm Stainless Socket Head Cap Screws & Brass Heat-Set Inserts (25pc)',
      'OTS-02 N52 Neodymium Disc Magnets (10×3mm, 12-Pack)',
      'OTS-03 High-Friction 2mm EPDM Rubber Isolation & Grip Pads',
      'OTS-04 Stainless Steel Compression Spring & Detent Pin Hardware Kit',
    ],
  };
}

export async function runAnalystAgent(
  input: AnalystInput
): Promise<RunAgentResult<ObjectAnalysis>> {
  const urlInfo = input.url ? parseUrlProductInfo(input.url) : null;
  let scrapedMeta: {
    title?: string;
    description?: string;
    siteName?: string;
    price?: number;
  } = {};

  if (input.url && /^https?:\/\//i.test(input.url)) {
    scrapedMeta = await fetchProductPageMetadata(input.url.trim());
    if (scrapedMeta.title || urlInfo?.title) {
      input.onLog?.({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: scrapedMeta.title
          ? `Fetched product page metadata: "${scrapedMeta.title}"${scrapedMeta.price ? ` ($${scrapedMeta.price})` : ''}`
          : `Resolved product name from URL slug: "${urlInfo?.title}"`,
      });
    }
  }

  const cleanedImageName = input.imageName
    ?.replace(/\.(jpe?g|png|webp|gif|bmp|svg|heic|avif)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  const validUrlTitle =
    urlInfo?.title && !/^youtube\s+watch$/i.test(urlInfo.title)
      ? urlInfo.title
      : '';

  const resolvedTitle =
    input.prompt?.trim() ||
    scrapedMeta.title ||
    validUrlTitle ||
    cleanedImageName ||
    urlInfo?.title ||
    'Custom Hardware Gadget';

  const resolvedBrand =
    scrapedMeta.siteName ||
    urlInfo?.brand ||
    KNOWN_BRAND_MAP[
      (resolvedTitle.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    ] ||
    'Commercial OEM';

  const scrapedContext = [
    scrapedMeta.title ? `Page Title: ${scrapedMeta.title}` : '',
    scrapedMeta.description ? `Page Description: ${scrapedMeta.description}` : '',
    scrapedMeta.price ? `Listed Retail Price: $${scrapedMeta.price}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const inputType: ObjectAnalysis['inputType'] = input.inlineImage
    ? 'image'
    : input.url
    ? input.url.includes('youtube.com') ||
      input.url.includes('youtu.be') ||
      input.url.includes('tiktok.com')
      ? 'video'
      : 'url'
    : 'prompt';

  const isPlant = isPlantWatererInput(resolvedTitle, input.url);
  const genericFallback = isPlant
    ? SAMPLE_ANALYSIS
    : buildGenericObjectAnalysis({
        cleanTitle: resolvedTitle,
        brand: resolvedBrand,
        input,
        inputType,
        scrapedDesc: scrapedMeta.description,
        scrapedPrice: scrapedMeta.price,
      });

  const prompt = `You are the Analyst Agent (Stage 1 of 6) in "Get Me An Alt", an AI hardware reverse-engineering pipeline powered by Gemini 4 Argon.
The user wants a DIY 3D-printed + off-the-shelf alternative to the following pricey commercial product:
Target Product: "${resolvedTitle}" (Brand: ${resolvedBrand})
${input.url ? `Source URL: ${input.url}` : ''}
${scrapedContext ? `${scrapedContext}\n` : ''}${input.inlineImage ? 'An image of the target object is attached. Inspect its geometry, mechanisms, and commercial price.' : ''}

Analyze "${resolvedTitle}" specifically (never substitute a different gadget) and return ONLY a JSON object matching this exact TypeScript interface:
{
  "objectName": "Specific DIY project name for ${resolvedTitle}",
  "slug": "${slugify(resolvedTitle)}",
  "category": "${genericFallback.category}",
  "tagline": "One-sentence compelling engineering summary",
  "description": "2-sentence explanation of why the commercial ${resolvedTitle} is expensive and how the 3D-printed + off-the-shelf DIY version replicates its function",
  "functionSummary": "How the mechanical/electronic system of ${resolvedTitle} works",
  "inputType": "${inputType}",
  "originalProduct": {
    "name": "${resolvedTitle}",
    "brand": "${resolvedBrand}",
    "retailPrice": ${genericFallback.originalProduct.retailPrice},
    "currency": "USD",
    "url": "${input.url || 'https://www.amazon.com/s?k=' + encodeURIComponent(resolvedTitle)}",
    "whyExpensive": "Why the commercial product costs so much"
  },
  "targetDiyCost": ${genericFallback.targetDiyCost},
  "estimatedSavings": ${genericFallback.estimatedSavings},
  "estimatedPrintTimeHours": 3.0,
  "estimatedAssemblyMinutes": 20,
  "difficulty": "Beginner",
  "overallDimensionsMm": [${genericFallback.overallDimensionsMm.join(', ')}],
  "keyMechanisms": ["3 to 4 key mechanical or electronic mechanisms specific to ${resolvedTitle}"],
  "engineeringNotes": ["3 practical 3D printing & structural engineering notes (infill, perimeters, tolerances)"],
  "materialsNeeded": ["Recommended filament types and off-the-shelf hardware summary for ${resolvedTitle}"],
  "whatGetsPrinted": ["5 to 6 specific 3D printed parts with PRT-01..PRT-06 prefixes for ${resolvedTitle}"],
  "whatGetsBought": ["3 to 4 specific off-the-shelf parts with OTS-01..OTS-04 prefixes for ${resolvedTitle}"]
}`;

  const retryPrompt = `Reverse-engineer "${resolvedTitle}" (${resolvedBrand}) into a DIY 3D-printed + off-the-shelf build. Return ONLY valid JSON with keys: objectName, slug, category, tagline, description, functionSummary, inputType ("${inputType}"), originalProduct ({name, brand, retailPrice, currency:"USD", url, whyExpensive}), targetDiyCost, estimatedSavings, estimatedPrintTimeHours, estimatedAssemblyMinutes, difficulty ("Beginner"|"Intermediate"|"Advanced"), overallDimensionsMm ([x,y,z]), keyMechanisms (3 strings), engineeringNotes (3 strings), materialsNeeded (3 strings), whatGetsPrinted (5 strings PRT-01..PRT-05), whatGetsBought (4 strings OTS-01..OTS-04).`;

  const result = await runGeminiAgent<ObjectAnalysis>({
    stageName: 'Analyst',
    prompt,
    retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'analysis.json',
    inlineImage: input.inlineImage,
    preferRestForSpeed: true,
    timeoutMs: 30000,
    onLog: input.onLog,
    fallbackGenerator: () => genericFallback,
  });

  const d = result.data;
  const retail =
    Number(d?.originalProduct?.retailPrice) ||
    genericFallback.originalProduct.retailPrice;
  const diy = Number(d?.targetDiyCost) || genericFallback.targetDiyCost;

  const normalized: ObjectAnalysis = {
    objectName: d?.objectName || genericFallback.objectName,
    slug: slugify(d?.slug || d?.objectName || resolvedTitle),
    category: d?.category || genericFallback.category,
    tagline: d?.tagline || genericFallback.tagline,
    description: d?.description || genericFallback.description,
    functionSummary: d?.functionSummary || genericFallback.functionSummary,
    inputUrl: input.url || d?.inputUrl,
    inputType,
    originalProduct: {
      name: d?.originalProduct?.name || genericFallback.originalProduct.name,
      brand: d?.originalProduct?.brand || genericFallback.originalProduct.brand,
      retailPrice: retail,
      currency: 'USD',
      url:
        input.url ||
        d?.originalProduct?.url ||
        `https://www.amazon.com/s?k=${encodeURIComponent(
          d?.objectName || resolvedTitle
        )}`,
      whyExpensive:
        d?.originalProduct?.whyExpensive ||
        genericFallback.originalProduct.whyExpensive,
    },
    targetDiyCost: diy,
    estimatedSavings: Math.max(0, Math.round((retail - diy) * 100) / 100),
    estimatedPrintTimeHours:
      Number(d?.estimatedPrintTimeHours) ||
      genericFallback.estimatedPrintTimeHours,
    estimatedAssemblyMinutes:
      Number(d?.estimatedAssemblyMinutes) ||
      genericFallback.estimatedAssemblyMinutes,
    difficulty:
      d?.difficulty === 'Beginner' ||
      d?.difficulty === 'Intermediate' ||
      d?.difficulty === 'Advanced'
        ? d.difficulty
        : 'Beginner',
    overallDimensionsMm:
      Array.isArray(d?.overallDimensionsMm) &&
      d.overallDimensionsMm.length === 3
        ? [
            Number(d.overallDimensionsMm[0]) ||
              genericFallback.overallDimensionsMm[0],
            Number(d.overallDimensionsMm[1]) ||
              genericFallback.overallDimensionsMm[1],
            Number(d.overallDimensionsMm[2]) ||
              genericFallback.overallDimensionsMm[2],
          ]
        : genericFallback.overallDimensionsMm,
    keyMechanisms:
      Array.isArray(d?.keyMechanisms) && d.keyMechanisms.length > 0
        ? d.keyMechanisms
        : genericFallback.keyMechanisms,
    engineeringNotes:
      Array.isArray(d?.engineeringNotes) && d.engineeringNotes.length > 0
        ? d.engineeringNotes
        : genericFallback.engineeringNotes,
    materialsNeeded:
      Array.isArray(d?.materialsNeeded) && d.materialsNeeded.length > 0
        ? d.materialsNeeded
        : genericFallback.materialsNeeded,
    whatGetsPrinted:
      Array.isArray(d?.whatGetsPrinted) && d.whatGetsPrinted.length > 0
        ? d.whatGetsPrinted
        : genericFallback.whatGetsPrinted,
    whatGetsBought:
      Array.isArray(d?.whatGetsBought) && d.whatGetsBought.length > 0
        ? d.whatGetsBought
        : genericFallback.whatGetsBought,
  };

  try {
    fs.mkdirSync(input.cwd, { recursive: true });
    fs.writeFileSync(
      path.join(input.cwd, 'analysis.json'),
      JSON.stringify(normalized, null, 2)
    );
  } catch {
    // ignore fs errors
  }

  return {
    ...result,
    data: normalized,
  };
}
