import { NextRequest } from 'next/server';
import {
  ensurePipelineRunning,
  getProjectEvents,
  getProjectManifest,
  pipelineEmitter,
} from '@/lib/agents/orchestrator';
import { isPresetManifest } from '@/lib/recent-builds';
import {
  ensurePersistedProjectRestored,
  getClientIpHash,
  recordCompletedBuildForIp,
  trackProjectForIp,
} from '@/lib/recent-builds-server';
import { SsePipelineEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const ipHash = getClientIpHash(req);
  await ensurePersistedProjectRestored(projectId, ipHash);
  trackProjectForIp(projectId, ipHash);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let sentCount = 0;

      const sendSseEvent = (ev: SsePipelineEvent) => {
        if (closed) return;
        try {
          const payload: SsePipelineEvent = {
            agent: ev.agent,
            phase: ev.phase,
            message: ev.message,
            data: ev.data,
            ts: ev.ts || new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const initialManifest = ensurePipelineRunning(projectId);
      const initialEvents = getProjectEvents(projectId);

      if (initialEvents.length > 0) {
        for (const ev of initialEvents) {
          sendSseEvent(ev);
          sentCount++;
        }
      } else if (initialManifest) {
        sendSseEvent({
          agent: 'orchestrator',
          phase: 'start',
          message: `Initialized pipeline workspace for ${initialManifest.title}`,
          data: { manifest: initialManifest },
          ts: initialManifest.createdAt,
        });
      }

      if (
        initialManifest &&
        (initialManifest.status === 'completed' ||
          initialManifest.status === 'error')
      ) {
        if (
          initialManifest.status === 'completed' &&
          !isPresetManifest(initialManifest)
        ) {
          void recordCompletedBuildForIp(
            ipHash,
            initialManifest,
            initialManifest
          );
        }
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      const onEvent = (ev: SsePipelineEvent) => {
        sendSseEvent(ev);
        sentCount++;
        if (
          ev.agent === 'orchestrator' &&
          (ev.phase === 'done' || ev.phase === 'error')
        ) {
          const finalManifest = getProjectManifest(projectId);
          if (
            finalManifest &&
            finalManifest.status === 'completed' &&
            !isPresetManifest(finalManifest)
          ) {
            void recordCompletedBuildForIp(
              ipHash,
              finalManifest,
              finalManifest
            );
          }
          cleanup();
        }
      };

      pipelineEmitter.on(`event:${projectId}`, onEvent);

      // Periodic poll fallback for multi-worker environments
      const pollTimer = setInterval(() => {
        if (closed) return;
        const allEvents = getProjectEvents(projectId);
        while (sentCount < allEvents.length) {
          sendSseEvent(allEvents[sentCount]);
          sentCount++;
        }
        const latest = getProjectManifest(projectId);
        if (
          latest &&
          (latest.status === 'completed' || latest.status === 'error')
        ) {
          if (latest.status === 'completed' && !isPresetManifest(latest)) {
            void recordCompletedBuildForIp(ipHash, latest, latest);
          }
          cleanup();
        }
      }, 1000);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        pipelineEmitter.off(`event:${projectId}`, onEvent);
        try {
          controller.close();
        } catch {
          // ignore
        }
      }

      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
