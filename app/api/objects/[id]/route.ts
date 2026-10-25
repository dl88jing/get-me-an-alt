import { NextRequest, NextResponse } from 'next/server';
import { getProjectManifest } from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const manifest = getProjectManifest(params.id);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  return NextResponse.json({ manifest });
}
