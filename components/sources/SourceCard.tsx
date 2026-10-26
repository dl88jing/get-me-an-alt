'use client';

import React, { useState } from 'react';
import type { ResearchSource } from '../../lib/types';
import {
  extractDomainLabel,
  getEmbedUrl,
  getThumbnail,
  inferSourceKind,
  type EnrichedResearchSource,
  type SourceItem,
  type SourceKind,
} from '../../lib/agents/researcher-depth';

export type CompatibleSource =
  | ResearchSource
  | EnrichedResearchSource
  | SourceItem;

export interface SourceCardProps {
  key?: string | number;
  item?: CompatibleSource;
  source?: CompatibleSource;
}

const KIND_META: Record<
  SourceKind,
  { label: string; badgeClass: string; dotClass: string }
> = {
  video: {
    label: 'Video',
    badgeClass: 'bg-[#c84b31]/15 text-[#f4a28c] border-[#c84b31]/40',
    dotClass: 'bg-[#e76f51]',
  },
  'open-design': {
    label: 'Open 3D Design',
    badgeClass: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/35',
    dotClass: 'bg-emerald-400',
  },
  schematic: {
    label: 'Schematic',
    badgeClass: 'bg-[#d4af37]/15 text-[#f3d478] border-[#d4af37]/40',
    dotClass: 'bg-[#f3d478]',
  },
  pdf: {
    label: 'PDF / Datasheet',
    badgeClass: 'bg-amber-950/50 text-amber-300 border-amber-500/35',
    dotClass: 'bg-amber-400',
  },
  teardown: {
    label: 'Teardown',
    badgeClass: 'bg-[#d4af37]/20 text-[#f3d478] border-[#f3d478]/45',
    dotClass: 'bg-[#f3d478]',
  },
  instructions: {
    label: 'Build Guide',
    badgeClass: 'bg-[#282016] text-[#e6d3b3] border-[#d4af37]/30',
    dotClass: 'bg-[#d4af37]',
  },
  product: {
    label: 'Hardware / Part',
    badgeClass: 'bg-[#282016] text-[#e6d3b3] border-[#d4af37]/30',
    dotClass: 'bg-[#e6d3b3]',
  },
};

export function SourceCard(props: SourceCardProps) {
  const raw = (props.source || props.item) as
    | Partial<EnrichedResearchSource & SourceItem>
    | undefined;

  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  if (!raw || !raw.url) {
    return null;
  }

  const kind: SourceKind = inferSourceKind(raw);
  const domainLabel =
    raw.domain || raw.source || extractDomainLabel(raw.url || '');
  const resolvedEmbedUrl = raw.embedUrl || getEmbedUrl({ url: raw.url });
  const resolvedThumbnail = getThumbnail({
    url: raw.url,
    thumbnailUrl: raw.thumbnailUrl,
    thumbnail: raw.thumbnail,
  });
  const takeaways = Array.isArray(raw.keyTakeaways)
    ? raw.keyTakeaways.filter(Boolean)
    : [];

  const meta = KIND_META[kind] || KIND_META.instructions;
  const relevancePct = Math.round(
    Math.max(0, Math.min(1, Number(raw.relevanceScore ?? 0.88))) * 100
  );

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && raw.url) {
        await navigator.clipboard.writeText(raw.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <article
      className="group relative flex flex-col justify-between rounded-2xl codex-folio p-4 transition-all duration-200 hover:border-[#d4af37]/50"
      aria-label={`${meta.label}: ${raw.title || domainLabel}`}
    >
      <div>
        {/* Media region: embedded iframe player (only when embedUrl exists) or thumbnail with onError fallback */}
        {resolvedEmbedUrl ? (
          <div className="relative mb-3.5 aspect-video overflow-hidden rounded-xl border border-[#d4af37]/30 bg-[#0c0906]">
            {showPlayer || !resolvedThumbnail || imgFailed ? (
              <iframe
                src={resolvedEmbedUrl}
                title={raw.title || 'Embedded reference video'}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowPlayer(true)}
                aria-label={`Play embedded video: ${raw.title || domainLabel}`}
                className="relative block h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
              >
                <img
                  src={resolvedThumbnail}
                  alt={raw.title || 'Video thumbnail'}
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 transition-colors group-hover:bg-black/25">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f3d478]/60 bg-[#14100b]/90 text-[#f3d478] shadow-lg transition-transform group-hover:scale-110">
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="ml-0.5 h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </div>
              </button>
            )}
          </div>
        ) : resolvedThumbnail && !imgFailed ? (
          <div className="relative mb-3.5 aspect-video overflow-hidden rounded-xl border border-[#d4af37]/30 bg-[#0c0906]">
            <img
              src={resolvedThumbnail}
              alt={raw.title || 'Source thumbnail'}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Top Badges: Kind + Domain + Relevance */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-codex text-[10px] font-bold uppercase tracking-wider ${meta.badgeClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                aria-hidden="true"
              />
              {meta.label}
            </span>
            <span className="rounded-md border border-[#d4af37]/20 bg-[#0c0906]/85 px-2 py-0.5 font-mono text-[11px] text-[#e6d3b3]">
              {domainLabel}
            </span>
          </div>

          <span
            className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-950/35 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300 tabular-nums"
            title={`Relevance score: ${relevancePct}%`}
          >
            {relevancePct}% match
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-1.5 font-display text-base font-bold leading-snug text-[#f5ebd6] group-hover:text-[#f3d478]">
          <a
            href={raw.url}
            target="_blank"
            rel="noreferrer"
            className="focus:outline-none focus-visible:underline"
          >
            {raw.title || domainLabel}
          </a>
        </h3>

        {/* Summary */}
        <p className="mb-3 text-xs leading-relaxed text-[#c7ae87]">
          {raw.summary}
        </p>

        {/* Key Takeaways */}
        {takeaways.length > 0 && (
          <ul className="mb-3 space-y-1.5 rounded-xl border border-[#d4af37]/15 bg-[#0c0906]/75 p-2.5 text-xs text-[#e6d3b3]">
            {takeaways.map((tk, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4af37]"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{tk}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: License / Source Badge + Action Buttons */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#d4af37]/15 pt-3">
        <div className="truncate text-xs text-[#bda782]">
          {raw.license ? (
            <span className="rounded border border-[#d4af37]/20 bg-[#0c0906]/80 px-2 py-0.5 text-[11px] text-[#e6d3b3]">
              {raw.license}
            </span>
          ) : (
            <span className="font-codex text-[10px] uppercase tracking-wider text-[#bda782]">
              {meta.label} · {domainLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label={`Copy link for ${raw.title || domainLabel}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/25 bg-[#17120c] px-2.5 py-1.5 text-xs font-medium text-[#e6d3b3] transition-colors hover:border-[#d4af37]/50 hover:text-[#f5ebd6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
          >
            {copied ? (
              <span className="text-emerald-300">Copied</span>
            ) : (
              <span>Copy link</span>
            )}
          </button>

          <a
            href={raw.url}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${raw.title || domainLabel} in a new tab`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 px-3 py-1.5 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478] transition-colors hover:border-[#f3d478] hover:bg-[#d4af37]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
          >
            <span>Open</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export default SourceCard;
