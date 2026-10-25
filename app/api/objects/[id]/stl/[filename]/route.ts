import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  getProjectFolder,
  getProjectManifest,
} from '@/lib/agents/orchestrator';

export const dynamic = 'force-dynamic';

const DEMO_PART_FILE_ALIASES: Record<string, string> = {
  'pump-cradle.stl': 'pump-mount.stl',
  'controller-enclosure.stl': 'controller-box.stl',
  'enclosure-cover.stl': 'controller-bracket.stl',
  'drip-manifold.stl': 'refill-funnel.stl',
  'emitter-spike.stl': 'drip-stake.stl',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; filename: string } }
) {
  const { id, filename } = params;
  const safeFile = path.basename(filename);
  const aliasedDemoFile = DEMO_PART_FILE_ALIASES[safeFile];

  const folder = getProjectFolder(id);
  const candidates = [
    ...(folder
      ? [
          path.join(folder, 'parts', safeFile),
          path.join(folder, 'plates', safeFile),
          path.join(folder, safeFile),
        ]
      : []),
    path.join(process.cwd(), 'data', 'demo', id, 'parts', safeFile),
    path.join(process.cwd(), 'data', 'demo', 'plant-waterer', 'parts', safeFile),
    ...(aliasedDemoFile
      ? [
          path.join(
            process.cwd(),
            'data',
            'demo',
            'plant-waterer',
            'parts',
            aliasedDemoFile
          ),
        ]
      : []),
    path.join(process.cwd(), 'data', 'demo', 'parts', safeFile),
  ];

  const contentType = safeFile.toLowerCase().endsWith('.3mf')
    ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
    : safeFile.toLowerCase().endsWith('.scad')
    ? 'text/plain; charset=utf-8'
    : 'model/stl';

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const content = fs.readFileSync(candidate);
      return new NextResponse(content, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${safeFile}"`,
        },
      });
    }
  }

  // Fallback synthesized ASCII STL from manifest part dimensions
  const manifest = getProjectManifest(id);
  const partId = safeFile.replace(/\.stl$/i, '');
  const part = manifest?.design?.parts.find((p) => p.id === partId);
  const [w, h, d] = part?.dims_mm || [50, 30, 50];
  const hx = w / 2;
  const hy = d / 2;
  const stl = [
    `solid ${partId}`,
    `  facet normal 0 0 -1`,
    `    outer loop`,
    `      vertex ${-hx} ${-hy} 0`,
    `      vertex ${hx} ${hy} 0`,
    `      vertex ${hx} ${-hy} 0`,
    `    endloop`,
    `  endfacet`,
    `  facet normal 0 0 1`,
    `    outer loop`,
    `      vertex ${-hx} ${-hy} ${h}`,
    `      vertex ${hx} ${-hy} ${h}`,
    `      vertex ${hx} ${hy} ${h}`,
    `    endloop`,
    `  endfacet`,
    `endsolid ${partId}`,
    '',
  ].join('\n');

  return new NextResponse(stl, {
    headers: {
      'Content-Type': 'model/stl',
      'Content-Disposition': `attachment; filename="${safeFile}"`,
    },
  });
}
