'use client';

import React, { useMemo, useState } from 'react';
import type {
  BomItem,
  DesignPart,
  ObjectAnalysis,
  ResearchData,
  ResearchSource,
} from '../../lib/types';
import type { TeardownData } from '../../lib/agents/teardown';
import {
  ALL_SOURCE_KINDS,
  extractDomainLabel,
  extractYouTubeId,
  getThumbnail,
  inferSourceKind,
  type EnrichedResearchSource,
  type SourceItem,
  type SourceKind,
  type SourcesArtifact,
} from '../../lib/agents/researcher-depth';
import { SourceCard, type CompatibleSource } from './SourceCard';
import { TeardownGallery } from './TeardownGallery';

export interface SourcesTabProps {
  /** Primary leader contract (`ResearchData`) or earlier `SourcesArtifact` */
  data?: ResearchData | SourcesArtifact;
  research?: ResearchData;
  artifact?: SourcesArtifact;
  /** Either `ResearchData` or a direct list of `ResearchSource | SourceItem` */
  sources?: ResearchData | Array<ResearchSource | EnrichedResearchSource | SourceItem>;
  /** Video teardown artifact (`teardown.json`) */
  teardown?: TeardownData | null;
  /** Optional BOM items for teardown cross-linking */
  bomItems?: BomItem[];
  /** Optional 3D design parts for teardown cross-linking */
  designParts?: DesignPart[];
  /** Optional object analysis for fallback teardown synthesis */
  analysis?: ObjectAnalysis;
  objectSlug?: string;
  objectName?: string;
  generatedAt?: string;
  inputKind?: SourcesArtifact['inputKind'];
  fallbackUsed?: boolean;
  onSelectBomRef?: (bomRefOrQuery: string) => void;
  onSelectDesignPart?: (partIdOrName: string) => void;
}

const FILTER_LABELS: Record<'all' | SourceKind, string> = {
  all: 'All Sources',
  video: 'Videos',
  'open-design': 'Open Designs',
  schematic: 'Schematics',
  pdf: 'PDFs & Manuals',
  teardown: 'Teardowns',
  instructions: 'Instructions & Guides',
  product: 'Products & Parts',
};

function isResearchData(val: unknown): val is ResearchData {
  return Boolean(
    val &&
      typeof val === 'object' &&
      'sources' in val &&
      Array.isArray((val as ResearchData).sources) &&
      ('querySummary' in val || 'groundingUsed' in val)
  );
}

function isSourcesArtifact(val: unknown): val is SourcesArtifact {
  return Boolean(
    val &&
      typeof val === 'object' &&
      'sources' in val &&
      Array.isArray((val as SourcesArtifact).sources) &&
      !('querySummary' in val)
  );
}

export function SourcesTab(props: SourcesTabProps) {
  const normalized: {
    items: CompatibleSource[];
    querySummary: string;
    groundingUsed: boolean;
    fallbackUsed: boolean;
    searchQueries: string[];
    technicalInsights: string[];
    referenceDimensions: Record<string, string>;
    objectLabel: string;
    inputKind?: string;
  } = useMemo(() => {
    const candidate = props.research || props.data || props.sources || props.artifact;

    let items: CompatibleSource[] = [];
    let querySummary = '';
    let groundingUsed = true;
    let searchQueries: string[] = [];
    let technicalInsights: string[] = [];
    let referenceDimensions: Record<string, string> = {};
    let inputKind: string | undefined = props.inputKind;

    if (isResearchData(candidate)) {
      items = candidate.sources || [];
      querySummary = candidate.querySummary || '';
      groundingUsed = Boolean(candidate.groundingUsed);
      searchQueries = Array.isArray(candidate.searchQueries)
        ? candidate.searchQueries
        : [];
      technicalInsights = Array.isArray(candidate.technicalInsights)
        ? candidate.technicalInsights
        : [];
      referenceDimensions = candidate.referenceDimensions || {};
    } else if (isSourcesArtifact(candidate)) {
      items = candidate.sources || [];
      groundingUsed = !candidate.fallbackUsed;
      inputKind = candidate.inputKind || inputKind;
    } else if (Array.isArray(props.sources)) {
      items = props.sources;
      groundingUsed = props.fallbackUsed !== undefined ? !props.fallbackUsed : true;
    }

    if (props.fallbackUsed === true) {
      groundingUsed = false;
    }

    return {
      items,
      querySummary,
      groundingUsed,
      fallbackUsed: !groundingUsed,
      searchQueries,
      technicalInsights,
      referenceDimensions,
      objectLabel:
        props.objectName ||
        props.objectSlug ||
        (isSourcesArtifact(candidate) ? candidate.objectSlug : 'DIY Alternative'),
      inputKind,
    };
  }, [props]);

  const [selectedKind, setSelectedKind] = useState<'all' | SourceKind>('all');
  const [query, setQuery] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const kindCounts: Record<'all' | SourceKind, number> = useMemo(() => {
    const counts: Record<'all' | SourceKind, number> = {
      all: normalized.items.length,
      video: 0,
      schematic: 0,
      pdf: 0,
      'open-design': 0,
      teardown: 0,
      instructions: 0,
      product: 0,
    };
    for (const item of normalized.items) {
      const k = inferSourceKind(item);
      if (counts[k] !== undefined) {
        counts[k] += 1;
      }
    }
    return counts;
  }, [normalized.items]);

  const filteredSources: CompatibleSource[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return normalized.items.filter((raw: CompatibleSource) => {
      const item = raw as Partial<EnrichedResearchSource & SourceItem>;
      const kind = inferSourceKind(item);
      if (selectedKind !== 'all' && kind !== selectedKind) {
        return false;
      }
      if (!q) return true;
      const domain = item.domain || item.source || extractDomainLabel(item.url || '');
      const takeawaysText = Array.isArray(item.keyTakeaways)
        ? item.keyTakeaways.join(' ').toLowerCase()
        : '';
      return (
        (item.title || '').toLowerCase().includes(q) ||
        (item.summary || '').toLowerCase().includes(q) ||
        domain.toLowerCase().includes(q) ||
        kind.toLowerCase().includes(q) ||
        (item.type || '').toLowerCase().includes(q) ||
        takeawaysText.includes(q)
      );
    });
  }, [normalized.items, selectedKind, query]);

  const filterKeys: Array<'all' | SourceKind> = ['all', ...ALL_SOURCE_KINDS];
  const dimensionEntries = Object.entries(normalized.referenceDimensions || {});

  return (
    <section
      className="w-full space-y-6 text-[#f5ebd6]"
      aria-label="Research Sources, Open-Source References & Video Teardown"
    >
      {/* Header Bar */}
      <div className="flex flex-col gap-4 rounded-2xl codex-folio p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-bold tracking-tight text-[#f5ebd6]">
              Research &amp; Open-Source Priors
            </h2>
            <span className="rounded-full border border-[#d4af37]/35 bg-[#d4af37]/15 px-2.5 py-0.5 font-mono text-xs font-medium text-[#f3d478] tabular-nums">
              {filteredSources.length} of {normalized.items.length} sources
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-codex text-[11px] font-bold uppercase tracking-wider ${
                normalized.groundingUsed
                  ? 'border-[#b89b4a]/45 bg-[#1d1710] text-[#e6d3b3]'
                  : 'border-[#d4af37]/35 bg-[#d4af37]/15 text-[#f3d478]'
              }`}
            >
              {normalized.groundingUsed
                ? 'Google Search Grounded'
                : 'Verified Platform References'}
            </span>
          </div>
          <p
            className={`mt-1.5 text-sm text-[#dfd3be] ${
              !summaryExpanded ? 'line-clamp-2' : ''
            }`}
          >
            {normalized.querySummary || (
              <>
                Grounded videos, printable CAD repositories, schematics, PDF
                datasheets, and teardown guides for{' '}
                <span className="font-semibold text-[#faf4e8]">
                  {normalized.objectLabel}
                </span>
                .
              </>
            )}
          </p>
          {normalized.querySummary && normalized.querySummary.length > 140 && (
            <button
              type="button"
              onClick={() => setSummaryExpanded((prev) => !prev)}
              className="mt-1 -ml-2 inline-flex min-h-[44px] min-w-[44px] items-center px-2 text-xs font-semibold text-[#f3d478] hover:underline"
            >
              {summaryExpanded ? 'Show Less' : 'Read More'}
            </button>
          )}
        </div>

        {/* Text Search Input */}
        <div className="relative w-full sm:w-72">
          <label htmlFor="sources-search-input" className="sr-only">
            Search research sources
          </label>
          <input
            id="sources-search-input"
            type="search"
            value={query}
            onChange={(e: { target: { value: string } }) => setQuery(e.target.value)}
            placeholder="Filter by title, domain, takeaway..."
            aria-label="Filter sources by keyword or domain"
            className="w-full min-h-[44px] rounded-xl border border-[#d4af37]/30 bg-[#0c0906]/90 py-2 pl-9 pr-11 text-sm text-[#faf4e8] placeholder-[#b5a48b] transition-colors focus:border-[#f3d478] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/30"
          />
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#bda782]"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#bda782] hover:text-[#f5ebd6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Video Teardown Section (TeardownGallery) — Featured prominently at the top of Sources */}
      <TeardownGallery
        teardown={props.teardown}
        bomItems={props.bomItems}
        designParts={props.designParts}
        onSelectBomRef={props.onSelectBomRef}
        onSelectDesignPart={props.onSelectDesignPart}
      />

      {/* Technical Insights & Reference Dimensions (from ResearchData) */}
      {(normalized.technicalInsights.length > 0 ||
        dimensionEntries.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {normalized.technicalInsights.length > 0 && (
            <div className="rounded-2xl codex-folio p-5 lg:col-span-7">
              <h3 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Engineering &amp; Teardown Insights
              </h3>
              <ul className="mt-3 space-y-2 text-xs text-[#e6d3b3]">
                {normalized.technicalInsights.map((insight: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4af37]"
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dimensionEntries.length > 0 && (
            <div className="rounded-2xl codex-folio p-5 lg:col-span-5">
              <h3 className="font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478]">
                Reference Dimensions &amp; Standards
              </h3>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {dimensionEntries.map(([label, val]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/80 p-2.5"
                  >
                    <dt className="truncate text-[11px] text-[#bda782]">
                      {label}
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold text-[#f5ebd6]">
                      {val}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Kind Filter Chips */}
      <div
        role="toolbar"
        aria-label="Filter sources by category"
        className="flex flex-wrap items-center gap-2"
      >
        {filterKeys.map((kind) => {
          const active = selectedKind === kind;
          const count = kindCounts[kind] ?? 0;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setSelectedKind(kind)}
              aria-pressed={active}
              aria-label={`Filter by ${FILTER_LABELS[kind]} (${count})`}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478] ${
                active
                  ? 'border-[#f3d478]/70 bg-[#d4af37]/20 text-[#f3d478] shadow-sm'
                  : 'border-[#d4af37]/20 bg-[#14100b]/85 text-[#dfd3be] hover:border-[#d4af37]/45 hover:text-[#faf4e8]'
              }`}
            >
              <span>{FILTER_LABELS[kind]}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[11px] tabular-nums ${
                  active
                    ? 'bg-[#d4af37]/30 text-[#f5ebd6]'
                    : 'bg-[#0c0906] text-[#bda782]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards Grid or Empty Filter State */}
      {filteredSources.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSources.map((item, idx) => (
            <SourceCard
              key={`${item.id || idx}-${item.url}`}
              source={item}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d4af37]/30 bg-[#14100b]/60 px-6 py-12 text-center">
          <p className="font-display text-base font-bold text-[#f5ebd6]">
            No research sources match the current filter.
          </p>
          <p className="mt-1 text-xs text-[#bda782]">
            Try selecting &ldquo;All Sources&rdquo; or clearing your search query.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedKind('all');
              setQuery('');
            }}
            className="mt-4 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/15 px-3.5 py-1.5 font-codex text-xs font-bold uppercase tracking-wider text-[#f3d478] hover:bg-[#d4af37]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478]"
          >
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}

export default SourcesTab;
