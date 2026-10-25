import type { ProjectManifest, SsePipelineEvent } from '@/lib/types';
import MissionControlCore, {
  type StreamThought,
} from '../mission-control/MissionControl';

/**
 * Mission Control adapter — the mount point the project page's peer-component
 * resolver actually matches.
 *
 * Why this file exists: app/projects/[id]/page.tsx resolves its Managed Agents
 * panel via require.context patterns 'ui/MissionControl' | 'ui/AgentGraph' |
 * 'ui/AgentTimeline', but the real component lives at
 * components/mission-control/MissionControl.tsx — a substring the resolver
 * never matches, so the panel silently rendered nothing even after the leader
 * added the mount slot. This thin adapter (components/ui/ is the visual-polish /
 * Mission Control lane) bridges the two without touching app/:
 *   page props  { manifest, stages, events, projectId }
 *   core props  { manifest, thoughts, isLive }
 * `events` are the leader's structured SSE events {agent, phase, message,
 * data?, ts} — exactly the StreamThought shape — so they feed the live
 * thought feed; `manifest.stages` feeds the agent graph.
 *
 * No logic lives here: all rendering stays in mission-control/MissionControl.
 */
export function MissionControl({
  manifest,
  events,
  thoughts,
  isLive,
}: {
  manifest?: ProjectManifest | null;
  /** Unused by the core; accepted so the page's stages prop typechecks. */
  stages?: ProjectManifest['stages'];
  /** Structured SSE events from the page's stream state. */
  events?: SsePipelineEvent[];
  /** Unused by the core; accepted so the page's projectId prop typechecks. */
  projectId?: string;
  /** Direct thought-feed input (preferred if both are given). */
  thoughts?: StreamThought[];
  isLive?: boolean;
}) {
  const feed: StreamThought[] =
    thoughts ??
    (events ?? []).map((ev) => ({
      agent: ev.agent,
      phase: ev.phase,
      message: ev.message,
      data: ev.data,
      ts: ev.ts,
    }));
  return (
    <MissionControlCore
      manifest={manifest ?? null}
      thoughts={feed}
      isLive={isLive ?? manifest?.status === 'running'}
    />
  );
}

export default MissionControl;
