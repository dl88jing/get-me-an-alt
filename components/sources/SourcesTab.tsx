'use client';

import React, { useMemo, useState } from 'react';
import type {
  BomItem,
  DesignPart,
  ResearchData,
  ResearchSource,
} from '../../lib/types';
import type { TeardownData } from '../../lib/agents/teardown';
import {
  ALL_SOURCE_KINDS,
  extractDomainLabel,
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
      className="w-full space-y-5 text-zinc-100"
      aria-label="Research Sources, Open-Source References & Video Teardown"
    >
      {/* Header Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Research &amp; Open Designs
            </h2>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-300">
              {filteredSources.length} of {normalized.items.length} sources
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-xs ${
                normalized.groundingUsed
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {normalized.groundingUsed
                ? 'Google Search Grounded'
                : 'Verified Search Fallbacks'}
            </span>
            {normalized.inputKind && (
              <span className="rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 font-mono text-xs text-zinc-400">
                input: {normalized.inputKind}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-zinc-400">
            {normalized.querySummary || (
              <>
                Grounded videos, printable CAD repositories, schematics, PDF
                datasheets, and teardown guides for{' '}
                <span className="font-mono text-zinc-200">
                  {normalized.objectLabel}
                </span>
                .
              </>
            )}
          </p>
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
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 py-2 pl-9 pr-8 text-sm text-zinc-100 placeholder-zinc-500 transition-colors focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Fallback Banner when groundingUsed is false */}
      {normalized.fallbackUsed && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          <div>
            <p className="font-medium text-amber-100">
              Verified Search Starting Points Active (groundingUsed: false)
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-200/85">
              Live Gemini Search grounding returned no verified deep links or ran in deterministic mode. To prevent fabricated PDFs or 404 URLs, entries use honest platform search URLs across Printables, Thingiverse, GitHub, YouTube, iFixit, and Instructables.
            </p>
          </div>
        </div>
      )}

      {/* Technical Insights & Reference Dimensions (from ResearchData) */}
      {(normalized.technicalInsights.length > 0 ||
        dimensionEntries.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {normalized.technicalInsights.length > 0 && (
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 lg:col-span-7">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Engineering &amp; Teardown Insights
              </h3>
              <ul className="mt-2.5 space-y-1.5 text-xs text-zinc-300">
                {normalized.technicalInsights.map((insight: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="leading-relaxed">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dimensionEntries.length > 0 && (
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 lg:col-span-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Reference Dimensions &amp; Standards
              </h3>
              <dl className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {dimensionEntries.map(([label, val]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2"
                  >
                    <dt className="truncate text-[11px] text-zinc-400">
                      {label}
                    </dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold text-zinc-100">
                      {val}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Video Teardown Section (TeardownGallery) */}
      {props.teardown && (
        <TeardownGallery
          teardown={props.teardown}
          bomItems={props.bomItems}
          designParts={props.designParts}
          onSelectBomRef={props.onSelectBomRef}
          onSelectDesignPart={props.onSelectDesignPart}
        />
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
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                active
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200 shadow-sm'
                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <span>{FILTER_LABELS[kind]}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[11px] ${
                  active
                    ? 'bg-emerald-500/30 text-emerald-100'
                    : 'bg-zinc-800 text-zinc-400'
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center">
          <p className="text-sm font-medium text-zinc-300">
            No research sources match the current filter.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Try selecting &ldquo;All Sources&rdquo; or clearing your search query.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedKind('all');
              setQuery('');
            }}
            className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}

export default SourcesTab;
