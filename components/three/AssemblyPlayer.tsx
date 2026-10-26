"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line, Html, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import {
  AnyDesignInput,
  AnyInstructionsInput,
  InstructionStep,
  ResolvedAssemblyPart,
  StepMotion,
  resolveAssemblyParts,
} from "./types";
import { adaptInstructions } from "./adapters";
import {
  computeAssemblyFraming,
  usePartGeometryAndEdges,
  toRadians,
} from "./shapes";

export interface AssemblyPlayerProps {
  design?: AnyDesignInput;
  instructions: AnyInstructionsInput;
  projectId?: string;
  /**
   * Optional deterministic step override (1-based step number, or fractional e.g. 2.75).
   * When provided, drives the player deterministically for video capture.
   */
  externalStep?: number;
  /**
   * Callback fired when a step finishes its fly-in animation.
   */
  onStepDone?: (stepNumber: number) => void;
  autoPlay?: boolean;
  initialSpeed?: number;
  className?: string;
}

export interface DeterministicCaptureDriverOptions {
  totalSteps: number;
  stepDurationMs?: number;
  onSetStep: (stepNumber: number) => void;
  onComplete?: () => void;
}

/**
 * Helper function to drive `<AssemblyPlayer />` deterministically across all steps
 * for automated video/screenshot capture. Returns a cleanup/cancel function.
 */
export function driveAssemblyPlayer({
  totalSteps,
  stepDurationMs = 1400,
  onSetStep,
  onComplete,
}: DeterministicCaptureDriverOptions): () => void {
  let current = 1;
  let cancelled = false;
  onSetStep(1);

  const timer = setInterval(() => {
    if (cancelled) return;
    current += 1;
    if (current > totalSteps) {
      clearInterval(timer);
      onComplete?.();
    } else {
      onSetStep(current);
    }
  }, stepDurationMs);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

let cachedToonGradient: THREE.DataTexture | null = null;
function getToonGradientTexture(): THREE.DataTexture {
  if (cachedToonGradient) return cachedToonGradient;
  // 4-band crisp cel-shading gradient (paper shadow -> mid -> light -> highlight)
  const data = new Uint8Array([
    165, 165, 165, 255,
    205, 205, 205, 255,
    238, 238, 238, 255,
    255, 255, 255, 255,
  ]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  cachedToonGradient = tex;
  return tex;
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

interface IkeaPartMeshProps {
  part: ResolvedAssemblyPart;
  calloutNumber: number;
  projectId?: string;
  status: "assembled" | "active" | "future";
  stepProgress: number; // 0..1 within current step
  action?: string;
  motionVector?: StepMotion;
  activeIndex?: number;
  activeCount?: number;
  showCallouts?: boolean;
  isHighlighted?: boolean;
}

const IkeaPartMesh: React.FC<IkeaPartMeshProps> = ({
  part,
  calloutNumber,
  projectId,
  status,
  stepProgress,
  action,
  motionVector,
  activeIndex = 0,
  activeCount = 1,
  showCallouts = true,
  isHighlighted = false,
}) => {
  const { geometry, edgesGeometry, boundRadius } = usePartGeometryAndEdges(
    part,
    projectId,
    20
  );

  const gradientMap = useMemo(() => getToonGradientTexture(), []);

  const startPos: [number, number, number] = useMemo(
    () =>
      motionVector?.from
        ? [motionVector.from[0], motionVector.from[1], motionVector.from[2]]
        : [
            part.position[0] + part.explode[0],
            part.position[1] + part.explode[1],
            part.position[2] + part.explode[2],
          ],
    [motionVector, part.position, part.explode]
  );

  const endPos: [number, number, number] = useMemo(
    () =>
      motionVector?.to
        ? [motionVector.to[0], motionVector.to[1], motionVector.to[2]]
        : [part.position[0], part.position[1], part.position[2]],
    [motionVector, part.position]
  );

  const deltaVec: [number, number, number] = useMemo(
    () => [
      startPos[0] - endPos[0],
      startPos[1] - endPos[1],
      startPos[2] - endPos[2],
    ],
    [startPos, endPos]
  );

  // Direction quaternion for 3D motion arrow head pointing from startPos -> endPos
  const arrowTransform = useMemo(() => {
    const dir = new THREE.Vector3(-deltaVec[0], -deltaVec[1], -deltaVec[2]);
    const len = dir.length();
    if (len < 1) return null;
    dir.normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    // Position arrow head 28% of the way back from target so it's clearly visible
    const arrowPos: [number, number, number] = [
      endPos[0] + deltaVec[0] * 0.28,
      endPos[1] + deltaVec[1] * 0.28,
      endPos[2] + deltaVec[2] * 0.28,
    ];
    return { quat, arrowPos };
  }, [endPos, deltaVec]);

  if (status === "future") return null;

  const eased = status === "active" ? easeOutCubic(stepProgress) : 1;
  const inv = 1 - eased;

  const curPos: [number, number, number] = [
    endPos[0] + deltaVec[0] * inv,
    endPos[1] + deltaVec[1] * inv,
    endPos[2] + deltaVec[2] * inv,
  ];

  const spinOffsetRad =
    status === "active" && (action === "screw" || action === "fasten")
      ? THREE.MathUtils.degToRad(inv * 360)
      : 0;

  const eulerRad = new THREE.Euler(
    toRadians(part.rotation[0]),
    toRadians(part.rotation[1]) + spinOffsetRad,
    toRadians(part.rotation[2])
  );

  const explodeDist = Math.hypot(deltaVec[0], deltaVec[1], deltaVec[2]);

  // Renaissance Codex cel-shaded color palette:
  // Assembled parts: warm vellum/parchment ivory fill (#E6D3B3) with sepia ink outlines
  // Active step parts: warm terracotta/bronze (#C86D51 for printed) or brushed brass (#D4AF37 for hardware)
  const fillHex = isHighlighted
    ? "#F3D478"
    : status === "assembled"
    ? "#E6D3B3"
    : part.category === "purchased"
    ? "#D4AF37"
    : "#C86D51";

  // Compute callout anchor position relative to part's current 3D position
  const calloutTargetPos: [number, number, number] = [
    curPos[0] +
      (status === "active"
        ? activeCount > 1
          ? (activeIndex - (activeCount - 1) / 2) * 28
          : 28
        : (calloutNumber % 2 === 0 ? 1 : -1) *
          Math.min(28, Math.max(16, boundRadius * 0.55))),
    curPos[1] +
      (status === "active"
        ? 18 + (activeIndex % 2) * 14
        : 12 + (calloutNumber % 3) * 6),
    curPos[2] + ((calloutNumber % 3) - 1) * 10,
  ];

  return (
    <>
      {/* Motion Hint: Ghost Target + Dashed Trajectory Line + Directional Arrow */}
      {status === "active" && explodeDist > 3 && (
        <group>
          {/* Ghost silhouette at target assembled location */}
          {eased < 0.94 && (
            <group
              position={endPos}
              rotation={[
                toRadians(part.rotation[0]),
                toRadians(part.rotation[1]),
                toRadians(part.rotation[2]),
              ]}
            >
              <lineSegments geometry={edgesGeometry}>
                <lineBasicMaterial
                  color="#9C7A4C"
                  transparent
                  opacity={0.45 * (1 - eased * 0.6)}
                />
              </lineSegments>
            </group>
          )}

          {/* Dashed trajectory vector line */}
          <Line
            points={[startPos, endPos]}
            color="#D4AF37"
            lineWidth={2}
            dashed
            dashScale={0.35}
            dashSize={4}
            gapSize={3}
          />

          {/* 3D Arrow Cone pointing along insertion direction */}
          {arrowTransform && (
            <mesh
              position={arrowTransform.arrowPos}
              quaternion={arrowTransform.quat}
            >
              <coneGeometry args={[3.6, 9.5, 16]} />
              <meshBasicMaterial color="#F3D478" />
            </mesh>
          )}
        </group>
      )}

      {/* Main Cel-Shaded Part + Inverted-Hull Silhouette + Bold Line-Art Edges */}
      <group position={curPos} rotation={eulerRad}>
        {/* Back-face silhouette outline for curved STL surfaces */}
        <mesh geometry={geometry} scale={[1.018, 1.018, 1.018]}>
          <meshBasicMaterial
            color={status === "active" || isHighlighted ? "#F3D478" : "#2B1D0E"}
            side={THREE.BackSide}
          />
        </mesh>

        <mesh geometry={geometry} castShadow receiveShadow>
          <meshToonMaterial
            color={fillHex}
            gradientMap={gradientMap}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial
            color={status === "active" || isHighlighted ? "#2B1D0E" : "#3B2410"}
            linewidth={status === "active" || isHighlighted ? 2 : 1.2}
          />
        </lineSegments>
      </group>

      {/* Numbered Callout with Leader Line on visible parts */}
      {showCallouts && (
        <group>
          <Line
            points={[curPos, calloutTargetPos]}
            color={status === "active" || isHighlighted ? "#F3D478" : "#9C7A4C"}
            lineWidth={status === "active" || isHighlighted ? 1.85 : 1.15}
          />
          <mesh position={curPos}>
            <sphereGeometry args={[1.5, 12, 12]} />
            <meshBasicMaterial
              color={status === "active" || isHighlighted ? "#F3D478" : "#9C7A4C"}
            />
          </mesh>
          <Html
            position={calloutTargetPos}
            center
            distanceFactor={270}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: "none" }}
          >
            {status === "active" || isHighlighted ? (
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#14100b] text-[#f5ebd6] font-mono text-[11px] font-bold border-2 border-[#d4af37] shadow-md whitespace-nowrap"
                data-testid={`assembly-callout-${calloutNumber}`}
              >
                <span className="w-4 h-4 rounded-full bg-[#d4af37] text-[#140e07] font-extrabold text-[10px] flex items-center justify-center shrink-0">
                  {calloutNumber}
                </span>
                <span>{part.name}</span>
              </div>
            ) : (
              <div
                className="w-5 h-5 rounded-full bg-[#14100b]/95 text-[#f3d478] font-mono text-[10px] font-extrabold border-2 border-[#d4af37]/75 shadow-sm flex items-center justify-center"
                data-testid={`assembly-callout-${calloutNumber}`}
              >
                {calloutNumber}
              </div>
            )}
          </Html>
        </group>
      )}
    </>
  );
};

interface StepAnimationTickerProps {
  isPlaying: boolean;
  speed: number;
  externalStep?: number;
  stepProgress: number;
  setStepProgress: React.Dispatch<React.SetStateAction<number>>;
  onAdvanceStep: () => void;
}

const StepAnimationTicker: React.FC<StepAnimationTickerProps> = ({
  isPlaying,
  speed,
  externalStep,
  stepProgress,
  setStepProgress,
  onAdvanceStep,
}) => {
  const holdTimerRef = useRef(0);

  useFrame((_, delta) => {
    if (typeof externalStep === "number") return;
    if (!isPlaying) return;

    if (stepProgress < 1) {
      holdTimerRef.current = 0;
      const next = Math.min(1, stepProgress + delta * 0.65 * speed);
      setStepProgress(next);
    } else {
      holdTimerRef.current += delta * speed;
      if (holdTimerRef.current >= 0.85) {
        holdTimerRef.current = 0;
        onAdvanceStep();
      }
    }
  });

  return null;
};

type ToolKey = "screwdriver" | "hex_key" | "hand" | "tube";

const TOOL_CATALOG: Array<{
  id: ToolKey;
  label: string;
  matchKeywords: string[];
  matchActions: string[];
}> = [
  {
    id: "screwdriver",
    label: "Screwdriver",
    matchKeywords: ["screwdriver", "phillips", "flathead", "driver", "screw"],
    matchActions: ["screw"],
  },
  {
    id: "hex_key",
    label: "Hex Key (Allen)",
    matchKeywords: ["hex", "allen", "wrench", "m3", "key"],
    matchActions: ["screw"],
  },
  {
    id: "hand",
    label: "Hand / Snap Fit",
    matchKeywords: ["hand", "snap", "press", "fingers", "insert", "place"],
    matchActions: ["snap", "insert", "place"],
  },
  {
    id: "tube",
    label: "Tubing / Fluid",
    matchKeywords: ["tube", "tubing", "hose", "pipe", "silicone", "connect"],
    matchActions: ["connect"],
  },
];

const ToolSvgIcon: React.FC<{ tool: ToolKey; className?: string }> = ({
  tool,
  className = "w-5 h-5",
}) => {
  switch (tool) {
    case "screwdriver":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 9.5L20 4l-1-1-5.5 5.5" />
          <path d="M4 16l4 4" />
          <rect
            x="3"
            y="14"
            width="7"
            height="7"
            rx="2"
            transform="rotate(-45 6.5 17.5)"
          />
          <path d="M10.5 13.5l4-4" />
        </svg>
      );
    case "hex_key":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 20V7a3 3 0 013-3h9" />
          <path d="M10 20V8a1 1 0 011-1h8" />
          <polygon points="4,4 6,3 8,4 8,6 6,7 4,6" />
        </svg>
      );
    case "hand":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 11V6a2 2 0 00-4 0v4" />
          <path d="M14 10V4a2 2 0 00-4 0v6" />
          <path d="M10 10.5V6a2 2 0 00-4 0v8" />
          <path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.3 16.5a2 2 0 012.8-2.8L8 15.5" />
        </svg>
      );
    case "tube":
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 18c0-6 4-6 8-6s8 0 8-6" />
          <rect x="2" y="17" width="4" height="4" rx="1" />
          <rect x="18" y="3" width="4" height="4" rx="1" />
        </svg>
      );
  }
};

interface PlayerCameraRigProps {
  defaultTarget: [number, number, number];
  defaultCamPos: [number, number, number];
  fitDistance: number;
}

const PlayerCameraRig: React.FC<PlayerCameraRigProps> = ({
  defaultTarget,
  defaultCamPos,
  fitDistance,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(defaultCamPos[0], defaultCamPos[1], defaultCamPos[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(
        defaultTarget[0],
        defaultTarget[1],
        defaultTarget[2]
      );
      controlsRef.current.update();
    } else {
      camera.lookAt(defaultTarget[0], defaultTarget[1], defaultTarget[2]);
    }
  }, [defaultTarget, defaultCamPos, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={55}
      maxDistance={Math.max(1200, Math.round(fitDistance * 2.5))}
      target={defaultTarget}
    />
  );
};

export const AssemblyPlayer: React.FC<AssemblyPlayerProps> = ({
  design,
  instructions,
  projectId,
  externalStep,
  onStepDone,
  autoPlay = false,
  initialSpeed = 1,
  className = "",
}) => {
  const allParts = useMemo(
    () => resolveAssemblyParts(design, undefined, instructions),
    [design, instructions]
  );

  const playerFraming = useMemo(
    () =>
      computeAssemblyFraming(allParts, {
        explodeFactor: 0.45,
        minExplodeFactor: 0.45,
        fovDeg: 38,
        groupOffset: [18, -32, 0],
        leftLegendBias: 0.04,
      }),
    [allParts]
  );

  const adaptedInstructions = useMemo(
    () => adaptInstructions(instructions, design),
    [instructions, design]
  );

  const steps = useMemo<InstructionStep[]>(() => {
    if (adaptedInstructions.steps && adaptedInstructions.steps.length > 0) {
      return [...adaptedInstructions.steps].sort((a, b) => a.n - b.n);
    }
    // Synthesize steps from assembly step numbers if instructions.steps is empty
    const map = new Map<number, string[]>();
    allParts.forEach((p) => {
      const list = map.get(p.step) || [];
      if (!list.includes(p.partId)) list.push(p.partId);
      map.set(p.step, list);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([n, partIds]) => ({
        n,
        title: `Assemble Stage ${n}`,
        partIds,
        action: "place" as const,
        tools: ["hand"],
      }));
  }, [adaptedInstructions, allParts]);

  const totalSteps = Math.max(1, steps.length);

  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [stepProgress, setStepProgress] = useState<number>(0.65);
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [speed, setSpeed] = useState<number>(initialSpeed);
  const [loop, setLoop] = useState<boolean>(true);
  const [showCallouts, setShowCallouts] = useState<boolean>(true);
  const [noteExpanded, setNoteExpanded] = useState<boolean>(false);
  const [completedStepNums, setCompletedStepNums] = useState<Set<number>>(
    () => new Set()
  );
  const [highlightedInstanceId, setHighlightedInstanceId] = useState<
    string | null
  >(null);
  const stepDoneNotifiedRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stepChipsContainerRef = useRef<HTMLDivElement | null>(null);
  const stepChipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const currentStep = steps[Math.min(currentStepIdx, steps.length - 1)] || {
    n: 1,
    title: "Assembly Step 1",
    partIds: [],
    action: "place",
  };

  // Scroll the active step chip into view inside the horizontal chips container
  useEffect(() => {
    if (rootRef.current && rootRef.current.scrollLeft !== 0) {
      rootRef.current.scrollLeft = 0;
    }
    const container = stepChipsContainerRef.current;
    const chip = stepChipRefs.current.get(currentStepIdx);
    if (!container || !chip) return;
    const chipLeft = chip.offsetLeft;
    const chipWidth = chip.offsetWidth;
    const containerWidth = container.clientWidth;
    const targetLeft = Math.max(
      0,
      chipLeft - containerWidth / 2 + chipWidth / 2
    );
    container.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [currentStepIdx]);

  // Synchronize with externalStep when provided for deterministic video capture
  useEffect(() => {
    if (typeof externalStep === "number" && Number.isFinite(externalStep)) {
      const zeroBased = Math.max(
        0,
        Math.min(totalSteps - 1, Math.floor(externalStep - 1))
      );
      const frac = externalStep - Math.floor(externalStep);
      setCurrentStepIdx(zeroBased);
      const prog = frac > 0.001 ? frac : 0.72;
      setStepProgress(prog);
      const stepNum = steps[zeroBased]?.n ?? zeroBased + 1;
      onStepDone?.(stepNum);
    }
  }, [externalStep, totalSteps, steps, onStepDone]);

  // Notify onStepDone when normal playback finishes a step's animation
  useEffect(() => {
    if (stepProgress >= 0.99 && stepDoneNotifiedRef.current !== currentStep.n) {
      stepDoneNotifiedRef.current = currentStep.n;
      onStepDone?.(currentStep.n);
    }
  }, [stepProgress, currentStep.n, onStepDone]);

  const handleAdvanceStep = useCallback(() => {
    setCurrentStepIdx((prev) => {
      if (prev + 1 < totalSteps) {
        setStepProgress(0);
        return prev + 1;
      }
      if (loop) {
        setStepProgress(0);
        return 0;
      }
      setIsPlaying(false);
      return prev;
    });
  }, [totalSteps, loop]);

  const handleSelectStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(totalSteps - 1, idx));
      stepDoneNotifiedRef.current = null;
      setCurrentStepIdx(clamped);
      setStepProgress(isPlaying ? 0.18 : 0.65);
    },
    [totalSteps, isPlaying]
  );

  // Keyboard navigation (ArrowLeft / ArrowRight / Space) when not typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIsPlaying(false);
        handleSelectStep(currentStepIdx - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setIsPlaying(false);
        handleSelectStep(currentStepIdx + 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((prev) => {
          if (!prev && stepProgress >= 0.99) {
            setStepProgress(0);
          }
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentStepIdx, handleSelectStep, stepProgress]);

  const toggleCompletedStep = (stepNum: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCompletedStepNums((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum);
      else next.add(stepNum);
      return next;
    });
  };

  const scrollStepStripBy = (deltaPx: number) => {
    stepChipsContainerRef.current?.scrollBy({
      left: deltaPx,
      behavior: "smooth",
    });
  };

  // Determine which tools are active for the current step
  const activeToolIds = useMemo(() => {
    const rawTools = (currentStep.tools || []).map((t) => t.toLowerCase());
    const action = (currentStep.action || "place").toLowerCase();

    const active = new Set<ToolKey>();
    for (const tool of TOOL_CATALOG) {
      if (
        rawTools.some((rt) =>
          tool.matchKeywords.some((kw) => rt.includes(kw))
        ) ||
        tool.matchActions.includes(action)
      ) {
        active.add(tool.id);
      }
    }
    if (active.size === 0) active.add("hand");
    return active;
  }, [currentStep]);

  // Motion lookup for current step
  const currentMotionByPartId = useMemo(() => {
    const map = new Map<string, StepMotion>();
    (currentStep.motion ?? []).forEach((m) => {
      if (m.partId) map.set(m.partId, m);
    });
    return map;
  }, [currentStep]);

  // Parts involved in the current step
  const currentStepParts = useMemo(() => {
    const active = allParts.filter((p) => {
      if (currentMotionByPartId.has(p.partId)) return true;
      if (p.step === currentStep.n) return true;
      if (p.step < currentStep.n) return false;
      return (currentStep.partIds || []).includes(p.partId);
    });
    if (active.length > 0) return active;
    return allParts.filter((p) =>
      (currentStep.partIds || []).includes(p.partId)
    );
  }, [allParts, currentStep, currentMotionByPartId]);

  const overallProgress =
    ((currentStepIdx + stepProgress) / Math.max(1, totalSteps)) * 100;

  return (
    <div className="space-y-4 w-full max-w-full min-w-0" data-testid="assembly-player">
      <div
        ref={rootRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft !== 0) {
            e.currentTarget.scrollLeft = 0;
          }
        }}
        className={`relative w-full max-w-full min-w-0 h-auto md:h-[540px] rounded-2xl overflow-hidden bg-[#0c0906] text-[#f5ebd6] border border-[#d4af37]/35 shadow-2xl flex flex-col select-none ${className}`}
        data-testid="assembly-player-root"
      >
        {/* Top Manual Header Bar */}
        <div className="relative z-20 w-full max-w-full min-w-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 sm:gap-3.5 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#14100b]/95 border-b border-[#d4af37]/25">
          {/* Big Numbered Step Badge + Title */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 w-full min-w-0 lg:flex-1">
            <div
              className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-gradient-to-br from-[#282016] to-[#14100b] text-[#f3d478] border border-[#d4af37]/55 flex flex-col items-center justify-center font-black tracking-tighter shadow-md shrink-0 px-2.5 py-1.5"
              data-testid="step-badge-number"
            >
              <span className="text-[8px] sm:text-[9px] font-codex uppercase tracking-widest text-[#bda782] leading-none">
                STEP
              </span>
              <span className="font-display text-xl sm:text-2xl leading-none mt-0.5 text-[#f3d478] tabular-nums">
                {String(currentStep.n).padStart(2, "0")}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/45 font-codex text-[10px] font-bold uppercase tracking-widest shrink-0">
                  {currentStep.action}
                </span>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-[#bda782] uppercase tracking-wider shrink-0 tabular-nums">
                  STAGE {currentStepIdx + 1} OF {totalSteps}
                </span>
                {currentStepIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      handleSelectStep(0);
                    }}
                    data-testid="restart-step-1-btn"
                    className="inline-flex items-center gap-1 rounded border border-[#d4af37]/35 bg-[#0c0906] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#f3d478] hover:border-[#f3d478] transition-colors"
                    title="Jump back to Step 01"
                  >
                    ↺ Step 01
                  </button>
                )}
              </div>
              <h3
                className="font-display text-base sm:text-xl font-bold text-[#f5ebd6] tracking-tight leading-snug mt-0.5 line-clamp-2 sm:truncate"
                data-testid="step-title"
              >
                {currentStep.title}
              </h3>
              {currentStep.note && (
                <div className="mt-0.5">
                  <p
                    className={`text-xs text-[#e6d3b3] font-medium leading-relaxed break-words ${
                      noteExpanded ? "" : "line-clamp-2 sm:line-clamp-1"
                    }`}
                  >
                    {currentStep.note}
                  </p>
                  {currentStep.note.length > 95 && (
                    <button
                      type="button"
                      onClick={() => setNoteExpanded((v) => !v)}
                      className="sm:hidden mt-0.5 text-[11px] font-semibold text-[#f3d478] underline"
                    >
                      {noteExpanded ? "Show less" : "Read full note"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tool Icon Row + Callouts Toggle */}
          <div
            className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 bg-[#0c0906] px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-[#d4af37]/30 w-full lg:w-auto shrink-0 max-w-full overflow-x-auto no-scrollbar"
            data-testid="tool-icon-row"
          >
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#bda782] mr-0.5">
                TOOLS:
              </span>
              {TOOL_CATALOG.map((tool) => {
                const isActive = activeToolIds.has(tool.id);
                return (
                  <div
                    key={tool.id}
                    title={tool.label}
                    data-testid={`tool-icon-${tool.id}`}
                    data-active={isActive ? "true" : "false"}
                    className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-all ${
                      isActive
                        ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/65 shadow-sm"
                        : "bg-transparent text-[#bda782]/60 border-[#d4af37]/15 opacity-60"
                    }`}
                  >
                    <ToolSvgIcon tool={tool.id} className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-codex text-[11px] font-bold tracking-tight hidden sm:inline">
                      {tool.label.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowCallouts((v) => !v)}
              data-testid="toggle-assembly-callouts"
              className={`ml-0.5 flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border font-codex text-[11px] font-bold transition-all shrink-0 ${
                showCallouts
                  ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/60"
                  : "bg-transparent text-[#bda782] border-[#d4af37]/25"
              }`}
              title="Toggle numbered part callouts"
            >
              <span className="w-4 h-4 rounded-full bg-[#d4af37] text-[#140e07] font-mono text-[10px] font-extrabold flex items-center justify-center">
                #
              </span>
              <span>Callouts</span>
            </button>
          </div>
        </div>

        {/* Main Middle Canvas + Step Parts Callout Overlay */}
        <div className="relative z-0 isolate w-full max-w-full min-w-0 h-[210px] sm:h-[290px] md:h-auto md:flex-1 min-h-0 overflow-hidden">
          {/* Inner Frame Lines */}
          <div className="absolute inset-2.5 sm:inset-3 border border-[#d4af37]/20 rounded-lg pointer-events-none z-10" />

          <Canvas
            className="w-full h-full block"
            style={{ width: "100%", height: "100%", display: "block" }}
            shadows
            dpr={[1, 2]}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            camera={{
              position: playerFraming.defaultCamPos,
              fov: 38,
              near: 1,
              far: 3000,
            }}
          >
            <color attach="background" args={["#0C0906"]} />

            {/* Warm Chiaroscuro Technical Illustration Lighting */}
            <ambientLight intensity={1.05} />
            <directionalLight
              position={[180, 260, 190]}
              intensity={1.35}
              color="#FFF4D6"
            />
            <directionalLight
              position={[-150, 120, -120]}
              intensity={0.5}
              color="#D4AF37"
            />

            <group position={[18, -32, 0]}>
              {(() => {
                let activeRunningIdx = 0;
                return allParts.map((part, idx) => {
                  const motionVec = currentMotionByPartId.get(part.partId);
                  const inCurrentStep =
                    Boolean(motionVec) ||
                    part.step === currentStep.n ||
                    (part.step > currentStep.n &&
                      (currentStep.partIds || []).includes(part.partId));
                  const status: "assembled" | "active" | "future" = inCurrentStep
                    ? "active"
                    : part.step < currentStep.n
                    ? "assembled"
                    : "future";
                  const myActiveIdx = inCurrentStep ? activeRunningIdx++ : 0;

                  return (
                    <IkeaPartMesh
                      key={part.instanceId}
                      part={part}
                      calloutNumber={part.calloutNumber ?? idx + 1}
                      projectId={projectId}
                      status={status}
                      stepProgress={stepProgress}
                      action={currentStep.action}
                      motionVector={motionVec}
                      activeIndex={myActiveIdx}
                      activeCount={currentStepParts.length}
                      showCallouts={showCallouts}
                      isHighlighted={highlightedInstanceId === part.instanceId}
                    />
                  );
                });
              })()}
            </group>

            {/* Subtle Sepia Ground Shadow & Reference Grid */}
            <group position={[18, playerFraming.groundY, 0]}>
              <ContactShadows
                position={[0, 0.1, 0]}
                opacity={0.45}
                scale={Math.max(320, playerFraming.gridSpan)}
                blur={2.5}
                far={200}
                color="#050302"
              />
              <gridHelper
                args={[playerFraming.gridSpan, 14, "#5C4930", "#282016"]}
                position={[0, 0, 0]}
              />
            </group>

            <StepAnimationTicker
              isPlaying={isPlaying}
              speed={speed}
              externalStep={externalStep}
              stepProgress={stepProgress}
              setStepProgress={setStepProgress}
              onAdvanceStep={handleAdvanceStep}
            />

            <PlayerCameraRig
              defaultTarget={playerFraming.defaultTarget}
              defaultCamPos={playerFraming.defaultCamPos}
              fitDistance={playerFraming.fitDistance}
            />
          </Canvas>

          {/* Desktop Left Overlay: Step Parts Hardware Callout Box & Parts Legend */}
          <div
            className="hidden md:block absolute top-4 left-4 z-20 w-60 max-w-[calc(100%-2rem)] rounded-xl bg-[#14100b]/94 border border-[#d4af37]/40 p-3 shadow-2xl backdrop-blur-md"
            data-testid="assembly-parts-legend"
          >
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#d4af37]/20">
              <span className="text-[11px] font-codex font-bold uppercase tracking-wider text-[#f3d478]">
                PARTS LEGEND (STEP {currentStep.n})
              </span>
              <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/40 tabular-nums">
                {currentStepParts.length}×
              </span>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-0.5">
              {currentStepParts.map((p) => {
                const cNum = p.calloutNumber ?? 1;
                return (
                  <div
                    key={p.instanceId}
                    onMouseEnter={() => setHighlightedInstanceId(p.instanceId)}
                    onMouseLeave={() => setHighlightedInstanceId(null)}
                    className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-[#0c0906]/90 border border-[#d4af37]/25 hover:border-[#d4af37]/65 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/55 font-mono text-[10px] font-extrabold flex items-center justify-center shrink-0">
                        {cNum}
                      </span>
                      <span
                        className={`w-2.5 h-2.5 rounded-sm border border-[#d4af37]/50 shrink-0 ${
                          p.category === "purchased"
                            ? "bg-[#d4af37]"
                            : "bg-[#c86d51]"
                        }`}
                      />
                      <span className="font-semibold text-[#f5ebd6] truncate">
                        {p.name}
                      </span>
                    </div>
                    <span className="font-mono font-extrabold text-[#f3d478] shrink-0 tabular-nums">
                      {p.quantity}×
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Intra-step motion scrubber */}
            <div className="mt-2.5 pt-2 border-t border-[#d4af37]/20">
              <div className="flex items-center justify-between text-[10px] font-codex font-bold text-[#bda782] mb-1">
                <span>MOTION TIMELINE</span>
                <span className="font-mono text-[#f3d478] tabular-nums">
                  {Math.round(stepProgress * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stepProgress}
                onChange={(e) => {
                  setIsPlaying(false);
                  setStepProgress(parseFloat(e.target.value));
                }}
                aria-label="Intra-step motion scrubber"
                data-testid="step-motion-scrubber"
                className="w-full h-1.5 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
              />
            </div>
          </div>

          {/* Bottom-Right Assembly Hint Badge */}
          <div className="hidden md:flex absolute bottom-4 right-4 z-20 items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#14100b]/94 border border-[#d4af37]/40 shadow-2xl backdrop-blur-md">
            <svg
              className="w-5 h-5 text-[#f3d478] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="5" r="2.5" />
              <path d="M7 21v-6l-2-3 3-4h8l3 4-2 3v6" />
              <path d="M9 14h6" />
            </svg>
            <div className="text-[11px] leading-tight">
              <div className="font-codex font-bold text-[#f5ebd6] uppercase tracking-tight">
                {currentStep.action === "screw"
                  ? "Fasten securely — do not overtighten PLA"
                  : currentStep.action === "snap"
                  ? "Align tabs until an audible click is heard"
                  : currentStep.action === "connect"
                  ? "Push tubing 10mm onto barbed fitting"
                  : "Follow dashed vector arrows for alignment"}
              </div>
              <div className="text-[#bda782] font-mono text-[10px]">
                Drag to orbit · Scroll to zoom · ←/→ steps · Space play
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Docked Step Parts & Motion Bar (prevents covering the 3D canvas on 390x844) */}
        <div className="md:hidden relative z-20 w-full bg-[#14100b] border-t border-[#d4af37]/25 px-3.5 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#f3d478] shrink-0">
              PARTS ({currentStepParts.length}):
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {currentStepParts.map((p) => {
                const cNum = p.calloutNumber ?? 1;
                return (
                  <button
                    key={p.instanceId}
                    type="button"
                    onClick={() =>
                      setHighlightedInstanceId((cur) =>
                        cur === p.instanceId ? null : p.instanceId
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/30 bg-[#0c0906] px-2 py-1 text-[11px] shrink-0"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#d4af37]/25 text-[#f3d478] font-mono text-[10px] font-bold flex items-center justify-center">
                      {cNum}
                    </span>
                    <span className="font-medium text-[#f5ebd6] max-w-[140px] truncate">
                      {p.name}
                    </span>
                    <span className="font-mono text-[#f3d478] font-bold">
                      {p.quantity}×
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#bda782] shrink-0">
              MOTION
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={stepProgress}
              onChange={(e) => {
                setIsPlaying(false);
                setStepProgress(parseFloat(e.target.value));
              }}
              aria-label="Intra-step motion scrubber mobile"
              className="flex-1 h-1.5 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
            />
            <span className="text-[11px] font-mono font-bold text-[#f3d478] w-9 text-right tabular-nums">
              {Math.round(stepProgress * 100)}%
            </span>
          </div>
        </div>

        {/* Bottom Transport Controls & Step Scrubber Bar */}
        <div className="relative z-20 w-full max-w-full min-w-0 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#14100b]/95 border-t border-[#d4af37]/25 flex flex-col gap-2">
          {/* Horizontally Scrollable Step Scrubber Chips with Left/Right Scroll Buttons */}
          <div className="flex items-center gap-1.5 w-full max-w-full min-w-0">
            <button
              type="button"
              onClick={() => scrollStepStripBy(-260)}
              aria-label="Scroll steps left"
              className="hidden sm:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/30 bg-[#0c0906] text-xs font-bold text-[#f3d478] hover:border-[#f3d478] transition-colors"
            >
              ‹
            </button>
            <div
              ref={stepChipsContainerRef}
              data-testid="step-chips-scroll-row"
              className="flex-1 max-w-full min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5 scroll-smooth"
            >
              {steps.map((s, idx) => {
                const isCurr = idx === currentStepIdx;
                const isDone =
                  idx < currentStepIdx || completedStepNums.has(s.n);
                return (
                  <button
                    key={s.n}
                    ref={(el) => {
                      if (el) stepChipRefs.current.set(idx, el);
                      else stepChipRefs.current.delete(idx);
                    }}
                    type="button"
                    onClick={() => handleSelectStep(idx)}
                    data-testid={`step-pill-${s.n}`}
                    className={`shrink-0 py-1 px-2.5 sm:py-1.5 sm:px-3 rounded-lg border font-mono text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                      isCurr
                        ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/65 shadow-sm"
                        : isDone
                        ? "bg-[#1d1710] text-[#e6d3b3] border-[#d4af37]/30 hover:border-[#d4af37]/50"
                        : "bg-[#0c0906] text-[#bda782] border-[#d4af37]/15 hover:border-[#d4af37]/40"
                    }`}
                  >
                    <span className="tabular-nums">
                      {String(s.n).padStart(2, "0")}
                    </span>
                    <span className="font-sans font-semibold text-[11px] max-w-[170px] sm:max-w-none truncate">
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => scrollStepStripBy(260)}
              aria-label="Scroll steps right"
              className="hidden sm:inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/30 bg-[#0c0906] text-xs font-bold text-[#f3d478] hover:border-[#f3d478] transition-colors"
            >
              ›
            </button>
          </div>

          {/* Transport Controls Row */}
          <div className="w-full max-w-full min-w-0 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Prev Button */}
              <button
                type="button"
                onClick={() => handleSelectStep(currentStepIdx - 1)}
                disabled={currentStepIdx === 0}
                data-testid="prev-step-btn"
                className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#d4af37]/35 bg-[#0c0906] hover:bg-[#1d1710] disabled:opacity-40 font-codex text-xs font-bold text-[#e6d3b3] transition-colors"
              >
                ← Prev
              </button>

              {/* Play / Pause Button */}
              <button
                type="button"
                onClick={() => {
                  if (!isPlaying && stepProgress >= 0.99) {
                    setStepProgress(0);
                  }
                  setIsPlaying((p) => !p);
                }}
                data-testid="play-pause-btn"
                className="min-h-[36px] px-3.5 sm:px-4 py-1.5 rounded-lg border border-[#d4af37] bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] hover:brightness-110 text-[#140e07] font-codex text-xs font-extrabold tracking-wide transition-all flex items-center gap-1.5"
              >
                <span>{isPlaying ? "⏸ Pause" : "▶ Play"}</span>
              </button>

              {/* Next Button */}
              <button
                type="button"
                onClick={() => handleSelectStep(currentStepIdx + 1)}
                disabled={currentStepIdx >= totalSteps - 1}
                data-testid="next-step-btn"
                className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-lg border border-[#d4af37]/35 bg-[#0c0906] hover:bg-[#1d1710] disabled:opacity-40 font-codex text-xs font-bold text-[#e6d3b3] transition-colors"
              >
                Next →
              </button>
            </div>

            {/* Continuous Overall Step Scrubber */}
            <div className="hidden sm:flex items-center gap-2 flex-1 max-w-xs min-w-[140px]">
              <span className="text-[11px] font-codex font-bold text-[#bda782] shrink-0">
                SCRUB
              </span>
              <input
                type="range"
                min={0}
                max={totalSteps - 0.01}
                step={0.02}
                value={currentStepIdx + stepProgress * 0.99}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  const idx = Math.min(totalSteps - 1, Math.floor(v));
                  const frac = Math.min(1, v - idx);
                  setIsPlaying(false);
                  setCurrentStepIdx(idx);
                  setStepProgress(frac);
                }}
                aria-label="Full assembly step scrubber"
                data-testid="overall-step-scrubber"
                className="w-full h-2 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
              />
              <span className="text-[11px] font-mono font-bold text-[#f3d478] w-10 text-right tabular-nums">
                {Math.round(overallProgress)}%
              </span>
            </div>

            {/* Speed & Loop Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="inline-flex rounded-lg border border-[#d4af37]/30 bg-[#0c0906] p-0.5">
                {[0.5, 1, 1.5, 2].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSpeed(spd)}
                    data-testid={`speed-${spd}`}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors ${
                      speed === spd
                        ? "bg-[#d4af37] text-[#140e07]"
                        : "text-[#bda782] hover:bg-[#1d1710]"
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setLoop((l) => !l)}
                data-testid="loop-toggle-btn"
                className={`px-2 sm:px-2.5 py-1.5 rounded-lg border font-codex text-xs font-bold transition-colors ${
                  loop
                    ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/60"
                    : "bg-[#0c0906] text-[#bda782] border-[#d4af37]/25"
                }`}
                title="Toggle autoplay loop"
              >
                ↻ <span className="hidden sm:inline">Loop </span>
                {loop ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Scannable Step-by-Step Manual & Workbench Checklist */}
      <div
        className="rounded-2xl border border-[#d4af37]/30 bg-[#14100b]/95 p-4 sm:p-5 space-y-3.5"
        data-testid="assembly-step-checklist"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4af37]/20 pb-3">
          <div>
            <h4 className="font-display text-base sm:text-lg font-bold text-[#faf4e8]">
              Complete Step-by-Step Assembly Guide ({totalSteps} Steps)
            </h4>
            <p className="text-xs text-[#bda782]">
              Click any step card to preview its 3D trajectory above, or check off steps as you build.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-[#d4af37]/35 bg-[#0c0906] px-2.5 py-1 font-mono text-xs font-semibold text-[#f3d478] tabular-nums">
              {completedStepNums.size} / {totalSteps} Checked
            </span>
            {completedStepNums.size > 0 && (
              <button
                type="button"
                onClick={() => setCompletedStepNums(new Set())}
                className="rounded-lg border border-[#d4af37]/25 bg-[#0c0906] px-2.5 py-1 text-xs font-semibold text-[#e6d3b3] hover:border-[#f3d478] hover:text-[#f3d478] transition-colors"
              >
                Reset Checks
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((s, idx) => {
            const isCurr = idx === currentStepIdx;
            const isChecked = completedStepNums.has(s.n);
            const stepParts = allParts.filter(
              (p) => p.step === s.n || (s.partIds || []).includes(p.partId)
            );
            return (
              <div
                key={s.n}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setIsPlaying(false);
                  handleSelectStep(idx);
                  rootRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setIsPlaying(false);
                    handleSelectStep(idx);
                  }
                }}
                data-testid={`manual-step-card-${s.n}`}
                className={`group rounded-xl border p-3.5 transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isCurr
                    ? "border-[#d4af37] bg-[#231c12] shadow-md"
                    : isChecked
                    ? "border-[#d4af37]/30 bg-[#0c0906]/60 opacity-85"
                    : "border-[#d4af37]/20 bg-[#0c0906]/90 hover:border-[#d4af37]/50"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex h-6 w-7 items-center justify-center rounded-md font-mono text-xs font-extrabold shrink-0 tabular-nums ${
                          isCurr
                            ? "bg-[#d4af37] text-[#140e07]"
                            : "border border-[#d4af37]/40 bg-[#14100b] text-[#f3d478]"
                        }`}
                      >
                        {String(s.n).padStart(2, "0")}
                      </span>
                      <span className="rounded border border-[#d4af37]/30 bg-[#14100b] px-1.5 py-0.5 font-codex text-[10px] font-bold uppercase tracking-wider text-[#f3d478] shrink-0">
                        {s.action || "place"}
                      </span>
                      {isCurr && (
                        <span className="rounded-full bg-[#d4af37]/20 border border-[#d4af37]/50 px-2 py-0.5 font-mono text-[10px] font-bold text-[#f3d478] shrink-0">
                          Viewing in 3D
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleCompletedStep(s.n, e)}
                      aria-pressed={isChecked}
                      aria-label={`Mark step ${s.n} complete`}
                      className={`inline-flex min-h-[28px] items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition-colors shrink-0 ${
                        isChecked
                          ? "border-[#d4af37] bg-[#d4af37] text-[#140e07] font-bold"
                          : "border-[#d4af37]/30 bg-[#14100b] text-[#bda782] hover:border-[#f3d478] hover:text-[#f3d478]"
                      }`}
                    >
                      <span>{isChecked ? "✓ Done" : "○ Check"}</span>
                    </button>
                  </div>

                  <h5 className="font-display text-base font-bold text-[#faf4e8] leading-snug">
                    {s.title}
                  </h5>

                  {s.note && (
                    <p className="text-xs text-[#dfd3be] leading-relaxed">
                      {s.note}
                    </p>
                  )}
                </div>

                {(stepParts.length > 0 || (s.tools && s.tools.length > 0)) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#d4af37]/15 pt-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {stepParts.map((sp) => (
                        <span
                          key={sp.instanceId}
                          className="inline-flex items-center gap-1 rounded border border-[#d4af37]/30 bg-[#14100b] px-2 py-0.5 font-mono text-[10px] text-[#e6d3b3]"
                        >
                          <strong className="text-[#f3d478]">
                            #{sp.calloutNumber ?? 1}
                          </strong>
                          <span className="truncate max-w-[140px]">
                            {sp.name}
                          </span>
                        </span>
                      ))}
                    </div>
                    {s.tools && s.tools.length > 0 && (
                      <span className="font-mono text-[10px] text-[#bda782]">
                        Tools: {s.tools.join(", ")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AssemblyPlayer;
