'use client';

import React, { useMemo, useState } from 'react';
import type { BomItem, DesignPart } from '../../lib/types';
import type {
  TeardownData,
  TeardownFrame,
  TeardownPart,
  TeardownVideo,
} from '../../lib/agents/teardown';
import {
  buildTimestampedVideoUrl,
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

function resolveFrameImageSrc(frame: TeardownFrame): string | undefined {
  if (
    frame.image &&
    (frame.image.startsWith('http://') ||
      frame.image.startsWith('https://') ||
      frame.image.startsWith('data:') ||
      frame.image.startsWith('/'))
  ) {
    return frame.image;
  }
  if (frame.thumbnailUrl && frame.thumbnailUrl.trim().length > 0) {
    return frame.thumbnailUrl.trim();
  }
  const derived = getThumbnail(frame.video);
  if (derived) return derived;
  return frame.image || undefined;
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
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const activeIndex =
    frames.length > 0 ? Math.min(selectedIdx, frames.length - 1) : 0;
  const activeFrame: TeardownFrame | undefined = frames[activeIndex];

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

  return (
    <section
      aria-label="Video Teardown & Frame-by-Frame Part Callouts"
      className="rounded-2xl border border-zinc-800/90 bg-zinc-900/65 p-5 shadow-lg backdrop-blur-sm"
    >
      {/* Section Header */}
      <div className="flex flex-col gap-3 border-b border-zinc-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/35 bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
              <span
                className="h-1.5 w-1.5 rounded-full bg-purple-400"
                aria-hidden="true"
              />
              Video Teardown Agent
            </span>
            <h3 className="text-base font-semibold tracking-tight text-white">
              Frame-by-Frame Internal Part Analysis
            </h3>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 font-mono text-xs text-zinc-300">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Gemini 4 Argon inspects teardown videos via{' '}
            <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[11px] text-zinc-300">
              file_data
            </code>{' '}
            timestamps and maps visible internal hardware to 3D-printed parts (
            <code className="font-mono text-[11px] text-emerald-300">
              design.json
            </code>
            ) and off-the-shelf BOM lines (
            <code className="font-mono text-[11px] text-amber-300">
              bom.json
            </code>
            ).
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-purple-500/40 hover:text-purple-200"
              >
                <span className="truncate max-w-[200px]">{v.title}</span>
                <span aria-hidden="true" className="text-zinc-500">
                  ↗
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Empty / Honest Note State */}
      {frames.length === 0 ? (
        <div className="mt-4 rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-4 text-xs text-zinc-400">
          <p className="font-medium text-zinc-200">
            No verified teardown frames extracted for this run
          </p>
          <p className="mt-1 leading-relaxed text-zinc-400">
            {teardown?.note ||
              'No direct teardown/disassembly video URL or verified timestamps were returned by Gemini 4 Argon. Frame timestamps are never fabricated.'}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Frame Selector Strip */}
          <div
            role="tablist"
            aria-label="Teardown video frames"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {frames.map((frame: TeardownFrame, idx: number) => {
              const isSelected = idx === activeIndex;
              const imgSrc = resolveFrameImageSrc(frame);
              const tsLabel = formatTimestamp(frame.t);
              return (
                <button
                  key={`${frame.video}-${frame.t}-${idx}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedIdx(idx)}
                  className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                    isSelected
                      ? 'border-purple-500/70 bg-purple-500/10 ring-1 ring-purple-500/40'
                      : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
                  }`}
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
                    {imgSrc && !failedImages[idx] ? (
                      <img
                        src={imgSrc}
                        alt={`Frame at ${tsLabel}`}
                        onError={() =>
                          setFailedImages((prev: Record<number, boolean>) => ({
                            ...prev,
                            [idx]: true,
                          }))
                        }
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-zinc-900 font-mono text-xs text-zinc-500">
                        t={frame.t}s
                      </div>
                    )}
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-purple-200">
                      {tsLabel} ({frame.t}s)
                    </span>
                    <span className="absolute right-1.5 top-1.5 rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
                      {frame.parts.length}{' '}
                      {frame.parts.length === 1 ? 'part' : 'parts'}
                    </span>
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium text-zinc-200">
                      {frame.parts.map((p: TeardownPart) => p.name).join(', ') ||
                        `Frame @ ${tsLabel}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Frame Detail + Part Callouts */}
          {activeFrame && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* Left: Frame Preview + Timestamp Video Link */}
              <div className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 lg:col-span-5">
                <div>
                  <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 aspect-video">
                    {resolveFrameImageSrc(activeFrame) &&
                    !failedImages[activeIndex] ? (
                      <img
                        src={resolveFrameImageSrc(activeFrame)}
                        alt={`Teardown frame at ${formatTimestamp(activeFrame.t)}`}
                        onError={() =>
                          setFailedImages((prev: Record<number, boolean>) => ({
                            ...prev,
                            [activeIndex]: true,
                          }))
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center">
                        <span className="font-mono text-sm text-purple-300">
                          Timestamp {formatTimestamp(activeFrame.t)} (t=
                          {activeFrame.t}s)
                        </span>
                        <span className="mt-1 font-mono text-[11px] text-zinc-500">
                          {activeFrame.image}
                        </span>
                      </div>
                    )}
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                      <span className="rounded-md bg-black/80 px-2 py-0.5 font-mono text-xs font-semibold text-purple-300 backdrop-blur-sm">
                        t = {activeFrame.t}s ({formatTimestamp(activeFrame.t)})
                      </span>
                    </div>
                  </div>

                  {activeFrame.description && (
                    <p className="mt-3 text-xs leading-relaxed text-zinc-300">
                      {activeFrame.description}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
                  <span className="font-mono text-[11px] text-zinc-500">
                    Artifact: {activeFrame.image}
                  </span>
                  <a
                    href={buildTimestampedVideoUrl(
                      activeFrame.video,
                      activeFrame.t
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/20 px-3 py-1.5 text-xs font-semibold text-purple-200 transition-colors hover:border-purple-400/60 hover:bg-purple-500/30"
                  >
                    <span>
                      Watch video @ {formatTimestamp(activeFrame.t)} (t=
                      {activeFrame.t}s)
                    </span>
                    <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </div>

              {/* Right: Per-Part Callouts with BOM & Design Links */}
              <div className="space-y-3 lg:col-span-7">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Identified Parts at {formatTimestamp(activeFrame.t)} (
                    {activeFrame.parts.length})
                  </h4>
                  {teardown?.note && (
                    <span className="truncate max-w-xs text-[11px] text-zinc-500">
                      {teardown.note}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                    return (
                      <div
                        key={`${part.name}-${pIdx}`}
                        className="flex flex-col justify-between rounded-xl border border-zinc-800/90 bg-zinc-950/75 p-3.5 transition-colors hover:border-zinc-700"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-sm font-semibold text-zinc-100">
                              {part.name}
                            </h5>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                isPrint
                                  ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                                  : 'border-amber-500/35 bg-amber-500/15 text-amber-300'
                              }`}
                            >
                              {isPrint ? '3D Print' : 'Buy OTS'}
                            </span>
                          </div>

                          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                            {part.function}
                          </p>

                          <dl className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg bg-zinc-900/70 p-2 font-mono text-[11px]">
                            <div>
                              <dt className="text-zinc-500">Material</dt>
                              <dd className="truncate text-zinc-200">
                                {part.material}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-zinc-500">Est. Dims</dt>
                              <dd className="text-zinc-200">
                                {Array.isArray(part.dims_mm)
                                  ? `${part.dims_mm[0]}×${part.dims_mm[1]}×${part.dims_mm[2]}mm`
                                  : '—'}
                              </dd>
                            </div>
                            <div className="col-span-2 mt-0.5">
                              <dt className="text-zinc-500">
                                Fasteners / Connectors
                              </dt>
                              <dd className="truncate text-zinc-300">
                                {Array.isArray(part.fasteners)
                                  ? part.fasteners.join(', ')
                                  : part.fasteners}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        {/* Cross-links into BOM and Design parts */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-800/80 pt-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(matchedDesign || part.partId || isPrint) && (
                              <a
                                href={`#design-part-${
                                  matchedDesign?.id || part.partId || part.name
                                }`}
                                onClick={(e: { preventDefault: () => void }) => {
                                  if (onSelectDesignPart) {
                                    e.preventDefault();
                                    onSelectDesignPart(
                                      matchedDesign?.id ||
                                        part.partId ||
                                        part.name
                                    );
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/20"
                                title="View matching 3D design part in design.json"
                              >
                                <span>
                                  Design:{' '}
                                  {matchedDesign?.id ||
                                    part.partId ||
                                    'printed'}
                                </span>
                              </a>
                            )}

                            {(matchedBom || part.bomRef) && (
                              <a
                                href={`#bom-item-${
                                  matchedBom?.id || part.bomRef
                                }`}
                                onClick={(e: { preventDefault: () => void }) => {
                                  if (onSelectBomRef) {
                                    e.preventDefault();
                                    onSelectBomRef(
                                      matchedBom?.id ||
                                        part.bomRef ||
                                        searchQuery
                                    );
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300 hover:bg-amber-500/20"
                                title="View matching BOM line item in bom.json"
                              >
                                <span>
                                  BOM: {matchedBom?.partNumber || part.bomRef}
                                </span>
                              </a>
                            )}

                            <a
                              href={matchedBom?.primaryUrl || amazonSearchUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/90 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-zinc-600 hover:text-white"
                              title={`Off-the-shelf query: ${searchQuery}`}
                            >
                              <span className="truncate max-w-[140px]">
                                OTS: {searchQuery}
                              </span>
                              <span aria-hidden="true">↗</span>
                            </a>
                          </div>

                          <span
                            className="font-mono text-[11px] text-zinc-400"
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
    </section>
  );
}

export default TeardownGallery;
