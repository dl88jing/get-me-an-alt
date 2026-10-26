'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  Globe,
  History,
  Image as ImageIcon,
  Link2,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import {
  MAX_RECENT_BUILDS,
  mergeRecentBuilds,
  readLocalRecentBuilds,
  readRemovedRecentBuildSlugs,
  RECENT_BUILDS_UPDATED_EVENT,
  RecentBuildEntry,
  removeLocalRecentBuild,
  writeLocalRecentBuilds,
} from '@/lib/recent-builds';

function formatBuildTimestamp(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return 'Recent';
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(time).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '$0.00';
  return val % 1 === 0 ? `$${val}` : `$${val.toFixed(2)}`;
}

function getInputBadge(entry: RecentBuildEntry): {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  if (
    entry.inputType === 'video' ||
    /youtube\.com|youtu\.be/i.test(entry.input)
  ) {
    return { label: 'VIDEO TEARDOWN', Icon: Video };
  }
  if (entry.inputType === 'image' || /^photo:/i.test(entry.input)) {
    return { label: 'PHOTO INPUT', Icon: ImageIcon };
  }
  if (entry.inputType === 'url' || /^https?:\/\//i.test(entry.input)) {
    return { label: 'PRODUCT LINK', Icon: Link2 };
  }
  return { label: 'CUSTOM PROMPT', Icon: Sparkles };
}

export function RecentBuildsShelf() {
  const [builds, setBuilds] = useState<RecentBuildEntry[]>([]);
  const [communityBuilds, setCommunityBuilds] = useState<RecentBuildEntry[]>(
    []
  );
  const [loadingServer, setLoadingServer] = useState(true);

  const syncBuilds = useCallback(async () => {
    const removed = readRemovedRecentBuildSlugs();
    const local = readLocalRecentBuilds().filter((b) => !removed.has(b.slug));
    setBuilds(local);

    try {
      const res = await fetch('/api/my-builds', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const serverList: RecentBuildEntry[] = Array.isArray(data?.builds)
          ? data.builds
          : [];
        const commList: RecentBuildEntry[] = Array.isArray(
          data?.communityBuilds
        )
          ? data.communityBuilds
          : [];

        const merged = mergeRecentBuilds(
          serverList,
          local,
          MAX_RECENT_BUILDS,
          removed
        );
        setBuilds(merged);
        writeLocalRecentBuilds(merged);

        // If client localStorage has builds that the server didn't have yet for this IP, push them up
        const serverSlugs = new Set(serverList.map((b) => b.slug));
        const unsyncedLocal = local.filter((b) => !serverSlugs.has(b.slug));
        if (unsyncedLocal.length > 0) {
          void fetch('/api/my-builds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ builds: unsyncedLocal }),
          }).catch(() => {});
        }

        const mySlugs = new Set(merged.map((b) => b.slug));
        const extraCommunity = mergeRecentBuilds(
          commList.filter((b) => !mySlugs.has(b.slug)),
          [],
          12,
          removed
        );
        setCommunityBuilds(extraCommunity);
      }
    } catch {
      // Keep localStorage fallback
    } finally {
      setLoadingServer(false);
    }
  }, []);

  useEffect(() => {
    void syncBuilds();

    const handleStorageOrCustom = () => {
      const removed = readRemovedRecentBuildSlugs();
      const latestLocal = readLocalRecentBuilds().filter(
        (b) => !removed.has(b.slug)
      );
      setBuilds((prev) =>
        mergeRecentBuilds(latestLocal, prev, MAX_RECENT_BUILDS, removed)
      );
    };

    window.addEventListener('storage', handleStorageOrCustom);
    window.addEventListener(
      RECENT_BUILDS_UPDATED_EVENT,
      handleStorageOrCustom
    );
    return () => {
      window.removeEventListener('storage', handleStorageOrCustom);
      window.removeEventListener(
        RECENT_BUILDS_UPDATED_EVENT,
        handleStorageOrCustom
      );
    };
  }, [syncBuilds]);

  const handleRemove = async (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const nextLocal = removeLocalRecentBuild(slug);
    setBuilds(nextLocal);
    setCommunityBuilds((prev) => prev.filter((b) => b.slug !== slug));

    try {
      await fetch(`/api/my-builds?slug=${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore network error; local removal already persisted
    }
  };

  const handleCardSpotlight = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty(
      '--mouse-x',
      `${e.clientX - rect.left}px`
    );
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const renderBuildCard = (
    entry: RecentBuildEntry,
    isCommunity = false
  ): React.ReactNode => {
    const { label: inputTypeLabel, Icon: InputIcon } = getInputBadge(entry);
    const dollarSaved =
      entry.originalPrice > entry.altPrice
        ? Math.round((entry.originalPrice - entry.altPrice) * 100) / 100
        : 0;

    return (
      <div
        key={entry.slug}
        data-testid="recent-build-card"
        onMouseMove={handleCardSpotlight}
        className="spotlight-card group relative flex flex-col justify-between rounded-2xl codex-folio p-5 text-left border border-[#d4af37]/30 bg-[#0c0906]/90 hover:border-[#f3d478]/75 hover:-translate-y-0.5 transition-all duration-300"
      >
        <div className="space-y-3.5">
          {/* Top bar: Savings badge + Timestamp + Remove button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.savingsPct > 0 ? (
                <span className="rounded-md bg-[#d4af37]/15 px-2.5 py-0.5 font-codex text-[10px] font-bold text-[#f3d478] border border-[#d4af37]/45">
                  SAVE {entry.savingsPct}%
                  {dollarSaved > 0 ? ` (${formatCurrency(dollarSaved)})` : ''}
                </span>
              ) : (
                <span className="rounded-md bg-[#d4af37]/15 px-2.5 py-0.5 font-codex text-[10px] font-bold text-[#f3d478] border border-[#d4af37]/45">
                  CUSTOM DIY BUILD
                </span>
              )}

              {isCommunity && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#b89b4a]/20 px-2 py-0.5 font-mono text-[10px] text-[#e6d3b3] border border-[#b89b4a]/35">
                  <Globe className="h-2.5 w-2.5 text-[#d4af37]" />
                  Community
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#bda782]">
                <Clock className="h-3 w-3 text-[#d4af37]/80" />
                {formatBuildTimestamp(entry.createdAt)}
              </span>

              <button
                type="button"
                onClick={(e) => handleRemove(entry.slug, e)}
                aria-label={`Remove ${entry.title}`}
                title="Remove from Recent Builds"
                data-testid={`remove-build-${entry.slug}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border border-[#d4af37]/25 bg-[#14100b]/90 px-2.5 py-1.5 font-mono text-[11px] text-[#bda782] hover:border-[#c84b31]/70 hover:bg-[#c84b31]/15 hover:text-[#f5ebd6] transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5 text-[#e06348]" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Optional thumbnail preview if present */}
          {entry.thumbnail && (
            <div className="relative h-32 w-full overflow-hidden rounded-xl border border-[#d4af37]/25 bg-[#14100b]">
              <img
                src={entry.thumbnail}
                alt={entry.title}
                className="h-full w-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-500"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0c0906] via-transparent to-transparent" />
              <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 rounded bg-[#0c0906]/85 px-2 py-0.5 font-mono text-[10px] text-[#f3d478] border border-[#d4af37]/30">
                <InputIcon className="h-3 w-3 text-[#d4af37]" />
                {inputTypeLabel}
              </span>
            </div>
          )}

          {/* Input source tag when no thumbnail */}
          {!entry.thumbnail && (
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-wider text-[#bda782]">
              <span className="inline-flex items-center gap-1.5 text-[#d4af37]">
                <InputIcon className="h-3 w-3" />
                {inputTypeLabel}
              </span>
              {entry.category && (
                <span className="truncate text-[#bda782]/80">
                  {entry.category}
                </span>
              )}
            </div>
          )}

          {/* Build Title */}
          <div>
            <Link
              href={`/projects/${encodeURIComponent(entry.slug)}`}
              className="inline-flex min-h-[44px] items-center font-display text-xl font-bold text-[#f5ebd6] group-hover:text-[#f3d478] transition-colors leading-snug"
            >
              {entry.title}
            </Link>
          </div>

          {/* Original user input (URL / prompt / photo) */}
          <div className="rounded-xl border border-[#d4af37]/20 bg-[#14100b]/85 px-3 py-2 font-mono text-[11px] text-[#e6d3b3]/90 truncate">
            <span className="text-[#bda782] mr-1.5">Input:</span>
            <span title={entry.input}>{entry.input}</span>
          </div>
        </div>

        {/* Footer: Original vs DIY Price + Reopen link */}
        <div className="mt-5 space-y-2.5 border-t border-[#d4af37]/20 pt-3.5">
          {entry.partsSpec && (
            <div className="font-mono text-[10px] text-[#bda782]">
              {entry.partsSpec}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="font-mono tabular-nums">
              {entry.originalPrice > 0 && (
                <span className="text-[#bda782] line-through mr-2">
                  {formatCurrency(entry.originalPrice)}
                </span>
              )}
              <span className="font-bold text-[#f3d478] text-sm">
                {entry.altPrice > 0
                  ? `${formatCurrency(entry.altPrice)} DIY`
                  : 'View BOM'}
              </span>
            </div>

            <Link
              href={`/projects/${encodeURIComponent(entry.slug)}`}
              data-testid={`reopen-build-${entry.slug}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#d4af37]/45 bg-[#d4af37]/15 px-3.5 py-2 font-codex text-[11px] font-bold text-[#f3d478] hover:bg-[#d4af37]/25 hover:border-[#f3d478] transition-all"
            >
              <span>Reopen Build</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  };

  if (!loadingServer && builds.length === 0 && communityBuilds.length === 0) {
    return null;
  }

  return (
    <section
      id="recent-builds"
      data-testid="recent-builds-shelf"
      aria-label="Recent Builds"
      className="rounded-2xl surface-card p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#dfd3be]/15 pb-4">
        <div>
          <p className="eyebrow">Your Live Runs</p>
          <h2 className="mt-0.5 font-display text-2xl font-bold text-[#faf4e8]">
            Recent Builds
          </h2>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfd3be]/25 bg-[#0c0a08] px-3 py-1 font-mono text-xs text-[#f3d478]">
          <span className="h-2 w-2 rounded-full bg-[#e5bd47]" />
          {builds.length} Saved {builds.length === 1 ? 'Build' : 'Builds'}
        </span>
      </div>

      {builds.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builds.map((entry) => renderBuildCard(entry, false))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#d4af37]/20 bg-[#0c0906]/75 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-display text-lg font-bold text-[#f5ebd6]">
              {loadingServer
                ? 'Checking saved builds for your network...'
                : 'No custom live builds saved from your network yet'}
            </div>
            <p className="text-xs text-[#bda782]">
              Paste any product link, YouTube video, or photo in the command bar
              above to generate a custom DIY alternative—it will appear right
              here automatically.
            </p>
          </div>
          <a
            href="#hero-command"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/15 px-4 py-2 font-codex text-xs font-bold text-[#f3d478] hover:bg-[#d4af37]/25 transition-colors shrink-0"
          >
            <span>Start a Live Build</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {communityBuilds.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-[#d4af37]/20">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 font-codex text-xs font-bold uppercase tracking-[0.16em] text-[#d4af37]">
              <Globe className="h-3.5 w-3.5" />
              Community Live Builds
            </div>
            <span className="font-mono text-[11px] text-[#bda782]">
              Recent live runs on this server
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {communityBuilds.map((entry) => renderBuildCard(entry, true))}
          </div>
        </div>
      )}
    </section>
  );
}

export default RecentBuildsShelf;
