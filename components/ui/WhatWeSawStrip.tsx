'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Monitor,
  Sparkles,
  X,
} from 'lucide-react';
import type { IngestedProductPage } from '@/lib/types';

interface WhatWeSawStripProps {
  ingestedPage?: IngestedProductPage | null;
}

export default function WhatWeSawStrip({ ingestedPage }: WhatWeSawStripProps) {
  const [showTextAndSpecs, setShowTextAndSpecs] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  useEffect(() => {
    if (!lightboxImage) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxImage]);

  if (!ingestedPage) {
    return null;
  }

  const isHeadless = ingestedPage.mode === 'headless-browser';
  const specEntries = Object.entries(ingestedPage.specs || {});
  const variants = ingestedPage.variants || [];
  const images = (ingestedPage.images || []).filter(
    (img) => !failedUrls[img.dataUrl || img.url]
  );
  const screenshotCount =
    (ingestedPage.aboveFoldScreenshot ? 1 : 0) +
    (ingestedPage.fullPageScreenshot ? 1 : 0);

  return (
    <section
      data-testid="what-we-saw-strip"
      className="rounded-2xl surface-card p-5 sm:p-6 space-y-4 border border-[#e5bd47]/35"
    >
      {/* Header Row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              <Eye className="h-4 w-4 text-[#e5bd47]" />
              What We Saw on the Live Product Page
            </span>

            {/* Mode Badge */}
            <span
              data-testid="ingestion-mode-badge"
              data-mode={ingestedPage.mode}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold border ${
                isHeadless
                  ? 'bg-[#e5bd47]/20 text-[#faf4e8] border-[#e5bd47]/60'
                  : 'bg-[#231d15] text-[#dfd3be] border-[#dfd3be]/30'
              }`}
            >
              <Monitor className="h-3.5 w-3.5 text-[#e5bd47]" />
              {isHeadless
                ? `Headless Browser Live Render (${ingestedPage.browserEngine || 'Playwright Chromium'})`
                : 'HTTP Metadata Fallback'}
            </span>

            {ingestedPage.shopifyEnriched && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#231d15] px-2.5 py-0.5 text-[11px] font-semibold text-[#f3d478] border border-[#e5bd47]/35">
                <Sparkles className="h-3 w-3 text-[#e5bd47]" />
                Shopify JSON Enriched
              </span>
            )}

            {ingestedPage.jsonLdSummary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#231d15] px-2.5 py-0.5 text-[11px] font-semibold text-[#dfd3be] border border-[#dfd3be]/25">
                JSON-LD Product Schema
              </span>
            )}
          </div>

          <p className="text-xs text-[#b5a48b]">
            {isHeadless ? (
              <>
                Rendered <strong className="text-[#faf4e8]">{ingestedPage.title}</strong> in a real
                1440×900 headless browser ({(ingestedPage.durationMs / 1000).toFixed(1)}s), dismissed
                banners, scrolled to hydrate lazy media, and fed the screenshots + product photos +
                page text directly into Gemini 4 Argon.
              </>
            ) : (
              <>
                Browser fallback used ({ingestedPage.fallbackReason || 'serverless fallback'}):
                extracted structured metadata, product photos, and specifications from{' '}
                <strong className="text-[#faf4e8]">{ingestedPage.title}</strong>.
              </>
            )}
          </p>
        </div>

        {/* Summary Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
          {screenshotCount > 0 && (
            <span className="rounded-lg bg-[#0c0a08] border border-[#dfd3be]/20 px-2.5 py-1 font-mono text-[#faf4e8]">
              {screenshotCount} Live Screenshot{screenshotCount === 1 ? '' : 's'}
            </span>
          )}
          <span
            data-testid="captured-images-count"
            className="rounded-lg bg-[#0c0a08] border border-[#dfd3be]/20 px-2.5 py-1 font-mono text-[#f3d478]"
          >
            {images.length} Product Image{images.length === 1 ? '' : 's'}
          </span>
          <span
            data-testid="captured-text-length"
            className="rounded-lg bg-[#0c0a08] border border-[#dfd3be]/20 px-2.5 py-1 font-mono text-[#dfd3be]"
          >
            {ingestedPage.visibleText.length.toLocaleString()} chars text
          </span>
          {ingestedPage.finalUrl && (
            <a
              href={ingestedPage.finalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-[#231d15] border border-[#dfd3be]/25 px-2.5 py-1 font-semibold text-[#f3d478] hover:border-[#f3d478] transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Source Page
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Horizontal Visual Strip: Screenshots + Captured Product Gallery Images */}
      <div
        data-testid="what-we-saw-gallery"
        className="flex gap-3.5 overflow-x-auto pb-2 pt-1"
      >
        {/* Above-the-Fold Screenshot */}
        {ingestedPage.aboveFoldScreenshot && (
          <button
            type="button"
            data-testid="screenshot-above-fold"
            onClick={() =>
              setLightboxImage({
                src: ingestedPage.aboveFoldScreenshot!,
                title: `${ingestedPage.title} — Above-the-Fold Browser Render`,
                subtitle: `1440×900 live viewport · ${ingestedPage.browserEngine || 'Playwright Chromium'}`,
              })
            }
            className="group relative flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-[#e5bd47]/50 bg-[#0c0a08] text-left hover:border-[#f3d478] transition-all"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#17130e]">
              <img
                src={ingestedPage.aboveFoldScreenshot}
                alt="Above-the-fold live browser screenshot"
                className="h-full w-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-[#0c0a08]/90 border border-[#e5bd47]/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#f3d478]">
                <CheckCircle2 className="h-3 w-3 text-[#e5bd47]" />
                Above-the-Fold
              </span>
              <span className="absolute right-2 bottom-2 rounded bg-[#0c0a08]/85 p-1 text-[#faf4e8] opacity-80 group-hover:opacity-100">
                <Maximize2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="p-2.5 space-y-0.5">
              <div className="text-xs font-bold text-[#faf4e8] truncate">
                Live Viewport Capture
              </div>
              <div className="text-[11px] font-mono text-[#b5a48b]">
                1440×900 · Sent to Gemini 4 Argon
              </div>
            </div>
          </button>
        )}

        {/* Full-Page Screenshot */}
        {ingestedPage.fullPageScreenshot && (
          <button
            type="button"
            data-testid="screenshot-full-page"
            onClick={() =>
              setLightboxImage({
                src: ingestedPage.fullPageScreenshot!,
                title: `${ingestedPage.title} — Full-Page Browser Render`,
                subtitle: 'Scrolled full-page capture after lazy-image hydration',
              })
            }
            className="group relative flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-[#e5bd47]/40 bg-[#0c0a08] text-left hover:border-[#f3d478] transition-all"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#17130e]">
              <img
                src={ingestedPage.fullPageScreenshot}
                alt="Full-page live browser screenshot"
                className="h-full w-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-[#0c0a08]/90 border border-[#dfd3be]/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#dfd3be]">
                Full-Page Scroll
              </span>
              <span className="absolute right-2 bottom-2 rounded bg-[#0c0a08]/85 p-1 text-[#faf4e8] opacity-80 group-hover:opacity-100">
                <Maximize2 className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="p-2.5 space-y-0.5">
              <div className="text-xs font-bold text-[#faf4e8] truncate">
                Full-Page Scroll Capture
              </div>
              <div className="text-[11px] font-mono text-[#b5a48b]">
                Lazy-loaded DOM · Multimodal input
              </div>
            </div>
          </button>
        )}

        {/* Captured Product Images */}
        {images.map((img, idx) => {
          const displaySrc = img.dataUrl || img.url;
          return (
            <button
              key={`${img.url}-${idx}`}
              type="button"
              data-testid={`captured-product-image-${idx}`}
              onClick={() =>
                setLightboxImage({
                  src: displaySrc,
                  title: img.alt || `${ingestedPage.title} — Product Image #${idx + 1}`,
                  subtitle: `${img.source.toUpperCase()}${
                    img.width && img.height ? ` · ${img.width}×${img.height}px` : ''
                  }`,
                })
              }
              className="group relative flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] text-left hover:border-[#f3d478] transition-all"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#17130e] flex items-center justify-center">
                <img
                  src={displaySrc}
                  alt={img.alt || `Product photo ${idx + 1}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedUrls((prev) => ({ ...prev, [displaySrc]: true }))
                  }
                  className="h-full w-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
                />
                <span className="absolute left-2 top-2 rounded bg-[#0c0a08]/90 border border-[#dfd3be]/25 px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#f3d478]">
                  {img.source}
                </span>
                {idx < 4 && (
                  <span className="absolute right-2 top-2 rounded bg-[#e5bd47] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#140e07]">
                    Vision Part
                  </span>
                )}
              </div>
              <div className="p-2.5 space-y-0.5">
                <div className="text-xs font-semibold text-[#faf4e8] truncate">
                  {img.alt || `Product Photo #${idx + 1}`}
                </div>
                <div className="text-[11px] font-mono text-[#b5a48b]">
                  {img.width && img.height
                    ? `${img.width}×${img.height}px`
                    : 'High-Res Product Media'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toggle Bar for Extracted Page Text, Variants & Specs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#dfd3be]/15 pt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#dfd3be]">
          {ingestedPage.price && (
            <span className="rounded-md bg-[#231d15] border border-[#e5bd47]/35 px-2.5 py-1 font-mono text-[#f3d478]">
              Captured Price: ${ingestedPage.price.toFixed(2)} {ingestedPage.currency || 'USD'}
            </span>
          )}
          {ingestedPage.brand && (
            <span className="rounded-md bg-[#231d15] border border-[#dfd3be]/20 px-2.5 py-1 text-[#faf4e8]">
              Brand: <strong>{ingestedPage.brand}</strong>
            </span>
          )}
          {variants.length > 0 && (
            <span className="rounded-md bg-[#231d15] border border-[#dfd3be]/20 px-2.5 py-1 text-[#dfd3be]">
              {variants.length} Variant{variants.length === 1 ? '' : 's'}:{' '}
              {variants
                .slice(0, 3)
                .map((v) => v.name)
                .join(', ')}
              {variants.length > 3 ? '…' : ''}
            </span>
          )}
          {specEntries.length > 0 && (
            <span className="rounded-md bg-[#231d15] border border-[#dfd3be]/20 px-2.5 py-1 text-[#dfd3be]">
              {specEntries.length} Extracted Spec{specEntries.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="toggle-extracted-page-details"
          onClick={() => setShowTextAndSpecs((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#dfd3be]/25 bg-[#231d15] px-3 py-1.5 text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478] transition-colors"
        >
          <FileText className="h-3.5 w-3.5 text-[#e5bd47]" />
          {showTextAndSpecs
            ? 'Hide Extracted Text & Specs'
            : 'Inspect Extracted Page Text & Specs'}
          {showTextAndSpecs ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Expanded Extracted Specs, Variants & Visible Text */}
      {showTextAndSpecs && (
        <div
          data-testid="extracted-page-details-panel"
          className="grid gap-4 lg:grid-cols-2 border-t border-[#dfd3be]/15 pt-4"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              <Layers className="h-3.5 w-3.5 text-[#e5bd47]" />
              Extracted Specs &amp; Variants ({specEntries.length} specs, {variants.length} variants)
            </div>

            {variants.length > 0 && (
              <div className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#b5a48b]">
                  Captured Product Variants
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {variants.map((v, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-[#17130e] border border-[#dfd3be]/20 px-2 py-0.5 text-xs text-[#faf4e8] font-mono"
                    >
                      {v.name}
                      {v.price ? ` · $${v.price}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {specEntries.length > 0 ? (
              <div className="max-h-56 overflow-y-auto rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 space-y-1.5">
                {specEntries.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-start justify-between gap-3 border-b border-[#dfd3be]/10 pb-1.5 last:border-0 last:pb-0 text-xs"
                  >
                    <span className="font-semibold text-[#b5a48b] shrink-0">
                      {k}
                    </span>
                    <span className="text-[#faf4e8] text-right font-mono">
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3 text-xs text-[#b5a48b]">
                Specifications embedded in main page body text (see visible text excerpt).
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[#f3d478]">
              <span className="inline-flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-[#e5bd47]" />
                Captured Visible Page Text (innerText)
              </span>
              <span className="font-mono text-[11px] text-[#b5a48b]">
                {ingestedPage.visibleText.length.toLocaleString()} chars
              </span>
            </div>
            <pre
              data-testid="extracted-visible-text"
              className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-3.5 font-mono text-xs text-[#dfd3be] leading-relaxed"
            >
              {ingestedPage.visibleText || ingestedPage.description || 'No text captured.'}
            </pre>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Screenshots & Product Photos */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c0a08]/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl surface-card border border-[#e5bd47]/50 p-4 sm:p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-display text-lg font-bold text-[#faf4e8]">
                  {lightboxImage.title}
                </h4>
                {lightboxImage.subtitle && (
                  <p className="text-xs font-mono text-[#b5a48b]">
                    {lightboxImage.subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#231d15] border border-[#dfd3be]/25 px-3 py-1.5 text-xs font-semibold text-[#faf4e8] hover:border-[#f3d478]"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-xl border border-[#dfd3be]/20 bg-[#0c0a08] p-2 flex items-center justify-center">
              <img
                src={lightboxImage.src}
                alt={lightboxImage.title}
                className="max-h-[72vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
