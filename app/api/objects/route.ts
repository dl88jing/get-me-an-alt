import { NextRequest, NextResponse } from 'next/server';
import {
  listRecentProjects,
  startProjectPipeline,
} from '@/lib/agents/orchestrator';
import { isPresetManifest } from '@/lib/recent-builds';
import {
  getClientIpHash,
  recordCompletedBuildForIp,
  trackProjectForIp,
} from '@/lib/recent-builds-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  const projects = listRecentProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, url, imageName, inlineImage, printerId } = body || {};

    if (!prompt && !url && !inlineImage) {
      return NextResponse.json(
        { error: 'Please provide a product URL, description, or image.' },
        { status: 400 }
      );
    }

    const ipHash = getClientIpHash(req);
    const manifest = startProjectPipeline({
      prompt,
      url,
      imageName,
      inlineImage,
      printerId: printerId || 'bambu-a1',
    });

    if (!isPresetManifest(manifest)) {
      trackProjectForIp(manifest.id, ipHash);
      if (manifest.status === 'completed') {
        await recordCompletedBuildForIp(ipHash, manifest, manifest);
      }
    }

    return NextResponse.json({
      id: manifest.id,
      slug: manifest.slug,
      manifest,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to start agent pipeline',
      },
      { status: 500 }
    );
  }
}
