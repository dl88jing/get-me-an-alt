'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface ExplodeSamplePart {
  id: string;
  code: string;
  name: string;
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
    name: 'Bayonet Top Cap & Sensor Collar',
    kind: 'printed',
    dims: '112 × 112 × 18 mm',
    cost: '$0.62 PETG',
    material: 'Translucent Emerald PETG',
    color: '#00f5a0',
    emissive: '#006844',
    basePos: [0, 0.85, 0],
    explodeVec: [0, 1.55, 0],
    geometry: 'cylinder',
    args: [1.06, 1.08, 0.22, 32],
  },
  {
    id: 'o-ring',
    code: 'BOM-01',
    name: 'Nitrile 105mm Sealing O-Ring Gasket',
    kind: 'purchased',
    dims: '105 × 105 × 3.5 mm',
    cost: '$1.40 McMaster',
    material: 'Buna-N 70A Elastomer',
    color: '#ff6b2b',
    emissive: '#7c2d12',
    basePos: [0, 0.65, 0],
    explodeVec: [0, 0.92, 0.35],
    geometry: 'ring',
    args: [0.95, 0.06, 16, 48],
  },
  {
    id: 'reservoir-body',
    code: 'PRT-02',
    name: '750mL Fluted Hydro-Reservoir Vessel',
    kind: 'printed',
    dims: '110 × 110 × 145 mm',
    cost: '$1.85 PETG',
    material: '3-Perim Watertight PETG',
    color: '#10b981',
    emissive: '#064e3b',
    basePos: [0, 0.05, 0],
    explodeVec: [0, 0.15, 0],
    geometry: 'cylinder',
    args: [1.0, 0.92, 1.15, 24],
  },
  {
    id: 'submersible-pump',
    code: 'BOM-02',
    name: '5V Low-Noise Brushless Impeller Pump',
    kind: 'purchased',
    dims: '38 × 28 × 32 mm',
    cost: '$5.90 Amazon',
    material: 'ABS + Ceramic Shaft',
    color: '#38bdf8',
    emissive: '#0c4a6e',
    basePos: [0, -0.35, 0],
    explodeVec: [-1.25, -0.25, 0.65],
    geometry: 'box',
    args: [0.62, 0.48, 0.52],
  },
  {
    id: 'capacitive-probe',
    code: 'BOM-03',
    name: 'Capacitive Soil Moisture Probe v2.0',
    kind: 'purchased',
    dims: '98 × 23 × 4 mm',
    cost: '$3.80 DigiKey',
    material: 'FR4 Matte Black PCB',
    color: '#0ea5e9',
    emissive: '#075985',
    basePos: [0.55, -0.1, 0.4],
    explodeVec: [1.45, 0.35, 0.7],
    geometry: 'box',
    args: [0.22, 1.05, 0.06],
  },
  {
    id: 'manifold-ring',
    code: 'PRT-03',
    name: '4-Port Anti-Siphon Drip Manifold',
    kind: 'printed',
    dims: '84 × 84 × 24 mm',
    cost: '$0.48 PETG',
    material: 'Matte Emerald PLA/PETG',
    color: '#34d399',
    emissive: '#065f46',
    basePos: [0, -0.62, 0],
    explodeVec: [0, -0.82, -0.35],
    geometry: 'hex',
    args: [0.72, 0.72, 0.24, 6],
  },
  {
    id: 'electronics-dock',
    code: 'PRT-04',
    name: 'Weighted Twist-Lock Base Chassis + M3 Inserts',
    kind: 'printed',
    dims: '118 × 118 × 32 mm',
    cost: '$0.90 PETG',
    material: 'Carbon-Filled PETG',
    color: '#059669',
    emissive: '#022c22',
    basePos: [0, -0.92, 0],
    explodeVec: [0, -1.65, 0],
    geometry: 'cylinder',
    args: [1.12, 1.18, 0.34, 32],
  },
];

function ExplodingPartMesh({
  part,
  explodeFactor,
  selectedId,
  onSelect,
}: {
  part: ExplodeSamplePart;
  explodeFactor: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedId === part.id;

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
      <mesh castShadow receiveShadow>
        {geomNode}
        <meshStandardMaterial
          color={part.color}
          emissive={isSelected || hovered ? part.color : part.emissive}
          emissiveIntensity={isSelected ? 0.55 : hovered ? 0.4 : 0.18}
          metalness={part.kind === 'purchased' ? 0.65 : 0.25}
          roughness={part.kind === 'purchased' ? 0.25 : 0.45}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh scale={[1.015, 1.015, 1.015]}>
        {geomNode}
        <meshBasicMaterial
          color={isSelected || hovered ? '#ffffff' : part.color}
          wireframe
          transparent
          opacity={isSelected || hovered ? 0.65 : 0.22}
        />
      </mesh>
    </group>
  );
}

function AssemblyRig({
  explodeFactor,
  selectedId,
  onSelect,
}: {
  explodeFactor: number;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const rigRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!rigRef.current) return;
    rigRef.current.rotation.y =
      state.clock.getElapsedTime() * 0.35 + explodeFactor * 1.1;
  });

  return (
    <group ref={rigRef}>
      {/* Central CAD Datum Axis */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 5.4, 8]} />
        <meshBasicMaterial color="#00f5a0" transparent opacity={0.35} />
      </mesh>

      {/* Bambu 256x256 Build Plate Reference Grid */}
      <gridHelper
        args={[5.2, 16, '#00f5a0', '#1e293b']}
        position={[0, -2.55, 0]}
      />

      {SAMPLE_EXPLODE_PARTS.map((p) => (
        <ExplodingPartMesh
          key={p.id}
          part={p}
          explodeFactor={explodeFactor}
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
  const [manualOverride, setManualOverride] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string>(
    SAMPLE_EXPLODE_PARTS[0].id
  );

  const effectiveExplode =
    manualOverride !== null
      ? manualOverride
      : Math.max(0, Math.min(1, scrollFactor));

  const selectedPart =
    SAMPLE_EXPLODE_PARTS.find((p) => p.id === selectedId) ||
    SAMPLE_EXPLODE_PARTS[0];

  return (
    <div className="grid gap-6 lg:grid-cols-12 items-stretch">
      {/* 3D Interactive Viewport */}
      <div className="relative lg:col-span-8 min-h-[420px] sm:min-h-[500px] rounded-2xl border border-white/[0.1] bg-[#070a0f] overflow-hidden shadow-glass">
        {/* Corner CAD Registration Crosshairs */}
        <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 font-mono text-[11px] text-[#00f5a0]">
          <span className="inline-block h-2 w-2 rounded-full bg-[#00f5a0] animate-pulse" />
          <span>CAD_VIEWPORT // EXPLODE_VECTOR: {(effectiveExplode * 100).toFixed(0)}%</span>
        </div>
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-md border border-white/10 bg-[#050608]/80 px-2.5 py-1 font-mono text-[10px] text-slate-300">
          BED: 256×256×256mm (BAMBU A1)
        </div>

        <Canvas
          camera={{ position: [3.9, 2.3, 4.4], fov: 40 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.85} />
          <directionalLight position={[6, 8, 5]} intensity={1.6} />
          <pointLight position={[-5, -3, -4]} intensity={0.9} color="#38bdf8" />
          <pointLight position={[0, 4, 2]} intensity={1.1} color="#00f5a0" />
          <AssemblyRig
            explodeFactor={effectiveExplode}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </Canvas>

        {/* Bottom Interactive Explode Scrubbing Bar */}
        <div className="absolute bottom-3 inset-x-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050608]/85 backdrop-blur-md px-4 py-2.5">
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Explode Axis
            </span>
            <input
              type="range"
              aria-label="Explode 3D assembly slider"
              min={0}
              max={100}
              value={Math.round(effectiveExplode * 100)}
              onChange={(e) => setManualOverride(Number(e.target.value) / 100)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-800 accent-[#00f5a0]"
            />
            <span className="font-mono text-xs font-bold text-[#00f5a0] tabular-nums w-10 text-right">
              {Math.round(effectiveExplode * 100)}%
            </span>
          </div>
          {manualOverride !== null && (
            <button
              type="button"
              onClick={() => setManualOverride(null)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300 hover:text-white"
            >
              Sync to Scroll
            </button>
          )}
        </div>
      </div>

      {/* Right Column: Live Part Telemetry & Clickable Component Stack */}
      <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0a0d12]/90 p-5 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-400">
              SELECTED COMPONENT
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                selectedPart.kind === 'printed'
                  ? 'border border-[#00f5a0]/40 bg-[#00f5a0]/15 text-[#00f5a0]'
                  : 'border border-sky-400/40 bg-sky-400/15 text-sky-300'
              }`}
            >
              {selectedPart.kind === 'printed'
                ? '3D Printed STL'
                : 'Off-The-Shelf BOM'}
            </span>
          </div>

          <div>
            <div className="font-mono text-xs text-[#00f5a0]">
              {selectedPart.code} · {selectedPart.material}
            </div>
            <h4 className="font-display text-lg font-bold text-white mt-0.5">
              {selectedPart.name}
            </h4>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono text-xs">
            <div className="rounded-xl border border-white/[0.06] bg-[#050608] p-2.5">
              <div className="text-[10px] text-slate-500">DIMENSIONS</div>
              <div className="text-slate-200 font-semibold mt-0.5 tabular-nums">
                {selectedPart.dims}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-[#050608] p-2.5">
              <div className="text-[10px] text-slate-500">UNIT COST</div>
              <div className="text-[#00f5a0] font-bold mt-0.5 tabular-nums">
                {selectedPart.cost}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Part List */}
        <div className="space-y-1.5 pt-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Click Any Part to Inspect ({SAMPLE_EXPLODE_PARTS.length} Sub-Assemblies)
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
                      ? 'border-[#00f5a0]/60 bg-[#00f5a0]/10 text-white'
                      : 'border-white/[0.06] bg-[#050608]/60 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {item.code}
                    </span>
                    <span className="text-xs font-medium truncate">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-[#00f5a0] shrink-0 ml-2 tabular-nums">
                    {item.cost.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
