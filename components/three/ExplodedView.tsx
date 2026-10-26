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
import { toRenaissancePartColor } from "./adapters";
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

  const resolvedHex = useMemo(
    () =>
      toRenaissancePartColor(
        part.color,
        part.category,
        Math.max(0, calloutNumber - 1)
      ),
    [part.color, part.category, calloutNumber]
  );

  const baseColor = useMemo(() => new THREE.Color(resolvedHex), [resolvedHex]);
  const emissiveColor = useMemo(() => {
    if (isSelected) return new THREE.Color("#D4AF37");
    if (isHovered) return new THREE.Color("#B89B4A");
    return new THREE.Color("#2B1D0E");
  }, [isSelected, isHovered]);

  const isPurchased = part.category === "purchased";

  return (
    <>
      {showLeaderLine && (
        <Line
          points={leaderPoints}
          color={isSelected ? "#F3D478" : isHovered ? "#D4AF37" : "#9C7A4C"}
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
              roughness={isPurchased ? 0.26 : 0.42}
              metalness={isPurchased ? 0.68 : 0.16}
              emissive={emissiveColor}
              emissiveIntensity={isSelected ? 0.36 : isHovered ? 0.24 : 0.06}
            />
          </mesh>

          {/* Subtle technical edge overlay, brighter when hovered or selected */}
          <lineSegments geometry={edgesGeometry}>
            <lineBasicMaterial
              color={
                isSelected
                  ? "#F3D478"
                  : isHovered
                  ? "#F5EBD6"
                  : isPurchased
                  ? "#3B2410"
                  : "#2B1D0E"
              }
              transparent
              opacity={isSelected || isHovered ? 0.98 : dimmed ? 0.38 : 0.58}
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
                  ? "#F3D478"
                  : isHovered
                  ? "#E6D3B3"
                  : isPurchased
                  ? "#D4AF37"
                  : "#C5A059"
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
                    ? "bg-[#f3d478] text-[#140e07] border-[#f5ebd6] scale-125 ring-2 ring-[#d4af37]/50"
                    : isHovered
                    ? "bg-[#1d1710] text-[#f5ebd6] border-[#f3d478] scale-110"
                    : isPurchased
                    ? "bg-[#14100b]/95 text-[#f3d478] border-[#d4af37]/85"
                    : "bg-[#14100b]/95 text-[#e6d3b3] border-[#b89b4a]/80"
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
            <div className="px-2.5 py-1 rounded-md bg-[#14100b]/95 border border-[#d4af37]/60 shadow-lg shadow-black/80 backdrop-blur-md whitespace-nowrap flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-[#d4af37]/25 border border-[#d4af37]/60 text-[10px] font-mono font-bold text-[#f3d478] flex items-center justify-center">
                {calloutNumber}
              </span>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: resolvedHex }}
              />
              <span className="text-xs font-display font-bold text-[#f5ebd6] tracking-tight">
                {part.name}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                  part.category === "printed"
                    ? "bg-[#b89b4a]/20 text-[#e6d3b3] border border-[#b89b4a]/40"
                    : "bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/40"
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
  defaultTarget: [number, number, number];
  defaultCamPos: [number, number, number];
  resetTrigger: number;
  autoRotate: boolean;
  isUserInteracting: React.MutableRefObject<boolean>;
}

const CameraRig: React.FC<CameraRigProps> = ({
  focusTarget,
  focusRadius,
  defaultTarget,
  defaultCamPos,
  resetTrigger,
  autoRotate,
  isUserInteracting,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const desiredTarget = useRef(
    new THREE.Vector3(defaultTarget[0], defaultTarget[1], defaultTarget[2])
  );
  const desiredCamPos = useRef<THREE.Vector3 | null>(null);
  const animatingCam = useRef(false);

  useEffect(() => {
    if (!focusTarget) {
      desiredTarget.current.set(
        defaultTarget[0],
        defaultTarget[1],
        defaultTarget[2]
      );
      camera.position.set(defaultCamPos[0], defaultCamPos[1], defaultCamPos[2]);
    }
  }, [defaultTarget, defaultCamPos, focusTarget, camera]);

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
      desiredTarget.current.set(
        defaultTarget[0],
        defaultTarget[1],
        defaultTarget[2]
      );
      desiredCamPos.current = new THREE.Vector3(
        defaultCamPos[0],
        defaultCamPos[1],
        defaultCamPos[2]
      );
      animatingCam.current = true;
    }
  }, [resetTrigger, defaultTarget, defaultCamPos]);

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

  const sceneFraming = useMemo(() => {
    if (allParts.length === 0) {
      return {
        defaultTarget: [10, 32, 0] as [number, number, number],
        defaultCamPos: [240, 180, 265] as [number, number, number],
      };
    }
    let minY = Infinity;
    let maxY = -Infinity;
    let maxHoriz = 80;
    for (const p of allParts) {
      const py0 = p.position[1];
      const py1 = p.position[1] + p.explode[1] * 0.55;
      const halfH = Math.max(15, (p.dims_mm?.[2] ?? p.dims_mm?.[1] ?? 30) * 0.45);
      minY = Math.min(minY, py0 - halfH, py1 - halfH);
      maxY = Math.max(maxY, py0 + halfH, py1 + halfH);
      const hx = Math.abs(p.position[0] + p.explode[0] * 0.5) + (p.dims_mm?.[0] ?? 40) * 0.4;
      const hz = Math.abs(p.position[2] + p.explode[2] * 0.5) + (p.dims_mm?.[1] ?? 40) * 0.4;
      maxHoriz = Math.max(maxHoriz, hx, hz);
    }
    const spanY = Math.max(120, maxY - minY);
    const centerY = (minY + maxY) / 2 - 32;
    const scale = Math.max(0.95, Math.min(1.85, Math.max(spanY / 210, maxHoriz / 135)));
    return {
      defaultTarget: [6, Math.round(centerY), 0] as [number, number, number],
      defaultCamPos: [
        Math.round(235 * scale),
        Math.round(centerY + 135 * scale),
        Math.round(265 * scale),
      ] as [number, number, number],
    };
  }, [allParts]);

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
      className={`relative w-full h-[640px] min-h-[540px] rounded-2xl overflow-hidden bg-[#0c0906] border border-[#d4af37]/30 shadow-2xl flex flex-col select-none ${className}`}
      data-testid="exploded-view-root"
    >
      {/* Subtle radial glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 42% 45%, rgba(212, 175, 55, 0.09) 0%, rgba(43, 29, 14, 0.05) 48%, rgba(12, 9, 6, 0.96) 100%)",
        }}
      />

      {/* Top HUD Bar: Title + Filter Toggles + Callouts + Auto-Rotate & Reset */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#14100b]/90 border-b border-[#d4af37]/25 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#d4af37] shadow-[0_0_10px_#d4af37]" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-[#f5ebd6] tracking-tight leading-none">
                Interactive 3D Exploded Assembly
              </h3>
              <span className="px-2 py-0.5 rounded bg-[#d4af37]/15 border border-[#d4af37]/40 text-[10px] font-codex font-bold uppercase tracking-wider text-[#f3d478]">
                Real STL + CAD
              </span>
            </div>
            <p className="text-[11px] text-[#bda782] mt-1">
              Orbit, scrub explosion vectors, or click any numbered callout to
              inspect CAD &amp; BOM specs
            </p>
          </div>
        </div>

        {/* Filter Mode Segmented Control & Toggles */}
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="inline-flex rounded-lg bg-[#0c0906]/95 p-1 border border-[#d4af37]/25"
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
                  className={`px-2.5 py-1 rounded-md font-codex text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                    active
                      ? "bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/50 shadow-sm"
                      : "text-[#bda782] hover:text-[#f5ebd6] border border-transparent"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active
                        ? "bg-[#d4af37] text-[#140e07] font-bold"
                        : "bg-[#1d1710] text-[#bda782]"
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
            className={`px-2.5 py-1.5 rounded-lg font-codex text-xs font-bold tracking-wide border transition-all flex items-center gap-1.5 ${
              showCallouts
                ? "bg-[#d4af37]/20 border-[#d4af37]/50 text-[#f3d478]"
                : "bg-[#0c0906] border-[#d4af37]/25 text-[#bda782] hover:text-[#f5ebd6]"
            }`}
            title="Toggle numbered part callouts and legend"
          >
            <span className="w-4 h-4 rounded-full bg-[#d4af37]/25 border border-[#d4af37]/60 font-mono text-[10px] font-bold text-[#f3d478] flex items-center justify-center">
              #
            </span>
            Callouts
          </button>

          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            data-testid="toggle-autorotate"
            className={`px-2.5 py-1.5 rounded-lg font-codex text-xs font-bold tracking-wide border transition-all flex items-center gap-1.5 ${
              autoRotate
                ? "bg-[#b89b4a]/20 border-[#b89b4a]/50 text-[#f3d478]"
                : "bg-[#0c0906] border-[#d4af37]/25 text-[#bda782] hover:text-[#f5ebd6]"
            }`}
            title="Toggle idle turntable rotation"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoRotate ? "bg-[#f3d478] animate-pulse" : "bg-[#5c4930]"
              }`}
            />
            Auto-Rotate
          </button>

          <button
            type="button"
            onClick={handleResetCamera}
            className="px-2.5 py-1.5 rounded-lg font-codex text-xs font-bold tracking-wide bg-[#0c0906] hover:bg-[#1d1710] text-[#e6d3b3] border border-[#d4af37]/25 transition-colors"
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
          camera={{
            position: sceneFraming.defaultCamPos,
            fov: 40,
            near: 1,
            far: 3000,
          }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={["#0C0906"]} />
          <fog attach="fog" args={["#0C0906", 680, 1650]} />

          <DampedExplodeDriver
            targetExplode={explode}
            smoothedExplode={smoothedExplode}
            onUpdate={setSmoothedExplode}
          />

          {/* Soft Chiaroscuro Workshop Lighting */}
          <ambientLight intensity={0.78} />
          <hemisphereLight
            args={["#FFF4D6", "#2B1D0E", 0.88]}
            position={[0, 200, 0]}
          />
          <directionalLight
            position={[150, 240, 160]}
            intensity={1.55}
            color="#FFF4D6"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0005}
          />
          <directionalLight
            position={[-160, 120, -140]}
            intensity={0.65}
            color="#D4AF37"
          />
          <pointLight position={[0, 90, 140]} intensity={0.45} color="#F5EBD6" />

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

          {/* Sepia Ground Grid & Soft Contact Shadows */}
          <group position={[0, -58, 0]}>
            <ContactShadows
              position={[0, 0.2, 0]}
              opacity={0.55}
              scale={340}
              blur={2.4}
              far={180}
              color="#050302"
            />
            <gridHelper
              args={[360, 18, "#5C4930", "#282016"]}
              position={[0, 0, 0]}
            />
          </group>

          <CameraRig
            focusTarget={focusTarget}
            focusRadius={focusRadius}
            defaultTarget={sceneFraming.defaultTarget}
            defaultCamPos={sceneFraming.defaultCamPos}
            resetTrigger={resetTrigger}
            autoRotate={autoRotate}
            isUserInteracting={isUserInteracting}
          />
        </Canvas>

        {/* Top-Left Numbered Parts Legend when Callouts are enabled */}
        {showCallouts && (
          <div
            className="hidden sm:flex absolute top-3 left-4 z-10 w-64 max-h-[260px] rounded-xl bg-[#14100b]/92 border border-[#d4af37]/30 p-3 shadow-xl backdrop-blur-md flex-col"
            data-testid="exploded-parts-legend"
          >
            <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-[#d4af37]/20">
              <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#f3d478]">
                Parts Callout Legend
              </span>
              <span className="text-[10px] font-mono text-[#d4af37]">
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
                        ? "bg-[#d4af37]/20 text-[#f5ebd6] border border-[#d4af37]/55"
                        : isHov
                        ? "bg-[#282016]/90 text-[#f5ebd6]"
                        : "hover:bg-[#1d1710]/80 text-[#e6d3b3]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-4 h-4 rounded-full font-mono text-[10px] font-bold flex items-center justify-center shrink-0 border ${
                          part.category === "printed"
                            ? "bg-[#b89b4a]/20 text-[#e6d3b3] border-[#b89b4a]/60"
                            : "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/65"
                        }`}
                      >
                        {cNum}
                      </span>
                      <span className="truncate font-medium">{part.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#bda782] shrink-0">
                      {part.partNumber || `×${part.quantity}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom-Left Explode Vector Slider Control Panel */}
        <div className="absolute left-4 bottom-14 z-10 w-80 max-w-[calc(100%-2rem)] rounded-xl bg-[#14100b]/92 border border-[#d4af37]/30 p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="font-codex text-xs font-bold uppercase tracking-wider text-[#f5ebd6] flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-[#d4af37]"
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
              className="text-xs font-mono font-bold text-[#f3d478] bg-[#d4af37]/15 px-2 py-0.5 rounded border border-[#d4af37]/35"
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
            className="w-full h-2 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
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
                    ? "bg-[#d4af37]/25 border-[#d4af37]/55 text-[#f3d478] font-bold"
                    : "bg-[#0c0906]/90 border-[#d4af37]/20 text-[#bda782] hover:text-[#f5ebd6]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hovered Part Quick Status Pill (Top-Left inside canvas when legend is hidden) */}
        {hoveredPart && !selectedPart && !showCallouts && (
          <div className="absolute top-3 left-4 z-10 px-3 py-1.5 rounded-lg bg-[#14100b]/92 border border-[#d4af37]/40 backdrop-blur-md flex items-center gap-2 pointer-events-none">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: hoveredPart.color }}
            />
            <span className="text-xs font-medium text-[#f5ebd6]">
              {hoveredPart.name}
            </span>
            <span className="text-[11px] text-[#bda782] font-mono">
              · Click to inspect
            </span>
          </div>
        )}

        {/* Right Side Inspector Card when a Part is Selected */}
        {selectedPart && (
          <div
            className="absolute top-3 right-4 bottom-14 z-20 w-80 max-w-[calc(100%-2rem)] rounded-xl bg-[#14100b]/95 border border-[#d4af37]/40 shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden"
            data-testid="selected-part-card"
          >
            {/* Card Header */}
            <div className="p-4 border-b border-[#d4af37]/25 flex items-start justify-between gap-2 bg-gradient-to-b from-[#1d1710]/90 to-[#14100b]/60">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 border border-[#d4af37]/55 text-[11px] font-mono font-bold text-[#f3d478] flex items-center justify-center">
                    {selectedPart.calloutNumber ?? 1}
                  </span>
                  <span
                    className={`text-[10px] font-codex font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                      selectedPart.category === "printed"
                        ? "bg-[#b89b4a]/20 text-[#e6d3b3] border-[#b89b4a]/45"
                        : "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/45"
                    }`}
                  >
                    {selectedPart.category === "printed"
                      ? "3D Printed STL"
                      : "Purchased Component"}
                  </span>
                  <span className="text-[11px] font-mono text-[#bda782] bg-[#0c0906] px-1.5 py-0.5 rounded border border-[#d4af37]/20">
                    Qty ×{selectedPart.quantity}
                  </span>
                </div>
                <h4 className="font-display text-lg font-bold text-[#f5ebd6] leading-snug flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-[#f5ebd6]/30"
                    style={{ backgroundColor: selectedPart.color }}
                  />
                  {selectedPart.name}
                </h4>
                <p className="text-[11px] font-mono text-[#bda782] mt-0.5">
                  ID: {selectedPart.partId} · Shape: {selectedPart.shape}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close inspector card"
                className="p-1 rounded-lg text-[#bda782] hover:text-[#f5ebd6] hover:bg-[#282016]/80 transition-colors"
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
                <div className="p-2.5 rounded-lg bg-[#0c0906]/90 border border-[#d4af37]/20">
                  <div className="text-[10px] font-codex uppercase tracking-wider text-[#bda782]">
                    Envelope (mm)
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#f5ebd6] mt-0.5">
                    {formatPartDimensions(
                      selectedPart.shape,
                      selectedPart.params,
                      selectedPart.dims_mm
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0c0906]/90 border border-[#d4af37]/20">
                  <div className="text-[10px] font-codex uppercase tracking-wider text-[#bda782]">
                    Assembly Step
                  </div>
                  <div className="text-xs font-mono font-semibold text-[#f3d478] mt-0.5">
                    Step #{selectedPart.step}
                  </div>
                </div>
              </div>

              {/* Assembly Step Details */}
              <div className="p-3 rounded-lg bg-[#0c0906]/80 border border-[#d4af37]/20">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-codex uppercase tracking-wider font-bold text-[#bda782]">
                    Used In Assembly Step
                  </span>
                  {selectedPart.stepInfo?.action && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#d4af37]/15 text-[#f3d478] border border-[#d4af37]/35">
                      {selectedPart.stepInfo.action}
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium text-[#f5ebd6]">
                  {selectedPart.stepInfo
                    ? `Step ${selectedPart.stepInfo.n}: ${selectedPart.stepInfo.title}`
                    : `Step ${selectedPart.step}: Install ${selectedPart.name}`}
                </div>
                {(selectedPart.stepInfo?.note ||
                  selectedPart.roleInAssembly ||
                  selectedPart.description) && (
                  <p className="text-[11px] text-[#bda782] mt-1 leading-relaxed">
                    {selectedPart.stepInfo?.note ||
                      selectedPart.roleInAssembly ||
                      selectedPart.description}
                  </p>
                )}
              </div>

              {/* BOM / Pricing Info */}
              {selectedPart.category === "purchased" ? (
                <div className="p-3 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-codex uppercase tracking-wider font-bold text-[#f3d478]">
                      BOM Line Item
                    </span>
                    {selectedPart.bomItem && (
                      <span className="text-sm font-mono font-bold text-[#f3d478]">
                        ${selectedPart.bomItem.priceUsd.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-[#f5ebd6] mt-1">
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0c0906]/90 hover:bg-[#1d1710] text-[#f3d478] border border-[#d4af37]/35 text-[11px] font-medium transition-colors"
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
                <div className="p-3 rounded-lg bg-[#b89b4a]/10 border border-[#b89b4a]/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-codex uppercase tracking-wider font-bold text-[#e6d3b3]">
                      Additive Manufacturing
                    </span>
                    <span className="text-xs font-mono font-semibold text-[#f3d478]">
                      ~$0.45 filament
                    </span>
                  </div>
                  <div className="text-[11px] text-[#e6d3b3] mt-1">
                    Standard PLA / PETG · 0.20mm layer height · 15% gyroid infill
                  </div>
                </div>
              )}
            </div>

            {/* Card Footer Actions */}
            <div className="p-3 border-t border-[#d4af37]/25 bg-[#0c0906]/80 flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleFocusPart(selectedPart)}
                data-testid="focus-part-btn"
                className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] hover:brightness-110 text-[#140e07] font-codex font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-[#d4af37]/20"
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
                className="py-2 px-3 rounded-lg bg-[#1d1710] hover:bg-[#282016] text-[#e6d3b3] border border-[#d4af37]/25 font-medium text-xs transition-colors"
              >
                Unfocus
              </button>
            </div>
          </div>
        )}

        {/* Bottom Part Quick-Select Strip */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-4 py-2 bg-[#14100b]/92 border-t border-[#d4af37]/25 backdrop-blur-md flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#bda782] mr-1 shrink-0">
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
                    ? "bg-[#d4af37]/20 border-[#d4af37] text-[#f5ebd6] shadow-sm"
                    : "bg-[#0c0906]/90 border-[#d4af37]/20 text-[#e6d3b3] hover:border-[#d4af37]/50 hover:text-[#f5ebd6]"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-[#1d1710] border border-[#d4af37]/50 font-mono text-[10px] font-bold text-[#f3d478] flex items-center justify-center shrink-0">
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
