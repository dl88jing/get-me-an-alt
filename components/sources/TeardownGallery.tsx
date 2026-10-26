'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BomItem, DesignPart } from '../../lib/types';
import type {
  TeardownData,
  TeardownFrame,
  TeardownPart,
  TeardownVideo,
} from '../../lib/agents/teardown';
import {
  buildTimestampedVideoUrl,
  extractVimeoId,
  extractYouTubeId,
  formatTimestamp,
  getThumbnail,
} from '../../lib/agents/researcher-depth';

export interface TeardownGalleryProps {
  teardown?: TeardownData | null;
  bomItems?: BomItem[];
  designParts?: DesignPart[];
  onSelectBomRef?: (bomRefOrQuery: string) => void;
  onSelectDesignPart?: (partIdOrName: string) => void;
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates a clean Renaissance Ink Sketch SVG data URI fallback
 * (always XML-escaped so it never fails to render in <img>).
 */
function buildFallbackSvg(frame: TeardownFrame, idx: number): string {
  const ts = `${formatTimestamp(frame.t)} (t=${frame.t}s)`;
  const title =
    frame.parts.map((p) => p.name).join(' + ') ||
    `Disassembly Plate ${idx + 1}`;
  const c1 = frame.parts[0]
    ? `${frame.parts[0].buyOrPrint === 'print' ? '3D Print' : 'OTS'}: ${frame.parts[0].name}`
    : 'Primary Internal Sub-Assembly';
  const c2 = frame.parts[1]
    ? `${frame.parts[1].buyOrPrint === 'print' ? '3D Print' : 'OTS'}: ${frame.parts[1].name}`
    : 'Fastener & Coupling Datum';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs>
      <radialGradient id="vellum" cx="50%" cy="42%" r="68%">
        <stop offset="0%" stop-color="#281e14"/>
        <stop offset="65%" stop-color="#19130c"/>
        <stop offset="100%" stop-color="#0f0b07"/>
      </radialGradient>
      <pattern id="plateGrid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d4af37" stroke-opacity="0.12" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="640" height="360" fill="url(#vellum)"/>
    <rect width="640" height="360" fill="url(#plateGrid)"/>
    <rect x="16" y="16" width="608" height="328" rx="12" fill="none" stroke="#d4af37" stroke-opacity="0.55" stroke-width="1.5"/>
    <rect x="22" y="22" width="596" height="316" rx="8" fill="none" stroke="#d4af37" stroke-opacity="0.22" stroke-dasharray="4 4" stroke-width="1"/>
    <circle cx="192" cy="194" r="82" fill="#140f0a" stroke="#d4af37" stroke-opacity="0.7" stroke-width="1.8"/>
    <circle cx="192" cy="194" r="58" fill="none" stroke="#e6d3b3" stroke-opacity="0.55" stroke-dasharray="6 4" stroke-width="1.4"/>
    <circle cx="192" cy="194" r="32" fill="none" stroke="#d4af37" stroke-opacity="0.4" stroke-width="1"/>
    <line x1="100" y1="194" x2="284" y2="194" stroke="#d4af37" stroke-opacity="0.28" stroke-dasharray="3 3" stroke-width="1"/>
    <line x1="192" y1="102" x2="192" y2="286" stroke="#d4af37" stroke-opacity="0.28" stroke-dasharray="3 3" stroke-width="1"/>
    <rect x="156" y="162" width="72" height="64" rx="6" fill="#231910" stroke="#f3d478" stroke-width="1.8"/>
    <line x1="228" y1="176" x2="324" y2="136" stroke="#d4af37" stroke-width="1.8"/>
    <circle cx="228" cy="176" r="4" fill="#d4af37"/>
    <line x1="228" y1="210" x2="324" y2="224" stroke="#b89b4a" stroke-width="1.8"/>
    <circle cx="228" cy="210" r="4" fill="#b89b4a"/>
    <text x="36" y="50" fill="#f3d478" font-family="Georgia, serif" font-size="12" font-weight="bold" letter-spacing="1.5">INTERNAL PART TELEMETRY · DISASSEMBLY @ ${escapeXml(ts)}</text>
    <text x="36" y="76" fill="#f5ebd6" font-family="Georgia, serif" font-size="15" font-weight="bold">${escapeXml(title.slice(0, 62))}</text>
    <rect x="324" y="106" width="276" height="74" rx="8" fill="#15100b" stroke="#d4af37" stroke-opacity="0.65" stroke-width="1.2"/>
    <text x="338" y="128" fill="#f3d478" font-family="Georgia, serif" font-size="10" font-weight="bold" letter-spacing="1.2">CALLOUT 1 · PRIMARY SUB-ASSEMBLY</text>
    <text x="338" y="152" fill="#f5ebd6" font-family="monospace" font-size="11.5">${escapeXml(c1.slice(0, 36))}</text>
    <rect x="324" y="194" width="276" height="74" rx="8" fill="#15100b" stroke="#b89b4a" stroke-opacity="0.65" stroke-width="1.2"/>
    <text x="338" y="216" fill="#e6d3b3" font-family="Georgia, serif" font-size="10" font-weight="bold" letter-spacing="1.2">CALLOUT 2 · COUPLED MECHANISM</text>
    <text x="338" y="240" fill="#f5ebd6" font-family="monospace" font-size="11.5">${escapeXml(c2.slice(0, 36))}</text>
    <text x="36" y="322" fill="#bda782" font-family="Georgia, serif" font-size="11" font-style="italic">Get Me An Alt · Gemini 4 Argon Multimodal Internal Part Callout</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function resolveFrameVideoUrl(
  frame: TeardownFrame,
  videos: TeardownVideo[] = []
): string | undefined {
  const candidates = [frame.video, ...videos.map((v) => v.url)].filter(
    (u): u is string => Boolean(u && u.trim())
  );

  for (const url of candidates) {
    if (
      extractYouTubeId(url) ||
      extractVimeoId(url) ||
      /\.(mp4|webm)(\?.*)?$/i.test(url)
    ) {
      return url.trim();
    }
  }

  return candidates[0]?.trim();
}

function isDirectVideoFile(videoUrl: string | undefined): boolean {
  if (!videoUrl) return false;
  return /\.(mp4|webm)(\?.*)?$/i.test(videoUrl.trim());
}

function buildEmbedVideoSrc(
  videoUrl: string | undefined,
  startSeconds: number,
  autoplay = false
): string | null {
  if (!videoUrl) return null;
  const t = Math.max(0, Math.floor(Number(startSeconds) || 0));

  const ytId = extractYouTubeId(videoUrl);
  if (ytId) {
    const params = new URLSearchParams({
      start: String(t),
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1',
    });
    if (autoplay) {
      params.set('autoplay', '1');
    }
    return `https://www.youtube-nocookie.com/embed/${ytId}?${params.toString()}`;
  }

  const vimeoId = extractVimeoId(videoUrl);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}?autoplay=${
      autoplay ? 1 : 0
    }#t=${t}s`;
  }

  return null;
}

function sanitizeImageCandidate(
  raw: string | undefined,
  frame: TeardownFrame,
  idx: number
): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/svg+xml')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      const prefix = trimmed.slice(0, commaIdx + 1);
      const payload = trimmed.slice(commaIdx + 1);
      try {
        const decoded = decodeURIComponent(payload);
        const fixedXml = decoded
          .replace(/&amp;;/g, '&amp;')
          .replace(
            /&(?:amp?(?![a-zA-Z0-9#]+;)|(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);))/g,
            '&amp;'
          );
        return `${prefix}${encodeURIComponent(fixedXml)}`;
      } catch {
        return buildFallbackSvg(frame, idx);
      }
    }
  }

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed;
  }

  return null;
}

/**
 * Resolves a browser-renderable thumbnail URL for a teardown frame card (preferring
 * the real YouTube thumbnail `i.ytimg.com/vi/<id>/hqdefault.jpg` or extracted WebP frame,
 * then any `data:image/...` artifact image).
 */
function resolveFrameImageSrc(
  frame: TeardownFrame,
  idx = 0,
  videos: TeardownVideo[] = []
): string {
  const resolvedVideo = resolveFrameVideoUrl(frame, videos);
  const candidates = [
    frame.thumbnailUrl,
    resolvedVideo ? getThumbnail(resolvedVideo) : undefined,
    frame.image,
    getThumbnail(frame.video),
  ];

  for (const raw of candidates) {
    const clean = sanitizeImageCandidate(raw, frame, idx);
    if (clean) return clean;
  }

  return buildFallbackSvg(frame, idx);
}

/**
 * Resolves the frame's artifact image (`frame.image`, including any `data:image/...`
 * schematic or `/media/teardown/...` image) so `data:image/...` artifacts always render
 * inside an `<img>` tag, never as raw text.
 */
function resolveFrameArtifactImageSrc(
  frame: TeardownFrame,
  idx = 0,
  videos: TeardownVideo[] = []
): string {
  const resolvedVideo = resolveFrameVideoUrl(frame, videos);
  const candidates = [
    frame.image,
    frame.thumbnailUrl,
    resolvedVideo ? getThumbnail(resolvedVideo) : undefined,
    getThumbnail(frame.video),
  ];

  for (const raw of candidates) {
    const clean = sanitizeImageCandidate(raw, frame, idx);
    if (clean) return clean;
  }

  return buildFallbackSvg(frame, idx);
}

export function TeardownGallery({
  teardown,
  bomItems = [],
  designParts = [],
  onSelectBomRef,
  onSelectDesignPart,
}: TeardownGalleryProps) {
  const frames: TeardownFrame[] = useMemo(
    () => (Array.isArray(teardown?.frames) ? teardown!.frames : []),
    [teardown]
  );
  const videos: TeardownVideo[] = useMemo(
    () => (Array.isArray(teardown?.videos) ? teardown!.videos : []),
    [teardown]
  );

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [seekNonce, setSeekNonce] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [expandedPartKeys, setExpandedPartKeys] = useState<
    Record<string, boolean>
  >({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const activeIndex =
    frames.length > 0 ? Math.min(selectedIdx, frames.length - 1) : 0;
  const activeFrame: TeardownFrame | undefined = frames[activeIndex];

  const handleSelectAndSeek = useCallback(
    (idx: number, shouldAutoplay = true) => {
      const targetFrame = frames[idx];
      setSelectedIdx(idx);
      setAutoplay(shouldAutoplay);
      setSeekNonce((n) => n + 1);

      if (
        targetFrame &&
        idx === activeIndex &&
        iframeRef.current?.contentWindow
      ) {
        try {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({
              event: 'command',
              func: 'seekTo',
              args: [Math.max(0, Math.floor(Number(targetFrame.t) || 0)), true],
            }),
            '*'
          );
          if (shouldAutoplay) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({
                event: 'command',
                func: 'playVideo',
                args: [],
              }),
              '*'
            );
          }
        } catch {
          // iframe reload via key handles seeking
        }
      }
    },
    [frames, activeIndex]
  );

  const stepFrame = useCallback(
    (delta: number) => {
      if (frames.length <= 1) return;
      const nextIdx = (activeIndex + delta + frames.length) % frames.length;
      handleSelectAndSeek(nextIdx, false);
    },
    [frames.length, activeIndex, handleSelectAndSeek]
  );

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxOpen(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, stepFrame]);

  const handleSectionKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      stepFrame(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      stepFrame(-1);
    }
  };

  const findMatchingBomItem = (part: TeardownPart): BomItem | undefined => {
    if (part.bomRef) {
      const byId = bomItems.find(
        (b) => b.id === part.bomRef || b.partNumber === part.bomRef
      );
      if (byId) return byId;
    }
    const q = (part.offTheShelfQuery || part.name || '').toLowerCase();
    const tokens = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (tokens.length === 0) return undefined;
    return bomItems.find((b) => {
      const hay = `${b.name} ${b.specification} ${b.partNumber}`.toLowerCase();
      return tokens.some((tk) => hay.includes(tk));
    });
  };

  const findMatchingDesignPart = (
    part: TeardownPart
  ): DesignPart | undefined => {
    if (part.partId) {
      const byId = designParts.find(
        (d) => d.id === part.partId || d.partNumber === part.partId
      );
      if (byId) return byId;
    }
    const tokens = (part.name || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
    if (tokens.length === 0) return undefined;
    return designParts.find((d) => {
      const hay = `${d.name} ${d.description || ''} ${d.id}`.toLowerCase();
      return tokens.some((tk) => hay.includes(tk));
    });
  };

  if (!teardown && frames.length === 0 && videos.length === 0) {
    return null;
  }

  const activeVideoUrl = activeFrame
    ? resolveFrameVideoUrl(activeFrame, videos)
    : videos[0]?.url;
  const activeEmbedUrl = activeFrame
    ? buildEmbedVideoSrc(activeVideoUrl, activeFrame.t, autoplay)
    : videos[0]?.url
    ? buildEmbedVideoSrc(videos[0].url, 0, false)
    : null;
  const activeIsDirectVideo = isDirectVideoFile(activeVideoUrl);

  const activeImgSrc = activeFrame
    ? failedImages[activeIndex]
      ? buildFallbackSvg(activeFrame, activeIndex)
      : resolveFrameImageSrc(activeFrame, activeIndex, videos)
    : '';

  const activeArtifactImgSrc = activeFrame
    ? failedImages[activeIndex]
      ? buildFallbackSvg(activeFrame, activeIndex)
      : resolveFrameArtifactImageSrc(activeFrame, activeIndex, videos)
    : '';

  const activeTsLabel = activeFrame ? formatTimestamp(activeFrame.t) : '0:00';
  const activeMeanConfidence = activeFrame?.parts?.length
    ? Math.round(
        (activeFrame.parts.reduce(
          (acc, p) => acc + (Number(p.confidence) || 0.92),
          0
        ) /
          activeFrame.parts.length) *
          100
      )
    : 95;

  return (
    <section
      tabIndex={0}
      onKeyDown={handleSectionKeyDown}
      aria-label="Video Teardown & Frame-by-Frame Part Callouts"
      className="rounded-2xl codex-folio p-5 sm:p-6 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/60"
    >
      {/* Section Header */}
      <div className="flex flex-col gap-3.5 border-b border-[#d4af37]/20 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-0.5 font-codex text-[11px] font-bold uppercase tracking-wider text-[#f3d478]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[#f3d478]"
                aria-hidden="true"
              />
              Video Teardown Agent
            </span>
            <h3 className="font-display text-lg font-bold tracking-tight text-[#f5ebd6]">
              Frame-by-Frame Internal Part Analysis
            </h3>
            <span className="rounded-full border border-[#d4af37]/30 bg-[#14100b] px-2.5 py-0.5 font-mono text-xs text-[#e6d3b3] tabular-nums">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#c7ae87]">
            Gemini 4 Argon inspects disassembly timestamps and maps visible
            internal mechanisms directly to{' '}
            <span className="font-semibold text-[#e6d3b3]">
              3D-printed vessels
            </span>{' '}
            and{' '}
            <span className="font-semibold text-[#f3d478]">
              off-the-shelf BOM hardware
            </span>
            .
          </p>
        </div>

        {/* Source Video Pills */}
        {videos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {videos.map((v: TeardownVideo) => (
              <a
                key={v.url}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#d4af37]/30 bg-[#120e0a]/90 px-3 py-1.5 text-xs font-medium text-[#f5ebd6] transition-all hover:border-[#f3d478]/65 hover:bg-[#d4af37]/15 hover:text-[#f3d478]"
              >
                <span className="max-w-[220px] truncate">{v.title}</span>
                <span aria-hidden="true" className="text-[#d4af37]">
                  ↗
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {frames.length === 0 ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[#d4af37]/20 bg-[#120e0a]/80 p-4 text-xs text-[#c7ae87]">
          {activeEmbedUrl && (
            <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-[#d4af37]/40 bg-[#0c0906] shadow-inner">
              <iframe
                src={activeEmbedUrl}
                title={videos[0]?.title || 'Reference Teardown Video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          )}
          <p className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
            Static Visual Input · No Disassembly Video Timestamps Required
          </p>
          <p className="mt-1 leading-relaxed text-[#e6d3b3]">
            {teardown?.note ||
              'No direct teardown video was needed for this run. Use the Sources cards below or switch to the Exploded 3D View tab to inspect every internal component.'}
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {/* Navigation Bar + Affordance Hint */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#c7ae87]">
              <span className="font-codex text-[11px] uppercase tracking-wider text-[#f3d478]">
                Disassembly Plates
              </span>
              <span className="text-[#d4af37]/40">·</span>
              <span>
                Click any timestamp card to seek the embedded video player, or{' '}
                <kbd className="rounded border border-[#d4af37]/30 bg-[#14100b] px-1.5 py-0.5 font-mono text-[10px] text-[#f3d478]">←</kbd>{' '}
                <kbd className="rounded border border-[#d4af37]/30 bg-[#14100b] px-1.5 py-0.5 font-mono text-[10px] text-[#f3d478]">→</kbd>{' '}
                to step frames
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepFrame(-1)}
                aria-label="Previous teardown frame"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs font-medium text-[#dfd3be] transition-colors hover:border-[#f3d478]/60 hover:bg-[#d4af37]/15 hover:text-[#faf4e8]"
              >
                ← Prev
              </button>
              <span className="px-2 font-mono text-xs text-[#f3d478] tabular-nums">
                {activeIndex + 1} / {frames.length}
              </span>
              <button
                type="button"
                onClick={() => stepFrame(1)}
                aria-label="Next teardown frame"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 text-xs font-medium text-[#dfd3be] transition-colors hover:border-[#f3d478]/60 hover:bg-[#d4af37]/15 hover:text-[#faf4e8]"
              >
                Next →
              </button>
            </div>
          </div>

          {/* Frame Selector Thumbnail Strip */}
          <div
            role="tablist"
            aria-label="Teardown video frames"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {frames.map((frame: TeardownFrame, idx: number) => {
              const isSelected = idx === activeIndex;
              const thumbSrc = failedImages[idx]
                ? buildFallbackSvg(frame, idx)
                : resolveFrameImageSrc(frame, idx, videos);
              const tsLabel = formatTimestamp(frame.t);
              const partSummary =
                frame.parts.map((p: TeardownPart) => p.name).join(' · ') ||
                `Frame @ ${tsLabel}`;

              return (
                <button
                  key={`${frame.video}-${frame.t}-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleSelectAndSeek(idx, true)}
                  className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478] ${
                    isSelected
                      ? 'border-[#f3d478] bg-[#d4af37]/15 shadow-[0_0_25px_-6px_rgba(212,175,55,0.45)] ring-1 ring-[#f3d478]/50'
                      : 'border-[#d4af37]/25 bg-[#120e0a]/85 hover:border-[#d4af37]/55 hover:bg-[#1a140e]'
                  }`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-[#0c0906]">
                    {!loadedImages[idx] && (
                      <div
                        className="skeleton-shimmer absolute inset-0"
                        aria-hidden="true"
                      />
                    )}
                    <img
                      src={thumbSrc}
                      alt={`Teardown frame ${idx + 1} at ${tsLabel}: ${partSummary}`}
                      onLoad={() =>
                        setLoadedImages((prev) => ({ ...prev, [idx]: true }))
                      }
                      onError={() => {
                        setFailedImages((prev) => ({ ...prev, [idx]: true }));
                        setLoadedImages((prev) => ({ ...prev, [idx]: true }));
                      }}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0906]/85 via-transparent to-transparent" />
                    <span
                      className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                        isSelected
                          ? 'border-[#f3d478]/60 bg-[#14100b]/95 text-[#f3d478]'
                          : 'border-[#d4af37]/30 bg-[#0c0906]/90 text-[#e6d3b3]'
                      }`}
                    >
                      <span aria-hidden="true">▶</span>
                      <span>
                        {tsLabel} ({frame.t}s)
                      </span>
                    </span>
                    <span className="absolute right-1.5 top-1.5 rounded border border-[#d4af37]/30 bg-[#0c0906]/90 px-1.5 py-0.5 font-mono text-[10px] text-[#f3d478]">
                      {frame.parts.length}{' '}
                      {frame.parts.length === 1 ? 'part' : 'parts'}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p
                      className={`truncate text-xs font-semibold ${
                        isSelected
                          ? 'text-[#f5ebd6]'
                          : 'text-[#e6d3b3] group-hover:text-[#f5ebd6]'
                      }`}
                    >
                      {frame.parts[0]?.name || `Frame @ ${tsLabel}`}
                    </p>
                    {frame.parts[1] && (
                      <p className="mt-0.5 truncate text-[11px] text-[#bda782]">
                        + {frame.parts[1].name}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Frame Detail + Part Callouts */}
          {activeFrame && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* Left: Embedded Video Player (or Frame Image) + Tasteful Metadata & Part Chips Bar */}
              <div className="flex flex-col justify-between rounded-2xl border border-[#d4af37]/30 bg-[#120e0a]/90 p-4 shadow-xl lg:col-span-5">
                <div>
                  {activeEmbedUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#d4af37]/40 bg-[#0c0906] shadow-inner">
                      <iframe
                        ref={iframeRef}
                        key={`${activeEmbedUrl}-${seekNonce}`}
                        src={activeEmbedUrl}
                        title={`Teardown video at ${activeTsLabel} (t=${activeFrame.t}s)`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                      <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5">
                        <span className="rounded-md border border-[#d4af37]/45 bg-[#0c0906]/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#f3d478] backdrop-blur-sm tabular-nums">
                          t = {activeFrame.t}s ({activeTsLabel})
                        </span>
                        <span className="rounded-md border border-[#b89b4a]/45 bg-[#14100b]/90 px-2 py-0.5 font-mono text-[11px] font-medium text-[#e6d3b3] backdrop-blur-sm tabular-nums">
                          {activeMeanConfidence}% conf
                        </span>
                      </div>
                    </div>
                  ) : activeIsDirectVideo && activeVideoUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#d4af37]/40 bg-[#0c0906] shadow-inner">
                      <video
                        key={`${activeVideoUrl}-${activeFrame.t}-${seekNonce}`}
                        src={`${activeVideoUrl}#t=${activeFrame.t}`}
                        controls
                        autoPlay={autoplay}
                        playsInline
                        className="h-full w-full object-contain"
                      />
                      <div className="pointer-events-none absolute left-2.5 top-2.5 flex items-center gap-1.5">
                        <span className="rounded-md border border-[#d4af37]/45 bg-[#0c0906]/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#f3d478] backdrop-blur-sm tabular-nums">
                          t = {activeFrame.t}s ({activeTsLabel})
                        </span>
                        <span className="rounded-md border border-[#b89b4a]/45 bg-[#14100b]/90 px-2 py-0.5 font-mono text-[11px] font-medium text-[#e6d3b3] backdrop-blur-sm tabular-nums">
                          {activeMeanConfidence}% conf
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      aria-label={`Open full-screen lightbox for frame at ${activeTsLabel}`}
                      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-[#d4af37]/40 bg-[#0c0906] text-left shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
                    >
                      {!loadedImages[activeIndex] && (
                        <div
                          className="skeleton-shimmer absolute inset-0"
                          aria-hidden="true"
                        />
                      )}
                      <img
                        src={activeArtifactImgSrc || activeImgSrc}
                        alt={`Teardown frame at ${activeTsLabel}: ${activeFrame.parts
                          .map((p) => p.name)
                          .join(', ')}`}
                        onLoad={() =>
                          setLoadedImages((prev) => ({
                            ...prev,
                            [activeIndex]: true,
                          }))
                        }
                        onError={() => {
                          setFailedImages((prev) => ({
                            ...prev,
                            [activeIndex]: true,
                          }));
                          setLoadedImages((prev) => ({
                            ...prev,
                            [activeIndex]: true,
                          }));
                        }}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0906]/80 via-transparent to-[#0c0906]/30" />

                      {/* Top-left timestamp badge */}
                      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                        <span className="rounded-md border border-[#d4af37]/45 bg-[#0c0906]/90 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#f3d478] backdrop-blur-sm tabular-nums">
                          t = {activeFrame.t}s ({activeTsLabel})
                        </span>
                        <span className="rounded-md border border-[#b89b4a]/45 bg-[#14100b]/90 px-2 py-0.5 font-mono text-[11px] font-medium text-[#e6d3b3] backdrop-blur-sm tabular-nums">
                          {activeMeanConfidence}% conf
                        </span>
                      </div>

                      {/* Top-right expand affordance */}
                      <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-md border border-[#d4af37]/40 bg-[#0c0906]/85 px-2 py-0.5 font-codex text-[10px] uppercase tracking-wider text-[#e6d3b3] opacity-90 transition-all group-hover:border-[#f3d478] group-hover:bg-[#14100b] group-hover:text-[#f3d478]">
                        ⤢ Enlarge Plate
                      </span>
                    </button>
                  )}

                  {activeFrame.description && (
                    <p className="mt-3 text-xs leading-relaxed text-[#e6d3b3]">
                      {activeFrame.description}
                    </p>
                  )}

                  {/* Captured Disassembly Frame Image Preview alongside Embedded Video Player */}
                  {(activeEmbedUrl || activeIsDirectVideo) &&
                    (activeArtifactImgSrc || activeImgSrc) && (
                      <button
                        type="button"
                        onClick={() => setLightboxOpen(true)}
                        className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-[#d4af37]/25 bg-[#0c0906]/85 p-2 text-left transition-all hover:border-[#f3d478]/60 hover:bg-[#17120c]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <img
                            src={activeArtifactImgSrc || activeImgSrc}
                            alt={`Captured frame plate at ${activeTsLabel}`}
                            onError={() =>
                              setFailedImages((prev) => ({
                                ...prev,
                                [activeIndex]: true,
                              }))
                            }
                            className="h-12 w-20 shrink-0 rounded-lg border border-[#d4af37]/30 bg-[#0c0906] object-cover"
                          />
                          <div className="min-w-0">
                            <p className="font-codex text-[10px] font-bold uppercase tracking-wider text-[#f3d478]">
                              Disassembly Frame Plate · {activeTsLabel}
                            </p>
                            <p className="truncate text-[11px] text-[#e6d3b3]">
                              {activeFrame.parts.map((p) => p.name).join(' + ')}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-md border border-[#d4af37]/35 bg-[#14100b] px-2 py-1 font-codex text-[10px] uppercase tracking-wider text-[#f3d478]">
                          ⤢ Enlarge
                        </span>
                      </button>
                    )}
                </div>

                {/* Tasteful Caption & Metadata Row (Part Chips + Timestamp + Confidence + Watch Button) */}
                <div className="mt-4 space-y-3 border-t border-[#d4af37]/20 pt-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-codex text-[10px] font-bold uppercase tracking-wider text-[#bda782]">
                      Mapped Parts:
                    </span>
                    {activeFrame.parts.map((part, pIdx) => {
                      const matchedBom = findMatchingBomItem(part);
                      const matchedDesign = findMatchingDesignPart(part);
                      const isPrint = part.buyOrPrint === 'print';

                      return (
                        <button
                          key={`chip-${part.name}-${pIdx}`}
                          type="button"
                          onClick={() => {
                            if (isPrint && onSelectDesignPart) {
                              onSelectDesignPart(
                                matchedDesign?.id || part.partId || part.name
                              );
                            } else if (!isPrint && onSelectBomRef) {
                              onSelectBomRef(
                                matchedBom?.id ||
                                  part.bomRef ||
                                  part.offTheShelfQuery ||
                                  part.name
                              );
                            } else if (onSelectDesignPart) {
                              onSelectDesignPart(
                                matchedDesign?.id || part.partId || part.name
                              );
                            }
                          }}
                          title={
                            isPrint
                              ? `Inspect ${part.name} in 3D Exploded View`
                              : `Inspect ${part.name} in Bill of Materials`
                          }
                          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                            isPrint
                              ? 'border-[#b89b4a]/45 bg-[#1d1710]/90 text-[#e6d3b3] hover:border-[#f3d478]/65 hover:bg-[#282016]'
                              : 'border-[#d4af37]/40 bg-[#d4af37]/12 text-[#f3d478] hover:border-[#f3d478]/70 hover:bg-[#d4af37]/25'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isPrint ? 'bg-[#b89b4a]' : 'bg-[#f3d478]'
                            }`}
                          />
                          <span className="max-w-[165px] truncate">
                            {part.name}
                          </span>
                          <span className="font-mono text-[10px] opacity-75">
                            {Math.round((Number(part.confidence) || 0.95) * 100)}%
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#bda782] tabular-nums">
                      <span>Timestamp {activeTsLabel}</span>
                      <span>·</span>
                      <span>{activeMeanConfidence}% mean confidence</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAndSeek(activeIndex, true)}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#d4af37]/50 bg-[#d4af37]/20 px-3.5 py-1.5 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478] transition-all hover:border-[#f3d478] hover:bg-[#d4af37]/30 hover:text-[#faf4e8]"
                      >
                        <span aria-hidden="true">▶</span>
                        <span>
                          Watch video @ {activeTsLabel} (t={activeFrame.t}s)
                        </span>
                      </button>
                      {activeVideoUrl && (
                        <a
                          href={buildTimestampedVideoUrl(
                            activeVideoUrl,
                            activeFrame.t
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[#d4af37]/30 bg-[#14100b] px-3 py-1.5 font-codex text-[11px] font-bold uppercase tracking-wider text-[#dfd3be] transition-all hover:border-[#f3d478] hover:text-[#f3d478]"
                          title="Open video at this timestamp on YouTube"
                        >
                          <span>YouTube</span>
                          <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Per-Part Callouts with BOM & Design Links */}
              <div className="space-y-3 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                    Identified Internal Components at {activeTsLabel} (
                    {activeFrame.parts.length})
                  </h4>
                  {teardown?.note && (
                    <span className="max-w-sm truncate text-[11px] italic text-[#b5a48b]">
                      {teardown.note}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {activeFrame.parts.map((part, pIdx) => {
                    const matchedBom = findMatchingBomItem(part);
                    const matchedDesign = findMatchingDesignPart(part);
                    const isPrint = part.buyOrPrint === 'print';
                    const confidencePct = Math.round(
                      Math.max(0, Math.min(1, Number(part.confidence) || 0.85)) *
                        100
                    );
                    const searchQuery = part.offTheShelfQuery || part.name;
                    const amazonSearchUrl = `https://www.amazon.com/s?k=${encodeURIComponent(
                      searchQuery
                    )}`;
                    const partKey = `${activeIndex}-${part.name}-${pIdx}`;
                    const isPartExpanded = Boolean(expandedPartKeys[partKey]);
                    const isLongFunc = (part.function || '').length > 105;

                    return (
                      <div
                        key={partKey}
                        className="flex flex-col justify-between rounded-2xl border border-[#d4af37]/25 bg-[#120e0a]/85 p-4 transition-all hover:border-[#d4af37]/50 hover:bg-[#17120c]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-display text-base font-bold leading-snug text-[#faf4e8]">
                              {part.name}
                            </h5>
                            <span
                              className={`shrink-0 rounded-full border px-2.5 py-0.5 font-codex text-[10px] font-bold uppercase tracking-wider ${
                                isPrint
                                  ? 'border-[#b89b4a]/45 bg-[#1d1710] text-[#e6d3b3]'
                                  : 'border-[#d4af37]/45 bg-[#d4af37]/15 text-[#f3d478]'
                              }`}
                            >
                              {isPrint ? '3D Print' : 'Buy OTS'}
                            </span>
                          </div>

                          <p
                            className={`mt-1.5 text-xs leading-relaxed text-[#dfd3be] ${
                              !isPartExpanded && isLongFunc
                                ? 'line-clamp-2'
                                : ''
                            }`}
                          >
                            {part.function}
                          </p>
                          {isLongFunc && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPartKeys((prev) => ({
                                  ...prev,
                                  [partKey]: !prev[partKey],
                                }))
                              }
                              className="mt-1 -ml-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-[11px] font-semibold text-[#f3d478] hover:underline"
                            >
                              {isPartExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}

                          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-[#b5a48b]/85">
                            <span>{part.material}</span>
                            {Array.isArray(part.dims_mm) && (
                              <>
                                <span>·</span>
                                <span className="tabular-nums">
                                  {part.dims_mm[0]}×{part.dims_mm[1]}×{part.dims_mm[2]}mm
                                </span>
                              </>
                            )}
                            {part.fasteners && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-[180px]">
                                  {Array.isArray(part.fasteners)
                                    ? part.fasteners.join(', ')
                                    : part.fasteners}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Cross-links into BOM and Design parts */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#d4af37]/15 pt-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(matchedDesign || part.partId || isPrint) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectDesignPart) {
                                    onSelectDesignPart(
                                      matchedDesign?.id ||
                                        part.partId ||
                                        part.name
                                    );
                                  }
                                }}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#b89b4a]/45 bg-[#1d1710] px-2.5 py-1.5 font-mono text-[11px] text-[#dfd3be] transition-colors hover:border-[#f3d478]/65 hover:bg-[#282016]"
                                title="Inspect matching 3D part in Exploded View"
                              >
                                <span>
                                  3D Part:{' '}
                                  {matchedDesign?.partNumber ||
                                    matchedDesign?.id ||
                                    part.partId ||
                                    'Inspect'}
                                </span>
                              </button>
                            )}

                            {(matchedBom || part.bomRef) && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectBomRef) {
                                    onSelectBomRef(
                                      matchedBom?.id ||
                                        part.bomRef ||
                                        searchQuery
                                    );
                                  }
                                }}
                                className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/15 px-2.5 py-1.5 font-mono text-[11px] text-[#f3d478] transition-colors hover:border-[#f3d478]/70 hover:bg-[#d4af37]/25"
                                title="View matching line item in Bill of Materials"
                              >
                                <span>
                                  BOM:{' '}
                                  {matchedBom?.partNumber ||
                                    part.bomRef?.replace(/^bom-/, '')}
                                </span>
                              </button>
                            )}

                            <a
                              href={matchedBom?.primaryUrl || amazonSearchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-[#d4af37]/25 bg-[#17120c] px-2.5 py-1.5 text-[11px] text-[#dfd3be] transition-colors hover:border-[#f3d478]/50 hover:text-[#faf4e8]"
                              title={`Source off-the-shelf part: ${searchQuery}`}
                            >
                              <span className="max-w-[130px] truncate">
                                Source OTS
                              </span>
                              <span aria-hidden="true">↗</span>
                            </a>
                          </div>

                          <span
                            className="font-mono text-[11px] text-[#b5a48b]/80 tabular-nums"
                            title="Gemini 4 Argon part identification confidence"
                          >
                            {confidencePct}% conf
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && activeFrame && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged teardown frame at ${activeTsLabel}`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl overflow-hidden rounded-2xl gilded-frame bg-[#120e0a] p-5 shadow-2xl"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#d4af37]/25 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-md border border-[#d4af37]/45 bg-[#0c0906] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#f3d478]">
                  Frame {activeIndex + 1}/{frames.length} · {activeTsLabel} (t=
                  {activeFrame.t}s)
                </span>
                <span className="font-display text-base font-bold text-[#f5ebd6]">
                  {activeFrame.parts.map((p) => p.name).join(' · ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepFrame(-1)}
                  className="rounded-lg border border-[#d4af37]/35 bg-[#17120c] px-2.5 py-1 text-xs text-[#e6d3b3] hover:border-[#f3d478] hover:text-[#f5ebd6]"
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => stepFrame(1)}
                  className="rounded-lg border border-[#d4af37]/35 bg-[#17120c] px-2.5 py-1 text-xs text-[#e6d3b3] hover:border-[#f3d478] hover:text-[#f5ebd6]"
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close lightbox"
                  className="rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-1 font-codex text-xs font-bold uppercase text-[#f3d478] hover:bg-[#d4af37]/30"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#d4af37]/35 bg-[#0c0906]">
              <img
                src={activeArtifactImgSrc || activeImgSrc}
                alt={`Enlarged teardown frame at ${activeTsLabel}`}
                className="h-full w-full object-contain"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-xs leading-relaxed text-[#e6d3b3]">
                {activeFrame.description}
              </p>
              <a
                href={buildTimestampedVideoUrl(
                  activeFrame.video,
                  activeFrame.t
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/55 bg-[#d4af37]/20 px-4 py-2 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478] hover:bg-[#d4af37]/35"
              >
                <span>Watch at {activeTsLabel}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default TeardownGallery;
