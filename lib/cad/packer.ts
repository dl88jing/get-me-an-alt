import { PrinterBed } from "../printers";
import { generatePartMesh, TriangleMesh } from "./geometry";
import { DesignPart, PrintedPart } from "./parts";

export interface PackInputPart {
  partId: string;
  name?: string;
  /** X footprint dimension in mm */
  width: number;
  /** Y footprint dimension in mm */
  depth: number;
  /** Z height dimension in mm */
  height: number;
  /** Number of copies to pack */
  quantity: number;
}

export interface PackOptions {
  /** Margin from outer bed edges in mm (default 5 mm) */
  margin?: number;
  /** Minimum clearance between adjacent parts in mm (default 5 mm) */
  spacing?: number;
  /** Allow 90-degree Z rotation when packing (default true) */
  allowRotation?: boolean;
}

export interface PackedPlateItem {
  partId: string;
  /** 1-based copy index (1..quantity) */
  copy: number;
  /** Placed min-corner X coordinate on bed in mm (includes bed margin) */
  x: number;
  /** Placed min-corner Y coordinate on bed in mm (includes bed margin) */
  y: number;
  /** True if rotated 90 degrees in XY */
  rotated: boolean;
  /** Placed X width in mm (after rotation if rotated) */
  width: number;
  /** Placed Y depth in mm (after rotation if rotated) */
  depth: number;
  /** Part Z height in mm */
  height: number;
  /** Center X coordinate on bed in mm */
  centerX: number;
  /** Center Y coordinate on bed in mm */
  centerY: number;
}

export interface PackedPlate {
  /** 0-based plate index */
  index: number;
  /** Parts placed on this plate */
  items: PackedPlateItem[];
  /** Ratio (0..1) of total part footprint area to usable bed area */
  utilization: number;
  /** Maximum Z height of parts on this plate in mm */
  maxHeight: number;
}

export interface RejectedPart {
  partId: string;
  name?: string;
  width: number;
  depth: number;
  height: number;
  quantity: number;
  reasons: string[];
  suggestion: string;
}

export interface PackResult {
  plates: PackedPlate[];
  rejected: RejectedPart[];
  bed: PrinterBed;
  margin: number;
  spacing: number;
  heuristicUsed: string;
}

interface ExpandedItem {
  partId: string;
  copy: number;
  width: number;
  depth: number;
  height: number;
  area: number;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type MaxRectsRule = "BSSF" | "BLSF" | "BAF" | "BL";

interface PlacementCandidate {
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  score1: number;
  score2: number;
}

const EPS = 1e-6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function rectsOverlap(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x < b.x + b.w - EPS &&
    a.x + a.w > b.x + EPS &&
    a.y < b.y + b.h - EPS &&
    a.y + a.h > b.y + EPS
  );
}

function isContainedIn(a: FreeRect, b: FreeRect): boolean {
  return (
    a.x >= b.x - EPS &&
    a.y >= b.y - EPS &&
    a.x + a.w <= b.x + b.w + EPS &&
    a.y + a.h <= b.y + b.h + EPS
  );
}

/**
 * Single-plate 2D MaxRects bin packer operating on spacing-inflated dimensions.
 */
class MaxRectsBin {
  readonly binW: number;
  readonly binH: number;
  freeRects: FreeRect[];
  placed: PackedPlateItem[] = [];

  constructor(usableW: number, usableD: number, spacing: number) {
    this.binW = usableW + spacing;
    this.binH = usableD + spacing;
    this.freeRects = [{ x: 0, y: 0, w: this.binW, h: this.binH }];
  }

  findCandidate(
    inflatedW: number,
    inflatedH: number,
    allowRotation: boolean,
    rule: MaxRectsRule
  ): PlacementCandidate | null {
    let best: PlacementCandidate | null = null;

    const tryOrientation = (w: number, h: number, rotated: boolean) => {
      for (const fr of this.freeRects) {
        if (w <= fr.w + EPS && h <= fr.h + EPS) {
          const leftoverW = Math.abs(fr.w - w);
          const leftoverH = Math.abs(fr.h - h);
          const shortSide = Math.min(leftoverW, leftoverH);
          const longSide = Math.max(leftoverW, leftoverH);
          const areaFit = fr.w * fr.h - w * h;

          let score1 = 0;
          let score2 = 0;
          switch (rule) {
            case "BSSF":
              score1 = shortSide;
              score2 = longSide;
              break;
            case "BLSF":
              score1 = longSide;
              score2 = shortSide;
              break;
            case "BAF":
              score1 = areaFit;
              score2 = shortSide;
              break;
            case "BL":
              score1 = fr.y + h;
              score2 = fr.x;
              break;
          }

          if (
            !best ||
            score1 < best.score1 - EPS ||
            (Math.abs(score1 - best.score1) <= EPS && score2 < best.score2 - EPS)
          ) {
            best = { x: fr.x, y: fr.y, w, h, rotated, score1, score2 };
          }
        }
      }
    };

    tryOrientation(inflatedW, inflatedH, false);
    if (allowRotation && Math.abs(inflatedW - inflatedH) > EPS) {
      tryOrientation(inflatedH, inflatedW, true);
    }

    return best;
  }

  commitPlacement(
    cand: PlacementCandidate,
    item: ExpandedItem,
    margin: number,
    spacing: number
  ): void {
    const used: FreeRect = { x: cand.x, y: cand.y, w: cand.w, h: cand.h };
    const nextFree: FreeRect[] = [];

    for (const fr of this.freeRects) {
      if (!rectsOverlap(fr, used)) {
        nextFree.push(fr);
        continue;
      }
      // Split free rectangle around used rectangle
      if (used.x > fr.x + EPS && used.x < fr.x + fr.w - EPS) {
        nextFree.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
      }
      if (used.x + used.w < fr.x + fr.w - EPS) {
        nextFree.push({
          x: used.x + used.w,
          y: fr.y,
          w: fr.x + fr.w - (used.x + used.w),
          h: fr.h,
        });
      }
      if (used.y > fr.y + EPS && used.y < fr.y + fr.h - EPS) {
        nextFree.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
      }
      if (used.y + used.h < fr.y + fr.h - EPS) {
        nextFree.push({
          x: fr.x,
          y: used.y + used.h,
          w: fr.w,
          h: fr.y + fr.h - (used.y + used.h),
        });
      }
    }

    // Prune redundant contained free rectangles
    const pruned: FreeRect[] = [];
    for (let i = 0; i < nextFree.length; i++) {
      let contained = false;
      for (let j = 0; j < nextFree.length; j++) {
        if (i !== j && isContainedIn(nextFree[i], nextFree[j])) {
          if (
            i > j ||
            Math.abs(nextFree[i].w - nextFree[j].w) > EPS ||
            Math.abs(nextFree[i].h - nextFree[j].h) > EPS
          ) {
            contained = true;
            break;
          }
        }
      }
      if (!contained) {
        pruned.push(nextFree[i]);
      }
    }
    this.freeRects = pruned;

    const placedW = cand.rotated ? item.depth : item.width;
    const placedD = cand.rotated ? item.width : item.depth;
    const bedX = round2(margin + cand.x);
    const bedY = round2(margin + cand.y);

    this.placed.push({
      partId: item.partId,
      copy: item.copy,
      x: bedX,
      y: bedY,
      rotated: cand.rotated,
      width: round2(placedW),
      depth: round2(placedD),
      height: round2(item.height),
      centerX: round2(bedX + placedW * 0.5),
      centerY: round2(bedY + placedD * 0.5),
    });
  }
}

interface SkylineNode {
  x: number;
  y: number;
  w: number;
}

/**
 * Single-plate 2D Skyline (Bottom-Left / Min-Waste) bin packer.
 */
class SkylineBin {
  readonly binW: number;
  readonly binH: number;
  skyline: SkylineNode[];
  placed: PackedPlateItem[] = [];

  constructor(usableW: number, usableD: number, spacing: number) {
    this.binW = usableW + spacing;
    this.binH = usableD + spacing;
    this.skyline = [{ x: 0, y: 0, w: this.binW }];
  }

  private fitsAt(nodeIdx: number, w: number, h: number): { y: number; waste: number } | null {
    const x = this.skyline[nodeIdx].x;
    if (x + w > this.binW + EPS) return null;

    let widthLeft = w;
    let i = nodeIdx;
    let maxY = this.skyline[nodeIdx].y;

    while (widthLeft > EPS) {
      if (i >= this.skyline.length) return null;
      if (this.skyline[i].y > maxY) {
        maxY = this.skyline[i].y;
      }
      if (maxY + h > this.binH + EPS) return null;
      widthLeft -= this.skyline[i].w;
      i++;
    }

    // Compute wasted area underneath the rectangle
    let waste = 0;
    let rem = w;
    for (let k = nodeIdx; k < this.skyline.length && rem > EPS; k++) {
      const segW = Math.min(rem, this.skyline[k].w);
      waste += segW * (maxY - this.skyline[k].y);
      rem -= segW;
    }

    return { y: maxY, waste };
  }

  findCandidate(
    inflatedW: number,
    inflatedH: number,
    allowRotation: boolean,
    mode: "BL" | "MW"
  ): (PlacementCandidate & { nodeIdx: number }) | null {
    let best: (PlacementCandidate & { nodeIdx: number }) | null = null;

    const tryOrientation = (w: number, h: number, rotated: boolean) => {
      for (let i = 0; i < this.skyline.length; i++) {
        const fit = this.fitsAt(i, w, h);
        if (!fit) continue;

        const score1 = mode === "BL" ? fit.y + h : fit.waste;
        const score2 = mode === "BL" ? fit.waste : fit.y + h;

        if (
          !best ||
          score1 < best.score1 - EPS ||
          (Math.abs(score1 - best.score1) <= EPS && score2 < best.score2 - EPS) ||
          (Math.abs(score1 - best.score1) <= EPS &&
            Math.abs(score2 - best.score2) <= EPS &&
            this.skyline[i].x < best.x - EPS)
        ) {
          best = {
            x: this.skyline[i].x,
            y: fit.y,
            w,
            h,
            rotated,
            score1,
            score2,
            nodeIdx: i,
          };
        }
      }
    };

    tryOrientation(inflatedW, inflatedH, false);
    if (allowRotation && Math.abs(inflatedW - inflatedH) > EPS) {
      tryOrientation(inflatedH, inflatedW, true);
    }

    return best;
  }

  commitPlacement(
    cand: PlacementCandidate & { nodeIdx: number },
    item: ExpandedItem,
    margin: number,
    spacing: number
  ): void {
    const newNode: SkylineNode = {
      x: cand.x,
      y: cand.y + cand.h,
      w: cand.w,
    };

    this.skyline.splice(cand.nodeIdx, 0, newNode);

    for (let i = cand.nodeIdx + 1; i < this.skyline.length; i++) {
      const prev = this.skyline[i - 1];
      const curr = this.skyline[i];
      if (curr.x < prev.x + prev.w - EPS) {
        const shrink = prev.x + prev.w - curr.x;
        curr.x += shrink;
        curr.w -= shrink;
        if (curr.w <= EPS) {
          this.skyline.splice(i, 1);
          i--;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Merge adjacent skyline segments with identical Y
    for (let i = 0; i < this.skyline.length - 1; i++) {
      if (Math.abs(this.skyline[i].y - this.skyline[i + 1].y) <= EPS) {
        this.skyline[i].w += this.skyline[i + 1].w;
        this.skyline.splice(i + 1, 1);
        i--;
      }
    }

    const placedW = cand.rotated ? item.depth : item.width;
    const placedD = cand.rotated ? item.width : item.depth;
    const bedX = round2(margin + cand.x);
    const bedY = round2(margin + cand.y);

    this.placed.push({
      partId: item.partId,
      copy: item.copy,
      x: bedX,
      y: bedY,
      rotated: cand.rotated,
      width: round2(placedW),
      depth: round2(placedD),
      height: round2(item.height),
      centerX: round2(bedX + placedW * 0.5),
      centerY: round2(bedY + placedD * 0.5),
    });
  }
}

function runMaxRectsStrategy(
  items: ExpandedItem[],
  usableW: number,
  usableD: number,
  margin: number,
  spacing: number,
  allowRotation: boolean,
  rule: MaxRectsRule,
  bestFitAcrossBins: boolean
): PackedPlateItem[][] {
  const bins: MaxRectsBin[] = [];

  for (const item of items) {
    const infW = item.width + spacing;
    const infH = item.depth + spacing;

    let chosenBin: MaxRectsBin | null = null;
    let chosenCand: PlacementCandidate | null = null;

    for (const bin of bins) {
      const cand = bin.findCandidate(infW, infH, allowRotation, rule);
      if (cand) {
        if (!bestFitAcrossBins) {
          chosenBin = bin;
          chosenCand = cand;
          break;
        }
        if (
          !chosenCand ||
          cand.score1 < chosenCand.score1 - EPS ||
          (Math.abs(cand.score1 - chosenCand.score1) <= EPS &&
            cand.score2 < chosenCand.score2 - EPS)
        ) {
          chosenBin = bin;
          chosenCand = cand;
        }
      }
    }

    if (!chosenBin || !chosenCand) {
      chosenBin = new MaxRectsBin(usableW, usableD, spacing);
      chosenCand = chosenBin.findCandidate(infW, infH, allowRotation, rule)!;
      bins.push(chosenBin);
    }

    chosenBin.commitPlacement(chosenCand, item, margin, spacing);
  }

  return bins.map((b) => b.placed);
}

function runSkylineStrategy(
  items: ExpandedItem[],
  usableW: number,
  usableD: number,
  margin: number,
  spacing: number,
  allowRotation: boolean,
  mode: "BL" | "MW",
  bestFitAcrossBins: boolean
): PackedPlateItem[][] {
  const bins: SkylineBin[] = [];

  for (const item of items) {
    const infW = item.width + spacing;
    const infH = item.depth + spacing;

    let chosenBin: SkylineBin | null = null;
    let chosenCand: (PlacementCandidate & { nodeIdx: number }) | null = null;

    for (const bin of bins) {
      const cand = bin.findCandidate(infW, infH, allowRotation, mode);
      if (cand) {
        if (!bestFitAcrossBins) {
          chosenBin = bin;
          chosenCand = cand;
          break;
        }
        if (
          !chosenCand ||
          cand.score1 < chosenCand.score1 - EPS ||
          (Math.abs(cand.score1 - chosenCand.score1) <= EPS &&
            cand.score2 < chosenCand.score2 - EPS)
        ) {
          chosenBin = bin;
          chosenCand = cand;
        }
      }
    }

    if (!chosenBin || !chosenCand) {
      chosenBin = new SkylineBin(usableW, usableD, spacing);
      chosenCand = chosenBin.findCandidate(infW, infH, allowRotation, mode)!;
      bins.push(chosenBin);
    }

    chosenBin.commitPlacement(chosenCand, item, margin, spacing);
  }

  return bins.map((b) => b.placed);
}

function evaluatePackingEnvelopeScore(plates: PackedPlateItem[][]): number {
  if (plates.length === 0) return 0;
  // Tie-breaker: minimize bounding envelope area across plates (especially the last plate)
  let score = 0;
  for (let p = 0; p < plates.length; p++) {
    let maxX = 0;
    let maxY = 0;
    for (const item of plates[p]) {
      if (item.x + item.width > maxX) maxX = item.x + item.width;
      if (item.y + item.depth > maxY) maxY = item.y + item.depth;
    }
    const weight = p === plates.length - 1 ? 2.0 : 1.0;
    score += maxX * maxY * weight;
  }
  return score;
}

/**
 * Packs a list of parts (with quantities, footprint dimensions, and heights) onto the minimum
 * number of build plates for a given printer bed using multi-heuristic MaxRects & Skyline packing.
 *
 * Defaults: 5 mm bed margin, 5 mm inter-part spacing, 90-degree rotation enabled.
 */
export function packParts(
  parts: PackInputPart[],
  bed: PrinterBed,
  options: PackOptions = {}
): PackResult {
  const margin = options.margin ?? 5;
  const spacing = options.spacing ?? 5;
  const allowRotation = options.allowRotation ?? true;

  const usableW = Math.max(1, bed.x - 2 * margin);
  const usableD = Math.max(1, bed.y - 2 * margin);
  const usableArea = usableW * usableD;

  const rejected: RejectedPart[] = [];
  const expanded: ExpandedItem[] = [];

  for (const part of parts) {
    const qty = Math.max(0, Math.floor(part.quantity));
    if (qty === 0) continue;

    const w = Math.max(0.5, part.width);
    const d = Math.max(0.5, part.depth);
    const h = Math.max(0.5, part.height);

    const fitsNormal = w <= usableW + EPS && d <= usableD + EPS;
    const fitsRotated = allowRotation && d <= usableW + EPS && w <= usableD + EPS;
    const fitsFootprint = fitsNormal || fitsRotated;
    const fitsHeight = h <= bed.z + EPS;

    if (!fitsFootprint || !fitsHeight) {
      const reasons: string[] = [];
      const suggestions: string[] = [];

      if (!fitsFootprint) {
        reasons.push(
          `Footprint ${round2(w)}x${round2(d)} mm exceeds printable bed area ${round2(usableW)}x${round2(usableD)} mm (with ${margin} mm margin).`
        );
        const maxBedSide = Math.max(usableW, usableD);
        const cutsX = Math.max(2, Math.ceil(Math.max(w, d) / (maxBedSide - 10)));
        suggestions.push(
          `Split part into ${cutsX} interlocking sections along the longest axis with dovetail tabs or M3 bolt flanges.`
        );
      }
      if (!fitsHeight) {
        reasons.push(
          `Height ${round2(h)} mm exceeds printer max Z height ${bed.z} mm.`
        );
        const cutsZ = Math.max(2, Math.ceil(h / (bed.z - 5)));
        suggestions.push(
          `Split horizontally into ${cutsZ} stacked tiers with 4 mm alignment dowel pins.`
        );
      }

      rejected.push({
        partId: part.partId,
        name: part.name,
        width: round2(w),
        depth: round2(d),
        height: round2(h),
        quantity: qty,
        reasons,
        suggestion: suggestions.join(" "),
      });
      continue;
    }

    for (let c = 1; c <= qty; c++) {
      expanded.push({
        partId: part.partId,
        copy: c,
        width: w,
        depth: d,
        height: h,
        area: w * d,
      });
    }
  }

  if (expanded.length === 0) {
    return {
      plates: [],
      rejected,
      bed,
      margin,
      spacing,
      heuristicUsed: "none",
    };
  }

  // Candidate sorting heuristics (area descending is primary as required)
  const sortings: Array<{ name: string; items: ExpandedItem[] }> = [
    {
      name: "area-desc",
      items: [...expanded].sort(
        (a, b) =>
          b.area - a.area ||
          Math.max(b.width, b.depth) - Math.max(a.width, a.depth) ||
          a.partId.localeCompare(b.partId) ||
          a.copy - b.copy
      ),
    },
    {
      name: "max-side-desc",
      items: [...expanded].sort(
        (a, b) =>
          Math.max(b.width, b.depth) - Math.max(a.width, a.depth) ||
          b.area - a.area ||
          a.partId.localeCompare(b.partId) ||
          a.copy - b.copy
      ),
    },
    {
      name: "perimeter-desc",
      items: [...expanded].sort(
        (a, b) =>
          b.width + b.depth - (a.width + a.depth) ||
          b.area - a.area ||
          a.partId.localeCompare(b.partId) ||
          a.copy - b.copy
      ),
    },
    {
      name: "min-side-desc",
      items: [...expanded].sort(
        (a, b) =>
          Math.min(b.width, b.depth) - Math.min(a.width, a.depth) ||
          b.area - a.area ||
          a.partId.localeCompare(b.partId) ||
          a.copy - b.copy
      ),
    },
  ];

  const maxRectsRules: MaxRectsRule[] = ["BSSF", "BLSF", "BAF", "BL"];
  const skylineModes: Array<"BL" | "MW"> = ["BL", "MW"];

  let bestPlates = null as PackedPlateItem[][] | null;
  let bestEnvelopeScore = Infinity;
  let bestHeuristicName = "";

  const considerSolution = (candidate: PackedPlateItem[][], name: string) => {
    const envScore = evaluatePackingEnvelopeScore(candidate);
    if (
      !bestPlates ||
      candidate.length < bestPlates.length ||
      (candidate.length === bestPlates.length && envScore < bestEnvelopeScore - EPS)
    ) {
      bestPlates = candidate;
      bestEnvelopeScore = envScore;
      bestHeuristicName = name;
    }
  };

  for (const sorting of sortings) {
    for (const bestFit of [true, false]) {
      const bfTag = bestFit ? "BF" : "FF";
      for (const rule of maxRectsRules) {
        const res = runMaxRectsStrategy(
          sorting.items,
          usableW,
          usableD,
          margin,
          spacing,
          allowRotation,
          rule,
          bestFit
        );
        considerSolution(res, `MaxRects-${rule}-${bfTag} (${sorting.name})`);
      }

      for (const mode of skylineModes) {
        const res = runSkylineStrategy(
          sorting.items,
          usableW,
          usableD,
          margin,
          spacing,
          allowRotation,
          mode,
          bestFit
        );
        considerSolution(res, `Skyline-${mode}-${bfTag} (${sorting.name})`);
      }
    }
  }

  const finalBins = bestPlates ?? [];
  const plates: PackedPlate[] = finalBins.map((items, index) => {
    let areaSum = 0;
    let maxHeight = 0;
    for (const it of items) {
      areaSum += it.width * it.depth;
      if (it.height > maxHeight) maxHeight = it.height;
    }
    const utilization = round4(Math.min(1, areaSum / usableArea));
    return {
      index,
      items,
      utilization,
      maxHeight: round2(maxHeight),
    };
  });

  return {
    plates,
    rejected,
    bed,
    margin,
    spacing,
    heuristicUsed: bestHeuristicName,
  };
}

/**
 * Convenience helper: generates meshes (or uses precomputed meshes) for `PrintedPart[]` or `DesignPart[]`,
 * filters to printed parts (`kind !== "purchased"`), extracts their Z-up bounding boxes, and packs them
 * onto the minimum number of plates.
 */
export function packPrintedParts(
  parts: Array<PrintedPart | DesignPart>,
  bed: PrinterBed,
  options: PackOptions = {},
  precomputedMeshes?: Map<string, TriangleMesh>
): PackResult {
  const printedOnly = parts.filter(
    (p) => !("kind" in p) || p.kind === undefined || p.kind === "printed"
  );
  const inputParts: PackInputPart[] = printedOnly.map((part) => {
    const mesh = precomputedMeshes?.get(part.id) ?? generatePartMesh(part);
    const [width, depth, height] = mesh.bbox.size;
    return {
      partId: part.id,
      name: part.name,
      width,
      depth,
      height,
      quantity: Math.max(1, Math.floor(part.quantity ?? 1)),
    };
  });

  return packParts(inputParts, bed, options);
}
