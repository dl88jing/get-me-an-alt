import { NextRequest } from 'next/server';
import {
  getProjectManifest,
  pipelineEmitter,
} from '@/lib/agents/orchestrator';
import { ProjectManifest } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const sendEvent = (manifest: ProjectManifest) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(manifest)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };

      const initial = getProjectManifest(projectId);
      if (initial) {
        sendEvent(initial);
        if (initial.status === 'completed' || initial.status === 'error') {
          closed = true;
          controller.close();
          return;
        }
      }

      const onUpdate = (updated: ProjectManifest) => {
        sendEvent(updated);
        if (updated.status === 'completed' || updated.status === 'error') {
          cleanup();
        }
      };

      pipelineEmitter.on(`update:${projectId}`, onUpdate);

      // Periodic poll fallback for multi-worker environments
      const pollTimer = setInterval(() => {
        if (closed) return;
        const latest = getProjectManifest(projectId);
        if (latest) {
          sendEvent(latest);
          if (latest.status === 'completed' || latest.status === 'error') {
            cleanup();
          }
        }
      }, 1500);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        pipelineEmitter.off(`update:${projectId}`, onUpdate);
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
