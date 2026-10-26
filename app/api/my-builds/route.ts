import { NextRequest, NextResponse } from 'next/server';
import {
  getClientIpHash,
  listBuildsForIp,
  recordCompletedBuildForIp,
  removeBuildForIp,
} from '@/lib/recent-builds-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ipHash = getClientIpHash(req);
  const { builds, communityBuilds } = await listBuildsForIp(ipHash, 50);
  return NextResponse.json(
    {
      builds,
      communityBuilds,
      count: builds.length,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const ipHash = getClientIpHash(req);
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    if (Array.isArray(body)) {
      for (const item of body) {
        await recordCompletedBuildForIp(ipHash, item);
      }
    } else if (Array.isArray(body.builds)) {
      for (const item of body.builds) {
        await recordCompletedBuildForIp(ipHash, item);
      }
    } else {
      const target = body.build || body.manifest || body;
      const fullManifest = body.manifest || undefined;
      await recordCompletedBuildForIp(ipHash, target, fullManifest);
    }

    const { builds, communityBuilds } = await listBuildsForIp(ipHash, 50);
    return NextResponse.json({
      ok: true,
      builds,
      communityBuilds,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to record recent build',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ipHash = getClientIpHash(req);
    let slug = req.nextUrl.searchParams.get('slug') || '';
    if (!slug) {
      const body = await req.json().catch(() => null);
      if (body && typeof body.slug === 'string') {
        slug = body.slug;
      }
    }

    if (!slug.trim()) {
      return NextResponse.json(
        { error: 'Missing slug parameter' },
        { status: 400 }
      );
    }

    const builds = await removeBuildForIp(ipHash, slug);
    return NextResponse.json({
      ok: true,
      builds,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to remove recent build',
      },
      { status: 500 }
    );
  }
}
