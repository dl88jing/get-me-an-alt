"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PartParams, PartShape, ResolvedAssemblyPart } from "./types";

function pickNum(
  params: PartParams | undefined,
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

function buildBoxGeometry(params: PartParams): THREE.BufferGeometry {
  const w = pickNum(params, ["w", "width", "x", "size"], 40);
  const h = pickNum(params, ["h", "height", "y", "thickness"], 28);
  const d = pickNum(params, ["d", "depth", "z", "length", "l"], 40);
  const radius = pickNum(
    params,
    ["radius", "r", "fillet", "cornerRadius"],
    Math.min(w, d) * 0.08
  );

  const shape = createRoundedRectShape(w, d, radius);

  // Optional hollow box ONLY when explicitly marked hollow (never from DFM wallThickness alone)
  const wall = params?.hollow
    ? Number(params?.wall ?? params?.wallThickness ?? 0)
    : 0;
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

function buildCylinderGeometry(params: PartParams): THREE.BufferGeometry {
  const diam = Number(params?.diameter ?? params?.d ?? 0);
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

function buildConeGeometry(params: PartParams): THREE.BufferGeometry {
  const rTop = pickNum(params, ["radiusTop", "rTop", "topRadius"], 2);
  const rBottom = pickNum(
    params,
    ["radiusBottom", "rBottom", "bottomRadius", "radius", "r"],
    15
  );
  const h = pickNum(params, ["height", "h", "length"], 65);
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 32, 1);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildSphereGeometry(params: PartParams): THREE.BufferGeometry {
  const r = pickNum(params, ["radius", "r", "outerRadius", "w"], 18);
  const geo = new THREE.SphereGeometry(r, 32, 24);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function buildTubeGeometry(params: PartParams): THREE.BufferGeometry {
  const od = Number(params?.od ?? params?.outerDiameter ?? 0);
  const id = Number(params?.id ?? params?.innerDiameter ?? 0);
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
  const closedBottom = Number(
    params?.closedBottom ?? params?.floorThickness ?? 0
  );

  if (closedBottom > 0) {
    const floorT = Math.max(2, closedBottom > 1 ? closedBottom : wall * 1.2);
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

function buildBracketLGeometry(params: PartParams): THREE.BufferGeometry {
  const leg1 = pickNum(params, ["leg1", "legA", "armA", "h", "height"], 38);
  const leg2 = pickNum(
    params,
    ["leg2", "legB", "armB", "d", "depth", "l"],
    32
  );
  const width = pickNum(params, ["w", "width"], 22);
  const t = Math.min(
    Math.min(leg1, leg2) * 0.35,
    pickNum(params, ["thickness", "t", "wall"], 5)
  );
  const fillet = Math.min(t * 0.8, pickNum(params, ["filletRadius"], 3));

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
  params: PartParams
): THREE.BufferGeometry {
  const w = pickNum(params, ["w", "width", "x"], 64);
  const d = pickNum(params, ["d", "depth", "l", "length", "y"], 44);
  const t = pickNum(params, ["t", "thickness", "h", "height"], 5);
  const actualT = t > 20 ? 5 : t;
  const holeR = pickNum(params, ["holeRadius", "holeR", "rHole"], 2.8);
  const centerHoleR = Number(params?.centerHoleRadius ?? params?.bore ?? 0);

  const cornerR = pickNum(
    params,
    ["cornerRadius", "radius", "r"],
    Math.min(w, d) * 0.14
  );
  const shape = createRoundedRectShape(w, d, cornerR);

  const holeCoords: Array<[number, number, number]> = [];

  if (Array.isArray(params?.holes)) {
    for (const hObj of params.holes) {
      if (hObj && typeof hObj === "object") {
        const hx = Number(hObj.x) || 0;
        const hy = Number(hObj.y) || 0;
        const hr = Number(hObj.radius ?? hObj.r) || holeR;
        if (hr > 0 && hr < Math.min(w, d) * 0.45) {
          holeCoords.push([hx, hy, hr]);
        }
      }
    }
  } else {
    const holeCount = Math.round(
      pickNum(params, ["holes", "holeCount", "numHoles"], 4)
    );
    const insetX = Math.max(holeR * 2.4, w * 0.16);
    const insetY = Math.max(holeR * 2.4, d * 0.18);
    const hx = w / 2 - insetX;
    const hy = d / 2 - insetY;

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

function buildHookGeometry(params: PartParams): THREE.BufferGeometry {
  const h = pickNum(
    params,
    ["shankLength", "h", "height", "length"],
    44
  );
  const w = pickNum(params, ["w", "width"], 14);
  const r = pickNum(
    params,
    ["throatRadius", "r", "radius", "gap", "throat"],
    11
  );
  const t = pickNum(params, ["t", "thickness", "wall"], 4.5);

  const outerR = r + t;
  const shankH = Math.max(12, h - outerR);

  const shape = new THREE.Shape();
  shape.moveTo(-outerR, shankH);
  shape.lineTo(-r, shankH);
  shape.lineTo(-r, 0);
  shape.absarc(0, 0, r, Math.PI, 0, false);
  const tipH = pickNum(params, ["tipLength"], r * 0.45);
  shape.lineTo(r, tipH);
  shape.absarc(r + t / 2, tipH, t / 2, Math.PI, 0, true);
  shape.lineTo(outerR, 0);
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

function buildClipGeometry(params: PartParams): THREE.BufferGeometry {
  const innerR = pickNum(params, ["innerRadius", "r", "radius"], 11);
  const t = pickNum(params, ["wallThickness", "t", "thickness", "wall"], 3.5);
  const h = pickNum(params, ["h", "height", "w", "width"], 16);
  const openDeg = pickNum(
    params,
    ["openAngle", "openAngleDeg", "gapAngle"],
    72
  );

  const outerR = innerR + t;
  const halfOpenRad = THREE.MathUtils.degToRad(openDeg / 2);
  const startAngle = halfOpenRad;
  const endAngle = Math.PI * 2 - halfOpenRad;

  const shape = new THREE.Shape();
  shape.moveTo(
    Math.cos(startAngle) * innerR,
    Math.sin(startAngle) * innerR
  );
  shape.absarc(0, 0, innerR, startAngle, endAngle, false);
  const midEnd = innerR + t / 2;
  shape.absarc(
    Math.cos(endAngle) * midEnd,
    Math.sin(endAngle) * midEnd,
    t / 2,
    endAngle + Math.PI,
    endAngle,
    true
  );
  shape.absarc(0, 0, outerR, endAngle, startAngle, true);
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

function buildFunnelGeometry(params: PartParams): THREE.BufferGeometry {
  const topR = pickNum(params, ["topRadius", "rTop", "r", "radius"], 24);
  const bottomR = Math.min(
    topR * 0.55,
    pickNum(params, ["bottomRadius", "rBottom", "spoutRadius"], 6.5)
  );
  const coneH = pickNum(params, ["coneHeight"], 24);
  const spoutHParam = pickNum(params, ["spoutHeight", "neckHeight"], 14);
  const h = pickNum(
    params,
    ["h", "height", "length"],
    coneH + spoutHParam
  );
  const spoutH = Math.min(h * 0.55, spoutHParam);
  const wall = Math.min(
    bottomR * 0.45,
    pickNum(params, ["wallThickness", "wall", "thickness", "t"], 2.2)
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

function buildGearSimpleGeometry(params: PartParams): THREE.BufferGeometry {
  const teeth = Math.max(
    6,
    Math.min(36, Math.round(pickNum(params, ["teeth", "numTeeth", "n"], 12)))
  );
  const mod = pickNum(params, ["module"], 0);
  const computedOuterR =
    mod > 0 ? (teeth * mod) / 2 + mod : 18;
  const outerR = pickNum(
    params,
    ["r", "radius", "outerRadius"],
    computedOuterR
  );
  const h = pickNum(params, ["thickness", "h", "height", "t"], 8);
  const toothDepth = pickNum(
    params,
    ["toothDepth"],
    mod > 0 ? mod * 2.1 : outerR * 0.18
  );
  const rootR = Math.max(4, outerR - toothDepth);
  const boreR = Math.min(
    rootR * 0.6,
    pickNum(
      params,
      ["boreRadius", "bore", "holeRadius", "innerRadius"],
      outerR * 0.25
    )
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

function mergeBufferGeometries(
  geometries: THREE.BufferGeometry[]
): THREE.BufferGeometry {
  const nonIndexed = geometries.map((g) =>
    g.index ? g.toNonIndexed() : g.clone()
  );
  let totalVerts = 0;
  for (const g of nonIndexed) {
    const pos = g.getAttribute("position");
    if (pos) totalVerts += pos.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    const pos = g.getAttribute("position");
    const norm = g.getAttribute("normal");
    if (!pos) continue;
    positions.set(pos.array as Float32Array, offset * 3);
    if (norm) {
      normals.set(norm.array as Float32Array, offset * 3);
    }
    offset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildHFrameGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(90, pickNum(params, ["w", "width"], 136));
  const h = Math.max(150, pickNum(params, ["h", "height"], 204));
  const d = Math.max(70, pickNum(params, ["d", "depth"], 96));
  const barT = Math.max(12, Math.min(20, Math.round(w * 0.12)));
  const halfSpanX = w / 2 - barT / 2;
  const bottomY = -h / 2 + barT / 2;

  const leftStile = new THREE.BoxGeometry(barT, h * 0.88, barT);
  leftStile.translate(-halfSpanX, -h * 0.04, 0);

  const rightStile = new THREE.BoxGeometry(barT, h * 0.88, barT);
  rightStile.translate(halfSpanX, -h * 0.04, 0);

  const leftFoot = new THREE.BoxGeometry(barT * 1.1, barT, d);
  leftFoot.translate(-halfSpanX, bottomY, 0);

  const rightFoot = new THREE.BoxGeometry(barT * 1.1, barT, d);
  rightFoot.translate(halfSpanX, bottomY, 0);

  const lowerCrossbar = new THREE.BoxGeometry(w - barT, barT, barT);
  lowerCrossbar.translate(0, -h * 0.26, 0);

  const upperCrossbar = new THREE.BoxGeometry(w - barT, barT, barT);
  upperCrossbar.translate(0, h * 0.24, 0);

  const centerMast = new THREE.BoxGeometry(barT * 0.95, h, barT * 0.95);
  centerMast.translate(0, 0, barT * 0.35);

  const rearStrut = new THREE.BoxGeometry(barT * 0.85, h * 0.72, barT * 0.85);
  rearStrut.rotateX(THREE.MathUtils.degToRad(22));
  rearStrut.translate(0, -h * 0.14, -d * 0.28);

  return mergeBufferGeometries([
    leftStile,
    rightStile,
    leftFoot,
    rightFoot,
    lowerCrossbar,
    upperCrossbar,
    centerMast,
    rearStrut,
  ]);
}

function buildCasterWheelGeometry(params: PartParams): THREE.BufferGeometry {
  const wheelR = Math.max(12, Math.min(28, pickNum(params, ["radius", "r"], 18)));
  const wheelW = Math.max(10, Math.min(20, pickNum(params, ["wheelWidth"], 12)));
  const isQuadSet = Boolean(params?.isQuadSet);

  const makeSingleCaster = (ox: number, oz: number): THREE.BufferGeometry[] => {
    const wheel = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 24);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(ox, -wheelR * 0.3, oz);

    const hub = new THREE.CylinderGeometry(wheelR * 0.38, wheelR * 0.38, wheelW + 3, 16);
    hub.rotateZ(Math.PI / 2);
    hub.translate(ox, -wheelR * 0.3, oz);

    const yokePlate = new THREE.BoxGeometry(wheelW + 8, 5, wheelR * 1.35);
    yokePlate.translate(ox, wheelR * 0.65, oz);

    const stem = new THREE.CylinderGeometry(4.5, 4.5, 16, 16);
    stem.translate(ox, wheelR * 0.65 + 9, oz);

    return [wheel, hub, yokePlate, stem];
  };

  if (isQuadSet) {
    const sx = pickNum(params, ["spanX"], 59);
    const sz = pickNum(params, ["spanZ"], 38);
    return mergeBufferGeometries([
      ...makeSingleCaster(-sx, -sz),
      ...makeSingleCaster(sx, -sz),
      ...makeSingleCaster(-sx, sz),
      ...makeSingleCaster(sx, sz),
    ]);
  }

  const single = mergeBufferGeometries(makeSingleCaster(0, 0));
  single.center();
  single.computeBoundingBox();
  single.computeBoundingSphere();
  return single;
}

function buildShelfLedgeGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(85, pickNum(params, ["w", "width"], 158));
  const d = Math.max(28, pickNum(params, ["d", "depth"], 42));
  const h = Math.max(14, pickNum(params, ["h", "height"], 24));
  const deckT = Math.max(6, Math.min(10, h * 0.38));

  const deck = new THREE.BoxGeometry(w, deckT, d);
  deck.translate(0, -h / 2 + deckT / 2, 0);

  const frontLip = new THREE.BoxGeometry(w, h * 0.78, 6);
  frontLip.translate(0, -h * 0.1, d / 2 - 3);

  const rearSpineClamp = new THREE.BoxGeometry(Math.min(54, w * 0.38), h, 12);
  rearSpineClamp.translate(0, 0, -d / 2 + 6);

  const merged = mergeBufferGeometries([deck, frontLip, rearSpineClamp]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildCustomCsgGeometry(params: PartParams): THREE.BufferGeometry {
  if (params?.preset === "enclosure") {
    return buildBoxGeometry({
      ...params,
      hollow: true,
      wall: params.wallThickness ?? params.wall ?? 2.8,
    });
  }

  const r = pickNum(params, ["r", "radius", "outerRadius"], 48);
  const w = pickNum(params, ["w", "width"], r * 2);
  const d = pickNum(params, ["d", "depth"], r * 2);
  const h = pickNum(params, ["h", "height"], 68);
  const wall = pickNum(params, ["wallThickness", "wall", "thickness"], 4);

  const outerR = Math.max(18, Math.min(w, d) / 2);
  const innerR = Math.max(8, outerR - wall);

  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);

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
  params: PartParams = {}
): string {
  const sortedEntries = Object.entries(params || {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `${shape}:${JSON.stringify(sortedEntries)}`;
}

/**
 * Standalone Three.js geometry builder for all supported CAD & shared-contract shapes.
 */
export function buildPartGeometry(
  shape: PartShape | string,
  params: PartParams = {}
): THREE.BufferGeometry {
  const key = getGeometryCacheKey(shape, params);
  const cached = GEOMETRY_CACHE.get(key);
  if (cached) return cached;

  let geometry: THREE.BufferGeometry;
  const rolePreset =
    typeof params?.rolePreset === "string" ? params.rolePreset : "";

  if (rolePreset === "h_frame") {
    geometry = buildHFrameGeometry(params);
  } else if (rolePreset === "caster_wheel") {
    geometry = buildCasterWheelGeometry(params);
  } else if (rolePreset === "shelf_ledge") {
    geometry = buildShelfLedgeGeometry(params);
  } else {
    switch (shape) {
      case "box":
        geometry = buildBoxGeometry(params);
        break;
      case "cylinder":
        geometry = buildCylinderGeometry(params);
        break;
      case "cone":
        geometry = buildConeGeometry(params);
        break;
      case "sphere":
        geometry = buildSphereGeometry(params);
        break;
      case "tube":
        geometry = buildTubeGeometry(params);
        break;
      case "bracketL":
      case "bracket":
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
      case "enclosure":
        geometry = buildBoxGeometry({
          ...params,
          hollow: params.hollow ?? true,
          wall: params.wallThickness ?? params.wall ?? 2.5,
        });
        break;
      case "custom_csg":
        geometry = buildCustomCsgGeometry(params);
        break;
      default:
        geometry = buildBoxGeometry(params);
        break;
    }
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
  params: PartParams = {},
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
  params: PartParams = {}
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
  params: PartParams = {},
  dims_mm?: [number, number, number]
): string {
  if (Array.isArray(dims_mm) && dims_mm.length === 3) {
    return `${Math.round(dims_mm[0])} × ${Math.round(dims_mm[1])} × ${Math.round(dims_mm[2])} mm`;
  }
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
  params: PartParams;
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

/**
 * Converts an Euler angle value from either degrees (e.g. 90, -90, 180)
 * or radians (e.g. 1.57, 0.3) into radians.
 */
export function toRadians(val: number | undefined): number {
  if (!val || !Number.isFinite(val)) return 0;
  if (Math.abs(val) > 0 && Math.abs(val) <= Math.PI * 2 && Math.abs(val) < 6.3) {
    return val;
  }
  return THREE.MathUtils.degToRad(val);
}

/**
 * Maps demo/sample printed part IDs (across `data/demo/plant-waterer/design.json`,
 * `SAMPLE_DESIGN`, and `FALLBACK_PLANT_WATERER_DESIGN`) to the real binary STL files
 * in `data/demo/plant-waterer/parts/*.stl`.
 */
export const DEMO_PART_STL_MAP: Record<string, string> = {
  // data/demo/plant-waterer/design.json part IDs
  "reservoir-tank": "reservoir-tank.stl",
  "reservoir-lid": "reservoir-lid.stl",
  "pump-mount": "pump-mount.stl",
  "refill-funnel": "refill-funnel.stl",
  "controller-box": "controller-box.stl",
  "controller-bracket": "controller-bracket.stl",
  "tube-clip": "tube-clip.stl",
  "drip-stake": "drip-stake.stl",
  "flow-wheel": "flow-wheel.stl",
  // lib/sample-data.ts SAMPLE_DESIGN part IDs
  "pump-cradle": "pump-mount.stl",
  "drip-manifold": "flow-wheel.stl",
  "controller-enclosure": "controller-box.stl",
  "enclosure-cover": "controller-bracket.stl",
  "emitter-spike": "drip-stake.stl",
  // components/three/demo.tsx FALLBACK_PLANT_WATERER_DESIGN part IDs
  reservoir_base: "reservoir-tank.stl",
  pump_mount_plate: "pump-mount.stl",
  inner_planter_cup: "reservoir-lid.stl",
  float_guide_tube: "tube-clip.stl",
  refill_funnel: "refill-funnel.stl",
  sensor_bracket: "controller-bracket.stl",
  flow_dosing_gear: "flow-wheel.stl",
  drip_rim_clip: "tube-clip.stl",
};

const STL_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry | null>();
const STL_PROMISE_CACHE = new Map<string, Promise<THREE.BufferGeometry | null>>();
const STL_EDGES_CACHE = new Map<string, THREE.EdgesGeometry>();

let sharedStlLoader: STLLoader | null = null;
function getStlLoader(): STLLoader {
  if (!sharedStlLoader) {
    sharedStlLoader = new STLLoader();
  }
  return sharedStlLoader;
}

export const PRESET_PROJECT_ID_SET = new Set<string>([
  "plant-auto-waterer",
  "plant-waterer",
  "demo",
  "sample",
  "art-easel",
  "tabletop-studio-art-easel",
  "articulated-tabletop-studio-art-easel",
  "iphone-magnifier",
  "iphone-magnifier-adapter",
  "liquid-handler",
  "liquid-handling-robot",
  "desktop-robot-arm",
  "robot-arm",
  "6-axis-robot-arm",
  "bladeless-air-purifier",
  "bladeless-fan",
  "bladeless-tower-fan",
  "camera-slider-3axis",
  "camera-slider",
  "motorized-camera-slider",
]);

export function isPresetProjectId(projectId?: string): boolean {
  if (!projectId) return false;
  return PRESET_PROJECT_ID_SET.has(projectId.trim().toLowerCase());
}

/**
 * Builds candidate STL fetch URLs for a printed part.
 * Only loads pre-built STLs for known preset/demo projects and never reuses
 * plant-waterer STLs for non-plant-waterer objects.
 */
export function getCandidateStlUrls(
  partId: string,
  projectId?: string,
  stlFile?: string
): string[] {
  const baseId = String(partId || "")
    .trim()
    .replace(/-\d+$/, "");
  if (!baseId) return [];

  const explicitBase = stlFile
    ? stlFile.split("/").pop() || `${baseId}.stl`
    : `${baseId}.stl`;
  const mappedDemoFile = DEMO_PART_STL_MAP[baseId];

  const isPlantWatererDemo =
    (!projectId && Boolean(mappedDemoFile)) ||
    projectId === "plant-auto-waterer" ||
    projectId === "plant-waterer" ||
    projectId === "demo" ||
    projectId === "sample";

  // Live (non-preset) projects build each part's mesh directly from its dimensions & role
  if (!isPlantWatererDemo && !isPresetProjectId(projectId)) {
    return [];
  }

  const urls: string[] = [];
  const pushUnique = (u: string) => {
    if (!urls.includes(u)) urls.push(u);
  };

  if (isPlantWatererDemo) {
    if (mappedDemoFile) {
      pushUnique(
        `/api/objects/plant-waterer/stl/${encodeURIComponent(mappedDemoFile)}`
      );
    }
    pushUnique(
      `/api/objects/plant-waterer/stl/${encodeURIComponent(explicitBase)}`
    );
    return urls;
  }

  if (projectId) {
    pushUnique(
      `/api/objects/${encodeURIComponent(projectId)}/stl/${encodeURIComponent(
        explicitBase
      )}`
    );
  }

  return urls;
}

/**
 * Centers and orients a raw STL BufferGeometry (generated on a Z-up print bed)
 * to Three.js Y-up local coordinates so it aligns with `design.json` position/rotation.
 */
export function orientAndCenterStlGeometry(
  rawGeo: THREE.BufferGeometry,
  shape: PartShape | string
): THREE.BufferGeometry {
  const geo = rawGeo.clone();
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const sizeX = box ? box.max.x - box.min.x : 30;
  const sizeY = box ? box.max.y - box.min.y : 30;
  const sizeZ = box ? box.max.z - box.min.z : 30;

  if (shape === "funnel") {
    // Support-free funnels are printed upside-down on the bed (wide rim at Z=0, spout at Z=max).
    // Rotate +90° around X so wide mouth faces +Y (up) and spout points -Y (down).
    geo.rotateX(Math.PI / 2);
  } else if (
    shape === "hook" ||
    shape === "bracketL" ||
    shape === "bracket" ||
    (sizeY > sizeX * 2.2 && sizeY > sizeZ * 2.2)
  ) {
    // Elongated stakes/hooks laid along Y on the print bed (e.g. drip-stake.stl)
    // already have their tall vertical axis along Y.
  } else {
    // Standard Z-up print bed STL (reservoir, lid, gear, pump mount, enclosure) ->
    // rotate -90° around X so print bed X-Y becomes horizontal X-Z and print Z becomes +Y.
    geo.rotateX(-Math.PI / 2);
  }

  geo.center();
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Asynchronously fetches and parses a part's STL via Three's STLLoader,
 * validating that it is a real closed mesh (rejecting the 2-facet fallback stub)
 * and orienting/centering it to match `design.json`.
 */
export async function loadPartStlGeometry(
  partId: string,
  shape: PartShape | string,
  projectId?: string,
  stlFile?: string
): Promise<THREE.BufferGeometry | null> {
  if (typeof window === "undefined") return null;

  const urls = getCandidateStlUrls(partId, projectId, stlFile);
  if (urls.length === 0) return null;

  const cacheKey = `${projectId || "demo"}:${partId}:${shape}:${urls.join("|")}`;
  if (STL_GEOMETRY_CACHE.has(cacheKey)) {
    return STL_GEOMETRY_CACHE.get(cacheKey) ?? null;
  }
  const existingPromise = STL_PROMISE_CACHE.get(cacheKey);
  if (existingPromise) return existingPromise;

  const promise = (async (): Promise<THREE.BufferGeometry | null> => {
    const loader = getStlLoader();
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (!buf || buf.byteLength < 84) continue;
        const parsed = loader.parse(buf);
        const posAttr = parsed.getAttribute("position");
        // Reject the 2-facet (6-vertex) missing-file stub from /api/objects/[id]/stl/[filename]
        if (!posAttr || posAttr.count < 36) {
          continue;
        }
        const oriented = orientAndCenterStlGeometry(parsed, shape);
        STL_GEOMETRY_CACHE.set(cacheKey, oriented);
        return oriented;
      } catch {
        // Try next candidate URL or fall back to procedural geometry
      }
    }
    STL_GEOMETRY_CACHE.set(cacheKey, null);
    return null;
  })();

  STL_PROMISE_CACHE.set(cacheKey, promise);
  return promise;
}

/**
 * React hook that loads the real STL geometry + EdgesGeometry for printed parts
 * via `STLLoader`, falling back seamlessly to procedural shapes when unavailable.
 */
export function usePartGeometryAndEdges(
  part: Pick<
    ResolvedAssemblyPart,
    "partId" | "category" | "shape" | "params" | "dims_mm" | "stlFile"
  >,
  projectId?: string,
  edgeThresholdAngle = 22
): {
  geometry: THREE.BufferGeometry;
  edgesGeometry: THREE.EdgesGeometry;
  boundRadius: number;
  isStlLoaded: boolean;
} {
  const fallbackGeometry = useMemo(
    () => buildPartGeometry(part.shape, part.params),
    [part.shape, part.params]
  );

  const fallbackEdges = useMemo(
    () => buildPartEdgesGeometry(part.shape, part.params, edgeThresholdAngle),
    [part.shape, part.params, edgeThresholdAngle]
  );

  const [stlGeo, setStlGeo] = useState<THREE.BufferGeometry | null>(() => {
    if (part.category !== "printed") return null;
    const urls = getCandidateStlUrls(part.partId, projectId, part.stlFile);
    const cacheKey = `${projectId || "demo"}:${part.partId}:${part.shape}:${urls.join("|")}`;
    return STL_GEOMETRY_CACHE.get(cacheKey) ?? null;
  });

  useEffect(() => {
    if (part.category !== "printed") {
      setStlGeo(null);
      return;
    }
    let cancelled = false;
    loadPartStlGeometry(part.partId, part.shape, projectId, part.stlFile).then(
      (loaded) => {
        if (!cancelled && loaded) {
          setStlGeo(loaded);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [part.partId, part.category, part.shape, part.stlFile, projectId]);

  const activeGeometry = stlGeo || fallbackGeometry;

  const activeEdges = useMemo(() => {
    if (!stlGeo) return fallbackEdges;
    const edgeKey = `stl:${projectId || "demo"}:${part.partId}:${edgeThresholdAngle}`;
    const cached = STL_EDGES_CACHE.get(edgeKey);
    if (cached) return cached;
    const computed = new THREE.EdgesGeometry(stlGeo, edgeThresholdAngle);
    STL_EDGES_CACHE.set(edgeKey, computed);
    return computed;
  }, [stlGeo, fallbackEdges, projectId, part.partId, edgeThresholdAngle]);

  const boundRadius = useMemo(() => {
    if (!activeGeometry.boundingSphere) {
      activeGeometry.computeBoundingSphere();
    }
    return activeGeometry.boundingSphere?.radius ?? 25;
  }, [activeGeometry]);

  return {
    geometry: activeGeometry,
    edgesGeometry: activeEdges,
    boundRadius,
    isStlLoaded: Boolean(stlGeo),
  };
}

