"use client";

import React, { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows } from "@react-three/drei";
import {
  AnyPlatesInput,
  AnyDesignInput,
  PlateItemFootprint,
  PartParams,
} from "./types";
import {
  adaptDesign,
  adaptPlates,
  DEFAULT_PRINTED_PALETTE,
  toRenaissancePartColor,
} from "./adapters";
import { buildPartGeometry, buildPartEdgesGeometry } from "./shapes";

export interface PlatePreviewProps {
  plates: AnyPlatesInput;
  design?: AnyDesignInput;
  projectId?: string;
  initialPlateIndex?: number;
  initialViewMode?: "2d" | "3d";
  className?: string;
}

const FOOTPRINT_PALETTE = DEFAULT_PRINTED_PALETTE;

function normalizeUtilizationPct(
  rawUtil: number | undefined,
  items: PlateItemFootprint[],
  bedX: number,
  bedY: number
): number {
  if (typeof rawUtil === "number" && Number.isFinite(rawUtil) && rawUtil > 0) {
    const pct = rawUtil <= 1 ? rawUtil * 100 : rawUtil;
    return Math.min(100, Math.max(0, pct));
  }
  const bedArea = Math.max(1, bedX * bedY);
  const usedArea = items.reduce(
    (acc, item) => acc + Math.max(0, item.w * item.h),
    0
  );
  return Math.min(100, (usedArea / bedArea) * 100);
}

export const PlatePreview: React.FC<PlatePreviewProps> = ({
  plates,
  design,
  initialPlateIndex = 0,
  initialViewMode = "2d",
  className = "",
}) => {
  const adaptedPlates = useMemo(() => adaptPlates(plates), [plates]);
  const adaptedDesign = useMemo(
    () => (design ? adaptDesign(design) : undefined),
    [design]
  );

  const plateList = adaptedPlates.plates ?? [];
  const [selectedPlateIdx, setSelectedPlateIdx] = useState<number>(
    Math.min(initialPlateIndex, Math.max(0, plateList.length - 1))
  );
  const [hoveredItemIdx, setHoveredItemIdx] = useState<number | null>(null);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(0);
  const [viewMode, setViewMode] = useState<"2d" | "3d">(initialViewMode);

  const bedX = adaptedPlates.printer?.bed?.x || 256;
  const bedY = adaptedPlates.printer?.bed?.y || 256;
  const printerName = adaptedPlates.printer?.name || "Bambu Lab A1";

  const activePlate = plateList[selectedPlateIdx] ?? {
    index: 1,
    items: [],
    utilization: 0,
  };

  const printedLookup = useMemo(() => {
    const map = new Map<
      string,
      { shape: string; params: PartParams; color?: string }
    >();
    (adaptedDesign?.printed ?? []).forEach((p) => {
      map.set(p.id, { shape: p.shape, params: p.params, color: p.color });
    });
    return map;
  }, [adaptedDesign]);

  const enrichedItems = useMemo(() => {
    return (activePlate.items ?? []).map((item, idx) => {
      const matched = printedLookup.get(item.partId);
      const color = toRenaissancePartColor(
        item.color || matched?.color || FOOTPRINT_PALETTE[idx % FOOTPRINT_PALETTE.length],
        "printed",
        idx
      );

      // Clamp footprint coordinates cleanly inside [4 .. bed - w - 4] so it never clips outside the bed
      const w = Math.min(bedX - 8, Math.max(8, item.w || 30));
      const h = Math.min(bedY - 8, Math.max(8, item.h || 30));
      const x = Math.min(bedX - w - 4, Math.max(4, item.x ?? 10));
      const y = Math.min(bedY - h - 4, Math.max(4, item.y ?? 10));

      return {
        ...item,
        x,
        y,
        w,
        h,
        color,
        shape: matched?.shape || "box",
        params: matched?.params || { w, h: 20, d: h },
      };
    });
  }, [activePlate.items, printedLookup, bedX, bedY]);

  const utilizationPct = useMemo(
    () =>
      normalizeUtilizationPct(
        activePlate.utilization,
        enrichedItems,
        bedX,
        bedY
      ),
    [activePlate.utilization, enrichedItems, bedX, bedY]
  );

  const totalUsedMm2 = useMemo(
    () => enrichedItems.reduce((sum, item) => sum + item.w * item.h, 0),
    [enrichedItems]
  );

  const majorTicksX = useMemo(() => {
    const ticks: number[] = [];
    for (let x = 0; x <= bedX; x += 50) ticks.push(x);
    if (ticks[ticks.length - 1] !== bedX) ticks.push(bedX);
    return ticks;
  }, [bedX]);

  const majorTicksY = useMemo(() => {
    const ticks: number[] = [];
    for (let y = 0; y <= bedY; y += 50) ticks.push(y);
    if (ticks[ticks.length - 1] !== bedY) ticks.push(bedY);
    return ticks;
  }, [bedY]);

  const activeItem =
    (hoveredItemIdx !== null ? enrichedItems[hoveredItemIdx] : null) ??
    (selectedItemIdx !== null ? enrichedItems[selectedItemIdx] : null) ??
    enrichedItems[0] ??
    null;

  // SVG viewport padding for rulers
  const padL = 36;
  const padT = 26;
  const padR = 24;
  const padB = 34;
  const svgW = bedX + padL + padR;
  const svgH = bedY + padT + padB;

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden bg-[#0c0906] border border-[#d4af37]/30 shadow-2xl text-[#f5ebd6] flex flex-col select-none ${className}`}
      data-testid="plate-preview-root"
    >
      {/* Header Bar: Printer Info + Plate Tabs + 2D/3D Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#14100b]/92 border-b border-[#d4af37]/25">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/45 flex items-center justify-center text-[#f3d478] font-codex text-xs font-bold">
            STL
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3
                className="font-display text-base font-bold text-[#f5ebd6] tracking-tight"
                data-testid="printer-name-heading"
              >
                {printerName}
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#0c0906] text-[#f3d478] border border-[#d4af37]/30">
                {bedX} × {bedY} mm Bed
              </span>
            </div>
            <p className="text-[11px] text-[#bda782] mt-0.5">
              2D bin-packed build plates · Minimal support orientation ·
              Textured PEI sheet
            </p>
          </div>
        </div>

        {/* Plate Tabs + View Mode Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="inline-flex rounded-xl bg-[#0c0906] p-1 border border-[#d4af37]/25"
            role="tablist"
            aria-label="Build plates"
          >
            {plateList.map((p, idx) => {
              const isSelected = idx === selectedPlateIdx;
              const pUtil = normalizeUtilizationPct(
                p.utilization,
                p.items || [],
                bedX,
                bedY
              );
              return (
                <button
                  key={p.index ?? idx}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedPlateIdx(idx);
                    setSelectedItemIdx(0);
                    setHoveredItemIdx(null);
                  }}
                  data-testid={`plate-tab-${idx + 1}`}
                  className={`px-3 py-1.5 rounded-lg font-codex text-xs font-bold tracking-wide transition-all flex items-center gap-2 ${
                    isSelected
                      ? "bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/50 shadow-sm"
                      : "text-[#bda782] hover:text-[#f5ebd6] border border-transparent"
                  }`}
                >
                  <span>Plate {p.index ?? idx + 1}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      isSelected
                        ? "bg-[#d4af37] text-[#140e07] font-bold"
                        : "bg-[#1d1710] text-[#bda782]"
                    }`}
                  >
                    {p.items?.length ?? 0} pcs · {Math.round(pUtil)}%
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2D Top-Down vs 3D Bed Preview Switch */}
          <div className="inline-flex rounded-xl bg-[#0c0906] p-1 border border-[#d4af37]/25">
            <button
              type="button"
              onClick={() => setViewMode("2d")}
              data-testid="plate-mode-2d"
              className={`px-2.5 py-1 rounded-lg font-codex text-xs font-bold tracking-wide transition-colors ${
                viewMode === "2d"
                  ? "bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/50"
                  : "text-[#bda782] hover:text-[#f5ebd6]"
              }`}
            >
              Top-Down 2D
            </button>
            <button
              type="button"
              onClick={() => setViewMode("3d")}
              data-testid="plate-mode-3d"
              className={`px-2.5 py-1 rounded-lg font-codex text-xs font-bold tracking-wide transition-colors ${
                viewMode === "3d"
                  ? "bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/50"
                  : "text-[#bda782] hover:text-[#f5ebd6]"
              }`}
            >
              3D Slicer Bed
            </button>
          </div>
        </div>
      </div>

      {/* Utilization Bar Banner */}
      <div className="px-5 py-2.5 bg-[#14100b]/75 border-b border-[#d4af37]/20 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <span className="font-codex text-xs font-bold uppercase tracking-wider text-[#e6d3b3] shrink-0">
            Bed Utilization:
          </span>
          <div className="flex-1 h-2.5 rounded-full bg-[#282016] overflow-hidden border border-[#d4af37]/25">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#b89b4a] via-[#d4af37] to-[#f3d478] transition-all duration-500"
              style={{ width: `${Math.max(4, utilizationPct)}%` }}
              data-testid="utilization-bar-fill"
            />
          </div>
          <span
            className="text-xs font-mono font-bold text-[#f3d478] shrink-0"
            data-testid="utilization-percentage"
          >
            {utilizationPct.toFixed(1)}%
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-[#bda782]">
          <span>
            Parts:{" "}
            <strong className="text-[#f5ebd6]">{enrichedItems.length}</strong>
          </span>
          <span>
            Footprint:{" "}
            <strong className="text-[#f5ebd6]">
              {(totalUsedMm2 / 100).toFixed(1)} cm²
            </strong>{" "}
            / {((bedX * bedY) / 100).toFixed(0)} cm²
          </span>
        </div>
      </div>

      {/* Main Content Split: Left Top-Down Bed Render + Right Part Table & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
        {/* Left 8 Cols: Top-Down Build Plate Render */}
        <div className="lg:col-span-8 p-5 flex items-center justify-center bg-[#0c0906] relative overflow-hidden">
          {viewMode === "2d" ? (
            <div className="w-full max-w-[490px] aspect-square flex items-center justify-center">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-full drop-shadow-2xl"
                data-testid="plate-svg"
              >
                <defs>
                  {/* 10mm minor grid pattern */}
                  <pattern
                    id="minorGrid10"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 10 0 L 0 0 0 10"
                      fill="none"
                      stroke="#282016"
                      strokeWidth="0.45"
                    />
                  </pattern>
                  {/* 50mm major grid pattern */}
                  <pattern
                    id="majorGrid50"
                    width="50"
                    height="50"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="50" height="50" fill="url(#minorGrid10)" />
                    <path
                      d="M 50 0 L 0 0 0 50"
                      fill="none"
                      stroke="#3b2a1a"
                      strokeWidth="0.9"
                    />
                  </pattern>
                </defs>

                {/* Top PEI wiper tab ear */}
                <rect
                  x={padL + bedX * 0.34}
                  y={padT - 10}
                  width={bedX * 0.32}
                  height={12}
                  rx={3}
                  fill="#14100b"
                  stroke="#5c4930"
                  strokeWidth={1.2}
                />

                {/* Build Plate Outer Metallic Frame */}
                <rect
                  x={padL - 3}
                  y={padT - 3}
                  width={bedX + 6}
                  height={bedY + 6}
                  rx={10}
                  fill="#14100b"
                  stroke="#5c4930"
                  strokeWidth={1.5}
                />

                {/* Build Plate Printable Area with mm Grid */}
                <g transform={`translate(${padL}, ${padT})`}>
                  <rect
                    x={0}
                    y={0}
                    width={bedX}
                    height={bedY}
                    rx={6}
                    fill="#0f0b07"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={bedX}
                    height={bedY}
                    rx={6}
                    fill="url(#majorGrid50)"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={bedX}
                    height={bedY}
                    rx={6}
                    fill="none"
                    stroke="#d4af37"
                    strokeOpacity={0.55}
                    strokeWidth={1.4}
                  />

                  {/* Nozzle Purge Line at front of bed */}
                  <line
                    x1={14}
                    y1={bedY - 4}
                    x2={85}
                    y2={bedY - 4}
                    stroke="#d4af37"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    opacity={0.7}
                  />

                  {/* Printer Watermark on Bed Center */}
                  <text
                    x={bedX / 2}
                    y={bedY - 12}
                    textAnchor="middle"
                    fill="#5c4930"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                    letterSpacing="1.5"
                  >
                    {printerName.toUpperCase()} · {bedX}×{bedY}MM
                  </text>

                  {/* Origin (0,0) Marker at Bottom-Left or Top-Left */}
                  <circle cx={0} cy={0} r={3} fill="#f3d478" />

                  {/* Part Footprints */}
                  {enrichedItems.map((item, idx) => {
                    const isHov = hoveredItemIdx === idx;
                    const isSel = selectedItemIdx === idx;
                    const cx = item.x + item.w / 2;
                    const cy = item.y + item.h / 2;
                    const clipId = `plate-preview-clip-${selectedPlateIdx}-${idx}`;

                    const innerW = Math.max(4, item.w - 6);
                    const innerH = Math.max(4, item.h - 4);
                    const showName = item.w >= 16 && item.h >= 11;
                    const showDims = item.w >= 28 && item.h >= 22;

                    const nameFontSize = Math.min(
                      7.5,
                      Math.max(4.0, Math.min(innerW * 0.13, innerH * (showDims ? 0.26 : 0.42)))
                    );
                    const maxNameChars = Math.max(
                      3,
                      Math.floor(innerW / (nameFontSize * 0.62))
                    );
                    const fullName = item.name || item.partId;
                    const truncatedName =
                      fullName.length > maxNameChars
                        ? `${fullName.slice(0, Math.max(2, maxNameChars - 1)).trimEnd()}…`
                        : fullName;

                    const fullDimText = `${Math.round(item.w)}×${Math.round(item.h)}mm${
                      item.rotated ? " ↻" : ""
                    }`;
                    const compactDimText = `${Math.round(item.w)}×${Math.round(item.h)}${
                      item.rotated ? "↻" : ""
                    }`;
                    const rawDimFontSize = Math.min(
                      6.2,
                      Math.max(3.6, Math.min(innerW * 0.1, innerH * 0.2))
                    );
                    const dimText =
                      fullDimText.length * rawDimFontSize * 0.6 <= innerW
                        ? fullDimText
                        : compactDimText;
                    const dimFontSize = Math.min(
                      rawDimFontSize,
                      Math.max(3.5, innerW / Math.max(1, dimText.length * 0.62))
                    );

                    const fullTooltip = `${fullName} (${item.partId}) — ${Math.round(
                      item.w
                    )}×${Math.round(item.h)} mm${
                      item.rotated ? " · Rotated 90°" : ""
                    }`;

                    return (
                      <g
                        key={`${item.partId}-${idx}`}
                        onMouseEnter={() => setHoveredItemIdx(idx)}
                        onMouseLeave={() => setHoveredItemIdx(null)}
                        onClick={() => setSelectedItemIdx(idx)}
                        className="cursor-pointer"
                        data-testid={`plate-item-${item.partId}`}
                      >
                        <title>{fullTooltip}</title>
                        <clipPath id={clipId}>
                          <rect
                            x={item.x + 2}
                            y={item.y + 1.5}
                            width={Math.max(0, item.w - 4)}
                            height={Math.max(0, item.h - 3)}
                            rx={2.5}
                          />
                        </clipPath>

                        {/* Outer Slicer Brim Ring */}
                        <rect
                          x={item.x - 2}
                          y={item.y - 2}
                          width={item.w + 4}
                          height={item.h + 4}
                          rx={5}
                          fill="none"
                          stroke={item.color}
                          strokeOpacity={isHov || isSel ? 0.85 : 0.32}
                          strokeWidth={0.8}
                          strokeDasharray="3 2"
                        />

                        {/* Main Part Footprint Box */}
                        <rect
                          x={item.x}
                          y={item.y}
                          width={item.w}
                          height={item.h}
                          rx={3.5}
                          fill={item.color}
                          fillOpacity={isSel ? 0.44 : isHov ? 0.34 : 0.24}
                          stroke={isSel ? "#F3D478" : item.color}
                          strokeWidth={isSel || isHov ? 2.2 : 1.4}
                        />

                        {/* Subtle Infill Hatching Inside Footprint */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={Math.min(item.w, item.h) * 0.22}
                          fill={item.color}
                          fillOpacity={0.22}
                          stroke={item.color}
                          strokeWidth={0.7}
                          strokeOpacity={0.5}
                        />

                        {/* Clipped Part Name & Dimensions Label */}
                        {showName && (
                          <g clipPath={`url(#${clipId})`}>
                            <text
                              x={cx}
                              y={showDims ? cy - dimFontSize * 0.55 : cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#F5EBD6"
                              fontSize={nameFontSize}
                              fontFamily="serif"
                              fontWeight="bold"
                            >
                              {truncatedName}
                            </text>
                            {showDims && (
                              <text
                                x={cx}
                                y={cy + nameFontSize * 0.72}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#E6D3B3"
                                fontSize={dimFontSize}
                                fontFamily="monospace"
                              >
                                {dimText}
                              </text>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* X-Axis Millimeter Ruler Ticks */}
                {majorTicksX.map((tx) => (
                  <g key={`tx-${tx}`} transform={`translate(${padL + tx}, 0)`}>
                    <line
                      x1={0}
                      y1={padT + bedY}
                      x2={0}
                      y2={padT + bedY + 5}
                      stroke="#9c7a4c"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={padT + bedY + 15}
                      textAnchor="middle"
                      fill="#bda782"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {tx}
                    </text>
                  </g>
                ))}

                {/* Y-Axis Millimeter Ruler Ticks */}
                {majorTicksY.map((ty) => (
                  <g key={`ty-${ty}`} transform={`translate(0, ${padT + ty})`}>
                    <line
                      x1={padL - 5}
                      y1={0}
                      x2={padL}
                      y2={0}
                      stroke="#9c7a4c"
                      strokeWidth={1}
                    />
                    <text
                      x={padL - 8}
                      y={2.5}
                      textAnchor="end"
                      fill="#bda782"
                      fontSize="7.5"
                      fontFamily="monospace"
                    >
                      {ty}
                    </text>
                  </g>
                ))}

                {/* Axis Unit Labels */}
                <text
                  x={padL + bedX / 2}
                  y={svgH - 4}
                  textAnchor="middle"
                  fill="#9c7a4c"
                  fontSize="7.5"
                  fontFamily="monospace"
                >
                  X AXIS (mm)
                </text>
              </svg>
            </div>
          ) : (
            /* 3D Slicer Build Plate View */
            <div className="w-full h-[460px] rounded-xl overflow-hidden border border-[#d4af37]/25">
              <Canvas
                shadows
                dpr={[1, 2]}
                gl={{ preserveDrawingBuffer: true, antialias: true }}
                camera={{ position: [0, 290, 210], fov: 40, near: 1, far: 2000 }}
              >
                <color attach="background" args={["#0C0906"]} />
                <ambientLight intensity={0.85} />
                <directionalLight
                  position={[120, 260, 140]}
                  intensity={1.4}
                  color="#FFF4D6"
                />
                <directionalLight
                  position={[-120, 180, -100]}
                  intensity={0.5}
                  color="#D4AF37"
                />

                {/* Build Plate Surface centered at (0,0,0) */}
                <group>
                  <mesh position={[0, -2, 0]} receiveShadow>
                    <boxGeometry args={[bedX, 4, bedY]} />
                    <meshStandardMaterial
                      color="#14100B"
                      roughness={0.6}
                      metalness={0.3}
                    />
                  </mesh>
                  <gridHelper
                    args={[bedX, Math.round(bedX / 16), "#D4AF37", "#282016"]}
                    position={[0, 0.2, 0]}
                  />

                  {enrichedItems.map((item, idx) => {
                    const geo = buildPartGeometry(item.shape, item.params);
                    const edges = buildPartEdgesGeometry(
                      item.shape,
                      item.params,
                      22
                    );
                    geo.computeBoundingBox();
                    const box = geo.boundingBox;
                    const partH = box ? box.max.y - box.min.y : 20;

                    const posX = item.x + item.w / 2 - bedX / 2;
                    const posZ = item.y + item.h / 2 - bedY / 2;

                    return (
                      <group
                        key={`${item.partId}-${idx}`}
                        position={[posX, partH / 2, posZ]}
                        rotation={[
                          0,
                          item.rotated ? Math.PI / 2 : 0,
                          0,
                        ]}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemIdx(idx);
                        }}
                      >
                        <mesh geometry={geo} castShadow receiveShadow>
                          <meshStandardMaterial
                            color={item.color}
                            roughness={0.4}
                            metalness={0.14}
                          />
                        </mesh>
                        <lineSegments geometry={edges}>
                          <lineBasicMaterial
                            color="#2B1D0E"
                            transparent
                            opacity={0.48}
                          />
                        </lineSegments>
                        <Html
                          position={[0, partH / 2 + 8, 0]}
                          center
                          distanceFactor={320}
                          style={{ pointerEvents: "none" }}
                        >
                          <div className="px-1.5 py-0.5 rounded bg-[#14100b]/92 border border-[#d4af37]/40 text-[10px] font-mono text-[#f5ebd6] whitespace-nowrap">
                            {item.name}
                          </div>
                        </Html>
                      </group>
                    );
                  })}

                  <ContactShadows
                    position={[0, 0.1, 0]}
                    opacity={0.45}
                    scale={bedX}
                    blur={2}
                    color="#050302"
                  />
                </group>

                <OrbitControls
                  makeDefault
                  enableDamping
                  dampingFactor={0.08}
                  minDistance={80}
                  maxDistance={600}
                />
              </Canvas>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Packed Parts Manifest & Selected Footprint Inspector */}
        <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-[#d4af37]/25 bg-[#14100b]/85 p-4 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-codex font-bold uppercase tracking-wider text-[#f3d478]">
                Plate {activePlate.index ?? selectedPlateIdx + 1} Manifest (
                {enrichedItems.length} parts)
              </h4>
              <span className="text-[11px] font-mono text-[#d4af37]">
                0.20mm Standard
              </span>
            </div>

            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {enrichedItems.map((item, idx) => {
                const isSel = selectedItemIdx === idx;
                return (
                  <button
                    key={`${item.partId}-${idx}`}
                    type="button"
                    onClick={() => setSelectedItemIdx(idx)}
                    onMouseEnter={() => setHoveredItemIdx(idx)}
                    onMouseLeave={() => setHoveredItemIdx(null)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                      isSel
                        ? "bg-[#1d1710] border-[#d4af37]/65 shadow-sm"
                        : "bg-[#0c0906]/65 border-[#d4af37]/20 hover:border-[#d4af37]/45"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#f5ebd6] truncate">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-[#bda782]">
                          pos ({Math.round(item.x)}, {Math.round(item.y)}) mm
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-semibold text-[#e6d3b3]">
                        {Math.round(item.w)}×{Math.round(item.h)} mm
                      </div>
                      {item.rotated && (
                        <span className="inline-block text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-[#d4af37]/15 text-[#f3d478] border border-[#d4af37]/35">
                          ↻ Rotated 90°
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Footprint Detail Card */}
          {activeItem && (
            <div className="p-3.5 rounded-xl bg-[#0c0906]/90 border border-[#d4af37]/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-codex uppercase tracking-wider text-[#f3d478] font-bold">
                  Selected Footprint
                </span>
                <span className="text-[10px] font-mono text-[#bda782]">
                  ID: {activeItem.partId}
                </span>
              </div>
              <div className="font-display text-base font-bold text-[#f5ebd6] flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: activeItem.color }}
                />
                {activeItem.name}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
                <div className="p-2 rounded bg-[#14100b] border border-[#d4af37]/20">
                  <div className="text-[9px] text-[#bda782]">OFFSET X,Y</div>
                  <div className="text-[#f5ebd6] font-semibold mt-0.5">
                    {Math.round(activeItem.x)}, {Math.round(activeItem.y)}
                  </div>
                </div>
                <div className="p-2 rounded bg-[#14100b] border border-[#d4af37]/20">
                  <div className="text-[9px] text-[#bda782]">SIZE W×H</div>
                  <div className="text-[#f5ebd6] font-semibold mt-0.5">
                    {Math.round(activeItem.w)}×{Math.round(activeItem.h)}
                  </div>
                </div>
                <div className="p-2 rounded bg-[#14100b] border border-[#d4af37]/20">
                  <div className="text-[9px] text-[#bda782]">ORIENTATION</div>
                  <div className="text-[#f3d478] font-semibold mt-0.5">
                    {activeItem.rotated ? "90° Rotated" : "0° Standard"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlatePreview;
