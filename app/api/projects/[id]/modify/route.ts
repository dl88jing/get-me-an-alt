import { NextRequest, NextResponse } from 'next/server';
import {
  buildDeterministicClassification,
  ORDERED_MODIFY_AGENTS,
  runSelectiveModifyPipeline,
} from '@/lib/agents/modify';
import {
  buildSampleManifest,
  getProjectManifest,
} from '@/lib/agents/orchestrator';
import { ProjectManifest, SsePipelineEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;
  const manifest = getProjectManifest(projectId) || buildSampleManifest();
  const previewPrompt = req.nextUrl.searchParams.get('prompt');

  if (previewPrompt) {
    const classification = buildDeterministicClassification(
      previewPrompt,
      manifest
    );
    return NextResponse.json({
      projectId,
      prompt: previewPrompt,
      classification,
    });
  }

  return NextResponse.json({
    status: 'ready',
    projectId,
    supportedStages: ORDERED_MODIFY_AGENTS,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = params.id;

  let body: {
    prompt?: string;
    manifest?: ProjectManifest | null;
    forceDeterministic?: boolean;
  } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json(
      { error: 'Modification prompt is required' },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const enqueueSse = (ev: SsePipelineEvent) => {
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

      req.signal.addEventListener('abort', () => {
        closed = true;
      });

      try {
        await runSelectiveModifyPipeline({
          projectId,
          prompt,
          clientManifest: body.manifest,
          forceDeterministic: body.forceDeterministic,
          onEvent: enqueueSse,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        enqueueSse({
          agent: 'orchestrator',
          phase: 'error',
          message: `Modify pipeline error: ${errMsg}`,
          data: { isModify: true, error: errMsg },
          ts: new Date().toISOString(),
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      }
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
