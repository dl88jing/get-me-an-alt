export interface InlineImageData {
  mimeType: string;
  base64Data: string;
  sourceUrl?: string;
}

export type InlineImageInput =
  | string
  | {
      mimeType?: string;
      base64Data?: string;
      url?: string;
      sourceUrl?: string;
    };

export interface ProductPageFetchResult {
  title?: string;
  description?: string;
  siteName?: string;
  brand?: string;
  price?: number;
  currency?: string;
  specs?: string[];
  images: string[];
  inlineImages: InlineImageData[];
  source?: 'aside-bridge' | 'shopify-json' | 'html' | 'youtube-oembed';
}

const MAX_HTML_BYTES = 600 * 1024; // 600 KB
const MAX_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024); // 1.5 MB
const MAX_IMAGES = 3;

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function decodeHtmlEntities(str: string): string {
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

export function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

export function isErrorOrBlockTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t || t.length < 3) return true;
  return /^(404\b|page not found|not found|access denied|just a moment|attention required|robot check|security check|error\b|cloudflare|forbidden|verify you are human)/i.test(
    t
  );
}

export function cleanPageTitle(rawTitle: string, siteName?: string): string {
  let cleaned = decodeHtmlEntities(rawTitle);
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
  return cleaned.slice(0, 96);
}

export function extractMetaContent(
  html: string,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const m1 = html.match(re1)?.[1];
    if (m1 && m1.trim()) return decodeHtmlEntities(m1);

    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["']`,
      'i'
    );
    const m2 = html.match(re2)?.[1];
    if (m2 && m2.trim()) return decodeHtmlEntities(m2);
  }
  return undefined;
}

function extractAllMetaContents(html: string, keys: string[]): string[] {
  const results: string[] = [];
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re1 = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      'gi'
    );
    let m: RegExpExecArray | null;
    while ((m = re1.exec(html)) !== null) {
      if (m[1]?.trim()) results.push(decodeHtmlEntities(m[1].trim()));
    }
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["']`,
      'gi'
    );
    while ((m = re2.exec(html)) !== null) {
      if (m[1]?.trim()) results.push(decodeHtmlEntities(m[1].trim()));
    }
  }
  return results;
}

function resolveCandidateUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const resolved = new URL(
      trimmed.startsWith('//') ? `https:${trimmed}` : trimmed,
      baseUrl
    );
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

function isLikelyProductImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  // Reject icons, sprites, tracking pixels, logos, SVGs, payment badges
  if (
    /\.(svg|gif|ico|woff2?|ttf|eot)(\?|$)/i.test(lower) ||
    /(?:logo|favicon|sprite|avatar|badge|payment|visa|mastercard|paypal|amex|apple-pay|google-pay|placeholder|blank|pixel|spinner|loader|flag|icon[-_]|1x1)/i.test(
      lower
    )
  ) {
    return false;
  }
  return true;
}

function parseJsonLdProducts(
  html: string,
  baseUrl: string
): {
  name?: string;
  description?: string;
  brand?: string;
  price?: number;
  currency?: string;
  images: string[];
} {
  const images: string[] = [];
  let name: string | undefined;
  let description: string | undefined;
  let brand: string | undefined;
  let price: number | undefined;
  let currency: string | undefined;

  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

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
      (t) =>
        t === 'product' ||
        t === 'productgroup' ||
        t === 'individualproduct' ||
        t === 'productmodel' ||
        t.endsWith('/product')
    );

    if (!isProduct) return;

    if (!name && typeof obj.name === 'string' && obj.name.trim()) {
      const cleaned = decodeHtmlEntities(obj.name);
      if (!isErrorOrBlockTitle(cleaned)) {
        name = cleaned;
      }
    }

    if (
      !description &&
      typeof obj.description === 'string' &&
      obj.description.trim()
    ) {
      const cleaned = stripHtmlTags(obj.description);
      if (cleaned.length > 12) {
        description = cleaned.slice(0, 600);
      }
    }

    if (!brand && obj.brand) {
      if (typeof obj.brand === 'string') {
        brand = decodeHtmlEntities(obj.brand);
      } else if (typeof obj.brand === 'object' && obj.brand !== null) {
        const bName = (obj.brand as Record<string, unknown>).name;
        if (typeof bName === 'string' && bName.trim()) {
          brand = decodeHtmlEntities(bName);
        }
      }
    }

    const collectImage = (imgVal: unknown) => {
      if (!imgVal) return;
      if (typeof imgVal === 'string') {
        const u = resolveCandidateUrl(imgVal, baseUrl);
        if (u && isLikelyProductImageUrl(u) && !images.includes(u)) {
          images.push(u);
        }
      } else if (Array.isArray(imgVal)) {
        for (const item of imgVal) collectImage(item);
      } else if (typeof imgVal === 'object') {
        const imgObj = imgVal as Record<string, unknown>;
        collectImage(imgObj.url || imgObj.contentUrl || imgObj.thumbnailUrl);
      }
    };
    collectImage(obj.image);

    const extractOfferPrice = (offersVal: unknown) => {
      if (!offersVal || price !== undefined) return;
      if (Array.isArray(offersVal)) {
        for (const off of offersVal) extractOfferPrice(off);
        return;
      }
      if (typeof offersVal === 'object') {
        const offObj = offersVal as Record<string, unknown>;
        const rawP =
          offObj.price ??
          offObj.lowPrice ??
          offObj.highPrice ??
          (offObj.priceSpecification as Record<string, unknown> | undefined)
            ?.price;
        if (rawP !== undefined && rawP !== null) {
          const num = Number(String(rawP).replace(/[^0-9.]/g, ''));
          if (Number.isFinite(num) && num > 0.5 && num < 50000) {
            price = num;
          }
        }
        if (
          !currency &&
          typeof offObj.priceCurrency === 'string' &&
          offObj.priceCurrency.trim()
        ) {
          currency = offObj.priceCurrency.trim().toUpperCase();
        }
        if (offObj.offers) {
          extractOfferPrice(offObj.offers);
        }
      }
    };
    extractOfferPrice(obj.offers);
  };

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1]?.trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      visitNode(parsed);
    } catch {
      // ignore malformed JSON-LD block
    }
  }

  return { name, description, brand, price, currency, images };
}

function extractGalleryProductImages(html: string, baseUrl: string): string[] {
  const highPriority: string[] = [];
  const mediumPriority: string[] = [];

  const addCandidate = (raw: string, priority: 'high' | 'medium') => {
    const resolved = resolveCandidateUrl(decodeHtmlEntities(raw), baseUrl);
    if (!resolved || !isLikelyProductImageUrl(resolved)) return;
    if (highPriority.includes(resolved) || mediumPriority.includes(resolved)) {
      return;
    }
    if (priority === 'high') {
      highPriority.push(resolved);
    } else {
      mediumPriority.push(resolved);
    }
  };

  // 1. Direct product-image URL patterns in HTML (Odoo, Shopify CDN, WooCommerce, BigCommerce, etc.)
  const productUrlPattern =
    /https?:\/\/[^"'\s<>)]+(?:\/web\/image\/product\.(?:image|template)\/\d+\/image_(?:1920|1024|512)[^"'\s<>)]*|\/cdn\/shop\/(?:files|products)\/[^"'\s<>)]+\.(?:jpe?g|png|webp)|cdn\.shopify\.com\/s\/files\/[^"'\s<>)]+\.(?:jpe?g|png|webp)|\/products?\/[^"'\s<>)]+\.(?:jpe?g|png|webp))/gi;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = productUrlPattern.exec(html)) !== null) {
    if (urlMatch[0] && !/website_meta_img/i.test(urlMatch[0])) {
      addCandidate(urlMatch[0], 'high');
    }
  }

  // 2. Scan <img> tags for product/gallery attributes
  const imgTagRegex = /<img\b[^>]+>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgTagRegex.exec(html)) !== null) {
    const tag = imgMatch[0];
    // Skip tiny explicit dimensions
    const widthMatch = tag.match(/\bwidth=["']?(\d+)/i);
    const heightMatch = tag.match(/\bheight=["']?(\d+)/i);
    if (
      (widthMatch && Number(widthMatch[1]) > 0 && Number(widthMatch[1]) < 80) ||
      (heightMatch && Number(heightMatch[1]) > 0 && Number(heightMatch[1]) < 80)
    ) {
      continue;
    }

    const attrUrls: string[] = [];
    for (const attr of [
      'data-zoom-image',
      'data-large_image',
      'data-src',
      'data-original',
      'src',
    ]) {
      const m = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'));
      if (m?.[1]) attrUrls.push(m[1]);
    }

    for (const rawUrl of attrUrls) {
      const isProductish =
        /(?:product|gallery|carousel|zoom|main-image|hero|image_1920|image_1024|media|catalog|item)/i.test(
          rawUrl
        ) ||
        /(?:product|gallery|carousel|zoom|figure|media|thumb)/i.test(tag);
      if (isProductish) {
        addCandidate(rawUrl, 'high');
      } else if (/\.(jpe?g|png|webp)(\?|$)/i.test(rawUrl)) {
        addCandidate(rawUrl, 'medium');
      }
    }
  }

  return [...highPriority, ...mediumPriority].slice(0, 12);
}

async function fetchHtmlUpToLimit(
  url: string,
  maxBytes = MAX_HTML_BYTES,
  timeoutMs = 8000
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      clearTimeout(timer);
      return null;
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      const text = await res.text();
      clearTimeout(timer);
      return text.slice(0, maxBytes);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let accumulated = '';
    let totalBytes = 0;

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      totalBytes += value.byteLength;
      accumulated += decoder.decode(value, { stream: true });
      if (/<\/body>/i.test(accumulated)) {
        break;
      }
    }
    accumulated += decoder.decode();
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    clearTimeout(timer);
    return accumulated.slice(0, maxBytes);
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function tryFetchShopifyProductJson(url: string): Promise<{
  title?: string;
  description?: string;
  brand?: string;
  price?: number;
  images: string[];
} | null> {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/products\/([^/?#]+)/i);
    if (!match?.[1]) return null;
    const handle = match[1].replace(/\.json$/i, '');
    const jsonUrl = `${u.origin}/products/${handle}.json`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(jsonUrl, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;

    const data = (await res.json()) as {
      product?: {
        title?: string;
        vendor?: string;
        body_html?: string;
        variants?: Array<{ price?: string | number }>;
        images?: Array<{ src?: string }>;
      };
    };
    const prod = data?.product;
    if (!prod || !prod.title) return null;

    const rawPrice = prod.variants?.[0]?.price;
    const parsedPrice =
      rawPrice !== undefined
        ? Number(String(rawPrice).replace(/[^0-9.]/g, ''))
        : NaN;

    const images = (prod.images || [])
      .map((img) => (img?.src ? resolveCandidateUrl(img.src, url) : null))
      .filter((x): x is string => Boolean(x && isLikelyProductImageUrl(x)));

    return {
      title: decodeHtmlEntities(prod.title),
      brand: prod.vendor ? decodeHtmlEntities(prod.vendor) : undefined,
      description: prod.body_html
        ? stripHtmlTags(prod.body_html).slice(0, 600)
        : undefined,
      price:
        Number.isFinite(parsedPrice) && parsedPrice > 0.5 && parsedPrice < 50000
          ? parsedPrice
          : undefined,
      images,
    };
  } catch {
    return null;
  }
}

function normalizeMimeType(rawMime: string | null, url: string): string {
  const clean = (rawMime || '').split(';')[0].trim().toLowerCase();
  if (
    clean === 'image/jpeg' ||
    clean === 'image/png' ||
    clean === 'image/webp' ||
    clean === 'image/heic' ||
    clean === 'image/heif'
  ) {
    return clean;
  }
  if (clean === 'image/jpg') return 'image/jpeg';
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  return 'image/jpeg';
}

export async function verifyAndDownloadImage(
  url: string,
  maxBytes = MAX_IMAGE_BYTES,
  timeoutMs = 5000
): Promise<InlineImageData | null> {
  // Handle data:image/... URLs directly
  if (url.startsWith('data:image/')) {
    const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    const approxBytes = Math.floor((base64Data.length * 3) / 4);
    if (approxBytes < 200 || approxBytes > maxBytes) return null;
    return { mimeType, base64Data };
  }

  // 1. Optional quick HEAD verification (skip 404s and huge files before downloading body)
  try {
    const headCtrl = new AbortController();
    const headTimer = setTimeout(() => headCtrl.abort(), 2500);
    const headRes = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      redirect: 'follow',
      signal: headCtrl.signal,
    });
    clearTimeout(headTimer);

    if (headRes.status === 404 || headRes.status === 410) {
      return null;
    }
    if (headRes.ok) {
      const ct = (headRes.headers.get('content-type') || '').toLowerCase();
      if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
        return null;
      }
      const cl = Number(headRes.headers.get('content-length') || '0');
      if (cl > maxBytes) {
        return null;
      }
    }
  } catch {
    // Fall through to GET verification if HEAD timed out or is unsupported
  }

  // 2. GET download & byte-size check
  const getCtrl = new AbortController();
  const getTimer = setTimeout(() => getCtrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
      },
      redirect: 'follow',
      signal: getCtrl.signal,
    });
    if (!res.ok) {
      clearTimeout(getTimer);
      return null;
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (
      ct &&
      !ct.startsWith('image/') &&
      !ct.includes('octet-stream') &&
      !ct.includes('binary')
    ) {
      clearTimeout(getTimer);
      return null;
    }
    if (ct.includes('svg') || ct.includes('gif')) {
      clearTimeout(getTimer);
      return null;
    }

    const cl = Number(res.headers.get('content-length') || '0');
    if (cl > maxBytes) {
      clearTimeout(getTimer);
      return null;
    }

    const ab = await res.arrayBuffer();
    clearTimeout(getTimer);
    if (ab.byteLength < 600 || ab.byteLength > maxBytes) {
      return null;
    }

    const mimeType = normalizeMimeType(ct, url);
    const base64Data = Buffer.from(ab).toString('base64');
    return {
      mimeType,
      base64Data,
      sourceUrl: url,
    };
  } catch {
    clearTimeout(getTimer);
    return null;
  }
}

export async function resolveInlineImages(
  inputs?: InlineImageInput[],
  maxImages = MAX_IMAGES,
  maxBytes = MAX_IMAGE_BYTES
): Promise<InlineImageData[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];
  const results: InlineImageData[] = [];
  const seenUrls = new Set<string>();

  for (const item of inputs) {
    if (results.length >= maxImages) break;
    if (!item) continue;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed || seenUrls.has(trimmed)) continue;
      seenUrls.add(trimmed);
      const downloaded = await verifyAndDownloadImage(trimmed, maxBytes);
      if (downloaded) results.push(downloaded);
      continue;
    }

    if (typeof item === 'object') {
      if (item.base64Data && typeof item.base64Data === 'string') {
        const cleanB64 = item.base64Data.includes(',')
          ? item.base64Data.split(',')[1]
          : item.base64Data;
        const approxBytes = Math.floor((cleanB64.length * 3) / 4);
        if (approxBytes >= 100 && approxBytes <= maxBytes) {
          results.push({
            mimeType: item.mimeType || 'image/jpeg',
            base64Data: cleanB64,
            sourceUrl: item.sourceUrl || item.url,
          });
          continue;
        }
      }
      const candidateUrl = (item.url || item.sourceUrl || '').trim();
      if (candidateUrl && !seenUrls.has(candidateUrl)) {
        seenUrls.add(candidateUrl);
        const downloaded = await verifyAndDownloadImage(candidateUrl, maxBytes);
        if (downloaded) results.push(downloaded);
      }
    }
  }

  return results;
}

async function tryAsideBridge(
  url: string
): Promise<ProductPageFetchResult | null> {
  const bridgeUrl = process.env.ASIDE_BRIDGE_URL?.trim();
  if (!bridgeUrl) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (process.env.ASIDE_BRIDGE_TOKEN?.trim()) {
      headers['x-bridge-token'] = process.env.ASIDE_BRIDGE_TOKEN.trim();
    }

    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const raw = (await res.json()) as Record<string, unknown>;
    const payload =
      raw.data && typeof raw.data === 'object'
        ? (raw.data as Record<string, unknown>)
        : raw;

    const title =
      typeof payload.title === 'string' && !isErrorOrBlockTitle(payload.title)
        ? cleanPageTitle(payload.title)
        : undefined;
    const description =
      typeof payload.description === 'string' && payload.description.trim()
        ? stripHtmlTags(payload.description).slice(0, 600)
        : undefined;

    let specs: string[] | undefined;
    if (Array.isArray(payload.specs)) {
      specs = payload.specs
        .map((s) => (typeof s === 'string' ? s.trim() : JSON.stringify(s)))
        .filter(Boolean)
        .slice(0, 15);
    } else if (payload.specs && typeof payload.specs === 'object') {
      specs = Object.entries(payload.specs as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .slice(0, 15);
    } else if (typeof payload.specs === 'string' && payload.specs.trim()) {
      specs = [payload.specs.trim().slice(0, 400)];
    }

    let price: number | undefined;
    if (payload.price !== undefined && payload.price !== null) {
      const p = Number(String(payload.price).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(p) && p > 0.5 && p < 50000) {
        price = p;
      }
    }

    const rawImages: string[] = [];
    if (Array.isArray(payload.images)) {
      for (const img of payload.images) {
        if (typeof img === 'string' && img.trim()) {
          const u = resolveCandidateUrl(img.trim(), url);
          if (u && isLikelyProductImageUrl(u) && !rawImages.includes(u)) {
            rawImages.push(u);
          }
        }
      }
    }

    const inlineCandidates: InlineImageInput[] = [...rawImages.slice(0, 6)];
    if (
      typeof payload.screenshot === 'string' &&
      payload.screenshot.trim().length > 100
    ) {
      const sc = payload.screenshot.trim();
      if (sc.startsWith('data:image/') || sc.startsWith('http')) {
        inlineCandidates.push(sc);
      } else {
        inlineCandidates.push({
          mimeType: 'image/png',
          base64Data: sc,
        });
      }
    }

    const verifiedInline = await resolveInlineImages(
      inlineCandidates,
      MAX_IMAGES,
      MAX_IMAGE_BYTES
    );
    const validUrls = verifiedInline
      .map((img) => img.sourceUrl)
      .filter((u): u is string => Boolean(u));

    if (!title && !description && verifiedInline.length === 0) {
      return null;
    }

    return {
      title,
      description,
      price,
      specs,
      images: validUrls.length > 0 ? validUrls : rawImages.slice(0, MAX_IMAGES),
      inlineImages: verifiedInline,
      source: 'aside-bridge',
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function fetchProductPage(
  url: string
): Promise<ProductPageFetchResult> {
  const cleanUrl = url.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    return { images: [], inlineImages: [] };
  }

  // 0. YouTube oEmbed fast path
  if (/youtube\.com\/watch|youtu\.be\//i.test(cleanUrl)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`,
        {
          headers: { 'User-Agent': BROWSER_USER_AGENT },
          signal: ctrl.signal,
        }
      );
      clearTimeout(timer);
      if (res.ok) {
        const oembed = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        const thumbUrl = oembed?.thumbnail_url?.trim();
        const inlineImages = thumbUrl
          ? await resolveInlineImages([thumbUrl], 1, MAX_IMAGE_BYTES)
          : [];
        return {
          title: oembed?.title ? String(oembed.title).trim().slice(0, 96) : undefined,
          siteName: oembed?.author_name
            ? String(oembed.author_name).trim()
            : 'YouTube',
          description: oembed?.author_name
            ? `YouTube video by ${oembed.author_name}`
            : undefined,
          images: thumbUrl ? [thumbUrl] : [],
          inlineImages,
          source: 'youtube-oembed',
        };
      }
    } catch {
      // fall through
    }
  }

  // 1. First try ASIDE_BRIDGE_URL if configured (25s timeout); fall back on any error
  const bridgeResult = await tryAsideBridge(cleanUrl);
  if (
    bridgeResult &&
    (bridgeResult.title || bridgeResult.inlineImages.length > 0)
  ) {
    // If bridge returned title/description/images cleanly, return or enrich if missing price
    if (bridgeResult.price && bridgeResult.inlineImages.length > 0) {
      return bridgeResult;
    }
  }

  // 2. Fetch Shopify /products/<handle>.json and HTML (up to 600KB / </body>) in parallel
  const [shopifyData, html] = await Promise.all([
    tryFetchShopifyProductJson(cleanUrl),
    fetchHtmlUpToLimit(cleanUrl, MAX_HTML_BYTES, 8500),
  ]);

  let jsonLd: ReturnType<typeof parseJsonLdProducts> = { images: [] };
  let ogTitle: string | undefined;
  let pageTitle: string | undefined;
  let siteName: string | undefined;
  let metaDescription: string | undefined;
  let metaPrice: number | undefined;
  let metaImages: string[] = [];
  let galleryImages: string[] = [];
  const specs: string[] = [...(bridgeResult?.specs || [])];

  if (html) {
    jsonLd = parseJsonLdProducts(html, cleanUrl);
    ogTitle = extractMetaContent(html, ['og:title', 'twitter:title']);
    const rawTitleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    pageTitle = rawTitleTag ? decodeHtmlEntities(rawTitleTag) : undefined;
    siteName = extractMetaContent(html, ['og:site_name', 'application-name']);
    metaDescription = extractMetaContent(html, [
      'og:description',
      'description',
      'twitter:description',
    ]);

    const rawPrice = extractMetaContent(html, [
      'product:price:amount',
      'og:price:amount',
      'twitter:data1',
      'price',
    ]);
    if (rawPrice) {
      const p = Number(rawPrice.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(p) && p > 0.5 && p < 50000) {
        metaPrice = p;
      }
    }

    const rawMetaImgs = extractAllMetaContents(html, [
      'og:image:secure_url',
      'og:image',
      'twitter:image',
      'twitter:image:src',
    ]);
    for (const rawImg of rawMetaImgs) {
      const resolved = resolveCandidateUrl(rawImg, cleanUrl);
      if (
        resolved &&
        isLikelyProductImageUrl(resolved) &&
        !metaImages.includes(resolved)
      ) {
        metaImages.push(resolved);
      }
    }

    galleryImages = extractGalleryProductImages(html, cleanUrl);

    // Extract bulleted specification lines from HTML if present
    const liMatches = html.match(/<li[^>]*>([\s\S]{10,220}?)<\/li>/gi) || [];
    for (const li of liMatches) {
      const text = stripHtmlTags(li);
      if (
        /\b(\d+\s*(?:mm|cm|in|g|kg|mah|v|kv|rpm|ghz|scale)\b|length|beam|wingspan|height|width|weight|motor|servo|hull|battery)/i.test(
          text
        ) &&
        text.length >= 12 &&
        text.length <= 160 &&
        specs.length < 12
      ) {
        if (!specs.includes(text)) specs.push(text);
      }
    }
  }

  const candidateTitle =
    bridgeResult?.title ||
    (jsonLd.name && !isErrorOrBlockTitle(jsonLd.name)
      ? cleanPageTitle(jsonLd.name, siteName)
      : undefined) ||
    shopifyData?.title ||
    (ogTitle && !isErrorOrBlockTitle(ogTitle)
      ? cleanPageTitle(ogTitle, siteName)
      : undefined) ||
    (pageTitle && !isErrorOrBlockTitle(pageTitle)
      ? cleanPageTitle(pageTitle, siteName)
      : undefined);

  const description =
    bridgeResult?.description ||
    jsonLd.description ||
    shopifyData?.description ||
    (metaDescription && !isErrorOrBlockTitle(metaDescription)
      ? metaDescription.slice(0, 600)
      : undefined);

  const price =
    bridgeResult?.price ??
    jsonLd.price ??
    shopifyData?.price ??
    metaPrice;

  const brand =
    jsonLd.brand ||
    shopifyData?.brand ||
    siteName?.slice(0, 48);

  // Prioritize JSON-LD Product images, Shopify JSON images, and gallery product images BEFORE og:image
  // (since Odoo/MotionRC og:image website_meta_img often 404s whereas JSON-LD & gallery images return 200 OK)
  const orderedImageCandidates: string[] = [];
  const pushUnique = (list: string[]) => {
    for (const u of list) {
      if (u && !orderedImageCandidates.includes(u)) {
        orderedImageCandidates.push(u);
      }
    }
  };

  pushUnique(bridgeResult?.images || []);
  pushUnique(jsonLd.images);
  pushUnique(shopifyData?.images || []);
  pushUnique(galleryImages);
  pushUnique(metaImages);

  // Verify & download up to 3 valid images (<= 1.5MB each), skipping 404s
  const verifiedInline: InlineImageData[] = [
    ...(bridgeResult?.inlineImages || []),
  ];
  for (const candidateUrl of orderedImageCandidates) {
    if (verifiedInline.length >= MAX_IMAGES) break;
    if (verifiedInline.some((img) => img.sourceUrl === candidateUrl)) continue;
    const verified = await verifyAndDownloadImage(
      candidateUrl,
      MAX_IMAGE_BYTES,
      4500
    );
    if (verified) {
      verifiedInline.push(verified);
    }
  }

  const verifiedUrls = verifiedInline
    .map((img) => img.sourceUrl)
    .filter((u): u is string => Boolean(u));

  return {
    title: candidateTitle,
    description,
    siteName: siteName?.slice(0, 48) || brand,
    brand,
    price,
    currency: jsonLd.currency || 'USD',
    specs: specs.length > 0 ? specs : undefined,
    images: verifiedUrls,
    inlineImages: verifiedInline,
    source: bridgeResult
      ? 'aside-bridge'
      : shopifyData
        ? 'shopify-json'
        : 'html',
  };
}
