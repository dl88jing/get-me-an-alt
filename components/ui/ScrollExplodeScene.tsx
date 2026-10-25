'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface ExplodeSamplePart {
  id: string;
  code: string;
  partRef: string;
  name: string;
  latinNote: string;
  kind: 'printed' | 'purchased';
  dims: string;
  cost: string;
  material: string;
  color: string;
  emissive: string;
  basePos: [number, number, number];
  explodeVec: [number, number, number];
  geometry: 'cylinder' | 'ring' | 'box' | 'hex' | 'tube';
  args: number[];
}

export const SAMPLE_EXPLODE_PARTS: ExplodeSamplePart[] = [
  {
    id: 'sensor-cap',
    code: 'PRT-01',
    partRef: 'PART 01 · TOP CAP',
    name: 'Bayonet Top Cap & Sensor Collar',
    latinNote: 'Quarter-turn bayonet cap with integrated sensor pass-through',
    kind: 'printed',
    dims: '112 × 112 × 18 mm',
    cost: '$0.62 PETG',
    material: 'Burnished Olive-Bronze PETG',
    color: '#c5a059',
    emissive: '#5c4930',
    basePos: [0, 0.85, 0],
    explodeVec: [0, 1.55, 0],
    geometry: 'cylinder',
    args: [1.06, 1.08, 0.22, 32],
  },
  {
    id: 'o-ring',
    code: 'BOM-01',
    partRef: 'PART 02 · O-RING',
    name: 'Nitrile 105mm Sealing O-Ring Gasket',
    latinNote: 'Watertight compression seal between top cap and reservoir',
    kind: 'purchased',
    dims: '105 × 105 × 3.5 mm',
    cost: '$1.40 McMaster',
    material: 'Buna-N 70A Elastomer',
    color: '#c84b31',
    emissive: '#5c1f12',
    basePos: [0, 0.65, 0],
    explodeVec: [0, 0.92, 0.35],
    geometry: 'ring',
    args: [0.95, 0.06, 16, 48],
  },
  {
    id: 'reservoir-body',
    code: 'PRT-02',
    partRef: 'PART 03 · RESERVOIR',
    name: '750mL Fluted Hydro-Reservoir Vessel',
    latinNote: '3-perimeter watertight PETG tank with sight-glass ribs',
    kind: 'printed',
    dims: '110 × 110 × 145 mm',
    cost: '$1.85 PETG',
    material: '3-Perim Florentine Bronze PETG',
    color: '#b89b4a',
    emissive: '#4a3b18',
    basePos: [0, 0.05, 0],
    explodeVec: [0, 0.15, 0],
    geometry: 'cylinder',
    args: [1.0, 0.92, 1.15, 24],
  },
  {
    id: 'submersible-pump',
    code: 'BOM-02',
    partRef: 'PART 04 · 5V PUMP',
    name: '5V Low-Noise Brushless Impeller Pump',
    latinNote: 'Submersible micro-impeller pump rated for 120L/h flow',
    kind: 'purchased',
    dims: '38 × 28 × 32 mm',
    cost: '$5.90 Amazon',
    material: 'Burnished Brass & ABS Core',
    color: '#d4af37',
    emissive: '#713f12',
    basePos: [0, -0.35, 0],
    explodeVec: [-1.25, -0.25, 0.65],
    geometry: 'box',
    args: [0.62, 0.48, 0.52],
  },
  {
    id: 'capacitive-probe',
    code: 'BOM-03',
    partRef: 'PART 05 · SOIL PROBE',
    name: 'Capacitive Soil Moisture Probe v2.0',
    latinNote: 'Corrosion-resistant analog capacitive moisture sensor blade',
    kind: 'purchased',
    dims: '98 × 23 × 4 mm',
    cost: '$3.80 DigiKey',
    material: 'Gilded FR4 Sensor Blade',
    color: '#f3d478',
    emissive: '#854d0e',
    basePos: [0.55, -0.1, 0.4],
    explodeVec: [1.45, 0.35, 0.7],
    geometry: 'box',
    args: [0.22, 1.05, 0.06],
  },
  {
    id: 'manifold-ring',
    code: 'PRT-03',
    partRef: 'PART 06 · MANIFOLD',
    name: '4-Port Anti-Siphon Drip Manifold',
    latinNote: '4-way barbed outlet splitter with anti-siphon air break',
    kind: 'printed',
    dims: '84 × 84 × 24 mm',
    cost: '$0.48 PETG',
    material: 'Warm Terracotta PLA/PETG',
    color: '#d4bc94',
    emissive: '#5c4930',
    basePos: [0, -0.62, 0],
    explodeVec: [0, -0.82, -0.35],
    geometry: 'hex',
    args: [0.72, 0.72, 0.24, 6],
  },
  {
    id: 'electronics-dock',
    code: 'PRT-04',
    partRef: 'PART 07 · BASE DOCK',
    name: 'Weighted Twist-Lock Base Chassis + M3 Inserts',
    latinNote: 'Dry electronics bay with M3 brass heat-set insert bosses',
    kind: 'printed',
    dims: '118 × 118 × 32 mm',
    cost: '$0.90 PETG',
    material: 'Bronze-Filled Carbon PETG',
    color: '#9c7a4c',
    emissive: '#3b2410',
    basePos: [0, -0.92, 0],
    explodeVec: [0, -1.65, 0],
    geometry: 'cylinder',
    args: [1.12, 1.18, 0.34, 32],
  },
];

const SKETCH_PARCHMENT_FILL = new THREE.Color('#e8d6b3');
const SKETCH_SEPIA_INK = new THREE.Color('#3b2410');
const SKETCH_SEPIA_EMISSIVE = new THREE.Color('#4a2f16');
const GILDED_HIGHLIGHT = new THREE.Color('#f3d478');

function ExplodingPartMesh({
  part,
  explodeFactor,
  realityFactor,
  selectedId,
  onSelect,
}: {
  part: ExplodeSamplePart;
  explodeFactor: number;
  realityFactor: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const solidMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const wireMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const inkOutlineMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const [hovered, setHovered] = useState(false);
  const isSelected = selectedId === part.id;

  const realColor = useMemo(() => new THREE.Color(part.color), [part.color]);
  const realEmissive = useMemo(
    () => new THREE.Color(part.emissive),
    [part.emissive]
  );
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpEmissive = useMemo(() => new THREE.Color(), []);
  const tmpWireColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const tx = part.basePos[0] + part.explodeVec[0] * explodeFactor;
    const ty = part.basePos[1] + part.explodeVec[1] * explodeFactor;
    const tz = part.basePos[2] + part.explodeVec[2] * explodeFactor;

    groupRef.current.position.x = THREE.MathUtils.lerp(
      groupRef.current.position.x,
      tx,
      Math.min(1, delta * 9)
    );
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      ty,
      Math.min(1, delta * 9)
    );
    groupRef.current.position.z = THREE.MathUtils.lerp(
      groupRef.current.position.z,
      tz,
      Math.min(1, delta * 9)
    );

    // Interpolate Sketch (0) -> Reality (1)
    if (solidMatRef.current) {
      tmpColor.copy(SKETCH_PARCHMENT_FILL).lerp(realColor, realityFactor);
      solidMatRef.current.color.copy(tmpColor);

      if (isSelected || hovered) {
        tmpEmissive.copy(GILDED_HIGHLIGHT).lerp(realColor, realityFactor * 0.6);
        solidMatRef.current.emissive.copy(tmpEmissive);
        solidMatRef.current.emissiveIntensity =
          0.25 + realityFactor * 0.35;
      } else {
        tmpEmissive
          .copy(SKETCH_SEPIA_EMISSIVE)
          .lerp(realEmissive, realityFactor);
        solidMatRef.current.emissive.copy(tmpEmissive);
        solidMatRef.current.emissiveIntensity =
          0.08 + realityFactor * 0.16;
      }

      const targetMetal = part.kind === 'purchased' ? 0.72 : 0.28;
      const targetRough = part.kind === 'purchased' ? 0.22 : 0.42;
      solidMatRef.current.metalness = THREE.MathUtils.lerp(
        0.04,
        targetMetal,
        realityFactor
      );
      solidMatRef.current.roughness = THREE.MathUtils.lerp(
        0.92,
        targetRough,
        realityFactor
      );
      solidMatRef.current.opacity = THREE.MathUtils.lerp(
        0.86,
        0.95,
        realityFactor
      );
    }

    if (wireMatRef.current) {
      tmpWireColor
        .copy(SKETCH_SEPIA_INK)
        .lerp(isSelected || hovered ? GILDED_HIGHLIGHT : realColor, realityFactor);
      wireMatRef.current.color.copy(tmpWireColor);
      // In sketch mode (realityFactor=0), sepia ink hatching wireframe is strong (0.72);
      // in reality mode (realityFactor=1), subtle CAD wireframe (0.2)
      const baseWireOpacity = THREE.MathUtils.lerp(0.75, 0.2, realityFactor);
      wireMatRef.current.opacity =
        isSelected || hovered ? Math.max(0.7, baseWireOpacity) : baseWireOpacity;
    }

    if (inkOutlineMatRef.current) {
      // Inverted-hull sepia ink contour strongest in Sketch Mode
      inkOutlineMatRef.current.opacity = THREE.MathUtils.lerp(
        0.85,
        isSelected || hovered ? 0.45 : 0.08,
        realityFactor
      );
      inkOutlineMatRef.current.color.copy(
        isSelected || hovered ? GILDED_HIGHLIGHT : SKETCH_SEPIA_INK
      );
    }
  });

  const geomNode = useMemo(() => {
    switch (part.geometry) {
      case 'ring':
        return (
          <torusGeometry
            args={part.args as [number, number, number, number]}
          />
        );
      case 'box':
        return <boxGeometry args={part.args as [number, number, number]} />;
      case 'hex':
      case 'cylinder':
      default:
        return (
          <cylinderGeometry
            args={part.args as [number, number, number, number]}
          />
        );
    }
  }, [part]);

  return (
    <group
      ref={groupRef}
      position={part.basePos}
      rotation={part.geometry === 'ring' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(part.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Solid / Parchment-to-Reality Mesh */}
      <mesh castShadow receiveShadow>
        {geomNode}
        <meshStandardMaterial
          ref={solidMatRef}
          color="#e8d6b3"
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Inverted-Hull Sepia Ink Silhouette Outline (Da Vinci Pen Contour) */}
      <mesh scale={[1.035, 1.035, 1.035]}>
        {geomNode}
        <meshBasicMaterial
          ref={inkOutlineMatRef}
          color="#3b2410"
          side={THREE.BackSide}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Sepia Cross-Hatching / CAD Wireframe Overlay */}
      <mesh scale={[1.012, 1.012, 1.012]}>
        {geomNode}
        <meshBasicMaterial
          ref={wireMatRef}
          color="#3b2410"
          wireframe
          transparent
          opacity={0.72}
        />
      </mesh>
    </group>
  );
}

function AssemblyRig({
  explodeFactor,
  realityFactor,
  selectedId,
  onSelect,
}: {
  explodeFactor: number;
  realityFactor: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rigRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!rigRef.current) return;
    rigRef.current.rotation.y =
      state.clock.getElapsedTime() * 0.32 + explodeFactor * 1.15;
  });

  return (
    <group ref={rigRef}>
      {/* Central Da Vinci Plumb Line / Datum Axis */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 5.4, 8]} />
        <meshBasicMaterial
          color={realityFactor < 0.5 ? '#5c3a1d' : '#d4af37'}
          transparent
          opacity={0.55}
        />
      </mesh>

      {/* Vitruvian Ring & Build Plate Reference Grid */}
      <mesh position={[0, -2.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.2, 2.26, 64]} />
        <meshBasicMaterial
          color={realityFactor < 0.5 ? '#5c3a1d' : '#d4af37'}
          side={THREE.DoubleSide}
          transparent
          opacity={0.45}
        />
      </mesh>

      <gridHelper
        args={[
          5.2,
          16,
          realityFactor < 0.5 ? '#6e4720' : '#d4af37',
          realityFactor < 0.5 ? '#9c7a4c' : '#2b2116',
        ]}
        position={[0, -2.55, 0]}
      />

      {SAMPLE_EXPLODE_PARTS.map((p) => (
        <ExplodingPartMesh
          key={p.id}
          part={p}
          explodeFactor={explodeFactor}
          realityFactor={realityFactor}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

export default function ScrollExplodeScene({
  scrollFactor,
}: {
  scrollFactor: number;
}) {
  const [manualExplode, setManualExplode] = useState<number | null>(null);
  const [manualReality, setManualReality] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string>(
    SAMPLE_EXPLODE_PARTS[0].id
  );

  const clampedScroll = Math.max(0, Math.min(1, scrollFactor));

  const effectiveExplode =
    manualExplode !== null ? manualExplode : clampedScroll;

  // As the user scrolls through the section, the model transitions from
  // 0.0 (Sepia Ink Codex Sketch on Vellum) -> 1.0 (Full-Color Reality)
  const autoReality = Math.max(
    0,
    Math.min(1, (clampedScroll - 0.12) / 0.72)
  );
  const effectiveReality =
    manualReality !== null ? manualReality : autoReality;

  const selectedPart =
    SAMPLE_EXPLODE_PARTS.find((p) => p.id === selectedId) ||
    SAMPLE_EXPLODE_PARTS[0];

  const isSketchDominant = effectiveReality < 0.48;

  return (
    <div className="space-y-4">
      {/* Top Sketch-to-Reality Transmutation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d4af37]/30 bg-[#14100b]/90 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-codex text-xs font-bold uppercase tracking-widest text-[#f3d478]">
            View Mode:
          </span>
          <span
            className={`rounded-full px-3 py-0.5 font-mono text-xs font-bold transition-colors ${
              effectiveReality < 0.35
                ? 'bg-[#e6d3b3] text-[#2b1d0e]'
                : effectiveReality < 0.75
                ? 'bg-[#d4af37]/25 text-[#f3d478] border border-[#d4af37]/50'
                : 'bg-[#b89b4a]/25 text-[#f3d478] border border-[#b89b4a]/50'
            }`}
          >
            {effectiveReality < 0.35
              ? '1 · Sepia Technical Sketch'
              : effectiveReality < 0.75
              ? '2 · Wireframe + Solid Blend (Sketch → CAD)'
              : '3 · 3D-Printed PETG + Retail Hardware'}
          </span>
        </div>

        {/* Quick Mode Preset Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => {
              setManualReality(0.05);
              setManualExplode(0.25);
            }}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              effectiveReality < 0.3
                ? 'bg-[#e6d3b3] text-[#2b1d0e] font-bold'
                : 'border border-[#d4af37]/25 bg-[#0c0906] text-[#bda782] hover:text-[#f5ebd6]'
            }`}
          >
            1. Ink Sketch
          </button>
          <button
            type="button"
            onClick={() => {
              setManualReality(0.5);
              setManualExplode(0.6);
            }}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              effectiveReality >= 0.3 && effectiveReality <= 0.7
                ? 'bg-[#d4af37] text-[#140e07] font-bold'
                : 'border border-[#d4af37]/25 bg-[#0c0906] text-[#bda782] hover:text-[#f5ebd6]'
            }`}
          >
            2. Blend
          </button>
          <button
            type="button"
            onClick={() => {
              setManualReality(1);
              setManualExplode(0.85);
            }}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              effectiveReality > 0.7
                ? 'bg-[#f3d478] text-[#140e07] font-bold'
                : 'border border-[#d4af37]/25 bg-[#0c0906] text-[#bda782] hover:text-[#f5ebd6]'
            }`}
          >
            3. 3D Solid
          </button>
          {(manualReality !== null || manualExplode !== null) && (
            <button
              type="button"
              onClick={() => {
                setManualReality(null);
                setManualExplode(null);
              }}
              className="rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-2.5 py-1 text-[#f3d478] hover:bg-[#d4af37]/20"
            >
              Sync to Scroll
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 items-stretch">
        {/* 3D Interactive Codex-to-Reality Viewport */}
        <div
          className="relative lg:col-span-8 min-h-[440px] sm:min-h-[520px] rounded-2xl overflow-hidden gilded-frame transition-colors duration-500"
          style={{
            background: `linear-gradient(160deg,
              rgb(${Math.round(234 - effectiveReality * 214)}, ${Math.round(
              214 - effectiveReality * 198
            )}, ${Math.round(176 - effectiveReality * 165)}) 0%,
              rgb(${Math.round(212 - effectiveReality * 198)}, ${Math.round(
              186 - effectiveReality * 174
            )}, ${Math.round(140 - effectiveReality * 132)}) 100%)`,
          }}
        >
          {/* Decorative Vitruvian Circle + Square Compass Overlay */}
          <svg
            aria-hidden="true"
            viewBox="0 0 500 500"
            className="pointer-events-none absolute inset-0 h-full w-full p-6 transition-opacity duration-500"
            style={{ opacity: 0.38 - effectiveReality * 0.2 }}
          >
            <circle
              cx="250"
              cy="250"
              r="210"
              fill="none"
              stroke={isSketchDominant ? '#4a2f16' : '#d4af37'}
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />
            <circle
              cx="250"
              cy="250"
              r="165"
              fill="none"
              stroke={isSketchDominant ? '#4a2f16' : '#d4af37'}
              strokeWidth="0.75"
            />
            <rect
              x="76"
              y="76"
              width="348"
              height="348"
              fill="none"
              stroke={isSketchDominant ? '#4a2f16' : '#d4af37'}
              strokeWidth="1"
            />
            <line
              x1="250"
              y1="20"
              x2="250"
              y2="480"
              stroke={isSketchDominant ? '#4a2f16' : '#d4af37'}
              strokeWidth="0.6"
              strokeDasharray="3 5"
            />
            <line
              x1="20"
              y1="250"
              x2="480"
              y2="250"
              stroke={isSketchDominant ? '#4a2f16' : '#d4af37'}
              strokeWidth="0.6"
              strokeDasharray="3 5"
            />
          </svg>

          {/* Top-Left Telemetry */}
          <div
            className={`pointer-events-none absolute top-3.5 left-4 z-10 space-y-0.5 font-mono text-[11px] transition-colors ${
              isSketchDominant ? 'text-[#3b2410]' : 'text-[#f3d478]'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
              <span>
                3D VIEWPORT // SOLID: {Math.round(effectiveReality * 100)}% ·
                EXPLODE: {Math.round(effectiveExplode * 100)}%
              </span>
            </div>
            <div className="text-[10px] opacity-80">
              <span className="mirror-script">
                GET ME AN ALT · PARAMETRIC CAD
              </span>{' '}
              — Hover any part
            </div>
          </div>

          {/* Top-Right Bed Target Stamp */}
          <div
            className={`pointer-events-none absolute top-3.5 right-4 z-10 rounded-lg border px-2.5 py-1 font-mono text-[10px] transition-colors ${
              isSketchDominant
                ? 'border-[#5c3a1d]/40 bg-[#f5ebd6]/80 text-[#2b1d0e]'
                : 'border-[#d4af37]/35 bg-[#0c0906]/85 text-[#e6d3b3]'
            }`}
          >
            PLATE: 256×256×256mm · BAMBU A1
          </div>

          {/* Callout Leader Badge on Viewport */}
          <div
            className={`pointer-events-none hidden sm:flex absolute top-16 right-4 z-10 max-w-[215px] flex-col rounded-xl border p-2.5 font-mono text-[10px] transition-all ${
              isSketchDominant
                ? 'border-[#5c3a1d]/45 bg-[#f5ebd6]/90 text-[#2b1d0e]'
                : 'border-[#d4af37]/30 bg-[#14100b]/90 text-[#f5ebd6]'
            }`}
          >
            <span className="font-codex font-bold text-[11px] text-[#b45309] dark:text-[#f3d478]">
              {selectedPart.partRef}
            </span>
            <span className="font-semibold truncate">{selectedPart.name}</span>
            <span className="italic opacity-80 font-display text-xs">
              “{selectedPart.latinNote}”
            </span>
          </div>

          <Canvas
            camera={{ position: [3.9, 2.3, 4.4], fov: 40 }}
            gl={{ antialias: true, alpha: true }}
          >
            <ambientLight intensity={0.95 - effectiveReality * 0.15} />
            <directionalLight
              position={[6, 8, 5]}
              intensity={1.1 + effectiveReality * 0.7}
              color="#fff4d6"
            />
            <pointLight
              position={[-5, -3, -4]}
              intensity={effectiveReality * 1.1}
              color="#d4af37"
            />
            <pointLight
              position={[0, 4, 2]}
              intensity={effectiveReality * 1.2}
              color="#f3d478"
            />
            <AssemblyRig
              explodeFactor={effectiveExplode}
              realityFactor={effectiveReality}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Canvas>

          {/* Bottom Dual Scrubbing Bar: Sketch->Reality + Explode Vector */}
          <div className="absolute bottom-3 inset-x-3 z-10 grid gap-2.5 sm:grid-cols-2 rounded-xl border border-[#d4af37]/35 bg-[#0c0906]/90 backdrop-blur-md px-4 py-3 text-[#f5ebd6]">
            {/* Slider 1: Sketch -> Reality */}
            <div className="flex items-center gap-2.5">
              <span className="font-codex text-[10px] uppercase tracking-wider text-[#f3d478] shrink-0">
                Sketch → Reality
              </span>
              <input
                type="range"
                aria-label="Sketch to reality transmutation slider"
                min={0}
                max={100}
                value={Math.round(effectiveReality * 100)}
                onChange={(e) => setManualReality(Number(e.target.value) / 100)}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-[#282016] accent-[#d4af37]"
              />
              <span className="font-mono text-xs font-bold text-[#f3d478] tabular-nums w-9 text-right">
                {Math.round(effectiveReality * 100)}%
              </span>
            </div>

            {/* Slider 2: Explode Vector */}
            <div className="flex items-center gap-2.5">
              <span className="font-codex text-[10px] uppercase tracking-wider text-[#bda782] shrink-0">
                Explode Axis
              </span>
              <input
                type="range"
                aria-label="Explode 3D assembly slider"
                min={0}
                max={100}
                value={Math.round(effectiveExplode * 100)}
                onChange={(e) => setManualExplode(Number(e.target.value) / 100)}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-[#282016] accent-[#f3d478]"
              />
              <span className="font-mono text-xs font-bold text-[#f3d478] tabular-nums w-9 text-right">
                {Math.round(effectiveExplode * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Part Inspector & Component List */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl codex-folio p-5 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#d4af37]/20 pb-3">
              <span className="font-codex text-[11px] uppercase tracking-widest text-[#d4af37]">
                PART INSPECTOR
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  selectedPart.kind === 'printed'
                    ? 'border border-[#b89b4a]/45 bg-[#b89b4a]/15 text-[#f3d478]'
                    : 'border border-[#d4af37]/45 bg-[#d4af37]/15 text-[#f3d478]'
                }`}
              >
                {selectedPart.kind === 'printed'
                  ? '3D-Printed Part'
                  : 'Off-the-Shelf BOM'}
              </span>
            </div>

            <div>
              <div className="font-mono text-xs text-[#f3d478]">
                {selectedPart.partRef} · {selectedPart.code}
              </div>
              <h4 className="font-display text-xl font-bold text-[#f5ebd6] mt-0.5">
                {selectedPart.name}
              </h4>
              <p className="font-display italic text-sm text-[#bda782]">
                “{selectedPart.latinNote}”
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono text-xs">
              <div className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/90 p-2.5">
                <div className="text-[10px] text-[#bda782]">DIMENSIONS</div>
                <div className="text-[#f5ebd6] font-semibold mt-0.5 tabular-nums">
                  {selectedPart.dims}
                </div>
              </div>
              <div className="rounded-xl border border-[#d4af37]/20 bg-[#0c0906]/90 p-2.5">
                <div className="text-[10px] text-[#bda782]">EST. COST</div>
                <div className="text-[#f3d478] font-bold mt-0.5 tabular-nums">
                  {selectedPart.cost}
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Part List */}
          <div className="space-y-1.5 pt-2">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#bda782]">
              Inspect Assembly Parts ({SAMPLE_EXPLODE_PARTS.length} Parts)
            </div>
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
              {SAMPLE_EXPLODE_PARTS.map((item) => {
                const active = item.id === selectedPart.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-all ${
                      active
                        ? 'border-[#d4af37]/70 bg-[#d4af37]/15 text-[#f5ebd6]'
                        : 'border-[#d4af37]/15 bg-[#0c0906]/70 text-[#e6d3b3] hover:border-[#d4af37]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-mono text-[11px] text-[#bda782] shrink-0">
                        {item.code}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#f3d478] shrink-0 ml-2 tabular-nums">
                      {item.cost.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
