import {
  BracketLParams,
  ClipParams,
  CustomCsgParams,
  CylinderParams,
  FunnelParams,
  GearSimpleParams,
  HoleSpec,
  HookParams,
  PlateWithHolesParams,
  PrintedPart,
  PrintedPartShape,
  ProxyShapeSpec,
  TubeParams,
  BoxParams,
} from "./parts";

export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export interface TriangleMesh {
  /** Flat vertex coordinates [x0, y0, z0, x1, y1, z1, ...] in mm */
  positions: Float32Array;
  /** Triangle vertex indices [i0, i1, i2, ...] (CCW outward winding) */
  indices: Uint32Array;
  /** Smooth or face-weighted vertex normals [nx0, ny0, nz0, ...] */
  normals: Float32Array;
  /** Axis-aligned bounding box in mm */
  bbox: BoundingBox3D;
  /** Number of vertices (positions.length / 3) */
  vertexCount: number;
  /** Number of triangles (indices.length / 3) */
  triangleCount: number;
}

export interface ManifoldReport {
  isManifold: boolean;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
  volumeMm3: number;
}

type Point2D = [number, number];

const EPS = 1e-7;

function num(val: unknown, fallback: number): number {
  const n = typeof val === "number" ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val: number, minVal: number, maxVal: number): number {
  return Math.max(minVal, Math.min(maxVal, val));
}

function signedArea2D(poly: Point2D[]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  return area * 0.5;
}

function ensureWinding(poly: Point2D[], ccw: boolean): Point2D[] {
  const area = signedArea2D(poly);
  if ((ccw && area < 0) || (!ccw && area > 0)) {
    return [...poly].reverse();
  }
  return [...poly];
}

function cross2D(a: Point2D, b: Point2D, c: Point2D): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle2D(p: Point2D, a: Point2D, b: Point2D, c: Point2D): boolean {
  const c1 = cross2D(a, b, p);
  const c2 = cross2D(b, c, p);
  const c3 = cross2D(c, a, p);
  return c1 >= -EPS && c2 >= -EPS && c3 >= -EPS;
}

function makeCirclePolygon(
  cx: number,
  cy: number,
  radius: number,
  segments: number,
  ccw: boolean
): Point2D[] {
  const pts: Point2D[] = [];
  const r = Math.max(0.25, radius);
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const a = ccw ? angle : -angle;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function makeRoundedRectPolygon(
  width: number,
  depth: number,
  cornerRadius = 0,
  cornerSegments = 6,
  ccw = true
): Point2D[] {
  const hw = width / 2;
  const hd = depth / 2;
  const r = clamp(cornerRadius, 0, Math.min(hw, hd) - 0.05);
  if (r <= 0.05) {
    const rect: Point2D[] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
    return ensureWinding(rect, ccw);
  }

  const pts: Point2D[] = [];
  const corners: Array<{ cx: number; cy: number; startAngle: number }> = [
    { cx: hw - r, cy: -hd + r, startAngle: -Math.PI / 2 },
    { cx: hw - r, cy: hd - r, startAngle: 0 },
    { cx: -hw + r, cy: hd - r, startAngle: Math.PI / 2 },
    { cx: -hw + r, cy: -hd + r, startAngle: Math.PI },
  ];

  for (const c of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const theta = c.startAngle + (i / cornerSegments) * (Math.PI / 2);
      pts.push([c.cx + r * Math.cos(theta), c.cy + r * Math.sin(theta)]);
    }
  }
  return ensureWinding(pts, ccw);
}

interface IndexedVertex2D {
  idx: number;
  pt: Point2D;
}

/**
 * Splices an interior CW hole loop into a CCW outer loop using a visible horizontal ray bridge.
 */
function bridgeHoleIntoPolygon(
  outerLoop: IndexedVertex2D[],
  holeLoop: IndexedVertex2D[]
): IndexedVertex2D[] {
  // 1. Find rightmost vertex M in holeLoop
  let holeMaxPos = 0;
  for (let i = 1; i < holeLoop.length; i++) {
    if (
      holeLoop[i].pt[0] > holeLoop[holeMaxPos].pt[0] ||
      (Math.abs(holeLoop[i].pt[0] - holeLoop[holeMaxPos].pt[0]) <= EPS &&
        holeLoop[i].pt[1] < holeLoop[holeMaxPos].pt[1])
    ) {
      holeMaxPos = i;
    }
  }
  const M = holeLoop[holeMaxPos];
  const mx = M.pt[0];
  const my = M.pt[1];

  // 2. Intersect ray (mx, my) -> (+inf, my) with edges of outerLoop
  let bestX = Infinity;
  let candidateOuterPos = -1;
  const n = outerLoop.length;

  for (let i = 0; i < n; i++) {
    const a = outerLoop[i].pt;
    const b = outerLoop[(i + 1) % n].pt;
    if ((a[1] > my) === (b[1] > my)) {
      // Check if horizontal segment or endpoint touches my
      if (Math.abs(a[1] - my) <= EPS && a[0] >= mx - EPS && a[0] < bestX) {
        bestX = a[0];
        candidateOuterPos = i;
      }
      continue;
    }
    // Only consider edges where interior stays to the left (downward edge in CCW outer loop)
    const xInt = a[0] + ((my - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (xInt >= mx - EPS && xInt < bestX) {
      bestX = xInt;
      candidateOuterPos = a[0] >= b[0] ? i : (i + 1) % n;
    }
  }

  if (candidateOuterPos === -1) {
    // Fallback: closest vertex in outerLoop to M with x >= mx (or minimum distance)
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = outerLoop[i].pt[0] - mx;
      const dy = outerLoop[i].pt[1] - my;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        candidateOuterPos = i;
      }
    }
  }

  // 3. Check if any reflex vertex of outerLoop lies inside triangle (M, (bestX, my), P)
  const P = outerLoop[candidateOuterPos].pt;
  const I: Point2D = [bestX, my];
  let bestPos = candidateOuterPos;
  let bestTan = Infinity;

  const triA = M.pt;
  const triB = P[1] >= my ? I : P;
  const triC = P[1] >= my ? P : I;

  if (Math.abs(cross2D(triA, triB, triC)) > EPS) {
    for (let i = 0; i < n; i++) {
      if (outerLoop[i].idx === outerLoop[candidateOuterPos].idx) continue;
      const prev = outerLoop[(i - 1 + n) % n].pt;
      const curr = outerLoop[i].pt;
      const next = outerLoop[(i + 1) % n].pt;
      // Reflex vertex in CCW loop
      if (cross2D(prev, curr, next) < EPS) {
        if (pointInTriangle2D(curr, triA, triB, triC)) {
          const dx = curr[0] - mx;
          const dy = Math.abs(curr[1] - my);
          const tan = dx > EPS ? dy / dx : Infinity;
          if (tan < bestTan || (Math.abs(tan - bestTan) <= EPS && dx < outerLoop[bestPos].pt[0] - mx)) {
            bestTan = tan;
            bestPos = i;
          }
        }
      }
    }
  }

  // Ensure bestPos is the last occurrence of that vertex idx if already bridged
  const chosenIdx = outerLoop[bestPos].idx;
  // Build spliced loop: outer[0..bestPos], hole[holeMaxPos..holeMaxPos], M, outer[bestPos..end]
  const result: IndexedVertex2D[] = [];
  for (let i = 0; i <= bestPos; i++) {
    result.push(outerLoop[i]);
  }
  for (let i = 0; i < holeLoop.length; i++) {
    result.push(holeLoop[(holeMaxPos + i) % holeLoop.length]);
  }
  result.push(holeLoop[holeMaxPos]);
  result.push({ idx: chosenIdx, pt: outerLoop[bestPos].pt });
  for (let i = bestPos + 1; i < n; i++) {
    result.push(outerLoop[i]);
  }
  return result;
}

/**
 * Triangulates a 2D simple polygon with optional interior holes into triangle vertex indices.
 * Vertex indices 0..outer.length-1 are the outer contour; subsequent indices are the holes in order.
 */
function triangulatePolygonWithHoles(
  outer: Point2D[],
  holes: Point2D[][] = []
): { vertices: Point2D[]; triangles: Array<[number, number, number]> } {
  const ccwOuter = ensureWinding(outer, true);
  const cwHoles = holes.map((h) => ensureWinding(h, false));

  const allVertices: Point2D[] = [];
  let outerLoop: IndexedVertex2D[] = ccwOuter.map((pt) => {
    const idx = allVertices.length;
    allVertices.push(pt);
    return { idx, pt };
  });

  const indexedHoles: Array<{ maxX: number; loop: IndexedVertex2D[] }> = cwHoles.map((hole) => {
    let maxX = -Infinity;
    const loop = hole.map((pt) => {
      const idx = allVertices.length;
      allVertices.push(pt);
      if (pt[0] > maxX) maxX = pt[0];
      return { idx, pt };
    });
    return { maxX, loop };
  });

  // Sort holes by rightmost X descending so bridges never cross unprocessed holes
  indexedHoles.sort((a, b) => b.maxX - a.maxX);
  for (const h of indexedHoles) {
    outerLoop = bridgeHoleIntoPolygon(outerLoop, h.loop);
  }

  // Ear clipping on outerLoop
  const loop = [...outerLoop];
  const triangles: Array<[number, number, number]> = [];
  let guard = loop.length * loop.length * 4 + 100;

  const isEar = (i: number, len: number, strictArea: number): boolean => {
    const prev = loop[(i - 1 + len) % len];
    const curr = loop[i];
    const next = loop[(i + 1) % len];
    if (prev.idx === curr.idx || curr.idx === next.idx || next.idx === prev.idx) {
      return false;
    }
    const area2 = cross2D(prev.pt, curr.pt, next.pt);
    if (area2 <= strictArea) return false;

    for (let j = 0; j < len; j++) {
      const v = loop[j];
      if (v.idx === prev.idx || v.idx === curr.idx || v.idx === next.idx) {
        continue;
      }
      if (pointInTriangle2D(v.pt, prev.pt, curr.pt, next.pt)) {
        return false;
      }
    }
    return true;
  };

  while (loop.length > 3 && guard-- > 0) {
    const len = loop.length;
    let clipped = false;

    // Remove trivial zero-area spike [..., u, v, u, ...] if any arises
    for (let i = 0; i < len; i++) {
      const prev = loop[(i - 1 + len) % len];
      const next = loop[(i + 1) % len];
      if (prev.idx === next.idx) {
        loop.splice(i, 2);
        clipped = true;
        break;
      }
    }
    if (clipped) continue;

    // Pass 1: strict ear test
    for (let i = 0; i < len; i++) {
      if (isEar(i, len, 1e-8)) {
        const prev = loop[(i - 1 + len) % len];
        const curr = loop[i];
        const next = loop[(i + 1) % len];
        triangles.push([prev.idx, curr.idx, next.idx]);
        loop.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (clipped) continue;

    // Pass 2: relaxed ear test
    for (let i = 0; i < len; i++) {
      if (isEar(i, len, -1e-6)) {
        const prev = loop[(i - 1 + len) % len];
        const curr = loop[i];
        const next = loop[(i + 1) % len];
        triangles.push([prev.idx, curr.idx, next.idx]);
        loop.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (clipped) continue;

    // Pass 3: largest positive cross product with distinct vertex indices
    let bestIdx = -1;
    let bestCross = -Infinity;
    for (let i = 0; i < len; i++) {
      const prev = loop[(i - 1 + len) % len];
      const curr = loop[i];
      const next = loop[(i + 1) % len];
      if (prev.idx === curr.idx || curr.idx === next.idx || next.idx === prev.idx) {
        continue;
      }
      const c = cross2D(prev.pt, curr.pt, next.pt);
      if (c > bestCross) {
        bestCross = c;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const prev = loop[(bestIdx - 1 + len) % len];
      const curr = loop[bestIdx];
      const next = loop[(bestIdx + 1) % len];
      triangles.push([prev.idx, curr.idx, next.idx]);
      loop.splice(bestIdx, 1);
    } else {
      break;
    }
  }

  if (loop.length === 3) {
    const [a, b, c] = loop;
    if (a.idx !== b.idx && b.idx !== c.idx && c.idx !== a.idx) {
      triangles.push([a.idx, b.idx, c.idx]);
    }
  }

  return { vertices: allVertices, triangles };
}

/**
 * Extrudes a 2D polygon (with optional interior holes) along Z from z = 0 to z = height.
 * Produces a 100% closed, watertight 2-manifold mesh.
 */
function extrudePolygonWithHoles(
  outer: Point2D[],
  height: number,
  holes: Point2D[][] = []
): TriangleMesh {
  const h = Math.max(0.5, height);
  const ccwOuter = ensureWinding(outer, true);
  const cwHoles = holes.map((hole) => ensureWinding(hole, false));
  const { vertices, triangles } = triangulatePolygonWithHoles(ccwOuter, cwHoles);

  const n2d = vertices.length;
  // Bottom vertices: 0 .. n2d-1 (z = 0)
  // Top vertices: n2d .. 2*n2d-1 (z = h)
  const positions = new Float32Array(n2d * 2 * 3);
  for (let i = 0; i < n2d; i++) {
    const [x, y] = vertices[i];
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = 0;

    const topIdx = (n2d + i) * 3;
    positions[topIdx] = x;
    positions[topIdx + 1] = y;
    positions[topIdx + 2] = h;
  }

  const triIndices: number[] = [];

  // Bottom cap (normal pointing -Z: reverse triangle winding)
  for (const [a, b, c] of triangles) {
    triIndices.push(a, c, b);
  }

  // Top cap (normal pointing +Z: keep CCW winding)
  for (const [a, b, c] of triangles) {
    triIndices.push(n2d + a, n2d + b, n2d + c);
  }

  // Side walls for outer contour and each hole contour
  const addContourWall = (startIdx: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const b0 = startIdx + i;
      const b1 = startIdx + ((i + 1) % count);
      const t0 = n2d + b0;
      const t1 = n2d + b1;
      triIndices.push(b0, b1, t1);
      triIndices.push(b0, t1, t0);
    }
  };

  let offset = 0;
  addContourWall(offset, ccwOuter.length);
  offset += ccwOuter.length;
  for (const hole of cwHoles) {
    addContourWall(offset, hole.length);
    offset += hole.length;
  }

  return buildMeshFromBuffers(positions, new Uint32Array(triIndices), true);
}

/**
 * Revolves a closed 2D profile in the (r, z) half-plane (all r > 0) around the Z axis.
 * Produces a 100% closed, watertight 2-manifold torus-topology mesh.
 */
function revolveClosedProfile(
  profileRZ: Point2D[],
  segments = 48
): TriangleMesh {
  const segs = Math.max(12, Math.floor(segments));
  // In (r, z), ensure CCW orientation so outward normals point away from interior
  const ring = ensureWinding(profileRZ, true);
  const m = ring.length;
  const totalVerts = segs * m;
  const positions = new Float32Array(totalVerts * 3);

  for (let s = 0; s < segs; s++) {
    const theta = (2 * Math.PI * s) / segs;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    for (let j = 0; j < m; j++) {
      const r = Math.max(0.2, ring[j][0]);
      const z = ring[j][1];
      const idx = (s * m + j) * 3;
      positions[idx] = r * cosT;
      positions[idx + 1] = r * sinT;
      positions[idx + 2] = z;
    }
  }

  const indices = new Uint32Array(segs * m * 2 * 3);
  let ptr = 0;
  for (let s = 0; s < segs; s++) {
    const sNext = (s + 1) % segs;
    for (let j = 0; j < m; j++) {
      const jNext = (j + 1) % m;
      const v00 = s * m + j;
      const v10 = sNext * m + j;
      const v11 = sNext * m + jNext;
      const v01 = s * m + jNext;

      indices[ptr++] = v00;
      indices[ptr++] = v10;
      indices[ptr++] = v11;

      indices[ptr++] = v00;
      indices[ptr++] = v11;
      indices[ptr++] = v01;
    }
  }

  return buildMeshFromBuffers(positions, indices, true);
}

/**
 * Builds a hollow open-top container (enclosure or reservoir) with matched outer and inner contours,
 * floor thickness, optional top rim, and optional floor through-holes.
 * Guaranteed 100% single-shell watertight 2-manifold.
 */
function buildHollowContainerMesh(opts: {
  outerContour: Point2D[];
  innerContour: Point2D[];
  height: number;
  floorThickness: number;
  floorHoles?: Point2D[][];
}): TriangleMesh {
  const height = Math.max(2, opts.height);
  const floorZ = clamp(opts.floorThickness, 1, height - 0.5);
  const outer = ensureWinding(opts.outerContour, true);
  const inner = ensureWinding(opts.innerContour, true);
  const holes = (opts.floorHoles ?? []).map((h) => ensureWinding(h, false));

  // Bottom cap at z = 0: outer contour with floorHoles
  const bottomTri = triangulatePolygonWithHoles(outer, holes);
  // Inner floor cap at z = floorZ: inner contour with floorHoles
  const cavityFloorTri = triangulatePolygonWithHoles(inner, holes);

  const nOuter = outer.length;
  const nInner = inner.length;
  const holeCounts = holes.map((h) => h.length);
  const totalHoleVerts = holeCounts.reduce((a, b) => a + b, 0);

  // Vertex layout:
  // 0: bottom outer (z = 0), count = nOuter
  // 1: bottom holes (z = 0), count = totalHoleVerts
  // 2: cavity inner floor (z = floorZ), count = nInner
  // 3: cavity floor holes (z = floorZ), count = totalHoleVerts
  // 4: top outer (z = height), count = nOuter
  // 5: top inner (z = height), count = nInner
  const offBottomOuter = 0;
  const offBottomHoles = offBottomOuter + nOuter;
  const offCavityInner = offBottomHoles + totalHoleVerts;
  const offCavityHoles = offCavityInner + nInner;
  const offTopOuter = offCavityHoles + totalHoleVerts;
  const offTopInner = offTopOuter + nOuter;
  const totalVerts = offTopInner + nInner;

  const positions = new Float32Array(totalVerts * 3);
  const setVert = (vIdx: number, x: number, y: number, z: number) => {
    positions[vIdx * 3] = x;
    positions[vIdx * 3 + 1] = y;
    positions[vIdx * 3 + 2] = z;
  };

  for (let i = 0; i < nOuter; i++) {
    setVert(offBottomOuter + i, outer[i][0], outer[i][1], 0);
    setVert(offTopOuter + i, outer[i][0], outer[i][1], height);
  }
  for (let i = 0; i < nInner; i++) {
    setVert(offCavityInner + i, inner[i][0], inner[i][1], floorZ);
    setVert(offTopInner + i, inner[i][0], inner[i][1], height);
  }

  let hCursor = 0;
  for (const h of holes) {
    for (let i = 0; i < h.length; i++) {
      setVert(offBottomHoles + hCursor + i, h[i][0], h[i][1], 0);
      setVert(offCavityHoles + hCursor + i, h[i][0], h[i][1], floorZ);
    }
    hCursor += h.length;
  }

  const tris: number[] = [];

  // 1. Bottom cap at z = 0 (indices in bottomTri already match 0 .. nOuter + totalHoleVerts - 1)
  for (const [a, b, c] of bottomTri.triangles) {
    tris.push(a, c, b);
  }

  // 2. Cavity floor cap at z = floorZ (indices in cavityFloorTri are 0 .. nInner + totalHoleVerts - 1, offset by offCavityInner)
  for (const [a, b, c] of cavityFloorTri.triangles) {
    tris.push(offCavityInner + a, offCavityInner + b, offCavityInner + c);
  }

  // 3. Top rim at z = height connecting topOuter (CCW) and topInner (CCW)
  if (nOuter === nInner) {
    for (let i = 0; i < nOuter; i++) {
      const next = (i + 1) % nOuter;
      const o0 = offTopOuter + i;
      const o1 = offTopOuter + next;
      const i0 = offTopInner + i;
      const i1 = offTopInner + next;
      tris.push(o0, o1, i1);
      tris.push(o0, i1, i0);
    }
  } else {
    const rimTri = triangulatePolygonWithHoles(outer, [ ensureWinding(inner, false) ]);
    const mapRimIdx = (idx: number) =>
      idx < nOuter ? offTopOuter + idx : offTopInner + (nInner - 1 - (idx - nOuter));
    for (const [a, b, c] of rimTri.triangles) {
      tris.push(mapRimIdx(a), mapRimIdx(b), mapRimIdx(c));
    }
  }

  // 4. Outer vertical wall: bottomOuter -> topOuter
  for (let i = 0; i < nOuter; i++) {
    const next = (i + 1) % nOuter;
    const b0 = offBottomOuter + i;
    const b1 = offBottomOuter + next;
    const t0 = offTopOuter + i;
    const t1 = offTopOuter + next;
    tris.push(b0, b1, t1);
    tris.push(b0, t1, t0);
  }

  // 5. Inner cavity vertical wall: topInner -> cavityInner (normals point inward toward cavity center)
  for (let i = 0; i < nInner; i++) {
    const next = (i + 1) % nInner;
    const b0 = offCavityInner + i;
    const b1 = offCavityInner + next;
    const t0 = offTopInner + i;
    const t1 = offTopInner + next;
    tris.push(b0, t1, b1);
    tris.push(b0, t0, t1);
  }

  // 6. Floor through-hole walls (from z = 0 to z = floorZ; hole contours are already CW)
  let holeOffset = 0;
  for (const h of holes) {
    const count = h.length;
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      const b0 = offBottomHoles + holeOffset + i;
      const b1 = offBottomHoles + holeOffset + next;
      const t0 = offCavityHoles + holeOffset + i;
      const t1 = offCavityHoles + holeOffset + next;
      tris.push(b0, b1, t1);
      tris.push(b0, t1, t0);
    }
    holeOffset += count;
  }

  return buildMeshFromBuffers(positions, new Uint32Array(tris), true);
}

export function computeBoundingBox(positions: Float32Array): BoundingBox3D {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}

export function computeVertexNormals(
  positions: Float32Array,
  indices: Uint32Array
): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];

    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;

    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;

    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i];
    const ny = normals[i + 1];
    const nz = normals[i + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    } else {
      normals[i + 2] = 1;
    }
  }
  return normals;
}

function buildMeshFromBuffers(
  positions: Float32Array,
  indices: Uint32Array,
  centerAndGround = true
): TriangleMesh {
  if (centerAndGround) {
    const rawBbox = computeBoundingBox(positions);
    const cx = (rawBbox.min[0] + rawBbox.max[0]) * 0.5;
    const cy = (rawBbox.min[1] + rawBbox.max[1]) * 0.5;
    const minZ = rawBbox.min[2];
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= cx;
      positions[i + 1] -= cy;
      positions[i + 2] -= minZ;
    }
  }

  const bbox = computeBoundingBox(positions);
  const normals = computeVertexNormals(positions, indices);
  return {
    positions,
    indices,
    normals,
    bbox,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

/**
 * Generates a closed 2-manifold box (or hollow open-top box if wallThickness/openTop is set).
 */
export function generateBoxMesh(rawParams: Partial<BoxParams> & Record<string, any>): TriangleMesh {
  const width = Math.max(1, num(rawParams.width ?? rawParams.w ?? rawParams.x, 40));
  const depth = Math.max(1, num(rawParams.depth ?? rawParams.d ?? rawParams.y, 40));
  const height = Math.max(1, num(rawParams.height ?? rawParams.h ?? rawParams.z, 20));
  const cornerRadius = Math.max(0, num(rawParams.cornerRadius ?? rawParams.fillet, 0));
  const wallThickness = num(rawParams.wallThickness ?? rawParams.wall, 0);
  const openTop = Boolean(rawParams.openTop) || wallThickness > 0;

  if (openTop && wallThickness > 0 && wallThickness * 2 < Math.min(width, depth) - 1) {
    const outer = makeRoundedRectPolygon(width, depth, cornerRadius, 6, true);
    const inner = makeRoundedRectPolygon(
      width - 2 * wallThickness,
      depth - 2 * wallThickness,
      Math.max(0, cornerRadius - wallThickness),
      6,
      true
    );
    return buildHollowContainerMesh({
      outerContour: outer,
      innerContour: inner,
      height,
      floorThickness: wallThickness,
    });
  }

  if (cornerRadius > 0.1) {
    const outer = makeRoundedRectPolygon(width, depth, cornerRadius, 6, true);
    return extrudePolygonWithHoles(outer, height);
  }

  const hw = width * 0.5;
  const hd = depth * 0.5;
  const positions = new Float32Array([
    -hw, -hd, 0,
     hw, -hd, 0,
     hw,  hd, 0,
    -hw,  hd, 0,
    -hw, -hd, height,
     hw, -hd, height,
     hw,  hd, height,
    -hw,  hd, height,
  ]);

  const indices = new Uint32Array([
    // Bottom (-Z)
    0, 2, 1,
    0, 3, 2,
    // Top (+Z)
    4, 5, 6,
    4, 6, 7,
    // Front (-Y)
    0, 1, 5,
    0, 5, 4,
    // Right (+X)
    1, 2, 6,
    1, 6, 5,
    // Back (+Y)
    2, 3, 7,
    2, 7, 6,
    // Left (-X)
    3, 0, 4,
    3, 4, 7,
  ]);

  return buildMeshFromBuffers(positions, indices, true);
}

/**
 * Generates a closed 2-manifold cylinder or cone frustum resting on z = 0.
 */
export function generateCylinderMesh(
  rawParams: Partial<CylinderParams> & Record<string, any>
): TriangleMesh {
  const rBottom = Math.max(
    0.5,
    num(
      rawParams.radius ??
        rawParams.r ??
        (rawParams.diameter !== undefined ? Number(rawParams.diameter) * 0.5 : undefined),
      15
    )
  );
  const rTop = Math.max(0.5, num(rawParams.topRadius ?? rawParams.r2, rBottom));
  const height = Math.max(1, num(rawParams.height ?? rawParams.h, 30));
  const segments = Math.max(12, Math.floor(num(rawParams.segments, 48)));

  // Flip if rTop > rBottom so the larger flat circular face rests on the print bed (z = 0)
  const r0 = Math.max(rBottom, rTop);
  const r1 = Math.min(rBottom, rTop);

  // Vertices:
  // 0: bottom center (0, 0, 0)
  // 1: top center (0, 0, height)
  // 2 .. 2+segments-1: bottom ring
  // 2+segments .. 2+2*segments-1: top ring
  const totalVerts = 2 + 2 * segments;
  const positions = new Float32Array(totalVerts * 3);
  positions[0] = 0;
  positions[1] = 0;
  positions[2] = 0;
  positions[3] = 0;
  positions[4] = 0;
  positions[5] = height;

  for (let i = 0; i < segments; i++) {
    const theta = (2 * Math.PI * i) / segments;
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const bIdx = (2 + i) * 3;
    positions[bIdx] = r0 * c;
    positions[bIdx + 1] = r0 * s;
    positions[bIdx + 2] = 0;

    const tIdx = (2 + segments + i) * 3;
    positions[tIdx] = r1 * c;
    positions[tIdx + 1] = r1 * s;
    positions[tIdx + 2] = height;
  }

  const indices = new Uint32Array(segments * 4 * 3);
  let ptr = 0;
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = 2 + i;
    const b1 = 2 + next;
    const t0 = 2 + segments + i;
    const t1 = 2 + segments + next;

    // Bottom cap (-Z)
    indices[ptr++] = 0;
    indices[ptr++] = b1;
    indices[ptr++] = b0;

    // Top cap (+Z)
    indices[ptr++] = 1;
    indices[ptr++] = t0;
    indices[ptr++] = t1;

    // Side quad
    indices[ptr++] = b0;
    indices[ptr++] = b1;
    indices[ptr++] = t1;

    indices[ptr++] = b0;
    indices[ptr++] = t1;
    indices[ptr++] = t0;
  }

  return buildMeshFromBuffers(positions, indices, true);
}

/**
 * Generates a closed 2-manifold hollow tube (with optional base flange) resting on z = 0.
 */
export function generateTubeMesh(
  rawParams: Partial<TubeParams> & Record<string, any>
): TriangleMesh {
  const outerR = Math.max(
    1.5,
    num(
      rawParams.outerRadius ??
        rawParams.radius ??
        (rawParams.outerDiameter !== undefined ? Number(rawParams.outerDiameter) * 0.5 : undefined),
      20
    )
  );
  const wall = num(rawParams.wallThickness ?? rawParams.wall, 3);
  const rawInner = num(
    rawParams.innerRadius ??
      (rawParams.innerDiameter !== undefined ? Number(rawParams.innerDiameter) * 0.5 : undefined),
    outerR - wall
  );
  const innerR = clamp(rawInner, 0.5, outerR - 0.5);
  const height = Math.max(1, num(rawParams.height ?? rawParams.h, 35));
  const flangeR = num(rawParams.flangeRadius, 0);
  const flangeH = clamp(num(rawParams.flangeHeight, 0), 0, height * 0.5);
  const segments = Math.max(16, Math.floor(num(rawParams.segments, 48)));

  if (flangeR > outerR + 0.5 && flangeH >= 0.5) {
    const profile: Point2D[] = [
      [innerR, 0],
      [flangeR, 0],
      [flangeR, flangeH],
      [outerR, flangeH],
      [outerR, height],
      [innerR, height],
    ];
    return revolveClosedProfile(profile, segments);
  }

  const profile: Point2D[] = [
    [innerR, 0],
    [outerR, 0],
    [outerR, height],
    [innerR, height],
  ];
  return revolveClosedProfile(profile, segments);
}

/**
 * Generates an L-bracket extruded along Z so its flat side rests on the bed (support-free, max strength).
 */
export function generateBracketLMesh(
  rawParams: Partial<BracketLParams> & Record<string, any>
): TriangleMesh {
  const legA = Math.max(8, num(rawParams.legA ?? rawParams.width ?? rawParams.armA, 45));
  const legB = Math.max(8, num(rawParams.legB ?? rawParams.height ?? rawParams.armB, 40));
  const width = Math.max(3, num(rawParams.width ?? rawParams.extrude ?? rawParams.depth, 30));
  const thickness = clamp(
    num(rawParams.thickness ?? rawParams.wallThickness, 4),
    1.5,
    Math.min(legA, legB) * 0.45
  );
  const filletR = clamp(
    num(rawParams.filletRadius ?? rawParams.fillet, thickness * 1.2),
    0,
    Math.min(legA - thickness, legB - thickness) * 0.5
  );

  const contour: Point2D[] = [
    [0, 0],
    [legA, 0],
    [legA, thickness],
  ];

  if (filletR > 0.25) {
    const steps = 6;
    const cx = thickness + filletR;
    const cy = thickness + filletR;
    for (let i = 0; i <= steps; i++) {
      const theta = -Math.PI / 2 - (i / steps) * (Math.PI / 2);
      contour.push([cx + filletR * Math.cos(theta), cy + filletR * Math.sin(theta)]);
    }
  } else {
    contour.push([thickness, thickness]);
  }

  contour.push([thickness, legB], [0, legB]);
  return extrudePolygonWithHoles(contour, width);
}

/**
 * Generates a flat plate with circular through-holes resting flat on z = 0.
 */
export function generatePlateWithHolesMesh(
  rawParams: Partial<PlateWithHolesParams> & Record<string, any>
): TriangleMesh {
  const width = Math.max(10, num(rawParams.width ?? rawParams.w, 120));
  const depth = Math.max(10, num(rawParams.depth ?? rawParams.d ?? rawParams.length, 120));
  const thickness = Math.max(1, num(rawParams.thickness ?? rawParams.height ?? rawParams.h, 6));
  const cornerRadius = clamp(
    num(rawParams.cornerRadius ?? rawParams.fillet, 6),
    0,
    Math.min(width, depth) * 0.45
  );

  const outer = makeRoundedRectPolygon(width, depth, cornerRadius, 6, true);

  let holeSpecs: HoleSpec[] = [];
  if (Array.isArray(rawParams.holes) && rawParams.holes.length > 0) {
    holeSpecs = rawParams.holes.map((h: any) => ({
      x: num(h.x, 0),
      y: num(h.y, 0),
      radius: Math.max(1, num(h.radius ?? (h.diameter ? Number(h.diameter) * 0.5 : undefined), 3)),
    }));
  } else {
    const holeR = Math.max(1.2, num(rawParams.holeRadius, 2.5));
    const margin = Math.max(holeR + 3, num(rawParams.holeMargin, 10));
    const pattern = rawParams.holePattern ?? "corners";
    const ox = Math.max(0, width * 0.5 - margin);
    const oy = Math.max(0, depth * 0.5 - margin);
    if (pattern === "center") {
      holeSpecs = [{ x: 0, y: 0, radius: holeR }];
    } else if (pattern === "row") {
      holeSpecs = [
        { x: -ox * 0.6, y: 0, radius: holeR },
        { x: 0, y: 0, radius: holeR },
        { x: ox * 0.6, y: 0, radius: holeR },
      ];
    } else {
      holeSpecs = [
        { x: -ox, y: -oy, radius: holeR },
        { x: ox, y: -oy, radius: holeR },
        { x: ox, y: oy, radius: holeR },
        { x: -ox, y: oy, radius: holeR },
      ];
    }
  }

  // Filter and clamp holes so they remain strictly inside the plate and non-overlapping
  const safeHoles: HoleSpec[] = [];
  const hw = width * 0.5;
  const hd = depth * 0.5;
  for (const h of holeSpecs) {
    const maxR = Math.min(hw - Math.abs(h.x) - 1.5, hd - Math.abs(h.y) - 1.5);
    if (maxR < 0.8) continue;
    const r = Math.min(h.radius, maxR);
    const overlaps = safeHoles.some(
      (other) => Math.hypot(h.x - other.x, h.y - other.y) < r + other.radius + 1.2
    );
    if (!overlaps) {
      safeHoles.push({ x: h.x, y: h.y, radius: r });
    }
  }

  const holePolys = safeHoles.map((h) => makeCirclePolygon(h.x, h.y, h.radius, 20, false));
  return extrudePolygonWithHoles(outer, thickness, holePolys);
}

/**
 * Generates a J-hook / drip-stake hook profile lying flat on z = 0 for support-free strength.
 */
export function generateHookMesh(
  rawParams: Partial<HookParams> & Record<string, any>
): TriangleMesh {
  const shankLength = Math.max(15, num(rawParams.shankLength ?? rawParams.length ?? rawParams.height, 90));
  const throatRadius = Math.max(3, num(rawParams.throatRadius ?? rawParams.radius, 10));
  const width = Math.max(2, num(rawParams.width ?? rawParams.extrude, 8));
  const thickness = Math.max(2, num(rawParams.thickness ?? rawParams.wallThickness, 4));
  const tipLength = Math.max(4, num(rawParams.tipLength, throatRadius * 0.8));

  // Build centerline path in XY, then offset by +/- thickness/2 to form a closed simple polygon
  const centerline: Point2D[] = [];
  // Straight shank from (0, -shankLength) to (0, 0)
  centerline.push([0, -shankLength]);
  centerline.push([0, 0]);

  // 180-degree curve centered at (throatRadius + thickness*0.5, 0)
  const rCenter = throatRadius + thickness * 0.5;
  const arcSteps = 16;
  for (let i = 1; i <= arcSteps; i++) {
    const theta = Math.PI - (i / arcSteps) * Math.PI;
    centerline.push([rCenter + rCenter * Math.cos(theta), rCenter * Math.sin(theta)]);
  }

  // Straight return tip heading down
  centerline.push([2 * rCenter, -tipLength]);

  const halfT = thickness * 0.5;
  const leftSide: Point2D[] = [];
  const rightSide: Point2D[] = [];

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];
    const prev = centerline[Math.max(0, i - 1)];
    const next = centerline[Math.min(centerline.length - 1, i + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;

    // Taper bottom point slightly for stake insertion
    const scale = i === 0 ? 0.35 : 1.0;
    leftSide.push([p[0] + nx * halfT * scale, p[1] + ny * halfT * scale]);
    rightSide.push([p[0] - nx * halfT * scale, p[1] - ny * halfT * scale]);
  }

  const poly = [...leftSide, ...rightSide.reverse()];
  return extrudePolygonWithHoles(poly, width);
}

/**
 * Generates a snap-fit C-clip (with backing tab) lying flat on z = 0.
 */
export function generateClipMesh(
  rawParams: Partial<ClipParams> & Record<string, any>
): TriangleMesh {
  const innerR = Math.max(
    1.5,
    num(
      rawParams.innerRadius ??
        rawParams.radius ??
        (rawParams.innerDiameter !== undefined ? Number(rawParams.innerDiameter) * 0.5 : undefined),
      4
    )
  );
  const wall = Math.max(1.5, num(rawParams.wallThickness ?? rawParams.thickness, 2.5));
  const height = Math.max(3, num(rawParams.height ?? rawParams.width ?? rawParams.extrude, 12));
  const openAngleRad = (clamp(num(rawParams.openAngleDeg, 76), 30, 140) * Math.PI) / 180;

  const outerR = innerR + wall;
  const startAngle = openAngleRad * 0.5;
  const endAngle = 2 * Math.PI - openAngleRad * 0.5;
  const arcSteps = 28;

  const contour: Point2D[] = [];
  // Inner arc from startAngle to endAngle
  for (let i = 0; i <= arcSteps; i++) {
    const a = startAngle + (i / arcSteps) * (endAngle - startAngle);
    contour.push([innerR * Math.cos(a), innerR * Math.sin(a)]);
  }

  // Outer arc from endAngle back to startAngle with a flat mounting spine at angle = PI
  for (let i = arcSteps; i >= 0; i--) {
    const a = startAngle + (i / arcSteps) * (endAngle - startAngle);
    const flare = i === 0 || i === arcSteps ? wall * 0.25 : 0;
    const r = outerR + flare;
    contour.push([r * Math.cos(a), r * Math.sin(a)]);
  }

  return extrudePolygonWithHoles(contour, height);
}

/**
 * Generates a conical funnel with wide mouth resting flat on z = 0 (prints without supports).
 */
export function generateFunnelMesh(
  rawParams: Partial<FunnelParams> & Record<string, any>
): TriangleMesh {
  const topR = Math.max(8, num(rawParams.topRadius ?? rawParams.mouthRadius ?? rawParams.radius, 24));
  const spoutR = clamp(num(rawParams.spoutRadius ?? rawParams.stemRadius, 6), 2, topR - 2);
  const coneH = Math.max(6, num(rawParams.coneHeight ?? rawParams.height, 26));
  const spoutH = Math.max(4, num(rawParams.spoutHeight ?? rawParams.stemHeight, 14));
  const wall = clamp(num(rawParams.wallThickness ?? rawParams.wall, 2.2), 1.0, spoutR - 0.8);
  const flangeW = Math.max(0, num(rawParams.flangeWidth, 3));
  const segments = Math.max(16, Math.floor(num(rawParams.segments, 48)));

  const totalH = coneH + spoutH;
  const profile: Point2D[] =
    flangeW > 0.5
      ? [
          [topR - wall, 0],
          [topR + flangeW, 0],
          [topR + flangeW, wall],
          [topR, wall],
          [spoutR, coneH],
          [spoutR, totalH],
          [spoutR - wall, totalH],
          [spoutR - wall, coneH],
        ]
      : [
          [topR - wall, 0],
          [topR, 0],
          [spoutR, coneH],
          [spoutR, totalH],
          [spoutR - wall, totalH],
          [spoutR - wall, coneH],
        ];

  return revolveClosedProfile(profile, segments);
}

/**
 * Generates a closed 2-manifold spur gear with central shaft bore resting flat on z = 0.
 */
export function generateGearSimpleMesh(
  rawParams: Partial<GearSimpleParams> & Record<string, any>
): TriangleMesh {
  const teeth = Math.max(6, Math.min(64, Math.floor(num(rawParams.teeth, 16))));
  const mod = Math.max(0.8, num(rawParams.module, 2.0));
  const pitchR = num(rawParams.pitchRadius, (teeth * mod) * 0.5);
  const outerR = Math.max(4, num(rawParams.outerRadius, pitchR + mod));
  const rootR = clamp(num(rawParams.rootRadius, pitchR - 1.15 * mod), 2, outerR - 0.8);
  const rawBore = num(
    rawParams.boreRadius ??
      (rawParams.boreDiameter !== undefined ? Number(rawParams.boreDiameter) * 0.5 : undefined),
    Math.min(3.0, rootR * 0.45)
  );
  const boreR = clamp(rawBore, 0.8, rootR - 1.2);
  const thickness = Math.max(1.5, num(rawParams.thickness ?? rawParams.height, 8));

  // 4 angular vertices per tooth: root0 -> tip0 -> tip1 -> root1
  const stepsPerTooth = 4;
  const nRing = teeth * stepsPerTooth;
  const outerRing: Point2D[] = [];
  const innerRing: Point2D[] = [];

  for (let t = 0; t < teeth; t++) {
    const baseAngle = (2 * Math.PI * t) / teeth;
    const pitchAngle = (2 * Math.PI) / teeth;
    const fractions = [0.0, 0.22, 0.46, 0.68];
    const radii = [rootR, outerR, outerR, rootR];

    for (let k = 0; k < stepsPerTooth; k++) {
      const a = baseAngle + fractions[k] * pitchAngle;
      const r = radii[k];
      outerRing.push([r * Math.cos(a), r * Math.sin(a)]);
      innerRing.push([boreR * Math.cos(a), boreR * Math.sin(a)]);
    }
  }

  // Vertex layout:
  // 0 .. nRing-1: bottom outer
  // nRing .. 2*nRing-1: bottom inner
  // 2*nRing .. 3*nRing-1: top outer
  // 3*nRing .. 4*nRing-1: top inner
  const positions = new Float32Array(nRing * 4 * 3);
  const setV = (idx: number, x: number, y: number, z: number) => {
    positions[idx * 3] = x;
    positions[idx * 3 + 1] = y;
    positions[idx * 3 + 2] = z;
  };

  for (let i = 0; i < nRing; i++) {
    setV(i, outerRing[i][0], outerRing[i][1], 0);
    setV(nRing + i, innerRing[i][0], innerRing[i][1], 0);
    setV(2 * nRing + i, outerRing[i][0], outerRing[i][1], thickness);
    setV(3 * nRing + i, innerRing[i][0], innerRing[i][1], thickness);
  }

  const indices = new Uint32Array(nRing * 8 * 3);
  let ptr = 0;
  for (let i = 0; i < nRing; i++) {
    const next = (i + 1) % nRing;
    const bo0 = i;
    const bo1 = next;
    const bi0 = nRing + i;
    const bi1 = nRing + next;
    const to0 = 2 * nRing + i;
    const to1 = 2 * nRing + next;
    const ti0 = 3 * nRing + i;
    const ti1 = 3 * nRing + next;

    // Bottom cap (-Z)
    indices[ptr++] = bo0;
    indices[ptr++] = bi1;
    indices[ptr++] = bo1;
    indices[ptr++] = bo0;
    indices[ptr++] = bi0;
    indices[ptr++] = bi1;

    // Top cap (+Z)
    indices[ptr++] = to0;
    indices[ptr++] = to1;
    indices[ptr++] = ti1;
    indices[ptr++] = to0;
    indices[ptr++] = ti1;
    indices[ptr++] = ti0;

    // Outer gear wall
    indices[ptr++] = bo0;
    indices[ptr++] = bo1;
    indices[ptr++] = to1;
    indices[ptr++] = bo0;
    indices[ptr++] = to1;
    indices[ptr++] = to0;

    // Inner bore wall
    indices[ptr++] = bi0;
    indices[ptr++] = ti1;
    indices[ptr++] = bi1;
    indices[ptr++] = bi0;
    indices[ptr++] = ti0;
    indices[ptr++] = ti1;
  }

  return buildMeshFromBuffers(positions, indices, true);
}

/**
 * Generates a custom CSG / compound mechanical part (enclosures, reservoirs, manifold blocks)
 * guaranteed to be a single closed 2-manifold mesh.
 */
export function generateCustomCsgMesh(
  rawParams: Partial<CustomCsgParams> & Record<string, any>
): TriangleMesh {
  const width = Math.max(12, num(rawParams.width ?? rawParams.w, 80));
  const depth = Math.max(12, num(rawParams.depth ?? rawParams.d, 60));
  const height = Math.max(4, num(rawParams.height ?? rawParams.h, 30));
  const wall = clamp(num(rawParams.wallThickness ?? rawParams.wall, 3), 1.5, Math.min(width, depth) * 0.35);
  const floorThickness = clamp(num(rawParams.floorThickness ?? wall, wall), 1.2, height * 0.6);
  const cornerRadius = clamp(num(rawParams.cornerRadius, 6), 0, Math.min(width, depth) * 0.45);
  const preset = rawParams.preset;

  // Collect any subtract cylinder holes from rawParams.holes or rawParams.operations
  const holeSpecs: HoleSpec[] = [];
  if (Array.isArray(rawParams.holes)) {
    for (const h of rawParams.holes) {
      holeSpecs.push({
        x: num(h.x, 0),
        y: num(h.y, 0),
        radius: Math.max(1, num(h.radius, 3)),
      });
    }
  }
  if (Array.isArray(rawParams.operations)) {
    for (const op of rawParams.operations) {
      if (op.op === "subtract" && op.shape === "cylinder") {
        holeSpecs.push({
          x: num(op.x, 0),
          y: num(op.y, 0),
          radius: Math.max(1, num(op.radius ?? (op.diameter ? op.diameter * 0.5 : 3), 3)),
        });
      }
    }
  }

  // Cylindrical reservoir / flanged hub preset
  if (preset === "flanged_hub" || (rawParams.radius !== undefined && rawParams.width === undefined)) {
    const r = Math.max(10, num(rawParams.radius, 45));
    const outer = makeCirclePolygon(0, 0, r, 36, true);
    const inner = makeCirclePolygon(0, 0, Math.max(3, r - wall), 36, true);
    return buildHollowContainerMesh({
      outerContour: outer,
      innerContour: inner,
      height,
      floorThickness,
    });
  }

  // Hollow container / enclosure / reservoir (default for custom_csg when wallThickness > 0)
  const innerW = width - 2 * wall;
  const innerD = depth - 2 * wall;
  const safeHoles: Point2D[][] = [];
  for (const h of holeSpecs) {
    const maxR = Math.min(innerW * 0.5 - Math.abs(h.x) - 1.5, innerD * 0.5 - Math.abs(h.y) - 1.5);
    if (maxR >= 1.0) {
      safeHoles.push(makeCirclePolygon(h.x, h.y, Math.min(h.radius, maxR), 16, false));
    }
  }

  const outerContour = makeRoundedRectPolygon(width, depth, cornerRadius, 6, true);
  const innerContour = makeRoundedRectPolygon(
    innerW,
    innerD,
    Math.max(0.5, cornerRadius - wall),
    6,
    true
  );

  return buildHollowContainerMesh({
    outerContour,
    innerContour,
    height,
    floorThickness,
    floorHoles: safeHoles,
  });
}

/**
 * Generates an indexed triangle mesh for any PrintedPart or PurchasedPartProxy.
 * Output is in millimeters, Z-up, centered in X/Y with its flattest base resting at z = 0.
 */
export function generatePartMesh(
  part: Pick<PrintedPart, "shape" | "params"> | ProxyShapeSpec
): TriangleMesh {
  const shape: PrintedPartShape = part.shape;
  const params = part.params ?? {};

  switch (shape) {
    case "box":
      return generateBoxMesh(params);
    case "cylinder":
      return generateCylinderMesh(params);
    case "tube":
      return generateTubeMesh(params);
    case "bracketL":
      return generateBracketLMesh(params);
    case "plate_with_holes":
      return generatePlateWithHolesMesh(params);
    case "hook":
      return generateHookMesh(params);
    case "clip":
      return generateClipMesh(params);
    case "funnel":
      return generateFunnelMesh(params);
    case "gear_simple":
      return generateGearSimpleMesh(params);
    case "custom_csg":
      return generateCustomCsgMesh(params);
    default:
      return generateBoxMesh(params);
  }
}

/**
 * Applies a Z-axis rotation (in degrees) and [tx, ty, tz] translation (in mm) to a mesh,
 * returning a new TriangleMesh.
 */
export function transformMesh(
  mesh: TriangleMesh,
  transform: { rotateZDeg?: number; translate?: [number, number, number] }
): TriangleMesh {
  const rad = ((transform.rotateZDeg ?? 0) * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const [tx, ty, tz] = transform.translate ?? [0, 0, 0];

  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];

    positions[i] = x * cosA - y * sinA + tx;
    positions[i + 1] = x * sinA + y * cosA + ty;
    positions[i + 2] = z + tz;
  }

  const indices = new Uint32Array(mesh.indices);
  return buildMeshFromBuffers(positions, indices, false);
}

/**
 * Validates that a TriangleMesh is a closed 2-manifold (every undirected edge shared by
 * exactly 2 triangles with opposite half-edge orientations, zero degenerate triangles).
 */
export function validateManifold(mesh: TriangleMesh): ManifoldReport {
  const { positions, indices } = mesh;
  const vertexCount = positions.length / 3;
  const triangleCount = indices.length / 3;

  // Map welded spatial coordinates (quantized to 1e-4 mm) to canonical vertex IDs
  const coordToCanon = new Map<string, number>();
  const vertToCanon = new Int32Array(vertexCount);
  let nextCanon = 0;

  for (let v = 0; v < vertexCount; v++) {
    const qx = Math.round(positions[v * 3] * 10000);
    const qy = Math.round(positions[v * 3 + 1] * 10000);
    const qz = Math.round(positions[v * 3 + 2] * 10000);
    const key = `${qx},${qy},${qz}`;
    let c = coordToCanon.get(key);
    if (c === undefined) {
      c = nextCanon++;
      coordToCanon.set(key, c);
    }
    vertToCanon[v] = c;
  }

  const undirectedEdgeCounts = new Map<string, number>();
  const directedHalfEdgeCounts = new Map<string, number>();
  let degenerateTriangles = 0;
  let signedVolume6 = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const rawA = indices[t];
    const rawB = indices[t + 1];
    const rawC = indices[t + 2];

    const a = vertToCanon[rawA];
    const b = vertToCanon[rawB];
    const c = vertToCanon[rawC];

    if (a === b || b === c || c === a) {
      degenerateTriangles++;
      continue;
    }

    const ax = positions[rawA * 3];
    const ay = positions[rawA * 3 + 1];
    const az = positions[rawA * 3 + 2];
    const bx = positions[rawB * 3];
    const by = positions[rawB * 3 + 1];
    const bz = positions[rawB * 3 + 2];
    const cx = positions[rawC * 3];
    const cy = positions[rawC * 3 + 1];
    const cz = positions[rawC * 3 + 2];

    signedVolume6 +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);

    const pairs: Array<[number, number]> = [
      [a, b],
      [b, c],
      [c, a],
    ];

    for (const [u, v] of pairs) {
      const uKey = u < v ? `${u}_${v}` : `${v}_${u}`;
      undirectedEdgeCounts.set(uKey, (undirectedEdgeCounts.get(uKey) ?? 0) + 1);

      const dKey = `${u}->${v}`;
      directedHalfEdgeCounts.set(dKey, (directedHalfEdgeCounts.get(dKey) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;

  for (const count of undirectedEdgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count !== 2) nonManifoldEdges++;
  }

  // Also check if any directed half-edge was used more than once (winding mismatch)
  for (const dCount of directedHalfEdgeCounts.values()) {
    if (dCount > 1) {
      nonManifoldEdges++;
    }
  }

  const volumeMm3 = Math.abs(signedVolume6) / 6;
  const isManifold =
    triangleCount >= 4 &&
    degenerateTriangles === 0 &&
    boundaryEdges === 0 &&
    nonManifoldEdges === 0 &&
    volumeMm3 > 0;

  return {
    isManifold,
    vertexCount,
    triangleCount,
    edgeCount: undirectedEdgeCounts.size,
    boundaryEdges,
    nonManifoldEdges,
    degenerateTriangles,
    volumeMm3,
  };
}
