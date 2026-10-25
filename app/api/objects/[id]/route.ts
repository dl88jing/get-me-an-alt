import { NextRequest, NextResponse } from 'next/server';
import {
  ensurePipelineRunning,
  getProjectEvents,
  getProjectManifest,
} from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const manifest =
    getProjectManifest(params.id) || ensurePipelineRunning(params.id);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const events = getProjectEvents(params.id);
  return NextResponse.json({ manifest, events });
}
