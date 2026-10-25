"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  AnyDesignInput,
  AnyBomInput,
  AnyInstructionsInput,
  PartFilterMode,
  ResolvedAssemblyPart,
  resolveAssemblyParts,
} from "./types";
import {
  getPartBoundingRadius,
  formatPartDimensions,
  usePartGeometryAndEdges,
  toRadians,
} from "./shapes";

export interface ExplodedViewProps {
  design: AnyDesignInput;
  bom?: AnyBomInput;
  instructions?: AnyInstructionsInput;
  projectId?: string;
  initialExplode?: number;
  initialSelectedPartId?: string | null;
  initialShowCallouts?: boolean;
  className?: string;
}

interface DampedExplodeDriverProps {
  targetExplode: number;
  smoothedExplode: number;
  onUpdate: (val: number) => void;
}

const DampedExplodeDriver: React.FC<DampedExplodeDriverProps> = ({
  targetExplode,
  smoothedExplode,
  onUpdate,
}) => {
  const currentRef = useRef(smoothedExplode);

  useFrame((_, delta) => {
    const diff = Math.abs(currentRef.current - targetExplode);
    if (diff > 0.0008) {
      const next = THREE.MathUtils.damp(
        currentRef.current,
        targetExplode,
        7.5,
        Math.min(delta, 0.1)
      );
      currentRef.current = Math.abs(next - targetExplode) < 0.001 ? targetExplode : next;
      onUpdate(currentRef.current);
    }
  });

  return null;
};

interface PartInstanceNodeProps {
  part: ResolvedAssemblyPart;
  calloutNumber: number;
  projectId?: string;
  smoothedExplode: number;
  showCallouts: boolean;
  isHovered: boolean;
  isSelected: boolean;
  dimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const PartInstanceNode: React.FC<PartInstanceNodeProps> = ({
  part,
  calloutNumber,
  projectId,
  smoothedExplode,
  showCallouts,
  isHovered,
  isSelected,
  dimmed,
  onHover,
  onSelect,
}) => {
  const { geometry, edgesGeometry, boundRadius } = usePartGeometryAndEdges(
    part,
    projectId,
    24
  );

  const eulerRad = useMemo(
    () =>
      new THREE.Euler(
        toRadians(part.rotation[0]),
        toRadians(part.rotation[1]),
        toRadians(part.rotation[2])
      ),
    [part.rotation]
  );

  const curPos = useMemo<[number, number, number]>(
    () => [
      part.position[0] + part.explode[0] * smoothedExplode,
      part.position[1] + part.explode[1] * smoothedExplode,
      part.position[2] + part.explode[2] * smoothedExplode,
    ],
    [part.position, part.explode, smoothedExplode]
  );

  const explodeDist = Math.hypot(
    part.explode[0],
    part.explode[1],
    part.explode[2]
  );

  const showLeaderLine = smoothedExplode > 0.03 && explodeDist > 2;

  const leaderPoints = useMemo<[number, number, number][]>(() => {
    return [
      [part.position[0], part.position[1], part.position[2]],
      curPos,
    ];
  }, [part.position, curPos]);

  // Compute a deterministic radial/vertical offset for the numbered callout leader line
  const calloutOffset = useMemo<[number, number, number]>(() => {
    const angle = ((calloutNumber - 1) * 137.5 * Math.PI) / 180;
    const r = Math.min(28, Math.max(16, boundRadius * 0.55));
    const dx =
      Math.abs(part.position[0]) > 15
        ? Math.sign(part.position[0]) * (r * 0.85)
        : Math.cos(angle) * r;
    const dz =
      Math.abs(part.position[2]) > 15
        ? Math.sign(part.position[2]) * (r * 0.75)
        : Math.sin(angle) * r * 0.75;
    const dy = Math.min(28, Math.max(14, boundRadius * 0.45)) + (calloutNumber % 3) * 5;
    return [dx, dy, dz];
  }, [calloutNumber, boundRadius, part.position]);

  const baseColor = useMemo(() => new THREE.Color(part.color), [part.color]);
  const emissiveColor = useMemo(() => {
    if (isSelected) return new THREE.Color("#38BDF8");
    if (isHovered) return baseColor.clone().multiplyScalar(0.65);
    return new THREE.Color("#000000");
  }, [isSelected, isHovered, baseColor]);

  const isPurchased = part.category === "purchased";

  return (
    <>
      {showLeaderLine && (
        <Line
          points={leaderPoints}
          color={isSelected ? "#38BDF8" : isHovered ? "#93C5FD" : "#475569"}
          lineWidth={isSelected || isHovered ? 1.8 : 1}
          dashed
          dashScale={0.25}
          dashSize={4}
          gapSize={3}
          transparent
          opacity={dimmed ? 0.15 : isSelected || isHovered ? 0.9 : 0.45}
        />
      )}
      <group position={curPos}>
        <group rotation={eulerRad}>
          <mesh
            geometry={geometry}
            castShadow
            receiveShadow
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(part.instanceId);
            }}
            onPointerOut={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              onHover(null);
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(part.instanceId);
            }}
          >
            <meshStandardMaterial
              color={baseColor}
              roughness={isPurchased ? 0.28 : 0.36}
              metalness={isPurchased ? 0.55 : 0.12}
              emissive={emissiveColor}
              emissiveIntensity={isSelected ? 0.38 : isHovered ? 0.28 : 0.04}
            />
          </mesh>

          {/* Subtle technical edge overlay, brighter when hovered or selected */}
          <lineSegments geometry={edgesGeometry}>
            <lineBasicMaterial
              color={
                isSelected
                  ? "#7DD3FC"
                  : isHovered
                  ? "#FFFFFF"
                  : isPurchased
                  ? "#1E293B"
                  : "#0F172A"
              }
              transparent
              opacity={isSelected || isHovered ? 0.98 : dimmed ? 0.38 : 0.55}
            />
          </lineSegments>
        </group>

        {/* Numbered Callout: 3D Leader Line + Circled Number Badge */}
        {showCallouts && (
          <group>
            <Line
              points={[[0, 0, 0], calloutOffset]}
              color={
                isSelected
                  ? "#38BDF8"
                  : isHovered
                  ? "#BAE6FD"
                  : isPurchased
                  ? "#FBBF24"
                  : "#34D399"
              }
              lineWidth={isSelected || isHovered ? 2 : 1.25}
              transparent
              opacity={dimmed ? 0.28 : isSelected || isHovered ? 1 : 0.78}
            />
            <Html
              position={calloutOffset}
              center
              distanceFactor={250}
              zIndexRange={[15, 0]}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(part.instanceId);
                }}
                onMouseEnter={() => onHover(part.instanceId)}
                onMouseLeave={() => onHover(null)}
                data-testid={`exploded-callout-${calloutNumber}`}
                title={`${calloutNumber}. ${part.name}`}
                className={`w-6 h-6 rounded-full font-mono text-[11px] font-extrabold flex items-center justify-center border-2 transition-transform shadow-md ${
                  isSelected
                    ? "bg-sky-400 text-slate-950 border-white scale-125 ring-2 ring-sky-400/50"
                    : isHovered
                    ? "bg-slate-900 text-white border-sky-400 scale-110"
                    : isPurchased
                    ? "bg-slate-950/95 text-amber-300 border-amber-400/80"
                    : "bg-slate-950/95 text-emerald-300 border-emerald-400/80"
                }`}
              >
                {calloutNumber}
              </button>
            </Html>
          </group>
        )}

        {/* Floating 3D label on hover or selection */}
        {(isHovered || isSelected) && (
          <Html
            position={[0, boundRadius * 0.75 + 12, 0]}
            center
            distanceFactor={260}
            zIndexRange={[25, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className="px-2.5 py-1 rounded-md bg-slate-950/95 border border-sky-400/60 shadow-lg shadow-sky-950/60 backdrop-blur-md whitespace-nowrap flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-sky-500/25 border border-sky-400/60 text-[10px] font-mono font-bold text-sky-200 flex items-center justify-center">
                {calloutNumber}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: part.color }}
              />
              <span className="text-xs font-semibold text-white tracking-tight">
                {part.name}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                  part.category === "printed"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                }`}
              >
                {part.category}
              </span>
            </div>
          </Html>
        )}
      </group>
    </>
  );
};

interface CameraRigProps {
  focusTarget: [number, number, number] | null;
  focusRadius: number;
  resetTrigger: number;
  autoRotate: boolean;
  isUserInteracting: React.MutableRefObject<boolean>;
}

const CameraRig: React.FC<CameraRigProps> = ({
  focusTarget,
  focusRadius,
  resetTrigger,
  autoRotate,
  isUserInteracting,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const desiredTarget = useRef(new THREE.Vector3(10, 32, 0));
  const desiredCamPos = useRef<THREE.Vector3 | null>(null);
  const animatingCam = useRef(false);

  useEffect(() => {
    if (focusTarget) {
      desiredTarget.current.set(focusTarget[0], focusTarget[1], focusTarget[2]);
      const dist = Math.max(95, focusRadius * 3.4);
      desiredCamPos.current = new THREE.Vector3(
        focusTarget[0] + dist * 0.8,
        focusTarget[1] + dist * 0.6,
        focusTarget[2] + dist * 0.85
      );
      animatingCam.current = true;
    }
  }, [focusTarget, focusRadius]);

  useEffect(() => {
    if (resetTrigger > 0) {
      desiredTarget.current.set(10, 32, 0);
      desiredCamPos.current = new THREE.Vector3(240, 180, 265);
      animatingCam.current = true;
    }
  }, [resetTrigger]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const ctrl = controlsRef.current;

    ctrl.target.lerp(desiredTarget.current, Math.min(1, delta * 6));

    if (animatingCam.current && desiredCamPos.current) {
      camera.position.lerp(desiredCamPos.current, Math.min(1, delta * 5.5));
      if (camera.position.distanceTo(desiredCamPos.current) < 1.5) {
        animatingCam.current = false;
      }
    }
    ctrl.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      autoRotate={autoRotate && !animatingCam.current}
      autoRotateSpeed={0.9}
      minDistance={45}
      maxDistance={650}
      onStart={() => {
        isUserInteracting.current = true;
        animatingCam.current = false;
      }}
      onEnd={() => {
        isUserInteracting.current = false;
      }}
    />
  );
};

export const ExplodedView: React.FC<ExplodedViewProps> = ({
  design,
  bom,
  instructions,
  projectId,
  initialExplode = 0.45,
  initialSelectedPartId = null,
  initialShowCallouts = true,
  className = "",
}) => {
  const [explode, setExplode] = useState<number>(initialExplode);
  const [smoothedExplode, setSmoothedExplode] = useState<number>(initialExplode);
  const [showCallouts, setShowCallouts] = useState<boolean>(initialShowCallouts);
  const [filterMode, setFilterMode] = useState<PartFilterMode>("all");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedPartId
  );
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [focusTarget, setFocusTarget] = useState<
    [number, number, number] | null
  >(null);
  const [focusRadius, setFocusRadius] = useState<number>(35);
  const [resetTrigger, setResetTrigger] = useState<number>(0);
  const isUserInteracting = useRef<boolean>(false);

  const allParts = useMemo(
    () => resolveAssemblyParts(design, bom, instructions),
    [design, bom, instructions]
  );

  // Select the first part initially if requested or keep responsive
  useEffect(() => {
    if (initialSelectedPartId) {
      const match = allParts.find(
        (p) =>
          p.instanceId === initialSelectedPartId ||
          p.partId === initialSelectedPartId
      );
      if (match) setSelectedId(match.instanceId);
    }
  }, [initialSelectedPartId, allParts]);

  const counts = useMemo(() => {
    const printed = allParts.filter((p) => p.category === "printed").length;
    const purchased = allParts.filter((p) => p.category === "purchased").length;
    return {
      all: allParts.length,
      printed,
      purchased,
    };
  }, [allParts]);

  const visibleParts = useMemo(() => {
    if (filterMode === "all") return allParts;
    return allParts.filter((p) => p.category === filterMode);
  }, [allParts, filterMode]);

  const selectedPart = useMemo(
    () => allParts.find((p) => p.instanceId === selectedId) ?? null,
    [allParts, selectedId]
  );

  const hoveredPart = useMemo(
    () => allParts.find((p) => p.instanceId === hoveredId) ?? null,
    [allParts, hoveredId]
  );

  const handleFocusPart = (part: ResolvedAssemblyPart) => {
    const pos: [number, number, number] = [
      part.position[0] + part.explode[0] * smoothedExplode,
      part.position[1] + part.explode[1] * smoothedExplode,
      part.position[2] + part.explode[2] * smoothedExplode,
    ];
    setFocusTarget(pos);
    setFocusRadius(getPartBoundingRadius(part.shape, part.params));
    setAutoRotate(false);
  };

  const handleResetCamera = () => {
    setFocusTarget(null);
    setResetTrigger((c) => c + 1);
  };

  return (
    <div
      className={`relative w-full h-[640px] min-h-[540px] rounded-2xl overflow-hidden bg-[#080C14] border border-slate-800/80 shadow-2xl flex flex-col select-none ${className}`}
      data-testid="exploded-view-root"
    >
      {/* Subtle radial glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 42% 45%, rgba(56, 189, 248, 0.09) 0%, rgba(15, 23, 42, 0.03) 48%, rgba(8, 12, 20, 0.95) 100%)",
        }}
      />

      {/* Top HUD Bar: Title + Filter Toggles + Callouts + Auto-Rotate & Reset */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/75 border-b border-slate-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_10px_#38BDF8]" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 tracking-tight leading-none">
                Interactive 3D Exploded Assembly
              </h3>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                Real STL + CAD
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Orbit, scrub explosion vectors, or click any numbered callout to
              inspect CAD &amp; BOM specs
            </p>
          </div>
        </div>

        {/* Filter Mode Segmented Control & Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex rounded-lg bg-slate-900/95 p-1 border border-slate-800"
            role="group"
            aria-label="Part category filter"
          >
            {(
              [
                { id: "all", label: "All Parts", count: counts.all },
                { id: "printed", label: "Printed Only", count: counts.printed },
                {
                  id: "purchased",
                  label: "Purchased Only",
                  count: counts.purchased,
                },
              ] as const
            ).map((tab) => {
              const active = filterMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  data-testid={`filter-${tab.id}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                    active
                      ? "bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active
                        ? "bg-sky-400/25 text-sky-200"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowCallouts((v) => !v)}
            data-testid="toggle-callouts"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
              showCallouts
                ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle numbered part callouts and legend"
          >
            <span className="w-4 h-4 rounded-full bg-sky-500/25 border border-sky-400/60 font-mono text-[10px] font-bold flex items-center justify-center">
              #
            </span>
            Callouts
          </button>

          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            data-testid="toggle-autorotate"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
              autoRotate
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="Toggle idle turntable rotation"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoRotate ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            Auto-Rotate
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Reset camera framing"
          >
            Reset View
          </button>
        </div>
      </div>

      {/* Main Viewport Area */}
      <div className="relative flex-1 w-full overflow-hidden">
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ position: [240, 180, 265], fov: 40, near: 1, far: 2500 }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={["#080C14"]} />
          <fog attach="fog" args={["#080C14", 420, 1100]} />

          <DampedExplodeDriver
            targetExplode={explode}
            smoothedExplode={smoothedExplode}
            onUpdate={setSmoothedExplode}
          />

          {/* Soft Studio Lighting */}
          <ambientLight intensity={0.75} />
          <hemisphereLight
            args={["#E0F2FE", "#1E293B", 0.85]}
            position={[0, 200, 0]}
          />
          <directionalLight
            position={[150, 240, 160]}
            intensity={1.55}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0005}
          />
          <directionalLight
            position={[-160, 120, -140]}
            intensity={0.65}
            color="#38BDF8"
          />
          <pointLight position={[0, 90, 140]} intensity={0.45} color="#F8FAFC" />

          {/* Assembly Parts */}
          <group position={[0, -32, 0]}>
            {visibleParts.map((part, idx) => (
              <PartInstanceNode
                key={part.instanceId}
                part={part}
                calloutNumber={part.calloutNumber ?? idx + 1}
                projectId={projectId}
                smoothedExplode={smoothedExplode}
                showCallouts={showCallouts}
                isHovered={hoveredId === part.instanceId}
                isSelected={selectedId === part.instanceId}
                dimmed={
                  selectedId !== null &&
                  selectedId !== part.instanceId &&
                  hoveredId !== part.instanceId
                }
                onHover={setHoveredId}
                onSelect={(id) => {
                  setSelectedId(id);
                }}
              />
            ))}
          </group>

          {/* Studio Ground Grid & Soft Contact Shadows */}
          <group position={[0, -58, 0]}>
            <ContactShadows
              position={[0, 0.2, 0]}
              opacity={0.55}
              scale={340}
              blur={2.4}
              far={180}
              color="#020617"
            />
            <gridHelper
              args={[360, 18, "#1E293B", "#0F172A"]}
              position={[0, 0, 0]}
            />
          </group>

          <CameraRig
            focusTarget={focusTarget}
            focusRadius={focusRadius}
            resetTrigger={resetTrigger}
            autoRotate={autoRotate}
            isUserInteracting={isUserInteracting}
          />
        </Canvas>

        {/* Top-Left Numbered Parts Legend when Callouts are enabled */}
        {showCallouts && (
          <div
            className="hidden sm:flex absolute top-3 left-4 z-10 w-64 max-h-[260px] rounded-xl bg-slate-950/90 border border-slate-800/90 p-3 shadow-xl backdrop-blur-md flex-col"
            data-testid="exploded-parts-legend"
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
                Parts Callout Legend
              </span>
              <span className="text-[10px] font-mono text-sky-400">
                {visibleParts.length} items
              </span>
            </div>
            <div className="overflow-y-auto space-y-1 pr-1">
              {visibleParts.map((part, idx) => {
                const cNum = part.calloutNumber ?? idx + 1;
                const isSel = selectedId === part.instanceId;
                const isHov = hoveredId === part.instanceId;
                return (
                  <button
                    key={part.instanceId}
                    type="button"
                    onClick={() => setSelectedId(part.instanceId)}
                    onMouseEnter={() => setHoveredId(part.instanceId)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                      isSel
                        ? "bg-sky-500/20 text-white border border-sky-400/50"
                        : isHov
                        ? "bg-slate-800/90 text-slate-100"
                        : "hover:bg-slate-900/80 text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-4 h-4 rounded-full font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border ${
                          part.category === "printed"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/60"
                            : "bg-amber-500/20 text-amber-300 border-amber-400/60"
                        }`}
                      >
                        {cNum}
                      </span>
                      <span className="truncate font-medium">{part.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {part.partNumber || `×${part.quantity}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom-Left Explode Vector Slider Control Panel */}
        <div className="absolute left-4 bottom-14 z-10 w-80 max-w-[calc(100%-2rem)] rounded-xl bg-slate-950/90 border border-slate-800/90 p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-sky-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
              Explode Factor
            </span>
            <span
              className="text-xs font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20"
              data-testid="explode-value"
            >
              {Math.round(explode * 100)}%
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => setExplode(parseFloat(e.target.value))}
            aria-label="Explode slider"
            data-testid="explode-slider"
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />

          <div className="flex items-center justify-between gap-1.5 mt-2.5">
            {[
              { label: "Assembled (0%)", val: 0 },
              { label: "45%", val: 0.45 },
              { label: "Full Explode (100%)", val: 1 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setExplode(preset.val)}
                className={`flex-1 py-1 px-2 rounded text-[11px] font-medium border transition-colors ${
                  Math.abs(explode - preset.val) < 0.03
                    ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                    : "bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hovered Part Quick Status Pill (Top-Left inside canvas when legend is hidden) */}
        {hoveredPart && !selectedPart && !showCallouts && (
          <div className="absolute top-3 left-4 z-10 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-700/80 backdrop-blur-md flex items-center gap-2 pointer-events-none">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: hoveredPart.color }}
            />
            <span className="text-xs font-medium text-slate-100">
              {hoveredPart.name}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              · Click to inspect
            </span>
          </div>
        )}

        {/* Right Side Inspector Card when a Part is Selected */}
        {selectedPart && (
          <div
            className="absolute top-3 right-4 bottom-14 z-20 w-80 max-w-[calc(100%-2rem)] rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
            data-testid="selected-part-card"
          >
            {/* Card Header */}
            <div className="p-4 border-b border-slate-800/90 flex items-start justify-between gap-2 bg-gradient-to-b from-slate-900/90 to-slate-950/40">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 border border-sky-400/50 text-[11px] font-mono font-bold text-sky-300 flex items-center justify-center">
                    {selectedPart.calloutNumber ?? 1}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      selectedPart.category === "printed"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {selectedPart.category === "printed"
                      ? "3D Printed STL"
                      : "Purchased Component"}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                    Qty ×{selectedPart.quantity}
                  </span>
                </div>
                <h4 className="text-base font-bold text-white leading-snug flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                    style={{ backgroundColor: selectedPart.color }}
                  />
                  {selectedPart.name}
                </h4>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                  ID: {selectedPart.partId} · Shape: {selectedPart.shape}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close inspector card"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Card Body */}
            <div className="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
              {/* Envelope & Coordinates */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Envelope (mm)
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
                    {formatPartDimensions(
                      selectedPart.shape,
                      selectedPart.params,
                      selectedPart.dims_mm
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/90">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Assembly Step
                  </div>
                  <div className="text-xs font-mono font-semibold text-sky-300 mt-0.5">
                    Step #{selectedPart.step}
                  </div>
                </div>
              </div>

              {/* Assembly Step Details */}
              <div className="p-3 rounded-lg bg-slate-900/75 border border-slate-800/90">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    Used In Assembly Step
                  </span>
                  {selectedPart.stepInfo?.action && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                      {selectedPart.stepInfo.action}
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium text-slate-200">
                  {selectedPart.stepInfo
                    ? `Step ${selectedPart.stepInfo.n}: ${selectedPart.stepInfo.title}`
                    : `Step ${selectedPart.step}: Install ${selectedPart.name}`}
                </div>
                {(selectedPart.stepInfo?.note ||
                  selectedPart.roleInAssembly ||
                  selectedPart.description) && (
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {selectedPart.stepInfo?.note ||
                      selectedPart.roleInAssembly ||
                      selectedPart.description}
                  </p>
                )}
              </div>

              {/* BOM / Pricing Info */}
              {selectedPart.category === "purchased" ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-300">
                      BOM Line Item
                    </span>
                    {selectedPart.bomItem && (
                      <span className="text-sm font-mono font-bold text-amber-200">
                        ${selectedPart.bomItem.priceUsd.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-slate-100 mt-1">
                    {selectedPart.bomItem?.name ||
                      selectedPart.bomLine ||
                      selectedPart.name}
                  </div>
                  {selectedPart.bomItem?.links &&
                    selectedPart.bomItem.links.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {selectedPart.bomItem.links.map((link, idx) => (
                          <a
                            key={`${link.retailer}-${idx}`}
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-[11px] font-medium transition-colors"
                          >
                            <span>{link.retailer}</span>
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M7 17L17 7M7 7h10v10" />
                            </svg>
                          </a>
                        ))}
                      </div>
                    )}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-300">
                      Additive Manufacturing
                    </span>
                    <span className="text-xs font-mono font-semibold text-emerald-200">
                      ~$0.45 filament
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    Standard PLA / PETG · 0.20mm layer height · 15% gyroid infill
                  </div>
                </div>
              )}
            </div>

            {/* Card Footer Actions */}
            <div className="p-3 border-t border-slate-800/90 bg-slate-900/70 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleFocusPart(selectedPart)}
                data-testid="focus-part-btn"
                className="flex-1 py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M3 12h3m12 0h3M12 3v3m0 12v3" />
                </svg>
                Focus Camera on Part
              </button>
              <button
                type="button"
                onClick={handleResetCamera}
                className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors"
              >
                Unfocus
              </button>
            </div>
          </div>
        )}

        {/* Bottom Part Quick-Select Strip */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-4 py-2 bg-slate-950/85 border-t border-slate-800/80 backdrop-blur-md flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1 shrink-0">
            Parts ({visibleParts.length}):
          </span>
          {visibleParts.map((part, idx) => {
            const cNum = part.calloutNumber ?? idx + 1;
            const isSel = selectedId === part.instanceId;
            return (
              <button
                key={part.instanceId}
                type="button"
                onClick={() => {
                  setSelectedId(part.instanceId);
                }}
                onMouseEnter={() => setHoveredId(part.instanceId)}
                onMouseLeave={() => setHoveredId(null)}
                data-testid={`part-chip-${part.partId}`}
                className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 border ${
                  isSel
                    ? "bg-sky-500/20 border-sky-400 text-white shadow-sm"
                    : "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-600 font-mono text-[10px] font-bold text-slate-200 flex items-center justify-center shrink-0">
                  {cNum}
                </span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: part.color }}
                />
                <span>{part.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ExplodedView;
