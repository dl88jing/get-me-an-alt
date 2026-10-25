import type { AgentStatus, ProjectManifest } from '@/lib/types';
import { EmptyState, SectionHeading } from '@/components/ui/SectionHeading';

/**
 * Mission Control — the "Best use of Managed Agents" centerpiece (visual-polish lane).
 *
 * Dual-shape by design, because the two contracts in this repo disagree:
 * - The live SSE route emits the full ProjectManifest on every update
 *   (`/api/objects/[id]/stream` sends `data: <ProjectManifest>`), so the
 *   agent graph always renders from `manifest.stages` (status, timings,
 *   tokens, logs, artifacts).
 * - The leader's posted shape on MESSAGEBOARD is per-agent events
 *   `{ agent, phase, message, data?, ts }`. Pass those through the optional
 *   `thoughts` prop and they render as a live thought feed under the graph,
 *   without changing the manifest rendering. Either shape alone is enough;
 *   together they are the full picture.
 *
 * Mounting is the leader's call (app/ is the leader's path): this component is
 * intentionally page-agnostic — pass it the latest manifest from the stream.
 */

/** One per-agent streaming event, in the leader's posted MESSAGEBOARD shape. */
export interface StreamThought {
  agent: string;
  phase: 'start' | 'thought' | 'artifact' | 'done' | 'error';
  message: string;
  data?: unknown;
  ts?: string | number;
}

const THOUGHT_STYLE: Record<
  StreamThought['phase'],
  { dot: string; label: string }
> = {
  start: { dot: 'bg-[#8b98a9]', label: 'started' },
  thought: { dot: 'bg-[#d29922] animate-timeline-dot', label: 'thinking' },
  artifact: { dot: 'bg-[#58a6ff]', label: 'artifact' },
  done: { dot: 'bg-[#3fb950]', label: 'done' },
  error: { dot: 'bg-[#f85149]', label: 'error' },
};

function formatTs(ts?: string | number): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const STATUS_STYLE: Record<
  AgentStatus,
  { dot: string; label: string; ring: string }
> = {
  pending: { dot: 'bg-[#8b98a9]', label: 'Queued', ring: '' },
  running: {
    dot: 'bg-[#d29922] animate-timeline-dot',
    label: 'Running',
    ring: 'border-[#d29922]/40',
  },
  completed: { dot: 'bg-[#3fb950]', label: 'Done', ring: '' },
  error: { dot: 'bg-[#f85149]', label: 'Failed', ring: 'border-[#f85149]/40' },
};

function formatMs(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function formatTokens(total?: number): string {
  if (total === undefined) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return `${total}`;
}

export function MissionControl({
  manifest,
  thoughts = [],
  isLive = false,
}: {
  manifest: ProjectManifest | null;
  /** Optional per-agent events in the leader's posted {agent, phase} shape. */
  thoughts?: StreamThought[];
  isLive?: boolean;
}) {
  if (!manifest) {
    return (
      <div>
        <SectionHeading
          eyebrow="Managed Agents"
          title="Mission Control"
          description="Watch every Gemini 4 Argon agent work the build, live."
        />
        <div className="mt-4">
          <EmptyState
            title="No build in flight"
            body="Start a build from a link, video, or image and the agent graph lights up here — status, thoughts, timings, and artifacts as they land."
          />
        </div>
      </div>
    );
  }

  const stages = manifest.stages ?? [];
  const done = stages.filter((s) => s.status === 'completed').length;
  const failed = stages.filter((s) => s.status === 'error').length;
  const totalTokens = stages.reduce(
    (sum, s) => sum + (s.tokensUsed?.total ?? 0),
    0,
  );
  const elapsedMs =
    manifest.createdAt && manifest.updatedAt
      ? new Date(manifest.updatedAt).getTime() -
        new Date(manifest.createdAt).getTime()
      : undefined;
  const progress =
    stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;

  return (
    <div>
      <SectionHeading
        eyebrow="Managed Agents"
        title="Mission Control"
        description={`Live agent graph for “${manifest.title}” — every stage is a Gemini 4 Argon agent.`}
      />

      {/* Overall status bar */}
      <div className="card mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-medium text-[#e6edf3]">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              manifest.status === 'completed'
                ? 'bg-[#3fb950]'
                : manifest.status === 'error'
                  ? 'bg-[#f85149]'
                  : 'bg-[#d29922] animate-timeline-dot'
            }`}
          />
          {manifest.status === 'completed'
            ? 'Build complete'
            : manifest.status === 'error'
              ? 'Build failed'
              : isLive
                ? 'Streaming live'
                : 'Build in progress'}
        </span>
        <span className="text-sm text-[#8b98a9]">
          {done}/{stages.length} agents done
          {failed > 0 ? ` · ${failed} failed` : ''}
        </span>
        <span className="text-sm text-[#8b98a9]">
          {formatTokens(totalTokens)} tokens
        </span>
        <span className="text-sm text-[#8b98a9]">
          {formatMs(elapsedMs)} elapsed
        </span>
        <div className="min-w-[140px] flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-[#232c38]">
            <div
              className="h-full rounded-full bg-[#3fb950] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Agent graph: pipeline order, as carried by the manifest */}
      <ol className="mt-4 space-y-3">
        {stages.map((stage, i) => {
          const style = STATUS_STYLE[stage.status];
          const latestLogs = (stage.logs ?? []).slice(-3);
          return (
            <li
              key={stage.id}
              className={`card animate-slide-in px-5 py-4 ${style.ring}`}
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
                />
                <span className="font-medium text-[#e6edf3]">
                  {i + 1}. {stage.name}
                </span>
                <span className="text-xs uppercase tracking-wide text-[#8b98a9]">
                  {style.label}
                </span>
                <span className="ml-auto text-xs text-[#8b98a9]">
                  {stage.model}
                  {stage.runner ? ` · ${stage.runner}` : ''}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#8b98a9]">{stage.role}</p>
              {stage.summary ? (
                <p className="mt-2 text-sm leading-relaxed text-[#e6edf3]">
                  {stage.summary}
                </p>
              ) : null}
              {stage.error ? (
                <p className="mt-2 text-sm text-[#f85149]">{stage.error}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b98a9]">
                <span>{formatMs(stage.durationMs)} run time</span>
                <span>{formatTokens(stage.tokensUsed?.total)} tokens</span>
                <span className="font-mono">
                  artifact: {stage.artifactFile}
                </span>
              </div>
              {latestLogs.length > 0 ? (
                <ul className="mt-3 space-y-1 border-l-2 border-[#232c38] pl-3">
                  {latestLogs.map((log, j) => (
                    <li
                      key={`${log.timestamp}-${j}`}
                      className="truncate font-mono text-xs text-[#8b98a9]"
                    >
                      {log.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* Live thought feed: the leader's posted per-event shape, when supplied. */}
      {thoughts.length > 0 ? (
        <div className="mt-6">
          <SectionHeading
            eyebrow="Streaming"
            title="Live thoughts"
            description="Per-agent events as they stream in — thoughts, artifacts, and completions."
          />
          <ul className="mt-4 space-y-1 border-l-2 border-[#232c38] pl-3">
            {thoughts.slice(-12).map((thought, i) => {
              const style = THOUGHT_STYLE[thought.phase] ?? THOUGHT_STYLE.thought;
              const ts = formatTs(thought.ts);
              return (
                <li
                  key={`${thought.agent}-${thought.phase}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-[#8b98a9]"
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                  />
                  <span className="font-sans font-medium text-[#e6edf3]">
                    {thought.agent}
                  </span>
                  <span className="uppercase tracking-wide">{style.label}</span>
                  {ts ? <span>{ts}</span> : null}
                  <span className="font-sans text-sm normal-case text-[#e6edf3]">
                    {thought.message}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {stages.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Agents queued"
            body="The manifest carries no stages yet — they appear here the moment the orchestrator starts each agent."
          />
        </div>
      ) : null}
    </div>
  );
}
