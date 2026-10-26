import fs from 'fs';
import path from 'path';
import type {
  AgentLogEntry,
  IngestedProductImage,
  IngestedProductPage,
  IngestedProductVariant,
} from '../types';

export interface GeminiInlineImagePart {
  mimeType: string;
  base64Data: string;
  label?: string;
  sourceUrl?: string;
}

export interface IngestProductResult {
  page: IngestedProductPage;
  geminiImageParts: GeminiInlineImagePart[];
}

export interface IngestProductOptions {
  cwd?: string;
  timeoutMs?: number;
  maxGeminiProductImages?: number;
  onLog?: (entry: AgentLogEntry) => void;
}

const REALISTIC_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const ICON_OR_TRACKER_URL_RE =
  /(?:\/|_|-|\b)(?:logo|icon|favicon|sprite|pixel|tracker|analytics|badge|flag|payment|visa|mastercard|amex|paypal|apple-pay|google-pay|shop-pay|klarna|afterpay|affirm|avatar|rating|stars?|spinner|loader|loading|placeholder|blank|spacer|1x1|clear\.gif|doubleclick|facebook\.com\/tr|pinterest|bat\.bing|adsystem|fls-na\.amazon)(?:\/|_|-|\.|\b)/i;

const BLOCKED_OR_ERROR_TITLE_RE =
  /^(404\b|page not found|not found|access denied|just a moment|attention required|robot check|security check|error\b|cloudflare|forbidden|verify you are human|pardon our interruption|oops\b|something went wrong)/i;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, '-')
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function isErrorTitle(title?: string): boolean {
  if (!title) return true;
  const trimmed = title.trim();
  if (trimmed.length < 3) return true;
  return BLOCKED_OR_ERROR_TITLE_RE.test(trimmed);
}

function cleanProductTitle(rawTitle: string, siteName?: string): string {
  let cleaned = decodeHtmlEntities(rawTitle);
  const parts = cleaned.split(/\s+(?:\||—|–|·|•|:|-)\s+/);
  if (parts.length > 1) {
    const first = parts[0].trim();
    if (first.length >= 5 && !isErrorTitle(first)) {
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
  return cleaned.slice(0, 110);
}

/**
 * Upgrades known e-commerce CDN thumbnail URLs (Amazon, Shopify, etc.)
 * to high-resolution product image URLs and computes a canonical dedupe key.
 */
export function upgradeAndCanonicalizeImageUrl(
  rawUrl: string,
  baseUrl: string
): { url: string; canonicalKey: string } | null {
  if (!rawUrl) return null;
  let trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('data:image/svg') || trimmed.startsWith('blob:')) {
    return null;
  }
  if (trimmed.startsWith('//')) {
    trimmed = `https:${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const lowerPath = parsed.pathname.toLowerCase();
  if (
    lowerPath.endsWith('.svg') ||
    lowerPath.endsWith('.ico') ||
    lowerPath.endsWith('.gif') ||
    ICON_OR_TRACKER_URL_RE.test(parsed.href)
  ) {
    return null;
  }

  // Amazon media CDN high-res upgrade:
  // e.g. https://m.media-amazon.com/images/I/71abc123._AC_SX425_.jpg -> ._AC_SL1500_.jpg
  if (
    /media-amazon\.com|images-amazon\.com|ssl-images-amazon\.com/i.test(
      parsed.hostname
    ) &&
    /\/images\/I\//i.test(parsed.pathname)
  ) {
    const m = parsed.pathname.match(/(\/images\/I\/[^.]+)\.[^/]+\.(jpe?g|png|webp)$/i);
    if (m) {
      const baseId = m[1];
      const ext = m[2];
      parsed.pathname = `${baseId}._AC_SL1500_.${ext}`;
      return {
        url: parsed.toString(),
        canonicalKey: `amz:${baseId.toLowerCase()}`,
      };
    }
  }

  // Shopify CDN high-res upgrade:
  // e.g. .../files/product_400x400.jpg?v=123&width=300 -> .../files/product.jpg?v=123&width=1600
  if (
    parsed.hostname.includes('cdn.shopify.com') ||
    parsed.pathname.includes('/cdn/shop/')
  ) {
    parsed.pathname = parsed.pathname.replace(
      /_(?:\d+x\d*|\d*x\d+|small|compact|medium|large|grande|master|pico|icon|thumb)(?:_crop_[a-z]+)?(?=\.(jpe?g|png|webp))/i,
      ''
    );
    if (parsed.searchParams.has('width')) {
      const w = Number(parsed.searchParams.get('width'));
      if (w > 0 && w < 1200) {
        parsed.searchParams.set('width', '1600');
      }
    }
    parsed.searchParams.delete('height');
    parsed.searchParams.delete('crop');
    const canonicalKey = `shopify:${parsed.hostname}${parsed.pathname.toLowerCase()}`;
    return {
      url: parsed.toString(),
      canonicalKey,
    };
  }

  // Generic canonical key without resize query params
  const cleanSearch = new URLSearchParams(parsed.searchParams);
  for (const k of ['w', 'width', 'h', 'height', 'size', 'resize', 'fit', 'quality', 'q', 'utm_source']) {
    cleanSearch.delete(k);
  }
  const canonicalKey = `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase()}${
    cleanSearch.toString() ? `?${cleanSearch.toString()}` : ''
  }`;

  return {
    url: parsed.toString(),
    canonicalKey,
  };
}

export function parseLargestFromSrcset(
  srcset: string,
  baseUrl: string
): { url: string; width?: number } | null {
  if (!srcset || !srcset.trim()) return null;
  let bestUrl = '';
  let bestScore = -1;
  let bestWidth: number | undefined;

  // Split srcset entries only after a width/density descriptor (e.g. "800w, " or "2x, ")
  // or before an explicit URL start, so commas inside Cloudflare/CDN URLs
  // (like /cdn-cgi/image/width=1200,quality=85/...) are never split mid-URL.
  const entries = srcset
    .split(/(?<=\s\d+(?:\.\d+)?[wx])\s*,\s*|\s*,\s*(?=(?:https?:)?\/\/|\/)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const tokens = entry.split(/\s+/);
    const rawUrl = tokens[0];
    if (!rawUrl || /^[a-z]+=/i.test(rawUrl)) continue;
    const desc = tokens[1] || '';
    let score = 100;
    let width: number | undefined;
    if (desc.endsWith('w')) {
      const w = Number.parseInt(desc.slice(0, -1), 10);
      if (Number.isFinite(w)) {
        score = w;
        width = w;
      }
    } else if (desc.endsWith('x')) {
      const x = Number.parseFloat(desc.slice(0, -1));
      if (Number.isFinite(x)) {
        score = x * 800;
      }
    }
    if (score >= bestScore) {
      bestScore = score;
      bestUrl = rawUrl;
      bestWidth = width;
    }
  }

  if (!bestUrl) return null;
  try {
    return {
      url: new URL(bestUrl, baseUrl).toString(),
      width: bestWidth,
    };
  } catch {
    return null;
  }
}

interface RawCandidateImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  source: IngestedProductImage['source'];
  inProductContainer?: boolean;
}

function deduplicateAndRankImages(
  candidates: RawCandidateImage[],
  baseUrl: string
): IngestedProductImage[] {
  const byCanonical = new Map<
    string,
    IngestedProductImage & { _score: number }
  >();

  const sourcePriority: Record<IngestedProductImage['source'], number> = {
    shopify: 520,
    'json-ld': 500,
    gallery: 480,
    og: 440,
    picture: 380,
    img: 340,
    'css-bg': 240,
  };

  for (const item of candidates) {
    // Filter out known tiny images/icons under 120px
    if (
      (typeof item.width === 'number' && item.width > 0 && item.width < 120) ||
      (typeof item.height === 'number' && item.height > 0 && item.height < 120)
    ) {
      continue;
    }

    const altLower = (item.alt || '').toLowerCase();
    if (/\b(logo|icon|badge|avatar|flag|payment|spinner)\b/.test(altLower)) {
      continue;
    }

    const norm = upgradeAndCanonicalizeImageUrl(item.url, baseUrl);
    if (!norm) continue;

    const areaBonus =
      item.width && item.height
        ? Math.min(600, Math.round(Math.sqrt(item.width * item.height) / 2))
        : item.width
          ? Math.min(450, Math.round(item.width / 3))
          : 180;

    const containerBonus = item.inProductContainer ? 220 : 0;
    const score =
      (sourcePriority[item.source] || 300) + areaBonus + containerBonus;

    const existing = byCanonical.get(norm.canonicalKey);
    if (!existing || score > existing._score) {
      byCanonical.set(norm.canonicalKey, {
        url: norm.url,
        alt: item.alt?.trim() || existing?.alt,
        width:
          item.width && (!existing?.width || item.width > existing.width)
            ? item.width
            : existing?.width,
        height:
          item.height && (!existing?.height || item.height > existing.height)
            ? item.height
            : existing?.height,
        source:
          existing && sourcePriority[existing.source] > sourcePriority[item.source]
            ? existing.source
            : item.source,
        _score: score,
      });
    }
  }

  return Array.from(byCanonical.values())
    .sort((a, b) => b._score - a._score)
    .slice(0, 16)
    .map(({ _score: _, ...rest }) => rest);
}

interface ShopifyEnrichment {
  title?: string;
  vendor?: string;
  description?: string;
  productType?: string;
  price?: number;
  variants: IngestedProductVariant[];
  specs: Record<string, string>;
  images: RawCandidateImage[];
}

/**
 * Checks if a URL is a Shopify product URL (`/products/<handle>`) and fetches
 * `/products/<handle>.json` for structured product images, variants, vendor, and specs.
 */
export async function fetchShopifyProductEnrichment(
  rawUrl: string
): Promise<ShopifyEnrichment | null> {
  try {
    const u = new URL(rawUrl);
    const match = u.pathname.match(/\/products\/([^/?#]+)/i);
    if (!match || !match[1]) return null;
    const handle = match[1].replace(/\.(json|js|html?)$/i, '');
    const cleanPath = u.pathname.replace(/\.(json|js|html?)$/i, '').replace(/\/$/, '');
    const candidateJsonUrls = Array.from(
      new Set([
        `${u.origin}${cleanPath}.json`,
        `${u.origin}/products/${handle}.json`,
      ])
    );

    let data: {
      product?: {
        title?: string;
        vendor?: string;
        body_html?: string;
        product_type?: string;
        tags?: string | string[];
        variants?: Array<{
          title?: string;
          price?: string | number;
          sku?: string;
          available?: boolean;
          grams?: number;
        }>;
        images?: Array<{
          src?: string;
          alt?: string | null;
          width?: number;
          height?: number;
        }>;
      };
    } | null = null;

    for (const jsonUrl of candidateJsonUrls) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4500);
      try {
        const res = await fetch(jsonUrl, {
          headers: {
            'User-Agent': REALISTIC_USER_AGENT,
            Accept: 'application/json',
          },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const parsed = await res.json();
          if (parsed?.product?.title) {
            data = parsed;
            break;
          }
        }
      } catch {
        clearTimeout(timer);
      }
    }

    const p = data?.product;
    if (!p || !p.title) return null;

    const variants: IngestedProductVariant[] = (p.variants || [])
      .slice(0, 12)
      .map((v) => {
        const pr = Number(v.price);
        return {
          name: v.title || 'Default',
          price: Number.isFinite(pr) && pr > 0 ? pr : undefined,
          sku: v.sku || undefined,
          available: typeof v.available === 'boolean' ? v.available : true,
        };
      });

    const firstPrice = variants.find((v) => v.price && v.price > 0)?.price;
    const specs: Record<string, string> = {};
    if (p.vendor) specs['Brand / Vendor'] = p.vendor;
    if (p.product_type) specs['Product Type'] = p.product_type;
    const firstGrams = p.variants?.find((v) => v.grams && v.grams > 0)?.grams;
    if (firstGrams) specs['Weight'] = `${firstGrams} g`;
    const firstSku = variants.find((v) => v.sku)?.sku;
    if (firstSku) specs['SKU'] = firstSku;
    if (p.tags) {
      const tagStr = Array.isArray(p.tags) ? p.tags.join(', ') : String(p.tags);
      if (tagStr.trim()) specs['Tags'] = tagStr.slice(0, 180);
    }

    const images: RawCandidateImage[] = (p.images || [])
      .filter((img) => typeof img.src === 'string' && img.src.trim())
      .map((img) => ({
        url: img.src!.trim(),
        alt: img.alt || p.title,
        width: img.width || 1200,
        height: img.height || 1200,
        source: 'shopify' as const,
        inProductContainer: true,
      }));

    return {
      title: p.title.trim(),
      vendor: p.vendor?.trim(),
      description: p.body_html ? stripHtmlTags(p.body_html).slice(0, 1600) : undefined,
      productType: p.product_type?.trim(),
      price: firstPrice,
      variants,
      specs,
      images,
    };
  } catch {
    return null;
  }
}

function parseJsonLdProducts(rawScripts: string[]): {
  summary?: IngestedProductPage['jsonLdSummary'];
  variants: IngestedProductVariant[];
  specs: Record<string, string>;
  images: RawCandidateImage[];
} {
  let summary: IngestedProductPage['jsonLdSummary'] | undefined;
  const variants: IngestedProductVariant[] = [];
  const specs: Record<string, string> = {};
  const images: RawCandidateImage[] = [];

  const visitNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visitNode(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj['@graph'])) {
      visitNode(obj['@graph']);
    }

    const rawType = obj['@type'];
    const types = Array.isArray(rawType)
      ? rawType.map((t) => String(t).toLowerCase())
      : typeof rawType === 'string'
        ? [rawType.toLowerCase()]
        : [];

    const isProduct = types.some(
      (t) => t.includes('product') || t === 'individualproduct'
    );
    if (!isProduct) return;

    const name = typeof obj.name === 'string' ? decodeHtmlEntities(obj.name) : undefined;
    const description =
      typeof obj.description === 'string'
        ? stripHtmlTags(obj.description).slice(0, 800)
        : undefined;
    const sku = typeof obj.sku === 'string' ? obj.sku : undefined;
    const category = typeof obj.category === 'string' ? obj.category : undefined;

    let brand: string | undefined;
    if (typeof obj.brand === 'string') {
      brand = obj.brand;
    } else if (obj.brand && typeof obj.brand === 'object') {
      const b = obj.brand as Record<string, unknown>;
      if (typeof b.name === 'string') brand = b.name;
    }

    // Extract images from JSON-LD
    const addImg = (val: unknown) => {
      if (!val) return;
      if (typeof val === 'string') {
        images.push({
          url: val,
          alt: name,
          source: 'json-ld',
          inProductContainer: true,
        });
      } else if (Array.isArray(val)) {
        for (const item of val) addImg(item);
      } else if (typeof val === 'object') {
        const io = val as Record<string, unknown>;
        const u = io.url || io.contentUrl;
        if (typeof u === 'string') {
          images.push({
            url: u,
            alt: (typeof io.caption === 'string' ? io.caption : name) || undefined,
            width: Number(io.width) || undefined,
            height: Number(io.height) || undefined,
            source: 'json-ld',
            inProductContainer: true,
          });
        }
      }
    };
    addImg(obj.image);

    // Extract offers & price
    let price: number | undefined;
    let currency: string | undefined;

    const parseOffer = (offerRaw: unknown) => {
      if (!offerRaw || typeof offerRaw !== 'object') return;
      if (Array.isArray(offerRaw)) {
        for (const o of offerRaw) parseOffer(o);
        return;
      }
      const off = offerRaw as Record<string, unknown>;
      const rawP = off.price ?? off.lowPrice ?? off.highPrice;
      const numP =
        typeof rawP === 'number'
          ? rawP
          : typeof rawP === 'string'
            ? Number.parseFloat(rawP.replace(/[^0-9.]/g, ''))
            : NaN;
      const curr =
        typeof off.priceCurrency === 'string' ? off.priceCurrency : undefined;
      if (Number.isFinite(numP) && numP > 0) {
        if (!price) price = numP;
        if (curr && !currency) currency = curr;
      }
      if (typeof off.name === 'string' && off.name.trim()) {
        variants.push({
          name: decodeHtmlEntities(off.name),
          price: Number.isFinite(numP) && numP > 0 ? numP : undefined,
          sku: typeof off.sku === 'string' ? off.sku : undefined,
          available:
            typeof off.availability === 'string'
              ? !/outofstock|soldout/i.test(off.availability)
              : undefined,
        });
      }
      if (Array.isArray(off.offers)) {
        parseOffer(off.offers);
      }
    };
    parseOffer(obj.offers);

    if (Array.isArray(obj.hasVariant)) {
      for (const v of obj.hasVariant) {
        visitNode(v);
      }
    }

    // Extract additionalProperty / dimensions / weight
    if (Array.isArray(obj.additionalProperty)) {
      for (const prop of obj.additionalProperty) {
        if (prop && typeof prop === 'object') {
          const pRec = prop as Record<string, unknown>;
          const k = typeof pRec.name === 'string' ? pRec.name.trim() : '';
          const v =
            pRec.value !== undefined && pRec.value !== null
              ? String(pRec.value).trim()
              : '';
          if (k && v) specs[k] = v;
        }
      }
    }
    for (const dimKey of ['weight', 'width', 'height', 'depth', 'color', 'material', 'model', 'mpn']) {
      const val = obj[dimKey];
      if (typeof val === 'string' && val.trim()) {
        specs[dimKey.charAt(0).toUpperCase() + dimKey.slice(1)] = val.trim();
      } else if (val && typeof val === 'object') {
        const qv = val as Record<string, unknown>;
        if (qv.value) {
          specs[dimKey.charAt(0).toUpperCase() + dimKey.slice(1)] = `${qv.value}${
            qv.unitCode || qv.unitText ? ` ${qv.unitText || qv.unitCode}` : ''
          }`;
        }
      }
    }

    let ratingValue: number | undefined;
    let reviewCount: number | undefined;
    if (obj.aggregateRating && typeof obj.aggregateRating === 'object') {
      const ar = obj.aggregateRating as Record<string, unknown>;
      const rv = Number(ar.ratingValue);
      const rc = Number(ar.reviewCount ?? ar.ratingCount);
      if (Number.isFinite(rv)) ratingValue = rv;
      if (Number.isFinite(rc)) reviewCount = rc;
    }

    if (!summary || (name && !summary.name) || (price && !summary.price)) {
      summary = {
        name: name || summary?.name,
        brand: brand || summary?.brand,
        description: description || summary?.description,
        sku: sku || summary?.sku,
        category: category || summary?.category,
        price: price ?? summary?.price,
        currency: currency || summary?.currency,
        ratingValue: ratingValue ?? summary?.ratingValue,
        reviewCount: reviewCount ?? summary?.reviewCount,
      };
    }
  };

  for (const raw of rawScripts) {
    try {
      const parsed = JSON.parse(raw);
      visitNode(parsed);
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }

  return { summary, variants, specs, images };
}

/**
 * Resolves the Chrome/Chromium binary path and launch arguments:
 * - On Vercel / AWS Lambda: uses `@sparticuz/chromium`
 * - Locally: prefers `process.env.CHROME_PATH`, `/usr/bin/google-chrome`, Playwright's local chromium, or `@sparticuz/chromium`
 */
async function resolveBrowserExecutable(): Promise<{
  executablePath: string;
  args: string[];
  engineLabel: string;
}> {
  const isServerless = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION
  );

  // Ensure local container chromelibs are on LD_LIBRARY_PATH if present
  if (!isServerless) {
    const extraLibDirs = [
      '/workspace/work/chromelibs/root/usr/lib/x86_64-linux-gnu',
      '/workspace/work/chromelibs/root/usr/lib/aarch64-linux-gnu',
      '/workspace/work/chromelibs/root/lib/x86_64-linux-gnu',
      '/workspace/work/chromelibs/root/lib/aarch64-linux-gnu',
    ];
    for (const dir of extraLibDirs) {
      if (fs.existsSync(dir) && !(process.env.LD_LIBRARY_PATH || '').includes(dir)) {
        process.env.LD_LIBRARY_PATH = `${dir}:${process.env.LD_LIBRARY_PATH || ''}`;
      }
    }
  }

  const baseStealthArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--no-zygote',
    '--js-flags=--max-old-space-size=512',
    '--window-size=1440,900',
  ];

  if (!isServerless) {
    const localCandidates = [
      process.env.CHROME_PATH,
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    ].filter((c): c is string => Boolean(c && c.trim()));

    for (const candidate of localCandidates) {
      try {
        if (fs.existsSync(candidate)) {
          return {
            executablePath: candidate,
            args: baseStealthArgs,
            engineLabel: `playwright-core (${path.basename(candidate)})`,
          };
        }
      } catch {
        // continue
      }
    }
  }

  // Serverless (@sparticuz/chromium) path
  const sparticuzMod = await import('@sparticuz/chromium');
  const chromium = sparticuzMod.default || sparticuzMod;
  const executablePath = await chromium.executablePath();
  const args = Array.from(new Set([...(chromium.args || []), ...baseStealthArgs]));

  return {
    executablePath,
    args,
    engineLabel: 'playwright-core (@sparticuz/chromium)',
  };
}

/**
 * Downloads up to `maxImages` product image URLs and encodes them as base64
 * Gemini `inlineData` parts (plus attaches `dataUrl` to the corresponding `IngestedProductImage`).
 */
async function downloadProductImagesAsBase64(
  images: IngestedProductImage[],
  refererUrl: string,
  maxImages = 4
): Promise<GeminiInlineImagePart[]> {
  const parts: GeminiInlineImagePart[] = [];
  const candidates = images.slice(0, maxImages + 3);

  for (const img of candidates) {
    if (parts.length >= maxImages) break;
    if (!img.url || !img.url.startsWith('http')) continue;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4500);
    try {
      const res = await fetch(img.url, {
        headers: {
          'User-Agent': REALISTIC_USER_AGENT,
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: refererUrl,
        },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const contentType = (res.headers.get('content-type') || 'image/jpeg')
        .split(';')[0]
        .trim()
        .toLowerCase();

      if (
        !contentType.startsWith('image/') ||
        contentType.includes('svg') ||
        contentType.includes('gif')
      ) {
        continue;
      }

      const buf = Buffer.from(await res.arrayBuffer());
      // Ignore tiny < 2.5KB tracking images or huge > 4.5MB payloads
      if (buf.byteLength < 2500 || buf.byteLength > 4_500_000) {
        continue;
      }

      const mimeType =
        contentType === 'image/png' ||
        contentType === 'image/webp' ||
        contentType === 'image/jpeg'
          ? contentType
          : 'image/jpeg';
      const base64Data = buf.toString('base64');
      img.mimeType = mimeType;
      if (buf.byteLength <= 350_000) {
        img.dataUrl = `data:${mimeType};base64,${base64Data}`;
      }

      parts.push({
        mimeType,
        base64Data,
        label: img.alt || `Product image (${img.source})`,
        sourceUrl: img.url,
      });
    } catch {
      clearTimeout(timer);
    }
  }

  return parts;
}

/**
 * Plain HTTP fetch fallback used ONLY when the headless browser fails or cannot launch.
 */
async function ingestViaHttpFallback(
  url: string,
  fallbackReason: string,
  startTime: number,
  options?: IngestProductOptions
): Promise<IngestProductResult> {
  const shopifyPromise = fetchShopifyProductEnrichment(url);
  let html = '';
  let finalUrl = url;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const isYoutube = /youtube\.com\/watch|youtu\.be\//i.test(url);
    const fetchTarget = isYoutube
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      : url;
    const res = await fetch(fetchTarget, {
      headers: {
        'User-Agent': REALISTIC_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      if (isYoutube) {
        const oembed = await res.json().catch(() => null);
        const shopify = await shopifyPromise;
        const page: IngestedProductPage = {
          mode: 'http-fallback',
          fallbackReason,
          shopifyEnriched: Boolean(shopify),
          inputUrl: url,
          finalUrl: url,
          title: oembed?.title || 'YouTube Hardware Video',
          brand: oembed?.author_name || 'YouTube',
          siteName: 'YouTube',
          description: oembed?.title
            ? `YouTube video "${oembed.title}" by ${oembed.author_name || 'Creator'}`
            : undefined,
          visibleText: oembed?.title || '',
          variants: [],
          specs: {},
          openGraph: {},
          meta: {},
          images: oembed?.thumbnail_url
            ? [
                {
                  url: String(oembed.thumbnail_url),
                  alt: String(oembed.title || 'YouTube Thumbnail'),
                  width: 480,
                  height: 360,
                  source: 'og',
                },
              ]
            : [],
          durationMs: Date.now() - startTime,
          capturedAt: new Date().toISOString(),
        };
        const geminiImageParts = await downloadProductImagesAsBase64(
          page.images,
          url,
          options?.maxGeminiProductImages ?? 4
        );
        return { page, geminiImageParts };
      }
      finalUrl = res.url || url;
      html = (await res.text()).slice(0, 350_000);
    }
  } catch {
    clearTimeout(timer);
  }

  const shopify = await shopifyPromise;

  const openGraph: Record<string, string> = {};
  const meta: Record<string, string> = {};
  const metaRegex = /<meta\s+[^>]*>/gi;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = metaRegex.exec(html)) !== null) {
    const tag = mMatch[0];
    const prop =
      tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const content = tag.match(/content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    if (prop && content) {
      const decoded = decodeHtmlEntities(content);
      if (prop.startsWith('og:') || prop.startsWith('product:') || prop.startsWith('twitter:')) {
        openGraph[prop.toLowerCase()] = decoded;
      } else {
        meta[prop.toLowerCase()] = decoded;
      }
    }
  }

  const ldScripts: string[] = [];
  const ldRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch: RegExpExecArray | null;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    if (ldMatch[1]?.trim()) ldScripts.push(ldMatch[1].trim());
  }
  const ldParsed = parseJsonLdProducts(ldScripts);

  const rawImages: RawCandidateImage[] = [
    ...(shopify?.images || []),
    ...ldParsed.images,
  ];
  for (const ogKey of ['og:image:secure_url', 'og:image', 'twitter:image']) {
    if (openGraph[ogKey]) {
      rawImages.push({
        url: openGraph[ogKey],
        alt: openGraph['og:title'] || undefined,
        source: 'og',
        inProductContainer: true,
      });
    }
  }

  // Extract <img> tags from HTML
  const imgRegex = /<img\s+[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const tag = imgMatch[0];
    const hiRes =
      tag.match(/data-old-hires=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-zoom-image=["']([^"']+)["']/i)?.[1] ||
      tag.match(/data-large_image=["']([^"']+)["']/i)?.[1] ||
      tag.match(/src=["']([^"']+)["']/i)?.[1];
    const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1];
    const w = Number(tag.match(/width=["']?(\d+)/i)?.[1] || 0);
    const h = Number(tag.match(/height=["']?(\d+)/i)?.[1] || 0);
    if (hiRes) {
      rawImages.push({
        url: decodeHtmlEntities(hiRes),
        alt: alt ? decodeHtmlEntities(alt) : undefined,
        width: w || undefined,
        height: h || undefined,
        source: 'img',
      });
    }
  }

  const dedupedImages = deduplicateAndRankImages(rawImages, finalUrl);

  const rawTitleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const siteName =
    shopify?.vendor ||
    ldParsed.summary?.brand ||
    openGraph['og:site_name'] ||
    meta['application-name'];

  const bestRawTitle =
    shopify?.title ||
    ldParsed.summary?.name ||
    openGraph['og:title'] ||
    openGraph['twitter:title'] ||
    (rawTitleTag ? decodeHtmlEntities(rawTitleTag) : '');

  const title =
    bestRawTitle && !isErrorTitle(bestRawTitle)
      ? cleanProductTitle(bestRawTitle, siteName)
      : '';

  const rawPriceStr =
    openGraph['product:price:amount'] ||
    openGraph['og:price:amount'] ||
    meta['price'];
  const metaPrice = rawPriceStr
    ? Number.parseFloat(rawPriceStr.replace(/[^0-9.]/g, ''))
    : NaN;

  const price =
    shopify?.price ||
    ldParsed.summary?.price ||
    (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : undefined);

  const visibleText =
    shopify?.description ||
    stripHtmlTags(html).slice(0, 6000);

  const page: IngestedProductPage = {
    mode: 'http-fallback',
    fallbackReason,
    shopifyEnriched: Boolean(shopify),
    inputUrl: url,
    finalUrl,
    title: title || url,
    brand: shopify?.vendor || ldParsed.summary?.brand || siteName,
    siteName,
    description:
      shopify?.description ||
      ldParsed.summary?.description ||
      openGraph['og:description'] ||
      meta['description'],
    visibleText,
    price,
    currency:
      ldParsed.summary?.currency ||
      openGraph['product:price:currency'] ||
      openGraph['og:price:currency'] ||
      'USD',
    priceText: price ? `$${price.toFixed(2)}` : undefined,
    variants:
      shopify?.variants && shopify.variants.length > 0
        ? shopify.variants
        : ldParsed.variants,
    specs: {
      ...ldParsed.specs,
      ...(shopify?.specs || {}),
    },
    openGraph,
    meta,
    jsonLdSummary: ldParsed.summary,
    images: dedupedImages,
    durationMs: Date.now() - startTime,
    capturedAt: new Date().toISOString(),
  };

  const geminiImageParts = await downloadProductImagesAsBase64(
    page.images,
    finalUrl,
    options?.maxGeminiProductImages ?? 4
  );

  persistIngestionArtifacts(options?.cwd, page);
  return { page, geminiImageParts };
}

function persistIngestionArtifacts(
  cwd: string | undefined,
  page: IngestedProductPage,
  aboveFoldBuffer?: Buffer,
  fullPageBuffer?: Buffer
): void {
  if (!cwd) return;
  try {
    const ingestDir = path.join(cwd, 'ingest');
    fs.mkdirSync(ingestDir, { recursive: true });
    if (aboveFoldBuffer) {
      const rel = 'ingest/above-fold.jpg';
      fs.writeFileSync(path.join(cwd, rel), aboveFoldBuffer);
      page.aboveFoldScreenshotFile = rel;
    }
    if (fullPageBuffer) {
      const rel = 'ingest/full-page.jpg';
      fs.writeFileSync(path.join(cwd, rel), fullPageBuffer);
      page.fullPageScreenshotFile = rel;
    }
    fs.writeFileSync(
      path.join(cwd, 'ingestion.json'),
      JSON.stringify(page, null, 2)
    );
  } catch {
    // ignore read-only fs errors
  }
}

/**
 * Primary headless browser ingestion function.
 * Launches Playwright Chromium (`@sparticuz/chromium` on Vercel, `/usr/bin/google-chrome` locally),
 * renders the target URL like a real user, dismisses cookie/consent banners, scrolls to trigger
 * lazy-loaded images, interacts with product galleries, and captures:
 * - Final URL, page title, brand, visible text (`innerText` of main content)
 * - Price, variants, and specs (JSON-LD, OpenGraph, meta, Shopify JSON, DOM spec tables)
 * - ALL product images (deduped, largest resolution preferred, icons/logos/pixels <120px filtered out)
 * - Full-page screenshot + above-the-fold screenshot
 * - Gemini `inlineData` image parts (screenshots + top product images)
 */
export async function ingestProductUrl(
  rawUrl: string,
  options?: IngestProductOptions
): Promise<IngestProductResult> {
  const startTime = Date.now();
  const url = rawUrl.trim();
  const log = (level: AgentLogEntry['level'], message: string) => {
    options?.onLog?.({
      timestamp: new Date().toISOString(),
      level,
      message,
    });
  };

  // Start Shopify `/products/<handle>.json` enrichment check in parallel
  const shopifyPromise = fetchShopifyProductEnrichment(url);

  let browser: import('playwright-core').Browser | null = null;
  let context: import('playwright-core').BrowserContext | null = null;
  let page: import('playwright-core').Page | null = null;
  const closeBrowserPromptly = async () => {
    if (page) {
      await page.close().catch(() => {});
      page = null;
    }
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  };
  try {
    const { chromium } = await import('playwright-core');
    const resolved = await resolveBrowserExecutable();

    log(
      'cmd',
      `Launching headless browser [${resolved.engineLabel}] -> ${url}`
    );

    browser = await chromium.launch({
      executablePath: resolved.executablePath,
      args: resolved.args,
      headless: true,
    });

    context = await browser.newContext({
      userAgent: REALISTIC_USER_AGENT,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
      ignoreHTTPSErrors: true,
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      (window as unknown as Record<string, unknown>).chrome = { runtime: {} };
    });

    page = await context.newPage();
    const primaryPage = page;
    // Enforce a strict single-page session within the 2048 MB Hobby memory budget
    context.on('page', (popup) => {
      if (popup !== primaryPage) {
        popup.close().catch(() => {});
      }
    });

    // Block heavy streaming media (video/audio) to conserve memory while keeping all DOM/CSS/images intact
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'media') {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(options?.timeoutMs || 22000, 22000),
    });

    // Wait for network idle (bounded so streaming analytics never hang)
    await page.waitForLoadState('networkidle', { timeout: 5500 }).catch(() => {});
    await page.waitForTimeout(500);

    // 1. Dismiss cookie/consent banners & newsletter popups
    await page
      .evaluate(() => {
        const acceptRegex =
          /^(accept( all( cookies)?)?|allow( all)?|i agree|agree( & continue)?|got it|ok|okay|continue|dismiss|close)$/i;
        const closeSelectors = [
          '#onetrust-accept-btn-handler',
          '#sp-cc-accept',
          '#truste-consent-button',
          '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
          '[data-testid*="cookie" i] button',
          '[id*="cookie" i] button',
          '[class*="cookie" i] button',
          '[id*="consent" i] button',
          '[class*="consent" i] button',
          '[aria-label*="accept" i]',
          '[aria-label*="close" i]',
          '[class*="klaviyo" i] button[aria-label*="close" i]',
          '[class*="popup" i] button[aria-label*="close" i]',
          '[class*="modal" i] button[aria-label*="close" i]',
        ];

        for (const sel of closeSelectors) {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
          for (const el of nodes.slice(0, 4)) {
            const txt = (el.innerText || el.getAttribute('aria-label') || '').trim();
            if (acceptRegex.test(txt) || sel.includes('accept') || sel.includes('onetrust')) {
              try {
                el.click();
              } catch {
                // ignore
              }
            }
          }
        }

        // Also click any visible button with exact accept text
        for (const btn of Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'))) {
          const text = (btn.innerText || '').trim();
          if (text.length > 0 && text.length <= 24 && acceptRegex.test(text)) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 20 && rect.height > 15) {
              try {
                btn.click();
              } catch {
                // ignore
              }
            }
          }
        }

        // Hide remaining fixed cookie/popup overlays blocking viewport
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('div, section, aside'))) {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') {
            const idCls = `${el.id} ${el.className}`.toLowerCase();
            if (
              /(cookie|consent|gdpr|onetrust|cybot|klaviyo|attentive|newsletter-popup|privy)/.test(
                idCls
              )
            ) {
              el.style.setProperty('display', 'none', 'important');
            }
          }
        }
        document.documentElement.style.overflow = 'auto';
        document.body.style.overflow = 'auto';
      })
      .catch(() => {});

    // 2. Open / cycle product image galleries & carousels so lazy gallery slides hydrate
    await page
      .evaluate(async () => {
        const thumbSelectors = [
          '#altImages li.item',
          '#altImages .a-button-thumbnail',
          '[data-testid*="thumbnail" i]',
          '[class*="product-gallery" i] [class*="thumb" i]',
          '[class*="product__media" i] button',
          '[class*="product-single__thumbnail" i]',
          '[aria-label*="thumbnail" i]',
          '[class*="carousel" i] [class*="thumb" i]',
        ];
        const thumbs: HTMLElement[] = [];
        for (const sel of thumbSelectors) {
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            const r = el.getBoundingClientRect();
            if (r.width >= 24 && r.height >= 24 && thumbs.length < 6) {
              thumbs.push(el);
            }
          }
          if (thumbs.length >= 3) break;
        }

        for (const thumb of thumbs.slice(0, 5)) {
          try {
            thumb.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            thumb.click();
            await new Promise((r) => setTimeout(r, 120));
          } catch {
            // ignore
          }
        }
        if (thumbs[0]) {
          try {
            thumbs[0].click();
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});

    // 3. Scroll down the page in steps to trigger lazy images, then return to top
    await page
      .evaluate(async () => {
        // Eagerly promote lazy attributes
        for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
          if (img.loading === 'lazy') img.loading = 'eager';
          const dataSrc =
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-original');
          if (dataSrc && (!img.src || img.src.startsWith('data:'))) {
            img.src = dataSrc;
          }
        }

        const step = 750;
        const maxScroll = Math.min(document.body.scrollHeight || 3000, 3600);
        for (let y = step; y <= maxScroll; y += step) {
          window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
          await new Promise((r) => setTimeout(r, 140));
        }
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        await new Promise((r) => setTimeout(r, 280));
      })
      .catch(() => {});

    // 4. Capture Above-the-Fold and Full-Page screenshots
    const aboveFoldBuffer = await page.screenshot({
      type: 'jpeg',
      quality: 76,
      fullPage: false,
    });
    const aboveFoldScreenshot = `data:image/jpeg;base64,${aboveFoldBuffer.toString('base64')}`;

    const pageDimensions = await page
      .evaluate(() => ({
        width: Math.max(document.documentElement.clientWidth || 1440, 1280),
        height: Math.max(
          document.body?.scrollHeight || 900,
          document.documentElement?.scrollHeight || 900
        ),
      }))
      .catch(() => ({ width: 1440, height: 2400 }));

    const fullPageClipHeight = Math.min(Math.max(pageDimensions.height, 900), 4200);
    const fullPageBuffer = await page
      .screenshot({
        type: 'jpeg',
        quality: 68,
        clip: {
          x: 0,
          y: 0,
          width: Math.min(pageDimensions.width, 1440),
          height: fullPageClipHeight,
        },
      })
      .catch(() => aboveFoldBuffer);
    const fullPageScreenshot = `data:image/jpeg;base64,${fullPageBuffer.toString('base64')}`;

    // 5. Extract DOM text, metadata, JSON-LD, price, variants, specs, and all product images
    const domExtracted = await page.evaluate(() => {
      const finalUrl = window.location.href;
      const rawTitle = document.title || '';

      const openGraph: Record<string, string> = {};
      const meta: Record<string, string> = {};
      for (const m of Array.from(document.querySelectorAll<HTMLMetaElement>('meta'))) {
        const key = (
          m.getAttribute('property') ||
          m.getAttribute('name') ||
          m.getAttribute('itemprop') ||
          ''
        )
          .trim()
          .toLowerCase();
        const val = (m.getAttribute('content') || '').trim();
        if (!key || !val) continue;
        if (
          key.startsWith('og:') ||
          key.startsWith('product:') ||
          key.startsWith('twitter:')
        ) {
          openGraph[key] = val;
        } else {
          meta[key] = val;
        }
      }

      const jsonLdScripts = Array.from(
        document.querySelectorAll<HTMLScriptElement>(
          'script[type="application/ld+json"]'
        )
      )
        .map((s) => s.textContent || '')
        .filter((t) => t.trim().length > 0);

      // Extract main visible text
      const mainSelectors = [
        '#ppd',
        '#dp-container',
        '#dp',
        'main',
        '[role="main"]',
        'article',
        '.product-single',
        '.product-template',
        '[class*="product-detail" i]',
        '#content',
      ];
      let mainEl: HTMLElement | null = null;
      for (const sel of mainSelectors) {
        const candidate = document.querySelector<HTMLElement>(sel);
        if (candidate && (candidate.innerText || '').trim().length > 160) {
          mainEl = candidate;
          break;
        }
      }
      const rawVisibleText = (
        (mainEl || document.body)?.innerText || ''
      ).replace(/\n{3,}/g, '\n\n');
      const visibleText = rawVisibleText.trim().slice(0, 10000);

      // Extract H1 product title if available
      const h1Title = (
        document.querySelector<HTMLElement>('#productTitle, h1')?.innerText || ''
      ).trim();

      // Extract DOM price
      const priceSelectors = [
        '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
        '#corePrice_feature_div .a-price .a-offscreen',
        '#priceblock_ourprice',
        '#priceblock_dealprice',
        '.a-price .a-offscreen',
        '[data-product-price]',
        '[itemprop="price"]',
        '.price-item--regular',
        '.product-price',
        '[class*="ProductPrice" i]',
        '[class*="price" i]',
      ];
      let domPriceText = '';
      for (const sel of priceSelectors) {
        const el = document.querySelector<HTMLElement>(sel);
        const txt = (
          el?.getAttribute('content') ||
          el?.innerText ||
          el?.textContent ||
          ''
        ).trim();
        const m = txt.match(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/);
        if (m) {
          domPriceText = m[0];
          break;
        }
      }

      // Extract DOM specs from tables & definition lists & feature bullets
      const domSpecs: Record<string, string> = {};
      const tableRows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>(
          '#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #productOverview_feature_div tr, table tr'
        )
      );
      for (const tr of tableRows.slice(0, 40)) {
        const cells = Array.from(tr.querySelectorAll<HTMLElement>('th, td'));
        if (cells.length >= 2) {
          const k = (cells[0].innerText || '').replace(/[:\s]+$/g, '').trim();
          const v = (cells[1].innerText || '').replace(/\s+/g, ' ').trim();
          if (
            k.length >= 2 &&
            k.length <= 48 &&
            v.length >= 1 &&
            v.length <= 160 &&
            Object.keys(domSpecs).length < 24
          ) {
            domSpecs[k] = v;
          }
        }
      }

      const dts = Array.from(document.querySelectorAll<HTMLElement>('dl dt'));
      for (const dt of dts.slice(0, 20)) {
        const dd = dt.nextElementSibling as HTMLElement | null;
        if (dd && dd.tagName.toLowerCase() === 'dd') {
          const k = (dt.innerText || '').replace(/[:\s]+$/g, '').trim();
          const v = (dd.innerText || '').replace(/\s+/g, ' ').trim();
          if (k && v && k.length <= 48 && v.length <= 160 && Object.keys(domSpecs).length < 24) {
            domSpecs[k] = v;
          }
        }
      }

      // Also extract Key: Value specs from bullet lists and visible text lines
      const specLineItems = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#detailBullets_feature_div li, #feature-bullets li, [class*="spec" i] li, [class*="detail" i] li, main li'
        )
      );
      for (const li of specLineItems.slice(0, 50)) {
        const txt = (li.innerText || li.textContent || '')
          .replace(/[\u200E\u200F]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const kvMatch = txt.match(/^([A-Za-z][A-Za-z0-9\s/()-]{2,34})\s*:\s*(.{2,140})$/);
        if (kvMatch && Object.keys(domSpecs).length < 24) {
          const k = kvMatch[1].trim();
          const v = kvMatch[2].trim();
          if (!domSpecs[k]) {
            domSpecs[k] = v;
          }
        }
      }

      // Extract DOM variants
      const domVariants: { name: string; price?: number }[] = [];
      const seenVar = new Set<string>();
      const variantEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#variation_color_name li, #variation_style_name li, #variation_size_name li, [class*="variant-input" i] label, select[name*="id"] option, [role="radio"], [data-testid*="variant" i] button, [class*="variant" i] button'
        )
      );
      for (const vel of variantEls.slice(0, 18)) {
        const name = (
          vel.getAttribute('title') ||
          vel.getAttribute('aria-label') ||
          vel.innerText ||
          vel.textContent ||
          ''
        )
          .replace(/^Click to select\s+/i, '')
          .replace(/^Select\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (
          name &&
          name.length >= 2 &&
          name.length <= 64 &&
          !seenVar.has(name.toLowerCase())
        ) {
          seenVar.add(name.toLowerCase());
          domVariants.push({ name });
        }
      }

      // Collect all candidate images from DOM
      const rawDomImages: {
        url: string;
        srcset?: string;
        dynamicImageJson?: string;
        alt?: string;
        width?: number;
        height?: number;
        source: 'gallery' | 'img' | 'picture' | 'css-bg';
        inProductContainer?: boolean;
      }[] = [];

      const productContainerSelector =
        '#imgTagWrapperId, #imageBlock, #main-image-container, #ppd, main, [class*="product-gallery" i], [class*="product__media" i], [class*="product-image" i], [class*="product-photo" i], [data-testid*="gallery" i]';

      for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img'))) {
        const rect = img.getBoundingClientRect();
        const natW = img.naturalWidth || 0;
        const natH = img.naturalHeight || 0;
        const w = Math.round(Math.max(natW, rect.width, Number(img.getAttribute('width')) || 0));
        const h = Math.round(Math.max(natH, rect.height, Number(img.getAttribute('height')) || 0));

        // Skip images that are known to be under 120px and have no high-res zoom attributes
        const hiResAttr =
          img.getAttribute('data-old-hires') ||
          img.getAttribute('data-zoom-image') ||
          img.getAttribute('data-large_image') ||
          img.getAttribute('data-high-res-src') ||
          img.getAttribute('data-master');
        const dynJson = img.getAttribute('data-a-dynamic-image') || undefined;

        if (!hiResAttr && !dynJson && w > 0 && h > 0 && (w < 120 || h < 120)) {
          continue;
        }

        const inProd = Boolean(img.closest(productContainerSelector));
        const inGallery = Boolean(
          img.closest(
            '#imageBlock, #main-image-container, [class*="gallery" i], [class*="product__media" i], [class*="carousel" i], [class*="slider" i]'
          )
        );
        const sourceType = inGallery ? 'gallery' : 'img';
        const alt = (img.alt || img.getAttribute('title') || '').trim() || undefined;

        if (hiResAttr) {
          rawDomImages.push({
            url: hiResAttr,
            alt,
            width: Math.max(w, 1200),
            height: Math.max(h, 1200),
            source: 'gallery',
            inProductContainer: true,
          });
        }
        if (dynJson) {
          rawDomImages.push({
            url: img.currentSrc || img.src || '',
            dynamicImageJson: dynJson,
            alt,
            width: Math.max(w, 1000),
            height: Math.max(h, 1000),
            source: 'gallery',
            inProductContainer: true,
          });
        }

        const srcset =
          img.getAttribute('srcset') || img.getAttribute('data-srcset') || undefined;
        const primaryUrl =
          img.currentSrc ||
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          '';

        if (primaryUrl || srcset) {
          rawDomImages.push({
            url: primaryUrl,
            srcset,
            alt,
            width: w || undefined,
            height: h || undefined,
            source: sourceType,
            inProductContainer: inProd,
          });
        }
      }

      // <picture> <source> elements
      for (const sourceEl of Array.from(
        document.querySelectorAll<HTMLSourceElement>('picture source[srcset]')
      )) {
        const srcset = sourceEl.getAttribute('srcset') || '';
        const parentPic = sourceEl.closest('picture');
        const childImg = parentPic?.querySelector('img');
        const rect = (childImg || parentPic)?.getBoundingClientRect();
        const w = Math.round(rect?.width || 0);
        const h = Math.round(rect?.height || 0);
        if (w > 0 && h > 0 && (w < 120 || h < 120)) continue;
        rawDomImages.push({
          url: '',
          srcset,
          alt: childImg?.alt || undefined,
          width: w || undefined,
          height: h || undefined,
          source: 'picture',
          inProductContainer: Boolean(sourceEl.closest(productContainerSelector)),
        });
      }

      // CSS background-image on large elements (>= 120x120)
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(
          '[style*="background-image"], [class*="product" i], [class*="gallery" i], [class*="hero" i]'
        )
      ).slice(0, 120)) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 120) continue;
        const bg = window.getComputedStyle(el).backgroundImage || '';
        const m = bg.match(/url\(["']?([^"')]+)["']?\)/i);
        if (m && m[1] && !m[1].startsWith('data:')) {
          rawDomImages.push({
            url: m[1],
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            source: 'css-bg',
            inProductContainer: Boolean(el.closest(productContainerSelector)),
          });
        }
      }

      return {
        finalUrl,
        rawTitle,
        h1Title,
        openGraph,
        meta,
        jsonLdScripts,
        visibleText,
        domPriceText,
        domSpecs,
        domVariants,
        rawDomImages,
      };
    });

    await closeBrowserPromptly();

    let shopify = await shopifyPromise;
    if (!shopify && domExtracted.finalUrl && domExtracted.finalUrl !== url) {
      shopify = await fetchShopifyProductEnrichment(domExtracted.finalUrl);
    }
    const ldParsed = parseJsonLdProducts(domExtracted.jsonLdScripts);

    // Build unified candidate image list
    const candidateImages: RawCandidateImage[] = [
      ...(shopify?.images || []),
      ...ldParsed.images,
    ];

    for (const ogKey of ['og:image:secure_url', 'og:image', 'twitter:image']) {
      if (domExtracted.openGraph[ogKey]) {
        candidateImages.push({
          url: domExtracted.openGraph[ogKey],
          alt: domExtracted.h1Title || domExtracted.openGraph['og:title'] || undefined,
          source: 'og',
          inProductContainer: true,
        });
      }
    }

    for (const rawImg of domExtracted.rawDomImages) {
      if (rawImg.dynamicImageJson) {
        try {
          const dynMap = JSON.parse(rawImg.dynamicImageJson) as Record<
            string,
            [number, number]
          >;
          let bestDynUrl = '';
          let bestDynArea = 0;
          let bestW = 0;
          let bestH = 0;
          for (const [u, dims] of Object.entries(dynMap)) {
            const w = Array.isArray(dims) ? Number(dims[0]) || 0 : 0;
            const h = Array.isArray(dims) ? Number(dims[1]) || 0 : 0;
            if (w * h >= bestDynArea) {
              bestDynArea = w * h;
              bestDynUrl = u;
              bestW = w;
              bestH = h;
            }
          }
          if (bestDynUrl) {
            candidateImages.push({
              url: bestDynUrl,
              alt: rawImg.alt,
              width: bestW || rawImg.width,
              height: bestH || rawImg.height,
              source: 'gallery',
              inProductContainer: true,
            });
          }
        } catch {
          // ignore
        }
      }

      if (rawImg.srcset) {
        const largest = parseLargestFromSrcset(
          rawImg.srcset,
          domExtracted.finalUrl
        );
        if (largest) {
          candidateImages.push({
            url: largest.url,
            alt: rawImg.alt,
            width: largest.width || rawImg.width,
            height: rawImg.height,
            source: rawImg.source,
            inProductContainer: rawImg.inProductContainer,
          });
        }
      }

      if (rawImg.url) {
        candidateImages.push({
          url: rawImg.url,
          alt: rawImg.alt,
          width: rawImg.width,
          height: rawImg.height,
          source: rawImg.source,
          inProductContainer: rawImg.inProductContainer,
        });
      }
    }

    const dedupedImages = deduplicateAndRankImages(
      candidateImages,
      domExtracted.finalUrl
    );

    const siteName =
      shopify?.vendor ||
      ldParsed.summary?.brand ||
      domExtracted.openGraph['og:site_name'] ||
      domExtracted.meta['application-name'];

    const bestRawTitle =
      shopify?.title ||
      ldParsed.summary?.name ||
      (!isErrorTitle(domExtracted.h1Title) ? domExtracted.h1Title : '') ||
      domExtracted.openGraph['og:title'] ||
      (!isErrorTitle(domExtracted.rawTitle) ? domExtracted.rawTitle : '');

    const finalTitle = bestRawTitle
      ? cleanProductTitle(bestRawTitle, siteName)
      : url;

    const ogPriceRaw =
      domExtracted.openGraph['product:price:amount'] ||
      domExtracted.openGraph['og:price:amount'] ||
      domExtracted.meta['price'];
    const ogPrice = ogPriceRaw
      ? Number.parseFloat(ogPriceRaw.replace(/[^0-9.]/g, ''))
      : NaN;
    const domPrice = domExtracted.domPriceText
      ? Number.parseFloat(domExtracted.domPriceText.replace(/[^0-9.]/g, ''))
      : NaN;

    const price =
      shopify?.price ||
      ldParsed.summary?.price ||
      (Number.isFinite(ogPrice) && ogPrice > 0 ? ogPrice : undefined) ||
      (Number.isFinite(domPrice) && domPrice > 0 ? domPrice : undefined);

    const mergedSpecs: Record<string, string> = {
      ...domExtracted.domSpecs,
      ...ldParsed.specs,
      ...(shopify?.specs || {}),
    };

    const mergedVariants: IngestedProductVariant[] =
      shopify?.variants && shopify.variants.length > 0
        ? shopify.variants
        : ldParsed.variants.length > 0
          ? ldParsed.variants
          : domExtracted.domVariants;

    const visibleText =
      domExtracted.visibleText && domExtracted.visibleText.length >= 80
        ? domExtracted.visibleText
        : shopify?.description || domExtracted.visibleText || '';

    const description =
      ldParsed.summary?.description ||
      shopify?.description?.slice(0, 500) ||
      domExtracted.openGraph['og:description'] ||
      domExtracted.meta['description'] ||
      visibleText.slice(0, 400);

    const ingestedPage: IngestedProductPage = {
      mode: 'headless-browser',
      browserEngine: resolved.engineLabel,
      shopifyEnriched: Boolean(shopify),
      inputUrl: url,
      finalUrl: domExtracted.finalUrl || url,
      title: finalTitle,
      brand: shopify?.vendor || ldParsed.summary?.brand || siteName,
      siteName,
      description,
      visibleText,
      price,
      currency:
        ldParsed.summary?.currency ||
        domExtracted.openGraph['product:price:currency'] ||
        domExtracted.openGraph['og:price:currency'] ||
        'USD',
      priceText:
        domExtracted.domPriceText ||
        (price ? `$${price.toFixed(2)}` : undefined),
      variants: mergedVariants.slice(0, 12),
      specs: mergedSpecs,
      openGraph: domExtracted.openGraph,
      meta: domExtracted.meta,
      jsonLdSummary: ldParsed.summary,
      images: dedupedImages,
      aboveFoldScreenshot,
      fullPageScreenshot,
      durationMs: Date.now() - startTime,
      capturedAt: new Date().toISOString(),
    };

    // Download top product images as base64 Gemini image parts
    const productImageParts = await downloadProductImagesAsBase64(
      ingestedPage.images,
      ingestedPage.finalUrl,
      options?.maxGeminiProductImages ?? 4
    );

    const geminiImageParts: GeminiInlineImagePart[] = [
      {
        mimeType: 'image/jpeg',
        base64Data: aboveFoldBuffer.toString('base64'),
        label: 'Above-the-fold live browser screenshot',
      },
      {
        mimeType: 'image/jpeg',
        base64Data: fullPageBuffer.toString('base64'),
        label: 'Full-page live browser screenshot',
      },
      ...productImageParts,
    ];

    persistIngestionArtifacts(
      options?.cwd,
      ingestedPage,
      aboveFoldBuffer,
      fullPageBuffer
    );

    log(
      'success',
      `Headless browser rendered "${ingestedPage.title}" in ${(ingestedPage.durationMs / 1000).toFixed(1)}s — captured 2 screenshots + ${ingestedPage.images.length} product images (${productImageParts.length} inline multimodal parts), ${Object.keys(ingestedPage.specs).length} specs${ingestedPage.price ? `, price $${ingestedPage.price}` : ''}${ingestedPage.shopifyEnriched ? ' [Shopify JSON enriched]' : ''}.`
    );

    return {
      page: ingestedPage,
      geminiImageParts,
    };
  } catch (err) {
    await closeBrowserPromptly();
    const reason = err instanceof Error ? err.message : String(err);
    log(
      'warn',
      `Headless browser ingestion failed (${reason.slice(0, 140)}); falling back to HTTP + Shopify/JSON-LD fetch.`
    );
    return ingestViaHttpFallback(url, reason.slice(0, 200), startTime, options);
  }
}

export { ingestProductUrl as fetchProductPage };
