import { NextRequest, NextResponse } from 'next/server';
import {
  ensurePipelineRunning,
  getProjectEvents,
  getProjectManifest,
} from '@/lib/agents/orchestrator';
import { isPresetManifest } from '@/lib/recent-builds';
import {
  ensurePersistedProjectRestored,
  getClientIpHash,
  recordCompletedBuildForIp,
  trackProjectForIp,
} from '@/lib/recent-builds-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ipHash = getClientIpHash(req);
  await ensurePersistedProjectRestored(params.id, ipHash);

  const manifest =
    getProjectManifest(params.id) || ensurePipelineRunning(params.id);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!isPresetManifest(manifest)) {
    trackProjectForIp(manifest.id, ipHash);
    if (manifest.status === 'completed') {
      void recordCompletedBuildForIp(ipHash, manifest, manifest);
    }
  }

  const events = getProjectEvents(params.id);
  return NextResponse.json({ manifest, events });
}
