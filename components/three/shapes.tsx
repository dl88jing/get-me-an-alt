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

function buildArmBasePedestalGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(110, pickNum(params, ["w", "width"], 150));
  const h = Math.max(32, pickNum(params, ["h", "height"], 42));
  const r = w / 2;
  const flangeH = Math.max(7, h * 0.22);
  const drumH = h * 0.56;
  const collarH = h * 0.26;

  const baseFlange = new THREE.CylinderGeometry(r * 0.96, r, flangeH, 36);
  baseFlange.translate(0, -h / 2 + flangeH / 2, 0);

  const boltBosses: THREE.BufferGeometry[] = [];
  const bossOffset = r * 0.72;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const boss = new THREE.CylinderGeometry(8.5, 9.5, flangeH * 1.15, 18);
      boss.translate(sx * bossOffset, -h / 2 + (flangeH * 1.15) / 2, sz * bossOffset);
      boltBosses.push(boss);
    }
  }

  const waistDrum = new THREE.CylinderGeometry(r * 0.72, r * 0.84, drumH, 36);
  waistDrum.translate(0, -h / 2 + flangeH + drumH / 2 - 1, 0);

  const bearingCollar = buildTubeGeometry({
    outerRadius: r * 0.68,
    innerRadius: r * 0.44,
    height: collarH,
  });
  bearingCollar.translate(0, h / 2 - collarH / 2, 0);

  const merged = mergeBufferGeometries([
    baseFlange,
    ...boltBosses,
    waistDrum,
    bearingCollar,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildTurntableRingDeckGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(90, pickNum(params, ["w", "width"], 128));
  const h = Math.max(10, pickNum(params, ["h", "height", "thickness"], 14));
  const r = w / 2;

  const gearRing = buildGearSimpleGeometry({
    outerRadius: r,
    thickness: h * 0.55,
    teeth: 28,
    boreRadius: r * 0.22,
  });
  gearRing.translate(0, -h * 0.18, 0);

  const upperDeck = new THREE.CylinderGeometry(r * 0.88, r * 0.92, h * 0.5, 36);
  upperDeck.translate(0, h * 0.12, 0);

  const centerBoss = buildTubeGeometry({
    outerRadius: r * 0.52,
    innerRadius: r * 0.16,
    height: h * 0.42,
  });
  centerBoss.translate(0, h * 0.32, 0);

  const merged = mergeBufferGeometries([gearRing, upperDeck, centerBoss]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildUYokeClevisGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(38, pickNum(params, ["w", "width", "legA"], 84));
  const h = Math.max(36, pickNum(params, ["h", "height", "legB"], 72));
  const d = Math.max(28, pickNum(params, ["d", "depth"], 52));
  const t = Math.max(5.5, Math.min(11, pickNum(params, ["thickness", "t", "wallThickness"], 8)));
  const earH = h - t;
  const earX = w / 2 - t / 2;

  const baseBridge = new THREE.BoxGeometry(w, t * 1.25, d * 0.88);
  baseBridge.translate(0, -h / 2 + (t * 1.25) / 2, 0);

  const baseFlange = new THREE.CylinderGeometry(d * 0.44, d * 0.48, t * 0.9, 28);
  baseFlange.translate(0, -h / 2 + (t * 0.9) / 2, 0);

  const leftEar = new THREE.BoxGeometry(t, earH * 0.82, d * 0.76);
  leftEar.translate(-earX, -h / 2 + t + (earH * 0.82) / 2, 0);

  const rightEar = new THREE.BoxGeometry(t, earH * 0.82, d * 0.76);
  rightEar.translate(earX, -h / 2 + t + (earH * 0.82) / 2, 0);

  const leftBoss = new THREE.CylinderGeometry(d * 0.38, d * 0.38, t * 1.35, 24);
  leftBoss.rotateZ(Math.PI / 2);
  leftBoss.translate(-earX, h / 2 - d * 0.38, 0);

  const rightBoss = new THREE.CylinderGeometry(d * 0.38, d * 0.38, t * 1.35, 24);
  rightBoss.rotateZ(Math.PI / 2);
  rightBoss.translate(earX, h / 2 - d * 0.38, 0);

  const pivotPin = new THREE.CylinderGeometry(d * 0.13, d * 0.13, w * 1.08, 20);
  pivotPin.rotateZ(Math.PI / 2);
  pivotPin.translate(0, h / 2 - d * 0.38, 0);

  const merged = mergeBufferGeometries([
    baseBridge,
    baseFlange,
    leftEar,
    rightEar,
    leftBoss,
    rightBoss,
    pivotPin,
  ]);
  if (params?.invertY) {
    merged.rotateX(Math.PI);
  }
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildServoMotorGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(20, pickNum(params, ["w", "width"], 40));
  const h = Math.max(22, pickNum(params, ["h", "height"], 38));
  const d = Math.max(12, pickNum(params, ["d", "depth"], 20));

  const body = new THREE.BoxGeometry(w, h * 0.76, d);
  body.translate(0, -h * 0.08, 0);

  const ears = new THREE.BoxGeometry(w * 1.36, Math.max(3, h * 0.09), d * 0.92);
  ears.translate(0, h * 0.14, 0);

  const gearDome = new THREE.CylinderGeometry(d * 0.46, d * 0.48, h * 0.16, 24);
  gearDome.translate(w * 0.2, h * 0.36, 0);

  const splineShaft = new THREE.CylinderGeometry(d * 0.2, d * 0.2, h * 0.18, 20);
  splineShaft.translate(w * 0.2, h * 0.48, 0);

  const merged = mergeBufferGeometries([body, ears, gearDome, splineShaft]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildArmTrussLinkGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(34, pickNum(params, ["w", "width"], 52));
  const h = Math.max(95, pickNum(params, ["h", "height", "length"], 145));
  const d = Math.max(28, pickNum(params, ["d", "depth"], 40));
  const railT = Math.max(6.5, w * 0.16);
  const railX = w / 2 - railT / 2;
  const endR = d * 0.46;
  const spanY = h - endR * 2;

  const leftBeam = new THREE.BoxGeometry(railT, spanY, d * 0.66);
  leftBeam.translate(-railX, 0, 0);

  const rightBeam = new THREE.BoxGeometry(railT, spanY, d * 0.66);
  rightBeam.translate(railX, 0, 0);

  const lowerKnuckle = new THREE.CylinderGeometry(endR, endR, w, 28);
  lowerKnuckle.rotateZ(Math.PI / 2);
  lowerKnuckle.translate(0, -h / 2 + endR, 0);

  const lowerBorePin = new THREE.CylinderGeometry(endR * 0.42, endR * 0.42, w * 1.12, 20);
  lowerBorePin.rotateZ(Math.PI / 2);
  lowerBorePin.translate(0, -h / 2 + endR, 0);

  const upperKnuckle = new THREE.CylinderGeometry(endR * 0.9, endR * 0.9, w, 28);
  upperKnuckle.rotateZ(Math.PI / 2);
  upperKnuckle.translate(0, h / 2 - endR * 0.9, 0);

  const upperBorePin = new THREE.CylinderGeometry(endR * 0.38, endR * 0.38, w * 1.12, 20);
  upperBorePin.rotateZ(Math.PI / 2);
  upperBorePin.translate(0, h / 2 - endR * 0.9, 0);

  const strut1 = new THREE.BoxGeometry(w - railT, 7, d * 0.48);
  strut1.translate(0, -spanY * 0.26, 0);

  const strut2 = new THREE.BoxGeometry(w - railT, 7, d * 0.48);
  strut2.translate(0, spanY * 0.26, 0);

  const diag1 = new THREE.BoxGeometry(w - railT * 0.8, 6, d * 0.42);
  diag1.rotateZ(THREE.MathUtils.degToRad(34));

  const merged = mergeBufferGeometries([
    leftBeam,
    rightBeam,
    lowerKnuckle,
    lowerBorePin,
    upperKnuckle,
    upperBorePin,
    strut1,
    strut2,
    diag1,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildElbowKnuckleGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(46, pickNum(params, ["w", "width"], 66));
  const h = Math.max(42, pickNum(params, ["h", "height"], 56));
  const d = Math.max(38, pickNum(params, ["d", "depth"], 52));

  const lowerPivotDrum = new THREE.CylinderGeometry(d * 0.38, d * 0.38, w, 28);
  lowerPivotDrum.rotateZ(Math.PI / 2);
  lowerPivotDrum.translate(0, -h * 0.24, 0);

  const midHousing = new THREE.BoxGeometry(w * 0.82, h * 0.52, d * 0.78);
  midHousing.translate(0, 0, 0);

  const upperRollCollar = buildTubeGeometry({
    outerRadius: Math.min(w, d) * 0.44,
    innerRadius: Math.min(w, d) * 0.28,
    height: h * 0.44,
  });
  upperRollCollar.translate(0, h * 0.28, 0);

  const merged = mergeBufferGeometries([
    lowerPivotDrum,
    midHousing,
    upperRollCollar,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildForearmBarrelGeometry(params: PartParams): THREE.BufferGeometry {
  const h = Math.max(80, pickNum(params, ["h", "height", "length"], 120));
  const rBottom = Math.max(16, pickNum(params, ["outerRadius", "r"], 23));
  const rTop = rBottom * 0.82;

  const baseFlange = new THREE.CylinderGeometry(rBottom * 1.14, rBottom * 1.14, 8, 32);
  baseFlange.translate(0, -h / 2 + 4, 0);

  const taperedTube = new THREE.CylinderGeometry(rTop, rBottom, h - 16, 32);

  const ribX = new THREE.BoxGeometry(rBottom * 2.1, h * 0.74, 4.5);
  const ribZ = new THREE.BoxGeometry(4.5, h * 0.74, rBottom * 2.1);

  const topCollar = buildTubeGeometry({
    outerRadius: rTop * 1.14,
    innerRadius: rTop * 0.68,
    height: 10,
  });
  topCollar.translate(0, h / 2 - 5, 0);

  const merged = mergeBufferGeometries([
    baseFlange,
    taperedTube,
    ribX,
    ribZ,
    topCollar,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildParallelGripperBodyGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(58, pickNum(params, ["w", "width"], 74));
  const h = Math.max(26, pickNum(params, ["h", "height"], 34));
  const d = Math.max(26, pickNum(params, ["d", "depth"], 38));

  const wristCollar = new THREE.CylinderGeometry(16, 18, h * 0.38, 24);
  wristCollar.translate(0, -h * 0.32, 0);

  const guideBridge = new THREE.BoxGeometry(w, h * 0.48, d * 0.72);
  guideBridge.translate(0, h * 0.08, 0);

  const leftRailEnd = new THREE.BoxGeometry(8, h * 0.58, d * 0.88);
  leftRailEnd.translate(-w / 2 + 4, h * 0.1, 0);

  const rightRailEnd = new THREE.BoxGeometry(8, h * 0.58, d * 0.88);
  rightRailEnd.translate(w / 2 - 4, h * 0.1, 0);

  const leftGear = buildGearSimpleGeometry({
    outerRadius: 12,
    thickness: 6,
    teeth: 12,
    boreRadius: 3,
  });
  leftGear.rotateX(Math.PI / 2);
  leftGear.translate(-13, h * 0.08, d * 0.42);

  const rightGear = buildGearSimpleGeometry({
    outerRadius: 12,
    thickness: 6,
    teeth: 12,
    boreRadius: 3,
  });
  rightGear.rotateX(Math.PI / 2);
  rightGear.translate(13, h * 0.08, d * 0.42);

  const merged = mergeBufferGeometries([
    wristCollar,
    guideBridge,
    leftRailEnd,
    rightRailEnd,
    leftGear,
    rightGear,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildParallelGripperJawsGeometry(params: PartParams): THREE.BufferGeometry {
  const span = Math.max(40, pickNum(params, ["span", "w", "width"], 52));
  const h = Math.max(38, pickNum(params, ["h", "height"], 48));
  const d = Math.max(14, pickNum(params, ["d", "depth"], 18));
  const jawX = span * 0.34;

  const makeJaw = (side: -1 | 1): THREE.BufferGeometry[] => {
    const carriageBase = new THREE.BoxGeometry(14, 10, d);
    carriageBase.translate(side * (jawX + 3), -h / 2 + 5, 0);

    const fingerBlade = new THREE.BoxGeometry(7, h - 8, d * 0.78);
    fingerBlade.translate(side * jawX, 4, 0);

    const tipPad = new THREE.BoxGeometry(10, 14, d * 0.84);
    tipPad.translate(side * (jawX - 3.5), h / 2 - 7, 0);

    return [carriageBase, fingerBlade, tipPad];
  };

  const merged = mergeBufferGeometries([...makeJaw(-1), ...makeJaw(1)]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildPurifierBasePanGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(130, pickNum(params, ["w", "width"], 168));
  const h = Math.max(24, pickNum(params, ["h", "height"], 32));
  const r = w / 2;

  const bottomSkirt = new THREE.CylinderGeometry(r * 0.94, r, h * 0.38, 40);
  bottomSkirt.translate(0, -h / 2 + (h * 0.38) / 2, 0);

  const upperPan = buildTubeGeometry({
    outerRadius: r * 0.94,
    innerRadius: r * 0.72,
    height: h * 0.68,
    closedBottom: 5,
  });
  upperPan.translate(0, h * 0.16, 0);

  const merged = mergeBufferGeometries([bottomSkirt, upperPan]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildHepaPleatedFilterGeometry(params: PartParams): THREE.BufferGeometry {
  const rOuter = Math.max(55, pickNum(params, ["outerRadius", "r"], 74));
  const rInner = Math.max(36, pickNum(params, ["innerRadius"], 50));
  const h = Math.max(80, pickNum(params, ["h", "height"], 115));
  const capH = 7;

  const bottomCap = buildTubeGeometry({
    outerRadius: rOuter + 1.5,
    innerRadius: rInner - 1,
    height: capH,
  });
  bottomCap.translate(0, -h / 2 + capH / 2, 0);

  const topCap = buildTubeGeometry({
    outerRadius: rOuter + 1.5,
    innerRadius: rInner - 1,
    height: capH,
  });
  topCap.translate(0, h / 2 - capH / 2, 0);

  const pleatedCore = buildGearSimpleGeometry({
    outerRadius: rOuter,
    toothDepth: 4.5,
    teeth: 32,
    thickness: h - capH * 2,
    boreRadius: rInner,
  });

  const merged = mergeBufferGeometries([bottomCap, topCap, pleatedCore]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildPerforatedIntakeDrumGeometry(params: PartParams): THREE.BufferGeometry {
  const rOuter = Math.max(65, pickNum(params, ["outerRadius", "r"], 82));
  const rInner = Math.max(58, pickNum(params, ["innerRadius"], 76));
  const h = Math.max(90, pickNum(params, ["h", "height"], 125));
  const ringH = 12;

  const bottomRing = buildTubeGeometry({
    outerRadius: rOuter,
    innerRadius: rInner,
    height: ringH,
  });
  bottomRing.translate(0, -h / 2 + ringH / 2, 0);

  const midRing = buildTubeGeometry({
    outerRadius: rOuter,
    innerRadius: rInner,
    height: 8,
  });

  const topRing = buildTubeGeometry({
    outerRadius: rOuter,
    innerRadius: rInner,
    height: ringH,
  });
  topRing.translate(0, h / 2 - ringH / 2, 0);

  const struts: THREE.BufferGeometry[] = [];
  const strutCount = 16;
  const rMid = (rOuter + rInner) / 2;
  const wallT = Math.max(4, rOuter - rInner);
  for (let i = 0; i < strutCount; i++) {
    const ang = (i * Math.PI * 2) / strutCount;
    const strut = new THREE.BoxGeometry(wallT, h - ringH, 5.5);
    strut.rotateY(-ang);
    strut.translate(Math.cos(ang) * rMid, 0, Math.sin(ang) * rMid);
    struts.push(strut);
  }

  const merged = mergeBufferGeometries([bottomRing, midRing, topRing, ...struts]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildAnnularRetainerRingGeometry(params: PartParams): THREE.BufferGeometry {
  const rOuter = Math.max(55, pickNum(params, ["outerRadius", "r"], 80));
  const rInner = Math.max(35, pickNum(params, ["innerRadius", "boreRadius"], 50));
  const h = Math.max(10, pickNum(params, ["h", "height", "thickness"], 16));

  const mainRing = buildTubeGeometry({
    outerRadius: rOuter,
    innerRadius: rInner,
    height: h,
  });

  const tabs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    const tab = new THREE.BoxGeometry(10, h * 0.75, 14);
    tab.rotateY(-ang);
    tab.translate(Math.cos(ang) * (rOuter + 3), 0, Math.sin(ang) * (rOuter + 3));
    tabs.push(tab);
  }

  const merged = mergeBufferGeometries([mainRing, ...tabs]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildCoandaPlenumNeckGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(84, pickNum(params, ["w", "width"], 108));
  const h = Math.max(36, pickNum(params, ["h", "height"], 46));
  const d = Math.max(44, pickNum(params, ["d", "depth"], 54));

  const lowerCollar = buildTubeGeometry({
    outerRadius: d * 0.68,
    innerRadius: d * 0.48,
    height: h * 0.48,
  });
  lowerCollar.translate(0, -h * 0.24, 0);

  const upperSplitSaddle = new THREE.BoxGeometry(w * 0.92, h * 0.56, d * 0.88);
  upperSplitSaddle.translate(0, h * 0.18, 0);

  const leftBranch = new THREE.CylinderGeometry(d * 0.36, d * 0.32, h * 0.55, 24);
  leftBranch.rotateZ(THREE.MathUtils.degToRad(26));
  leftBranch.translate(-w * 0.28, h * 0.16, 0);

  const rightBranch = new THREE.CylinderGeometry(d * 0.36, d * 0.32, h * 0.55, 24);
  rightBranch.rotateZ(THREE.MathUtils.degToRad(-26));
  rightBranch.translate(w * 0.28, h * 0.16, 0);

  const merged = mergeBufferGeometries([
    lowerCollar,
    upperSplitSaddle,
    leftBranch,
    rightBranch,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildCoandaAirfoilLoopHalfGeometry(
  params: PartParams,
  half: "lower" | "upper"
): THREE.BufferGeometry {
  const w = Math.max(150, pickNum(params, ["w", "width"], 186));
  const h = Math.max(105, pickNum(params, ["h", "height"], 130));
  const chordDepth = Math.max(38, pickNum(params, ["d", "depth"], 46));
  const profileT = Math.max(18, Math.min(26, w * 0.12));

  const rxOuter = w / 2;
  const rxInner = rxOuter - profileT;
  const ryOuter = h;
  const ryInner = Math.max(30, ryOuter - profileT);

  const shape = new THREE.Shape();
  const steps = 40;

  if (half === "upper") {
    // Inverted U-arch from angle 0..PI in X-Y plane (standing vertically, open along Z)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI;
      const x = Math.cos(t) * rxOuter;
      const y = Math.sin(t) * ryOuter;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const t = (i / steps) * Math.PI;
      const x = Math.cos(t) * rxInner;
      const y = Math.sin(t) * ryInner;
      shape.lineTo(x, y);
    }
    shape.closePath();
  } else {
    // Lower U-cradle from angle PI..2*PI in X-Y plane
    for (let i = 0; i <= steps; i++) {
      const t = Math.PI + (i / steps) * Math.PI;
      const x = Math.cos(t) * rxOuter;
      const y = Math.sin(t) * ryOuter;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const t = Math.PI + (i / steps) * Math.PI;
      const x = Math.cos(t) * rxInner;
      const y = Math.sin(t) * ryInner;
      shape.lineTo(x, y);
    }
    shape.closePath();
  }

  const loopArc = new THREE.ExtrudeGeometry(shape, {
    depth: chordDepth,
    bevelEnabled: true,
    bevelThickness: 2.5,
    bevelSize: 2.0,
    bevelSegments: 3,
    curveSegments: 36,
  });
  loopArc.center();

  if (half === "lower") {
    const throatPedestal = new THREE.CylinderGeometry(28, 34, 18, 28);
    throatPedestal.translate(0, -h / 2 - 4, 0);
    const merged = mergeBufferGeometries([loopArc, throatPedestal]);
    merged.center();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }

  loopArc.computeBoundingBox();
  loopArc.computeBoundingSphere();
  return loopArc;
}

function buildCoandaAirfoilLoopFullGeometry(
  params: PartParams
): THREE.BufferGeometry {
  const w = Math.max(156, pickNum(params, ["w", "width"], 186));
  const h = Math.max(190, pickNum(params, ["h", "height"], 238));
  const chordDepth = Math.max(38, pickNum(params, ["d", "depth"], 48));
  const profileT = Math.max(18, Math.min(25, w * 0.115));

  const rxOuter = w / 2;
  const ryOuter = h / 2;
  const rxInner = Math.max(42, rxOuter - profileT);
  const ryInner = Math.max(60, ryOuter - profileT);

  const shape = new THREE.Shape();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Superellipse (n=2.25) stadium-oval contour for authentic Dyson Pure Cool loop silhouette
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const x = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.88) * rxOuter;
    const y = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.84) * ryOuter;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const hole = new THREE.Path();
  for (let i = steps; i >= 0; i--) {
    const t = (i / steps) * Math.PI * 2;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const x = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.88) * rxInner;
    const y = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.84) * ryInner;
    if (i === steps) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);

  const loopRing = new THREE.ExtrudeGeometry(shape, {
    depth: chordDepth,
    bevelEnabled: true,
    bevelThickness: 2.6,
    bevelSize: 2.0,
    bevelSegments: 3,
    curveSegments: 48,
  });
  loopRing.center();

  const throatPedestal = buildTubeGeometry({
    outerRadius: 34,
    innerRadius: 24,
    height: 24,
  });
  throatPedestal.translate(0, -ryOuter - 8, 0);

  const merged = mergeBufferGeometries([loopRing, throatPedestal]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildDual2020RailsGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(180, pickNum(params, ["w", "width"], 250));
  const d = Math.max(48, pickNum(params, ["d", "depth"], 68));
  const railSize = Math.max(16, Math.min(22, pickNum(params, ["h", "height"], 20)));
  const railZ = d / 2 - railSize / 2;

  const frontRail = new THREE.BoxGeometry(w, railSize, railSize);
  frontRail.translate(0, 0, railZ);

  const rearRail = new THREE.BoxGeometry(w, railSize, railSize);
  rearRail.translate(0, 0, -railZ);

  const leftTie = new THREE.BoxGeometry(14, railSize * 0.7, d - railSize);
  leftTie.translate(-w * 0.42, 0, 0);

  const rightTie = new THREE.BoxGeometry(14, railSize * 0.7, d - railSize);
  rightTie.translate(w * 0.42, 0, 0);

  const merged = mergeBufferGeometries([frontRail, rearRail, leftTie, rightTie]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildSliderEndBlockGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(36, pickNum(params, ["w", "width"], 46));
  const h = Math.max(38, pickNum(params, ["h", "height"], 48));
  const d = Math.max(68, pickNum(params, ["d", "depth"], 86));

  const mainBridge = new THREE.BoxGeometry(w, h * 0.68, d);
  mainBridge.translate(0, -h * 0.12, 0);

  const topPillar = new THREE.BoxGeometry(w * 0.78, h * 0.42, d * 0.56);
  topPillar.translate(0, h * 0.26, 0);

  const pulleyBoss = new THREE.CylinderGeometry(13, 13, 12, 24);
  pulleyBoss.translate(0, h * 0.36, 0);

  const merged = mergeBufferGeometries([mainBridge, topPillar, pulleyBoss]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildOutriggerLegsQuadGeometry(params: PartParams): THREE.BufferGeometry {
  const spanX = pickNum(params, ["spanX"], 108);
  const spanZ = pickNum(params, ["spanZ"], 52);
  const legLen = pickNum(params, ["legLen"], 54);

  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const arm = new THREE.BoxGeometry(legLen, 10, 14);
      arm.rotateY(sx * sz * THREE.MathUtils.degToRad(-32));
      arm.translate(sx * spanX, 4, sz * spanZ);

      const foot = new THREE.CylinderGeometry(12, 14, 12, 20);
      foot.translate(sx * (spanX + 16), -4, sz * (spanZ + 14));
      parts.push(arm, foot);
    }
  }

  const merged = mergeBufferGeometries(parts);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildVSlotWheelSetGeometry(params: PartParams): THREE.BufferGeometry {
  const spanX = pickNum(params, ["spanX"], 42);
  const spanZ = pickNum(params, ["spanZ"], 30);
  const wheelR = pickNum(params, ["wheelR", "outerRadius"], 13);

  const wheels: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wGeo = new THREE.CylinderGeometry(wheelR, wheelR, 10, 24);
      wGeo.rotateX(Math.PI / 2);
      wGeo.translate(sx * spanX, 0, sz * spanZ);

      const spacer = new THREE.CylinderGeometry(5, 5, 14, 16);
      spacer.translate(sx * spanX, 8, sz * spanZ);
      wheels.push(wGeo, spacer);
    }
  }

  const merged = mergeBufferGeometries(wheels);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildGt2BeltLoopGeometry(params: PartParams): THREE.BufferGeometry {
  const spanX = Math.max(140, pickNum(params, ["spanX", "w", "width"], 210));
  const beltZ = 11;

  const frontStrand = new THREE.BoxGeometry(spanX, 7, 2.5);
  frontStrand.translate(0, 0, beltZ);

  const rearStrand = new THREE.BoxGeometry(spanX, 7, 2.5);
  rearStrand.translate(0, 0, -beltZ);

  const leftPulley = new THREE.CylinderGeometry(12, 12, 12, 24);
  leftPulley.translate(-spanX / 2, 0, 0);

  const rightPulley = new THREE.CylinderGeometry(12, 12, 12, 24);
  rightPulley.translate(spanX / 2, 0, 0);

  const merged = mergeBufferGeometries([
    frontStrand,
    rearStrand,
    leftPulley,
    rightPulley,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildArcaCameraCradleGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(58, pickNum(params, ["w", "width"], 74));
  const h = Math.max(26, pickNum(params, ["h", "height"], 38));
  const d = Math.max(48, pickNum(params, ["d", "depth"], 58));

  const clampBase = new THREE.BoxGeometry(w, 12, d);
  clampBase.translate(0, -h * 0.32, 0);

  const leftJaw = new THREE.BoxGeometry(10, 10, d);
  leftJaw.translate(-w / 2 + 5, -h * 0.1, 0);

  const rightJaw = new THREE.BoxGeometry(10, 10, d);
  rightJaw.translate(w / 2 - 5, -h * 0.1, 0);

  const lockKnob = new THREE.CylinderGeometry(9, 9, 14, 20);
  lockKnob.rotateZ(Math.PI / 2);
  lockKnob.translate(w / 2 + 7, -h * 0.18, 0);

  // Camera body & lens proxy on the Arca plate so the gimbal reads unmistakably
  const camBody = new THREE.BoxGeometry(w * 0.78, h * 0.62, d * 0.56);
  camBody.translate(0, h * 0.22, -4);

  const lensBarrel = new THREE.CylinderGeometry(16, 18, d * 0.52, 28);
  lensBarrel.rotateX(Math.PI / 2);
  lensBarrel.translate(0, h * 0.2, d * 0.36);

  const merged = mergeBufferGeometries([
    clampBase,
    leftJaw,
    rightJaw,
    lockKnob,
    camBody,
    lensBarrel,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildEaselHBaseGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(120, pickNum(params, ["w", "width"], 155));
  const h = Math.max(20, pickNum(params, ["h", "height"], 26));
  const d = Math.max(100, pickNum(params, ["d", "depth"], 130));
  const barW = 22;

  const leftRunner = new THREE.BoxGeometry(barW, h * 0.78, d);
  leftRunner.translate(-w / 2 + barW / 2, -h * 0.1, 0);

  const rightRunner = new THREE.BoxGeometry(barW, h * 0.78, d);
  rightRunner.translate(w / 2 - barW / 2, -h * 0.1, 0);

  const frontCrossbar = new THREE.BoxGeometry(w - barW, h * 0.72, barW);
  frontCrossbar.translate(0, -h * 0.12, d * 0.34);

  const centerBridge = new THREE.BoxGeometry(w - barW, h * 0.85, barW * 1.35);
  centerBridge.translate(0, -h * 0.05, -d * 0.08);

  const leftClevisEar = new THREE.BoxGeometry(8, h * 0.9, 28);
  leftClevisEar.translate(-16, h * 0.35, -d * 0.08);

  const rightClevisEar = new THREE.BoxGeometry(8, h * 0.9, 28);
  rightClevisEar.translate(16, h * 0.35, -d * 0.08);

  const merged = mergeBufferGeometries([
    leftRunner,
    rightRunner,
    frontCrossbar,
    centerBridge,
    leftClevisEar,
    rightClevisEar,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildCanvasTopClampGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(52, pickNum(params, ["w", "width"], 68));
  const h = Math.max(28, pickNum(params, ["h", "height"], 34));
  const d = Math.max(38, pickNum(params, ["d", "depth"], 46));

  const topDeck = new THREE.BoxGeometry(w, 9, d);
  topDeck.translate(0, h / 2 - 4.5, 0);

  const frontDownLip = new THREE.BoxGeometry(w, h * 0.68, 8);
  frontDownLip.translate(0, -h * 0.05, d / 2 - 4);

  const rearMastCollar = new THREE.BoxGeometry(36, h, 26);
  rearMastCollar.translate(0, 0, -d / 2 + 13);

  const merged = mergeBufferGeometries([topDeck, frontDownLip, rearMastCollar]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildMicroscopeStageBaseGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(80, pickNum(params, ["w", "width"], 94));
  const h = Math.max(24, pickNum(params, ["h", "height"], 32));
  const d = Math.max(70, pickNum(params, ["d", "depth"], 82));

  const bottomFoot = new THREE.BoxGeometry(w, 8, d);
  bottomFoot.translate(0, -h / 2 + 4, 0);

  const rearPillar = new THREE.BoxGeometry(w * 0.44, h, 24);
  rearPillar.translate(0, 0, -d / 2 + 12);

  const stageDeck = buildPlateWithHolesGeometry({
    width: w * 0.96,
    depth: d * 0.78,
    thickness: 9,
    centerHoleRadius: 12,
    holes: 4,
  });
  stageDeck.translate(0, h / 2 - 4.5, 4);

  const merged = mergeBufferGeometries([bottomFoot, rearPillar, stageDeck]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildPhoneCameraSaddleGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(76, pickNum(params, ["w", "width"], 92));
  const h = Math.max(18, pickNum(params, ["h", "height"], 24));
  const d = Math.max(54, pickNum(params, ["d", "depth"], 66));

  const plate = buildPlateWithHolesGeometry({
    width: w,
    depth: d,
    thickness: 7,
    centerHoleRadius: 11,
    holes: 0,
  });
  plate.translate(0, 2, 0);

  const leftClipRail = new THREE.BoxGeometry(7, h * 0.85, d);
  leftClipRail.translate(-w / 2 + 3.5, h * 0.2, 0);

  const rightClipRail = new THREE.BoxGeometry(7, h * 0.85, d);
  rightClipRail.translate(w / 2 - 3.5, h * 0.2, 0);

  const lensTurret = buildTubeGeometry({
    outerRadius: 18,
    innerRadius: 11,
    height: h * 0.75,
  });
  lensTurret.translate(0, -h * 0.25, 0);

  const merged = mergeBufferGeometries([
    plate,
    leftClipRail,
    rightClipRail,
    lensTurret,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildMicroplateDeck96WellGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(180, pickNum(params, ["w", "width"], 214));
  const h = Math.max(16, pickNum(params, ["h", "height"], 22));
  const d = Math.max(125, pickNum(params, ["d", "depth"], 148));

  const baseSlab = new THREE.BoxGeometry(w, h * 0.65, d);
  baseSlab.translate(0, -h * 0.16, 0);

  const leftPad = new THREE.BoxGeometry(26, h, d * 0.82);
  leftPad.translate(-w / 2 + 13, 0, 0);

  const rightPad = new THREE.BoxGeometry(26, h, d * 0.82);
  rightPad.translate(w / 2 - 13, 0, 0);

  const dividerRib = new THREE.BoxGeometry(8, h * 0.95, d * 0.76);

  const frontRim = new THREE.BoxGeometry(w - 40, h * 0.9, 8);
  frontRim.translate(0, 0, d * 0.38);

  const rearRim = new THREE.BoxGeometry(w - 40, h * 0.9, 8);
  rearRim.translate(0, 0, -d * 0.38);

  const merged = mergeBufferGeometries([
    baseSlab,
    leftPad,
    rightPad,
    dividerRib,
    frontRim,
    rearRim,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildGantryPortalUprightGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(24, pickNum(params, ["w", "width"], 32));
  const h = Math.max(120, pickNum(params, ["h", "height"], 162));
  const d = Math.max(70, pickNum(params, ["d", "depth"], 108));

  const baseFoot = new THREE.BoxGeometry(w * 1.15, 14, d);
  baseFoot.translate(0, -h / 2 + 7, 0);

  const mainColumn = new THREE.BoxGeometry(w * 0.85, h - 14, 34);
  mainColumn.translate(0, 7, 0);

  const frontGusset = new THREE.BoxGeometry(w * 0.55, h * 0.52, 16);
  frontGusset.rotateX(THREE.MathUtils.degToRad(-24));
  frontGusset.translate(0, -h * 0.18, 22);

  const rearGusset = new THREE.BoxGeometry(w * 0.55, h * 0.52, 16);
  rearGusset.rotateX(THREE.MathUtils.degToRad(24));
  rearGusset.translate(0, -h * 0.18, -22);

  const topSaddle = new THREE.BoxGeometry(w * 1.25, 26, 46);
  topSaddle.translate(0, h / 2 - 22, 0);

  const merged = mergeBufferGeometries([
    baseFoot,
    mainColumn,
    frontGusset,
    rearGusset,
    topSaddle,
  ]);
  merged.center();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function buildPipetteZHeadGeometry(params: PartParams): THREE.BufferGeometry {
  const w = Math.max(36, pickNum(params, ["w", "width"], 46));
  const h = Math.max(72, pickNum(params, ["h", "height"], 92));
  const d = Math.max(36, pickNum(params, ["d", "depth"], 44));

  const rearBackplate = new THREE.BoxGeometry(w, h * 0.72, 10);
  rearBackplate.translate(0, h * 0.08, -d * 0.32);

  const upperCollar = new THREE.BoxGeometry(w * 0.84, 14, d * 0.82);
  upperCollar.translate(0, h * 0.34, 2);

  const lowerCollar = new THREE.BoxGeometry(w * 0.84, 14, d * 0.82);
  lowerCollar.translate(0, -h * 0.06, 2);

  const pipetteBarrel = new THREE.CylinderGeometry(11, 10, h * 0.62, 24);
  pipetteBarrel.translate(0, h * 0.14, 6);

  const pipetteTipCone = new THREE.CylinderGeometry(9, 2.2, h * 0.36, 24);
  pipetteTipCone.translate(0, -h * 0.32, 6);

  const merged = mergeBufferGeometries([
    rearBackplate,
    upperCollar,
    lowerCollar,
    pipetteBarrel,
    pipetteTipCone,
  ]);
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
  } else if (rolePreset === "arm_base_pedestal") {
    geometry = buildArmBasePedestalGeometry(params);
  } else if (rolePreset === "turntable_ring_deck") {
    geometry = buildTurntableRingDeckGeometry(params);
  } else if (rolePreset === "u_yoke_clevis") {
    geometry = buildUYokeClevisGeometry(params);
  } else if (rolePreset === "servo_motor") {
    geometry = buildServoMotorGeometry(params);
  } else if (rolePreset === "arm_truss_link") {
    geometry = buildArmTrussLinkGeometry(params);
  } else if (rolePreset === "elbow_knuckle") {
    geometry = buildElbowKnuckleGeometry(params);
  } else if (rolePreset === "forearm_barrel") {
    geometry = buildForearmBarrelGeometry(params);
  } else if (rolePreset === "parallel_gripper_body") {
    geometry = buildParallelGripperBodyGeometry(params);
  } else if (rolePreset === "parallel_gripper_jaws") {
    geometry = buildParallelGripperJawsGeometry(params);
  } else if (rolePreset === "purifier_base_pan") {
    geometry = buildPurifierBasePanGeometry(params);
  } else if (rolePreset === "hepa_pleated_filter") {
    geometry = buildHepaPleatedFilterGeometry(params);
  } else if (rolePreset === "perforated_intake_drum") {
    geometry = buildPerforatedIntakeDrumGeometry(params);
  } else if (rolePreset === "annular_retainer_ring") {
    geometry = buildAnnularRetainerRingGeometry(params);
  } else if (rolePreset === "coanda_plenum_neck") {
    geometry = buildCoandaPlenumNeckGeometry(params);
  } else if (rolePreset === "coanda_airfoil_lower") {
    geometry = buildCoandaAirfoilLoopHalfGeometry(params, "lower");
  } else if (rolePreset === "coanda_airfoil_upper") {
    geometry = buildCoandaAirfoilLoopHalfGeometry(params, "upper");
  } else if (rolePreset === "coanda_airfoil_loop") {
    geometry = buildCoandaAirfoilLoopFullGeometry(params);
  } else if (rolePreset === "dual_2020_rails") {
    geometry = buildDual2020RailsGeometry(params);
  } else if (rolePreset === "slider_end_block") {
    geometry = buildSliderEndBlockGeometry(params);
  } else if (rolePreset === "outrigger_legs_quad") {
    geometry = buildOutriggerLegsQuadGeometry(params);
  } else if (rolePreset === "vslot_wheel_set") {
    geometry = buildVSlotWheelSetGeometry(params);
  } else if (rolePreset === "gt2_belt_loop") {
    geometry = buildGt2BeltLoopGeometry(params);
  } else if (rolePreset === "arca_camera_cradle") {
    geometry = buildArcaCameraCradleGeometry(params);
  } else if (rolePreset === "easel_h_base") {
    geometry = buildEaselHBaseGeometry(params);
  } else if (rolePreset === "canvas_top_clamp") {
    geometry = buildCanvasTopClampGeometry(params);
  } else if (rolePreset === "microscope_stage_base") {
    geometry = buildMicroscopeStageBaseGeometry(params);
  } else if (rolePreset === "phone_camera_saddle") {
    geometry = buildPhoneCameraSaddleGeometry(params);
  } else if (rolePreset === "microplate_deck_96well") {
    geometry = buildMicroplateDeck96WellGeometry(params);
  } else if (rolePreset === "gantry_portal_upright") {
    geometry = buildGantryPortalUprightGeometry(params);
  } else if (rolePreset === "pipette_z_head") {
    geometry = buildPipetteZHeadGeometry(params);
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

  // Presets other than plant-waterer use their own fixed procedural/rolePreset geometry;
  // live projects (non-preset projectId) fetch from /api/objects/<projectId>/stl/<explicitBase>.
  if (!isPlantWatererDemo && (!projectId || isPresetProjectId(projectId))) {
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

export interface AssemblyFramingResult {
  defaultTarget: [number, number, number];
  defaultCamPos: [number, number, number];
  fitDistance: number;
  groundY: number;
  gridSpan: number;
  minY: number;
  maxY: number;
  spanY: number;
}

/**
 * Computes an auto-fitted camera target and camera position that frames the entire
 * 3D assembly bounding box (union of assembled state and active explode state)
 * with generous breathing room for HUD panels and callouts across all projects.
 */
export function computeAssemblyFraming(
  parts: ResolvedAssemblyPart[],
  options: {
    explodeFactor?: number;
    minExplodeFactor?: number;
    fovDeg?: number;
    aspect?: number;
    groupOffset?: [number, number, number];
    leftLegendBias?: number;
  } = {}
): AssemblyFramingResult {
  const [gx, gy, gz] = options.groupOffset ?? [0, -32, 0];
  if (!Array.isArray(parts) || parts.length === 0) {
    return {
      defaultTarget: [10, 32, 0],
      defaultCamPos: [240, 180, 265],
      fitDistance: 375,
      groundY: -58,
      gridSpan: 360,
      minY: -58,
      maxY: 120,
      spanY: 178,
    };
  }

  const currentExplode = Math.max(0, Math.min(1.2, options.explodeFactor ?? 0.45));
  const minExplode = Math.max(0, Math.min(1.0, options.minExplodeFactor ?? 0));
  const sampleFactors = Array.from(
    new Set([0, Math.max(currentExplode, minExplode)])
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let assembledMinY = Infinity;

  const rotMatrix = new THREE.Matrix4();
  const euler = new THREE.Euler();

  for (const p of parts) {
    const geo = buildPartGeometry(p.shape, p.params);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox;

    const rawW = Number(p.dims_mm?.[0]) || 40;
    const rawH = Number(p.dims_mm?.[1]) || 30;
    const rawD = Number(p.dims_mm?.[2]) || 40;

    const localHx = Math.max(
      10,
      box ? (box.max.x - box.min.x) * 0.5 : rawW * 0.5
    );
    const localHy = Math.max(
      8,
      box ? (box.max.y - box.min.y) * 0.5 : rawH * 0.5
    );
    const localHz = Math.max(
      10,
      box ? (box.max.z - box.min.z) * 0.5 : rawD * 0.5
    );

    euler.set(
      toRadians(p.rotation?.[0] ?? 0),
      toRadians(p.rotation?.[1] ?? 0),
      toRadians(p.rotation?.[2] ?? 0)
    );
    rotMatrix.makeRotationFromEuler(euler);
    const me = rotMatrix.elements;

    const wx =
      Math.abs(me[0]) * localHx +
      Math.abs(me[4]) * localHy +
      Math.abs(me[8]) * localHz;
    const wy =
      Math.abs(me[1]) * localHx +
      Math.abs(me[5]) * localHy +
      Math.abs(me[9]) * localHz;
    const wz =
      Math.abs(me[2]) * localHx +
      Math.abs(me[6]) * localHy +
      Math.abs(me[10]) * localHz;

    const pos0Y = (p.position?.[1] ?? 0) + gy;
    assembledMinY = Math.min(assembledMinY, pos0Y - wy);

    for (const ef of sampleFactors) {
      const cx = (p.position?.[0] ?? 0) + (p.explode?.[0] ?? 0) * ef + gx;
      const cy = (p.position?.[1] ?? 0) + (p.explode?.[1] ?? 0) * ef + gy;
      const cz = (p.position?.[2] ?? 0) + (p.explode?.[2] ?? 0) * ef + gz;

      minX = Math.min(minX, cx - wx);
      maxX = Math.max(maxX, cx + wx);
      minY = Math.min(minY, cy - wy);
      maxY = Math.max(maxY, cy + wy + 12); // +12mm top callout clearance
      minZ = Math.min(minZ, cz - wz);
      maxZ = Math.max(maxZ, cz + wz);
    }
  }

  const spanX = Math.max(90, maxX - minX);
  const spanY = Math.max(110, maxY - minY);
  const spanZ = Math.max(90, maxZ - minZ);

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const fovRad = THREE.MathUtils.degToRad(options.fovDeg ?? 40);
  const tanHalfVFov = Math.tan(fovRad * 0.5);
  const effAspect = options.aspect ?? 1.38;

  // Projected spans from 3/4 perspective camera angle
  const maxHorizSpan = Math.max(spanX, spanZ, Math.hypot(spanX, spanZ) * 0.82);
  const projH = spanY * 0.96 + maxHorizSpan * 0.24;
  const projW = maxHorizSpan * 1.06;

  // Include generous padding for top/bottom HUD overlays and left legend box
  const distForHeight = (projH * 0.5 * 1.28) / tanHalfVFov;
  const distForWidth = (projW * 0.5 * 1.34) / (tanHalfVFov * effAspect);
  const boundingRadius = 0.5 * Math.hypot(spanX, spanY, spanZ);

  const fitDistance = Math.max(
    240,
    Math.min(1850, Math.max(distForHeight, distForWidth, boundingRadius * 2.28))
  );

  // Use a sleeker elevation angle on tall vertical assemblies so Coanda loops & towers face the camera cleanly
  const isTallAssembly = spanY > maxHorizSpan * 1.35;
  const rawDirX = 0.58;
  const rawDirY = isTallAssembly ? 0.26 : 0.34;
  const rawDirZ = 0.72;
  const dirLen = Math.hypot(rawDirX, rawDirY, rawDirZ);
  const dirX = rawDirX / dirLen;
  const dirY = rawDirY / dirLen;
  const dirZ = rawDirZ / dirLen;

  // Bias target slightly left so the 3D model sits in the open viewport right of the 256px legend
  const leftBias = options.leftLegendBias ?? 0.035;
  const targetX = Math.round(centerX - fitDistance * leftBias);
  const targetY = Math.round(centerY);
  const targetZ = Math.round(centerZ);

  const camX = Math.round(targetX + dirX * fitDistance);
  const camY = Math.round(targetY + dirY * fitDistance);
  const camZ = Math.round(targetZ + dirZ * fitDistance);

  const groundY = Math.min(
    -52,
    Math.floor((Number.isFinite(assembledMinY) ? assembledMinY : minY) - 10)
  );
  const gridSpan = Math.max(360, Math.round(Math.max(maxHorizSpan * 1.8, fitDistance * 0.72)));

  return {
    defaultTarget: [targetX, targetY, targetZ],
    defaultCamPos: [camX, camY, camZ],
    fitDistance,
    groundY,
    gridSpan,
    minY,
    maxY,
    spanY,
  };
}

/**
 * Centers and orients a raw STL BufferGeometry (generated on a Z-up print bed)
 * to Three.js Y-up local coordinates so it aligns with `design.json` position/rotation,
 * and sanity-scales the mesh if its bounding box deviates significantly from `targetDimsMm`.
 */
export function orientAndCenterStlGeometry(
  rawGeo: THREE.BufferGeometry,
  shape: PartShape | string,
  cadGrounded?: boolean,
  targetDimsMm?: [number, number, number]
): THREE.BufferGeometry {
  const geo = rawGeo.clone();
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const sizeX = box ? box.max.x - box.min.x : 30;
  const sizeY = box ? box.max.y - box.min.y : 30;
  const sizeZ = box ? box.max.z - box.min.z : 30;

  if (cadGrounded) {
    // OpenSCAD modules compiled by runCadAgent are built on the Z-up print bed;
    // rotate -90° around X so OpenSCAD +Z aligns with Three.js +Y.
    geo.rotateX(-Math.PI / 2);
  } else if (
    shape === "hook" ||
    shape === "bracketL" ||
    shape === "bracket" ||
    (sizeY > sizeX * 2.2 && sizeY > sizeZ * 2.2)
  ) {
    // Elongated stakes/hooks laid along Y on the print bed (e.g. drip-stake.stl)
    // already have their tall vertical axis along Y.
  } else {
    // Standard Z-up print bed STL (reservoir, lid, funnel, gear, pump mount, enclosure) ->
    // rotate -90° around X so print bed X-Y becomes horizontal X-Z and print Z becomes +Y.
    geo.rotateX(-Math.PI / 2);
  }

  geo.center();
  geo.computeBoundingBox();

  if (
    Array.isArray(targetDimsMm) &&
    targetDimsMm.length === 3 &&
    geo.boundingBox
  ) {
    const curX = Math.max(1, geo.boundingBox.max.x - geo.boundingBox.min.x);
    const curY = Math.max(1, geo.boundingBox.max.y - geo.boundingBox.min.y);
    const curZ = Math.max(1, geo.boundingBox.max.z - geo.boundingBox.min.z);
    const [tx, ty, tz] = targetDimsMm;
    if (tx > 4 && ty > 4 && tz > 4) {
      const errX = Math.abs(curX - tx) / tx;
      const errY = Math.abs(curY - ty) / ty;
      const errZ = Math.abs(curZ - tz) / tz;
      if (errX > 0.35 || errY > 0.35 || errZ > 0.35) {
        geo.scale(tx / curX, ty / curY, tz / curZ);
        geo.center();
      }
    }
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function isLowDetailProceduralStlHeader(ab: ArrayBuffer, vertexCount: number): boolean {
  if (ab.byteLength < 84) return true;
  try {
    const header = new TextDecoder()
      .decode(new Uint8Array(ab, 0, 80))
      .trim();
    // Reject procedural-fallback STLs ("GetMeAnAlt Binary STL") when OpenSCAD WASM didn't compile them
    if (header.startsWith("GetMeAnAlt Binary STL") && vertexCount <= 1200) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Synchronously decodes and parses an inline base64 binary STL (`part.stlBase64`)
 * compiled by `openscad-wasm`, falling back to `null` if invalid or a box/stub (<14 triangles).
 */
export function parseStlBase64Geometry(
  stlBase64: string | undefined,
  shape: PartShape | string,
  cacheKeyPrefix: string,
  cadGrounded?: boolean,
  targetDimsMm?: [number, number, number]
): THREE.BufferGeometry | null {
  if (!stlBase64 || typeof stlBase64 !== "string" || stlBase64.length < 64) {
    return null;
  }
  const dimsKey = Array.isArray(targetDimsMm) ? targetDimsMm.join("x") : "";
  const cacheKey = `b64:${cacheKeyPrefix}:${shape}:${
    cadGrounded ? "1" : "0"
  }:${dimsKey}:${stlBase64.length}:${stlBase64.slice(0, 32)}`;
  if (STL_GEOMETRY_CACHE.has(cacheKey)) {
    return STL_GEOMETRY_CACHE.get(cacheKey) ?? null;
  }
  try {
    let ab: ArrayBuffer | null = null;
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(stlBase64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      ab = bytes.buffer;
    }
    if (!ab || ab.byteLength < 84) {
      STL_GEOMETRY_CACHE.set(cacheKey, null);
      return null;
    }
    const parsed = getStlLoader().parse(ab);
    const posAttr = parsed.getAttribute("position");
    // Require >36 vertices (>12 triangles) and reject non-OpenSCAD procedural fallback stubs
    if (
      !posAttr ||
      posAttr.count <= 36 ||
      isLowDetailProceduralStlHeader(ab, posAttr.count)
    ) {
      STL_GEOMETRY_CACHE.set(cacheKey, null);
      return null;
    }
    const oriented = orientAndCenterStlGeometry(
      parsed,
      shape,
      cadGrounded,
      targetDimsMm
    );
    STL_GEOMETRY_CACHE.set(cacheKey, oriented);
    return oriented;
  } catch {
    STL_GEOMETRY_CACHE.set(cacheKey, null);
    return null;
  }
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
  stlFile?: string,
  cadGrounded?: boolean,
  targetDimsMm?: [number, number, number]
): Promise<THREE.BufferGeometry | null> {
  if (typeof window === "undefined") return null;

  const urls = getCandidateStlUrls(partId, projectId, stlFile);
  if (urls.length === 0) return null;

  const dimsKey = Array.isArray(targetDimsMm) ? targetDimsMm.join("x") : "";
  const cacheKey = `${projectId || "demo"}:${partId}:${shape}:${
    cadGrounded ? "1" : "0"
  }:${dimsKey}:${urls.join("|")}`;
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
        // Reject the 2-facet (6-vertex) missing-file stub, 12-facet box stub, or procedural fallback header
        if (
          !posAttr ||
          posAttr.count <= 36 ||
          isLowDetailProceduralStlHeader(buf, posAttr.count)
        ) {
          continue;
        }
        const oriented = orientAndCenterStlGeometry(
          parsed,
          shape,
          cadGrounded,
          targetDimsMm
        );
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
 * via inline `stlBase64` or `STLLoader`, falling back seamlessly to procedural shapes when unavailable.
 */
export function usePartGeometryAndEdges(
  part: Pick<
    ResolvedAssemblyPart,
    | "partId"
    | "category"
    | "shape"
    | "params"
    | "dims_mm"
    | "stlFile"
    | "stlBase64"
    | "cadGrounded"
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

  const hasRolePreset = Boolean(
    part.params &&
      typeof part.params.rolePreset === "string" &&
      part.params.rolePreset.length > 0
  );

  const inlineStlGeometry = useMemo(() => {
    if (part.category !== "printed" || hasRolePreset || !part.stlBase64) {
      return null;
    }
    return parseStlBase64Geometry(
      part.stlBase64,
      part.shape,
      `${projectId || "live"}:${part.partId}`,
      part.cadGrounded,
      part.dims_mm
    );
  }, [
    part.category,
    hasRolePreset,
    part.stlBase64,
    part.shape,
    part.partId,
    part.cadGrounded,
    part.dims_mm,
    projectId,
  ]);

  const [stlGeo, setStlGeo] = useState<THREE.BufferGeometry | null>(() => {
    if (part.category !== "printed" || hasRolePreset) return null;
    if (inlineStlGeometry) return inlineStlGeometry;
    const urls = getCandidateStlUrls(part.partId, projectId, part.stlFile);
    const dimsKey = Array.isArray(part.dims_mm) ? part.dims_mm.join("x") : "";
    const cacheKey = `${projectId || "demo"}:${part.partId}:${part.shape}:${
      part.cadGrounded ? "1" : "0"
    }:${dimsKey}:${urls.join("|")}`;
    return STL_GEOMETRY_CACHE.get(cacheKey) ?? null;
  });

  useEffect(() => {
    if (part.category !== "printed" || hasRolePreset) {
      setStlGeo(null);
      return;
    }
    if (inlineStlGeometry) {
      setStlGeo(inlineStlGeometry);
      return;
    }
    let cancelled = false;
    loadPartStlGeometry(
      part.partId,
      part.shape,
      projectId,
      part.stlFile,
      part.cadGrounded,
      part.dims_mm
    ).then((loaded) => {
      if (!cancelled && loaded) {
        setStlGeo(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    part.partId,
    part.category,
    part.shape,
    part.stlFile,
    part.cadGrounded,
    part.dims_mm,
    inlineStlGeometry,
    projectId,
    hasRolePreset,
  ]);

  const resolvedStl = inlineStlGeometry || stlGeo;
  const activeGeometry = resolvedStl || fallbackGeometry;

  const activeEdges = useMemo(() => {
    if (!resolvedStl) return fallbackEdges;
    const edgeKey = `stl:${projectId || "demo"}:${part.partId}:${edgeThresholdAngle}`;
    const cached = STL_EDGES_CACHE.get(edgeKey);
    if (cached) return cached;
    const computed = new THREE.EdgesGeometry(resolvedStl, edgeThresholdAngle);
    STL_EDGES_CACHE.set(edgeKey, computed);
    return computed;
  }, [resolvedStl, fallbackEdges, projectId, part.partId, edgeThresholdAngle]);

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
    isStlLoaded: Boolean(resolvedStl),
  };
}

