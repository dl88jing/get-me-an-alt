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
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dotClass: 'bg-rose-400',
  },
  'open-design': {
    label: 'Open 3D Design',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-400',
  },
  schematic: {
    label: 'Schematic',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    dotClass: 'bg-cyan-400',
  },
  pdf: {
    label: 'PDF / Datasheet',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dotClass: 'bg-amber-400',
  },
  teardown: {
    label: 'Teardown',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    dotClass: 'bg-purple-400',
  },
  instructions: {
    label: 'Instructions / Article',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    dotClass: 'bg-blue-400',
  },
  product: {
    label: 'Product / Part',
    badgeClass: 'bg-zinc-500/20 text-zinc-200 border-zinc-500/35',
    dotClass: 'bg-zinc-300',
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
      className="group relative flex flex-col justify-between rounded-2xl border border-zinc-800/90 bg-zinc-900/75 p-4 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900"
      aria-label={`${meta.label}: ${raw.title || raw.url}`}
    >
      <div>
        {/* Media region: embedded iframe player (only when embedUrl exists) or thumbnail with onError fallback */}
        {resolvedEmbedUrl ? (
          <div className="relative mb-3.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 aspect-video">
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
                aria-label={`Play embedded video: ${raw.title || raw.url}`}
                className="relative block h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <img
                  src={resolvedThumbnail}
                  alt={raw.title || 'Video thumbnail'}
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/25">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600/95 text-white shadow-lg ring-2 ring-white/20 transition-transform group-hover:scale-110">
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
          <div className="relative mb-3.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 aspect-video">
            <img
              src={resolvedThumbnail}
              alt={raw.title || 'Source thumbnail'}
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        ) : null}

        {/* Top Badges: Kind + Type + Domain + Relevance */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.badgeClass}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`}
                aria-hidden="true"
              />
              {meta.label}
            </span>
            <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
              {domainLabel}
            </span>
          </div>

          <span
            className="inline-flex items-center rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300"
            title={`Relevance score: ${relevancePct}%`}
          >
            {relevancePct}% match
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-1.5 text-base font-semibold leading-snug text-zinc-100 group-hover:text-white">
          <a
            href={raw.url}
            target="_blank"
            rel="noreferrer"
            className="focus:outline-none focus-visible:underline"
          >
            {raw.title || raw.url}
          </a>
        </h3>

        {/* Summary */}
        <p className="mb-3 text-sm leading-relaxed text-zinc-400">
          {raw.summary}
        </p>

        {/* Key Takeaways (from leader's ResearchSource.keyTakeaways) */}
        {takeaways.length > 0 && (
          <ul className="mb-3 space-y-1 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-2.5 text-xs text-zinc-300">
            {takeaways.map((tk, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{tk}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer: License / Type + Action Buttons */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
        <div className="truncate text-xs text-zinc-500">
          {raw.license ? (
            <span className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-400">
              {raw.license}
            </span>
          ) : raw.type ? (
            <span className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
              type: {raw.type}
            </span>
          ) : (
            <span className="font-mono text-[11px] text-zinc-500">
              #{raw.id || 'src'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label={`Copy link for ${raw.title || raw.url}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-800/70 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
            aria-label={`Open ${raw.title || raw.url} in a new tab`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
