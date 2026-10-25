"use client";

import React, { useMemo } from "react";
import * as THREE from "three";
import { PartShape } from "./types";

function pickNum(
  params: Record<string, number> | undefined,
  keys: string[],
  fallback: number
): number {
  if (!params) return fallback;
  for (const k of keys) {
    const val = params[k];
    if (typeof val === "number" && Number.isFinite(val) && val > 0) {
      return val;
    }
  }
  return fallback;
}

function createRoundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  const cr = Math.min(r, hw * 0.45, hd * 0.45);

  shape.moveTo(-hw + cr, -hd);
  shape.lineTo(hw - cr, -hd);
  if (cr > 0) shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  shape.lineTo(hw, hd - cr);
  if (cr > 0) shape.quadraticCurveTo(hw, hd, hw - cr, hd);
  shape.lineTo(-hw + cr, hd);
  if (cr > 0) shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  shape.lineTo(-hw, -hd + cr);
  if (cr > 0) shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);

  return shape;
}

function buildBoxGeometry(params: Record<string, number>): THREE.BufferGeometry {
  const w = pickNum(params, ["w", "width", "x", "size"], 40);
  const h = pickNum(params, ["h", "height", "y", "thickness"], 28);
  const d = pickNum(params, ["d", "depth", "z", "length", "l"], 40);
  const radius = pickNum(
    params,
    ["radius", "r", "fillet", "cornerRadius"],
    Math.min(w, d) * 0.08
  );

  const shape = createRoundedRectShape(w, d, radius);

  // Optional hollow box if wall/thickness is specified as hollow
  const wall = params?.wall ?? params?.wallThickness ?? 0;
  if (wall > 0 && wall < Math.min(w, d) * 0.4) {
    const innerW = w - wall * 2;
    const innerD = d - wall * 2;
    const innerR = Math.max(0.5, radius - wall * 0.5);
    const hw = innerW / 2;
    const hd = innerD / 2;
    const cr = Math.min(innerR, hw * 0.45, hd * 0.45);
    const hole = new THREE.Path();
    hole.moveTo(-hw + cr, -hd);
    hole.lineTo(hw - cr, -hd);
    hole.quadraticCurveTo(hw, -hd, hw, -hd + cr);
    hole.lineTo(hw, hd - cr);
    hole.quadraticCurveTo(hw, hd, hw - cr, hd);
    hole.lineTo(-hw + cr, hd);
    hole.quadraticCurveTo(-hw, hd, -hw, hd - cr);
    hole.lineTo(-hw, -hd + cr);
    hole.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: Math.min(1.0, h * 0.04),
    bevelSize: Math.min(0.8, Math.min(w, d) * 0.025),
    bevelSegments: 2,
    curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildCylinderGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const diam = params?.diameter ?? params?.d ?? 0;
  const baseR =
    diam > 0
      ? diam / 2
      : pickNum(params, ["r", "radius", "outerRadius", "w"], 16);
  const rTop = pickNum(params, ["rTop", "radiusTop"], baseR);
  const rBottom = pickNum(params, ["rBottom", "radiusBottom"], baseR);
  const h = pickNum(params, ["h", "height", "length", "l", "z"], 36);

  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 36, 1);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildTubeGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const od = params?.od ?? params?.outerDiameter ?? 0;
  const id = params?.id ?? params?.innerDiameter ?? 0;
  const outerR =
    od > 0
      ? od / 2
      : pickNum(params, ["outerRadius", "rOuter", "r", "radius"], 22);
  const wall = pickNum(params, ["wall", "thickness", "t"], outerR * 0.16);
  const rawInnerR =
    id > 0
      ? id / 2
      : pickNum(params, ["innerRadius", "rInner"], outerR - wall);
  const innerR = Math.max(1, Math.min(outerR - 1.2, rawInnerR));
  const h = pickNum(params, ["h", "height", "length", "l"], 55);
  const closedBottom = params?.closedBottom ?? 0;

  if (closedBottom > 0) {
    // Use LatheGeometry to form a cup/pot with a closed floor and open top
    const floorT = Math.max(2, wall * 1.2);
    const pts = [
      new THREE.Vector2(0.01, -h / 2),
      new THREE.Vector2(outerR, -h / 2),
      new THREE.Vector2(outerR, h / 2),
      new THREE.Vector2(innerR, h / 2),
      new THREE.Vector2(innerR, -h / 2 + floorT),
      new THREE.Vector2(0.01, -h / 2 + floorT),
    ];
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }

  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: false,
    curveSegments: 36,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildBracketLGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const leg1 = pickNum(params, ["leg1", "armA", "h", "height"], 38);
  const leg2 = pickNum(params, ["leg2", "armB", "d", "depth", "l"], 32);
  const width = pickNum(params, ["w", "width"], 22);
  const t = Math.min(
    Math.min(leg1, leg2) * 0.35,
    pickNum(params, ["thickness", "t", "wall"], 5)
  );
  const fillet = Math.min(t * 0.8, 3);

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(leg2, 0);
  shape.lineTo(leg2, t);
  shape.lineTo(t + fillet, t);
  shape.quadraticCurveTo(t, t, t, t + fillet);
  shape.lineTo(t, leg1);
  shape.lineTo(0, leg1);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.5,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildPlateWithHolesGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const w = pickNum(params, ["w", "width", "x"], 64);
  const d = pickNum(params, ["d", "depth", "l", "length", "y"], 44);
  const t = pickNum(params, ["t", "thickness", "h", "height"], 5);
  const actualT = t > 20 ? 5 : t;
  const holeR = pickNum(params, ["holeRadius", "holeR", "rHole"], 2.8);
  const holeCount = Math.round(
    pickNum(params, ["holes", "holeCount", "numHoles"], 4)
  );
  const centerHoleR = params?.centerHoleRadius ?? params?.bore ?? 0;

  const cornerR = Math.min(w, d) * 0.14;
  const shape = createRoundedRectShape(w, d, cornerR);

  const insetX = Math.max(holeR * 2.4, w * 0.16);
  const insetY = Math.max(holeR * 2.4, d * 0.18);
  const hx = w / 2 - insetX;
  const hy = d / 2 - insetY;

  const holeCoords: Array<[number, number, number]> = [];
  if (holeCount === 1) {
    holeCoords.push([0, 0, holeR]);
  } else if (holeCount === 2) {
    holeCoords.push([-hx, 0, holeR], [hx, 0, holeR]);
  } else if (holeCount >= 4) {
    holeCoords.push(
      [-hx, -hy, holeR],
      [hx, -hy, holeR],
      [hx, hy, holeR],
      [-hx, hy, holeR]
    );
    if (holeCount >= 6) {
      holeCoords.push([0, -hy, holeR], [0, hy, holeR]);
    }
  }

  if (centerHoleR > 0 && centerHoleR < Math.min(w, d) * 0.38) {
    holeCoords.push([0, 0, centerHoleR]);
  }

  for (const [cx, cy, r] of holeCoords) {
    const holePath = new THREE.Path();
    holePath.absarc(cx, cy, r, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: actualT,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.4,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildHookGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const h = pickNum(params, ["h", "height", "length"], 44);
  const w = pickNum(params, ["w", "width"], 14);
  const r = pickNum(params, ["r", "radius", "gap", "throat"], 11);
  const t = pickNum(params, ["t", "thickness", "wall"], 4.5);

  const outerR = r + t;
  const shankH = Math.max(12, h - outerR);

  const shape = new THREE.Shape();
  // Start at top of vertical shank
  shape.moveTo(-outerR, shankH);
  shape.lineTo(-r, shankH);
  shape.lineTo(-r, 0);
  // Inner curve of hook
  shape.absarc(0, 0, r, Math.PI, 0, false);
  // Tip of hook going slightly up
  const tipH = r * 0.45;
  shape.lineTo(r, tipH);
  shape.absarc(r + t / 2, tipH, t / 2, Math.PI, 0, true);
  shape.lineTo(outerR, 0);
  // Outer curve of hook
  shape.absarc(0, 0, outerR, 0, Math.PI, true);
  shape.lineTo(-outerR, shankH);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: w,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.5,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildClipGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const innerR = pickNum(params, ["r", "radius", "innerRadius"], 11);
  const t = pickNum(params, ["t", "thickness", "wall"], 3.5);
  const h = pickNum(params, ["h", "height", "w", "width"], 16);
  const openDeg = pickNum(params, ["openAngle", "gapAngle"], 72);

  const outerR = innerR + t;
  const halfOpenRad = THREE.MathUtils.degToRad(openDeg / 2);
  const startAngle = halfOpenRad;
  const endAngle = Math.PI * 2 - halfOpenRad;

  const shape = new THREE.Shape();
  // Start at inner startAngle
  shape.moveTo(
    Math.cos(startAngle) * innerR,
    Math.sin(startAngle) * innerR
  );
  shape.absarc(0, 0, innerR, startAngle, endAngle, false);
  // Rounded jaw tip 1
  const midEnd = innerR + t / 2;
  shape.absarc(
    Math.cos(endAngle) * midEnd,
    Math.sin(endAngle) * midEnd,
    t / 2,
    endAngle + Math.PI,
    endAngle,
    true
  );
  // Outer arc back to startAngle
  shape.absarc(0, 0, outerR, endAngle, startAngle, true);
  // Rounded jaw tip 2
  shape.absarc(
    Math.cos(startAngle) * midEnd,
    Math.sin(startAngle) * midEnd,
    t / 2,
    startAngle,
    startAngle + Math.PI,
    true
  );
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.4,
    bevelSegments: 2,
    curveSegments: 28,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildFunnelGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const topR = pickNum(params, ["topRadius", "rTop", "r", "radius"], 24);
  const bottomR = Math.min(
    topR * 0.55,
    pickNum(params, ["bottomRadius", "rBottom", "spoutRadius"], 6.5)
  );
  const h = pickNum(params, ["h", "height", "length"], 42);
  const spoutH = Math.min(
    h * 0.55,
    pickNum(params, ["spoutHeight", "neckHeight"], h * 0.36)
  );
  const wall = Math.min(
    bottomR * 0.45,
    pickNum(params, ["wall", "thickness", "t"], 2.2)
  );

  const halfH = h / 2;
  const neckY = -halfH + spoutH;
  const innerBottomR = Math.max(1.5, bottomR - wall);
  const innerTopR = Math.max(innerBottomR + 2, topR - wall);

  const points: THREE.Vector2[] = [
    new THREE.Vector2(innerBottomR, -halfH),
    new THREE.Vector2(bottomR, -halfH),
    new THREE.Vector2(bottomR, neckY),
    new THREE.Vector2(topR, halfH - 2),
    new THREE.Vector2(topR + 1.5, halfH),
    new THREE.Vector2(innerTopR, halfH),
    new THREE.Vector2(innerBottomR, neckY),
    new THREE.Vector2(innerBottomR, -halfH),
  ];

  const geo = new THREE.LatheGeometry(points, 36);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildGearSimpleGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  const outerR = pickNum(params, ["r", "radius", "outerRadius"], 18);
  const teeth = Math.max(
    6,
    Math.min(36, Math.round(pickNum(params, ["teeth", "numTeeth", "n"], 12)))
  );
  const h = pickNum(params, ["h", "height", "thickness", "t"], 8);
  const toothDepth = pickNum(params, ["toothDepth"], outerR * 0.18);
  const rootR = Math.max(4, outerR - toothDepth);
  const boreR = Math.min(
    rootR * 0.6,
    pickNum(params, ["bore", "holeRadius", "innerRadius"], outerR * 0.25)
  );

  const shape = new THREE.Shape();
  const stepAngle = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * stepAngle;
    const a1 = a0 + stepAngle * 0.18;
    const a2 = a0 + stepAngle * 0.32;
    const a3 = a0 + stepAngle * 0.62;
    const a4 = a0 + stepAngle * 0.76;

    const p0x = Math.cos(a0) * rootR;
    const p0y = Math.sin(a0) * rootR;
    if (i === 0) {
      shape.moveTo(p0x, p0y);
    } else {
      shape.lineTo(p0x, p0y);
    }
    shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
    shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
  }
  shape.closePath();

  if (boreR > 0.5) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.4,
    bevelSegments: 1,
    curveSegments: 12,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildCustomCsgGeometry(
  params: Record<string, number>
): THREE.BufferGeometry {
  // Parametric multi-chamber reservoir / flanged CAD housing body
  const r = pickNum(params, ["r", "radius", "outerRadius"], 48);
  const w = pickNum(params, ["w", "width"], r * 2);
  const d = pickNum(params, ["d", "depth"], r * 2);
  const h = pickNum(params, ["h", "height"], 68);
  const wall = pickNum(params, ["wall", "thickness"], 4);

  // Build an engineered cylindrical or stadium-shaped reservoir housing with mounting ears & inner basin
  const outerR = Math.max(18, Math.min(w, d) / 2);
  const innerR = Math.max(8, outerR - wall);
  const earR = Math.max(6, outerR * 0.22);

  const shape = new THREE.Shape();
  // Outer profile with two side mounting bosses
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);

  // Main central cavity
  const mainHole = new THREE.Path();
  mainHole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(mainHole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 1.2,
    bevelSize: 1.0,
    bevelSegments: 2,
    curveSegments: 40,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();
const EDGES_CACHE = new Map<string, THREE.EdgesGeometry>();

export function getGeometryCacheKey(
  shape: PartShape | string,
  params: Record<string, number>
): string {
  const sortedEntries = Object.entries(params || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `${shape}:${JSON.stringify(sortedEntries)}`;
}

/**
 * Standalone Three.js geometry builder for all 10 supported shapes.
 */
export function buildPartGeometry(
  shape: PartShape | string,
  params: Record<string, number> = {}
): THREE.BufferGeometry {
  const key = getGeometryCacheKey(shape, params);
  const cached = GEOMETRY_CACHE.get(key);
  if (cached) return cached;

  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case "box":
      geometry = buildBoxGeometry(params);
      break;
    case "cylinder":
      geometry = buildCylinderGeometry(params);
      break;
    case "tube":
      geometry = buildTubeGeometry(params);
      break;
    case "bracketL":
      geometry = buildBracketLGeometry(params);
      break;
    case "plate_with_holes":
      geometry = buildPlateWithHolesGeometry(params);
      break;
    case "hook":
      geometry = buildHookGeometry(params);
      break;
    case "clip":
      geometry = buildClipGeometry(params);
      break;
    case "funnel":
      geometry = buildFunnelGeometry(params);
      break;
    case "gear_simple":
      geometry = buildGearSimpleGeometry(params);
      break;
    case "custom_csg":
      geometry = buildCustomCsgGeometry(params);
      break;
    default:
      geometry = buildBoxGeometry(params);
      break;
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  GEOMETRY_CACHE.set(key, geometry);
  return geometry;
}

/**
 * Returns a cached EdgesGeometry for crisp CAD / IKEA line-art rendering.
 */
export function buildPartEdgesGeometry(
  shape: PartShape | string,
  params: Record<string, number> = {},
  thresholdAngle = 22
): THREE.EdgesGeometry {
  const key = `${getGeometryCacheKey(shape, params)}:edge:${thresholdAngle}`;
  const cached = EDGES_CACHE.get(key);
  if (cached) return cached;

  const baseGeo = buildPartGeometry(shape, params);
  const edges = new THREE.EdgesGeometry(baseGeo, thresholdAngle);
  EDGES_CACHE.set(key, edges);
  return edges;
}

/**
 * Returns the approximate bounding radius (in mm) for camera framing and labels.
 */
export function getPartBoundingRadius(
  shape: PartShape | string,
  params: Record<string, number> = {}
): number {
  const geo = buildPartGeometry(shape, params);
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  return geo.boundingSphere?.radius ?? 25;
}

/**
 * Returns human-readable dimensions string in mm for a part's shape & parameters.
 */
export function formatPartDimensions(
  shape: PartShape | string,
  params: Record<string, number> = {}
): string {
  const geo = buildPartGeometry(shape, params);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return "—";
  const sx = Math.round(box.max.x - box.min.x);
  const sy = Math.round(box.max.y - box.min.y);
  const sz = Math.round(box.max.z - box.min.z);
  return `${sx} × ${sy} × ${sz} mm`;
}

export interface PartGeometryProps {
  shape: PartShape | string;
  params: Record<string, number>;
}

export const PartGeometry: React.FC<PartGeometryProps> = ({
  shape,
  params,
}) => {
  const geometry = useMemo(
    () => buildPartGeometry(shape, params),
    [shape, params]
  );
  return <primitive object={geometry} attach="geometry" />;
};
