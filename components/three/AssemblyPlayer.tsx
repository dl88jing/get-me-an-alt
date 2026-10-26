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

  // Gilded cel-shaded color palette:
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
  const [activeKeyFlash, setActiveKeyFlash] = useState<
    "space" | "left" | "right" | null
  >(null);
  const keyFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepDoneNotifiedRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stepChipsContainerRef = useRef<HTMLDivElement | null>(null);
  const stepChipRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const triggerKeyFlash = useCallback((key: "space" | "left" | "right") => {
    setActiveKeyFlash(key);
    if (keyFlashTimerRef.current) clearTimeout(keyFlashTimerRef.current);
    keyFlashTimerRef.current = setTimeout(() => {
      setActiveKeyFlash(null);
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (keyFlashTimerRef.current) clearTimeout(keyFlashTimerRef.current);
    };
  }, []);

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

  const handleTogglePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        setStepProgress((prog) => (prog >= 0.99 ? 0 : prog));
      }
      return next;
    });
  }, []);

  const handleSelectStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(totalSteps - 1, idx));
      stepDoneNotifiedRef.current = null;
      setCurrentStepIdx(clamped);
      setStepProgress(isPlaying ? 0.18 : 0.55);
    },
    [totalSteps, isPlaying]
  );

  // Move focus to the player container on mount when opened via the Instructions tab
  // so Space / ← / → immediately control playback and steps without switching tabs.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (
      !active ||
      active === document.body ||
      active.getAttribute("data-tab-id") === "instructions"
    ) {
      rootRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // Keyboard shortcuts: Space (play/pause), ArrowLeft (prev step), ArrowRight (next step)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      let isRangeInput = false;
      if (target) {
        const tag = target.tagName;
        isRangeInput =
          tag === "INPUT" && (target as HTMLInputElement).type === "range";
        const isTextEntry =
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          (tag === "INPUT" && !isRangeInput);
        if (isTextEntry) return;

        // Do not hijack keyboard focus when user is on an interactive control outside the player
        if (
          rootRef.current &&
          !rootRef.current.contains(target) &&
          (tag === "BUTTON" ||
            tag === "A" ||
            target.getAttribute("role") === "tab" ||
            target.closest('[role="dialog"]'))
        ) {
          return;
        }
      }

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handleTogglePlayPause();
        triggerKeyFlash("space");
      } else if (e.key === "ArrowLeft" && !isRangeInput) {
        e.preventDefault();
        setCurrentStepIdx((prev) => {
          const next = Math.max(0, prev - 1);
          if (next !== prev) {
            stepDoneNotifiedRef.current = null;
            setStepProgress(isPlaying ? 0.18 : 0.55);
          }
          return next;
        });
        triggerKeyFlash("left");
      } else if (e.key === "ArrowRight" && !isRangeInput) {
        e.preventDefault();
        setCurrentStepIdx((prev) => {
          const next = Math.min(totalSteps - 1, prev + 1);
          if (next !== prev) {
            stepDoneNotifiedRef.current = null;
            setStepProgress(isPlaying ? 0.18 : 0.55);
          }
          return next;
        });
        triggerKeyFlash("right");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleTogglePlayPause, isPlaying, totalSteps, triggerKeyFlash]);

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

  const overallScrubberValueText = `Step ${currentStep.n} of ${totalSteps}: ${currentStep.title} (${Math.round(
    overallProgress
  )}% overall, ${currentStepParts.length} ${
    currentStepParts.length === 1 ? "part" : "parts"
  })`;

  const motionScrubberValueText = `Step ${currentStep.n} (${
    currentStep.title
  }) motion ${Math.round(stepProgress * 100)}% complete`;

  const srStepAnnouncement = useMemo(() => {
    const partSummary =
      currentStepParts.length > 0
        ? currentStepParts.map((p) => `${p.quantity}x ${p.name}`).join(", ")
        : "no parts listed";
    const toolSummary =
      currentStep.tools && currentStep.tools.length > 0
        ? currentStep.tools.join(", ")
        : "hand";
    return `Step ${currentStep.n} of ${totalSteps}: ${
      currentStep.title
    }. Action: ${currentStep.action || "place"}. Parts (${
      currentStepParts.length
    }): ${partSummary}. Tools: ${toolSummary}.${
      currentStep.note ? ` ${currentStep.note}` : ""
    } ${isPlaying ? "Playing." : "Paused."}`;
  }, [currentStep, totalSteps, currentStepParts, isPlaying]);

  return (
    <div className="space-y-4 w-full max-w-full min-w-0" data-testid="assembly-player">
    <div
      ref={rootRef}
      role="region"
      aria-label="Interactive 3D Assembly Instructions Player"
      tabIndex={0}
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft !== 0) {
          e.currentTarget.scrollLeft = 0;
        }
      }}
      className={`relative w-full max-w-full min-w-0 h-auto sm:h-[680px] min-h-[560px] rounded-2xl overflow-hidden bg-[#0c0906] text-[#f5ebd6] border border-[#d4af37]/35 shadow-2xl flex flex-col select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f3d478] ${className}`}
      data-testid="assembly-player-root"
    >
      {/* Screen-Reader Polite Live Region for Step & Playback Announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="step-sr-announcer"
      >
        {srStepAnnouncement}
      </div>

      {/* Top Manual Header Bar */}
      <div className="relative z-10 w-full max-w-full min-w-0 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-4 px-3.5 py-2.5 sm:px-5 sm:py-3.5 bg-[#14100b]/95 border-b border-[#d4af37]/25">
        {/* Big Numbered Step Badge + Title */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <div
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-[#282016] to-[#14100b] text-[#f3d478] border border-[#d4af37]/55 flex flex-col items-center justify-center font-black tracking-tighter shadow-md shrink-0"
            data-testid="step-badge-number"
          >
            <span className="text-[9px] font-codex uppercase tracking-widest text-[#bda782] leading-none">
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
              <span className="text-xs font-mono font-bold text-[#bda782] uppercase tracking-wider shrink-0 tabular-nums">
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
          className="flex items-center gap-1.5 sm:gap-2 bg-[#0c0906] px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-[#d4af37]/30 shrink-0 max-w-full overflow-x-auto"
          data-testid="tool-icon-row"
        >
          <span className="text-[10px] font-codex font-bold uppercase tracking-wider text-[#bda782] mr-0.5 sm:mr-1 shrink-0">
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
                className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-all shrink-0 ${
                  isActive
                    ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/65 shadow-sm"
                    : "bg-transparent text-[#bda782]/60 border-[#d4af37]/15 opacity-60"
                }`}
              >
                <ToolSvgIcon tool={tool.id} className="w-4 h-4" />
                <span className="font-codex text-[11px] font-bold tracking-tight hidden sm:inline">
                  {tool.label.split(" ")[0]}
                </span>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCallouts((v) => !v)}
            aria-pressed={showCallouts}
            data-testid="toggle-assembly-callouts"
            className={`ml-0.5 sm:ml-1 flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border font-codex text-[11px] font-bold transition-all shrink-0 ${
              showCallouts
                ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/60"
                : "bg-transparent text-[#bda782] border-[#d4af37]/25"
            }`}
            title="Toggle numbered part callouts"
          >
            <span className="w-4 h-4 rounded-full bg-[#d4af37] text-[#140e07] font-mono text-[10px] font-extrabold flex items-center justify-center">
              #
            </span>
            <span className="hidden sm:inline">Callouts</span>
          </button>
        </div>
      </div>

      {/* Main Middle Canvas + Step Parts Callout Overlay */}
      <div className="relative flex-1 flex flex-col w-full max-w-full min-w-0 min-h-0">
        <div className="relative w-full max-w-full min-w-0 h-[240px] sm:h-auto sm:flex-1 sm:min-h-0 overflow-hidden z-0 isolate">
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

        {/* Bottom-Right Assembly Hint Badge */}
        <div className="hidden md:flex absolute bottom-5 right-5 z-10 items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#14100b]/94 border border-[#d4af37]/40 shadow-2xl backdrop-blur-md">
          <svg
            className="w-6 h-6 text-[#f3d478] shrink-0"
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
              Drag to orbit · Scroll to zoom · Space Play/Pause · ←/→ Step
            </div>
          </div>
        </div>
      </div>

        {/* Step Parts Hardware Callout Box & Intra-Step Motion Scrubber (Floating Top-Left on Desktop, Docked Below Canvas on Mobile) */}
        <div
          className="relative sm:absolute sm:top-5 sm:left-5 z-10 w-full sm:w-64 sm:max-w-[calc(100%-2.5rem)] sm:rounded-xl bg-[#14100b]/95 border-t sm:border border-[#d4af37]/35 px-3.5 py-2 sm:p-3.5 shadow-2xl backdrop-blur-md"
          data-testid="assembly-parts-legend"
        >
          <div className="flex items-center justify-between pb-1.5 sm:pb-2 mb-1.5 sm:mb-2 border-b border-[#d4af37]/20">
            <span className="text-[10px] sm:text-[11px] font-codex font-bold uppercase tracking-wider text-[#f3d478]">
              PARTS LEGEND (STEP {currentStep.n})
            </span>
            <span className="text-[10px] sm:text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/40 tabular-nums">
              {currentStepParts.length}×
            </span>
          </div>

          <div className="flex sm:block gap-1.5 sm:space-y-1.5 overflow-x-auto sm:max-h-36 sm:overflow-y-auto pr-0.5">
            {currentStepParts.map((p) => {
              const cNum = p.calloutNumber ?? 1;
              return (
                <div
                  key={p.instanceId}
                  onMouseEnter={() => setHighlightedInstanceId(p.instanceId)}
                  onMouseLeave={() => setHighlightedInstanceId(null)}
                  onClick={() =>
                    setHighlightedInstanceId((prev) =>
                      prev === p.instanceId ? null : p.instanceId
                    )
                  }
                  className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-[#0c0906]/90 border border-[#d4af37]/25 hover:border-[#d4af37]/65 transition-colors cursor-pointer shrink-0 sm:shrink"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#d4af37]/20 text-[#f3d478] border border-[#d4af37]/55 font-mono text-[10px] font-extrabold flex items-center justify-center shrink-0">
                      {cNum}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-sm border border-[#d4af37]/50 shrink-0 ${
                        p.category === "purchased"
                          ? "bg-[#d4af37]"
                          : "bg-[#c86d51]"
                      }`}
                    />
                    <span className="font-semibold text-[#f5ebd6] truncate max-w-[160px] sm:max-w-none">
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
          <div className="mt-2 sm:mt-3 pt-1.5 sm:pt-2.5 border-t border-[#d4af37]/20">
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
              aria-label="Intra-step motion scrubber"
              aria-valuetext={motionScrubberValueText}
              onChange={(e) => {
                setIsPlaying(false);
                setStepProgress(parseFloat(e.target.value));
              }}
              data-testid="step-motion-scrubber"
              className="w-full h-1.5 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
            />
          </div>
        </div>
      </div>

      {/* Bottom Transport Controls, Step Scrubber & Keyboard Shortcut Bar */}
      <div className="relative z-10 w-full max-w-full min-w-0 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#14100b]/95 border-t border-[#d4af37]/25 flex flex-col gap-2">
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
            role="group"
            aria-label="Assembly steps"
            data-testid="step-chips-scroll-row"
            className="flex-1 max-w-full min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 scroll-smooth"
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
                  aria-current={isCurr ? "step" : undefined}
                  aria-label={`Step ${s.n} of ${totalSteps}: ${s.title}${
                    isCurr ? " (current step)" : isDone ? " (completed)" : ""
                  }`}
                  onClick={() => handleSelectStep(idx)}
                  data-testid={`step-pill-${s.n}`}
                  className={`shrink-0 py-1.5 px-2.5 sm:px-3 rounded-lg border font-mono text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
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
            {/* Prev Button with visible ← keycap hint */}
            <button
              type="button"
              onClick={() => handleSelectStep(currentStepIdx - 1)}
              disabled={currentStepIdx === 0}
              aria-label={`Previous step (${
                currentStepIdx > 0
                  ? `Step ${steps[currentStepIdx - 1]?.n}: ${
                      steps[currentStepIdx - 1]?.title
                    }`
                  : "at first step"
              })`}
              aria-keyshortcuts="ArrowLeft"
              title="Previous step (←)"
              data-testid="prev-step-btn"
              className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border bg-[#0c0906] hover:bg-[#1d1710] disabled:opacity-40 font-codex text-xs font-bold text-[#e6d3b3] transition-all flex items-center gap-1.5 ${
                activeKeyFlash === "left"
                  ? "border-[#f3d478] ring-1 ring-[#f3d478]"
                  : "border-[#d4af37]/35"
              }`}
            >
              <kbd className="px-1.5 py-0.5 rounded bg-[#1d1710] border border-[#d4af37]/45 font-mono text-[10px] font-bold text-[#f3d478] leading-none shadow-inner">
                ←
              </kbd>
              <span>Prev</span>
            </button>

            {/* Play / Pause Button with crisp SVG icon + visible Space keycap hint */}
            <button
              type="button"
              onClick={handleTogglePlayPause}
              aria-label={
                isPlaying
                  ? `Pause assembly animation at Step ${currentStep.n}`
                  : `Play assembly animation at Step ${currentStep.n}`
              }
              aria-keyshortcuts="Space"
              title={
                isPlaying
                  ? "Pause step animation (Space)"
                  : "Play step animation (Space)"
              }
              data-testid="play-pause-btn"
              className={`min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-lg border border-[#d4af37] bg-gradient-to-r from-[#f3d478] via-[#d4af37] to-[#b8860b] hover:brightness-110 text-[#140e07] font-codex text-xs font-extrabold tracking-wide transition-all flex items-center gap-1.5 ${
                activeKeyFlash === "space"
                  ? "ring-2 ring-[#faf4e8] brightness-110"
                  : ""
              }`}
            >
              {isPlaying ? (
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
              <span>{isPlaying ? "Pause" : "Play"}</span>
              <kbd className="inline-block px-1.5 py-0.5 rounded bg-[#140e07]/20 border border-[#140e07]/40 font-mono text-[10px] font-extrabold text-[#140e07] leading-none">
                Space
              </kbd>
            </button>

            {/* Next Button with visible → keycap hint */}
            <button
              type="button"
              onClick={() => handleSelectStep(currentStepIdx + 1)}
              disabled={currentStepIdx >= totalSteps - 1}
              aria-label={`Next step (${
                currentStepIdx + 1 < totalSteps
                  ? `Step ${steps[currentStepIdx + 1]?.n}: ${
                      steps[currentStepIdx + 1]?.title
                    }`
                  : "at final step"
              })`}
              aria-keyshortcuts="ArrowRight"
              title="Next step (→)"
              data-testid="next-step-btn"
              className={`min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-lg border bg-[#0c0906] hover:bg-[#1d1710] disabled:opacity-40 font-codex text-xs font-bold text-[#e6d3b3] transition-all flex items-center gap-1.5 ${
                activeKeyFlash === "right"
                  ? "border-[#f3d478] ring-1 ring-[#f3d478]"
                  : "border-[#d4af37]/35"
              }`}
            >
              <span>Next</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[#1d1710] border border-[#d4af37]/45 font-mono text-[10px] font-bold text-[#f3d478] leading-none shadow-inner">
                →
              </kbd>
            </button>
          </div>

          {/* Continuous Overall Step Scrubber with aria-valuetext */}
          <div className="flex items-center gap-2 flex-1 max-w-xs min-w-[140px]">
            <span className="text-[11px] font-codex font-bold text-[#bda782] shrink-0">
              SCRUB
            </span>
            <input
              type="range"
              min={0}
              max={totalSteps - 0.01}
              step={0.02}
              value={currentStepIdx + stepProgress * 0.99}
              aria-label="Full assembly step scrubber"
              aria-valuetext={overallScrubberValueText}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                const idx = Math.min(totalSteps - 1, Math.floor(v));
                const frac = Math.min(1, v - idx);
                setIsPlaying(false);
                setCurrentStepIdx(idx);
                setStepProgress(frac);
              }}
              data-testid="overall-step-scrubber"
              className="w-full h-2 bg-[#282016] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
            />
            <span className="text-[11px] font-mono font-bold text-[#f3d478] w-10 text-right tabular-nums">
              {Math.round(overallProgress)}%
            </span>
          </div>

          {/* Keyboard Shortcut Bar + Speed & Loop Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Visible Keyboard Shortcut Bar */}
            <div
              role="note"
              aria-label="Keyboard shortcuts: Space to play or pause, Left and Right arrow keys for previous or next step"
              data-testid="keyboard-shortcut-bar"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-lg bg-[#0c0906] border border-[#d4af37]/25 text-[10px] sm:text-[11px] text-[#bda782]"
            >
              <span className="inline-flex items-center gap-1">
                <kbd
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold leading-none transition-colors ${
                    activeKeyFlash === "space"
                      ? "bg-[#d4af37] text-[#140e07] border-[#f3d478]"
                      : "bg-[#1d1710] text-[#f3d478] border-[#d4af37]/40"
                  }`}
                >
                  Space
                </kbd>
                <span className="font-medium text-[#e6d3b3]">Play/Pause</span>
              </span>
              <span className="text-[#d4af37]/40">·</span>
              <span className="inline-flex items-center gap-1">
                <kbd
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold leading-none transition-colors ${
                    activeKeyFlash === "left"
                      ? "bg-[#d4af37] text-[#140e07] border-[#f3d478]"
                      : "bg-[#1d1710] text-[#f3d478] border-[#d4af37]/40"
                  }`}
                >
                  ←
                </kbd>
                <kbd
                  className={`px-1.5 py-0.5 rounded border font-mono text-[10px] font-bold leading-none transition-colors ${
                    activeKeyFlash === "right"
                      ? "bg-[#d4af37] text-[#140e07] border-[#f3d478]"
                      : "bg-[#1d1710] text-[#f3d478] border-[#d4af37]/40"
                  }`}
                >
                  →
                </kbd>
                <span className="font-medium text-[#e6d3b3]">Step</span>
              </span>
            </div>

            <div
              className="inline-flex rounded-lg border border-[#d4af37]/30 bg-[#0c0906] p-0.5"
              role="group"
              aria-label="Playback speed"
            >
              {[0.5, 1, 1.5, 2].map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeed(spd)}
                  aria-pressed={speed === spd}
                  aria-label={`Playback speed ${spd}x`}
                  data-testid={`speed-${spd}`}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
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
              aria-pressed={loop}
              data-testid="loop-toggle-btn"
              className={`min-h-[34px] px-2.5 py-1 rounded-lg border font-codex text-xs font-bold transition-colors ${
                loop
                  ? "bg-[#d4af37]/20 text-[#f3d478] border-[#d4af37]/60"
                  : "bg-[#0c0906] text-[#bda782] border-[#d4af37]/25"
              }`}
              title="Toggle autoplay loop"
            >
              ↻ Loop {loop ? "ON" : "OFF"}
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
