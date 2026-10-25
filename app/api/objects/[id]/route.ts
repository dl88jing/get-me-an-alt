import { NextRequest, NextResponse } from 'next/server';
import {
  getProjectEvents,
  getProjectManifest,
} from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const manifest = getProjectManifest(params.id);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const events = getProjectEvents(params.id);
  return NextResponse.json({ manifest, events });
}
