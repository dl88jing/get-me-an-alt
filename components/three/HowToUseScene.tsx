"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, ContactShadows, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  AnyDesignInput,
  AnyBomInput,
  AnyInstructionsInput,
  ResolvedAssemblyPart,
  resolveAssemblyParts,
} from "./types";
import { toRenaissancePartColor } from "./adapters";
import {
  computeAssemblyFraming,
  usePartGeometryAndEdges,
  toRadians,
} from "./shapes";
import type {
  ObjectAnalysis,
  UsageEffect,
  UsagePartAnimation,
  UsageScene,
  UsageStoryboard,
} from "@/lib/types";

export interface HowToUseSceneProps {
  design: AnyDesignInput;
  bom?: AnyBomInput;
  instructions?: AnyInstructionsInput;
  usage?: UsageStoryboard | null;
  analysis?: ObjectAnalysis | null;
  projectId?: string;
  autoPlay?: boolean;
  className?: string;
}

function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function matchResolvedPart(
  parts: ResolvedAssemblyPart[],
  partId?: string | null
): ResolvedAssemblyPart | null {
  if (!partId || parts.length === 0) return null;
  const exact = parts.find(
    (p) => p.partId === partId || p.instanceId === partId
  );
  if (exact) return exact;
  const lower = partId.toLowerCase();
  const fuzzy = parts.find(
    (p) =>
      p.partId.toLowerCase().includes(lower) ||
      p.name.toLowerCase().includes(lower)
  );
  return fuzzy || null;
}

function buildClientFallbackStoryboard(
  allParts: ResolvedAssemblyPart[],
  design: AnyDesignInput,
  analysis?: ObjectAnalysis | null
): UsageStoryboard {
  const objectName =
    analysis?.objectName ||
    design?.objectName ||
    design?.name ||
    "DIY Hardware Assembly";

  const safeParts: ResolvedAssemblyPart[] =
    allParts.length > 0
      ? allParts
      : [
          {
            instanceId: "base-part#0",
            partId: "base-part",
            name: "Primary Base Housing",
            category: "printed",
            shape: "box",
            params: { width: 100, height: 40, depth: 100 },
            color: "#d4af37",
            position: [0, 20, 0],
            rotation: [0, 0, 0],
            explode: [0, -40, 0],
            step: 1,
            quantity: 1,
          },
        ];

  const basePart =
    safeParts.find((p) =>
      /\b(base|chassis|frame|stand|pedestal|tank|deck|housing)\b/i.test(p.name)
    ) || safeParts[0];

  const loadPart =
    safeParts.find(
      (p) =>
        p.partId !== basePart.partId &&
        /\b(lid|funnel|clamp|cradle|tray|saddle|slide|jaw|cover|plate)\b/i.test(
          p.name
        )
    ) || safeParts[Math.min(1, safeParts.length - 1)];

  const controlPart =
    safeParts.find(
      (p) =>
        p.category === "purchased" ||
        /\b(controller|esp32|mcu|board|usb|power|sensor|knob|pwm|switch)\b/i.test(
          p.name
        )
    ) || safeParts[Math.min(2, safeParts.length - 1)];

  const actuatorPart =
    safeParts.find(
      (p) =>
        p.partId !== basePart.partId &&
        /\b(hinge|wheel|gear|pump|blower|carriage|arm|elbow|screw|manifold)\b/i.test(
          p.name
        )
    ) || safeParts[Math.min(3, safeParts.length - 1)];

  const outputPart =
    safeParts[safeParts.length - 1] || actuatorPart || loadPart || basePart;

  const scenes: UsageScene[] = [
    {
      id: "scene-1",
      index: 1,
      title: `Position ${basePart.name}`,
      durationSeconds: 4.0,
      camera: {
        fromPosition: [220, 165, 255],
        toPosition: [165, 135, 205],
        fromTarget: [0, 35, 0],
        toTarget: [
          basePart.position[0],
          basePart.position[1] - 32,
          basePart.position[2],
        ],
        fov: 40,
      },
      narration: {
        text: `Set ${basePart.name} flat on your work surface to begin.`,
        subtext: analysis?.tagline || "Stable foundation ready for operation",
        anchor: "part",
        partId: basePart.partId,
        offset: [0, 32, 0],
      },
      partAnimations: [
        {
          partId: basePart.partId,
          type: "press",
          fromOffset: [0, 12, 0],
          toOffset: [0, 0, 0],
          glowColor: "#f3d478",
          glowIntensity: 0.5,
        },
      ],
      effects: [
        {
          type: "hand_proxy",
          partId: basePart.partId,
          label: "Plant Base",
          color: "#f3d478",
        },
      ],
    },
    {
      id: "scene-2",
      index: 2,
      title: `Load & Engage ${loadPart.name}`,
      durationSeconds: 4.2,
      camera: {
        fromPosition: [165, 135, 205],
        toPosition: [-175, 145, 215],
        fromTarget: [
          basePart.position[0],
          basePart.position[1] - 32,
          basePart.position[2],
        ],
        toTarget: [
          loadPart.position[0],
          loadPart.position[1] - 32,
          loadPart.position[2],
        ],
        fov: 40,
      },
      narration: {
        text: `Open ${loadPart.name} and seat your payload securely.`,
        subtext: "Precision-printed interface with 0.30mm clearance",
        anchor: "part",
        partId: loadPart.partId,
        offset: [0, 32, 0],
      },
      partAnimations: [
        {
          partId: loadPart.partId,
          type: "translate",
          fromOffset: [0, 22, 0],
          toOffset: [0, 0, 0],
          glowColor: "#f3d478",
          glowIntensity: 0.6,
        },
      ],
      effects: [
        {
          type: "hand_proxy",
          partId: loadPart.partId,
          label: "Engage Part",
          color: "#f3d478",
        },
        {
          type: "target_prop",
          partId: loadPart.partId,
          label: "Seated Payload",
          color: "#e6d3b3",
        },
      ],
    },
    {
      id: "scene-3",
      index: 3,
      title: `Activate ${controlPart.name}`,
      durationSeconds: 4.0,
      camera: {
        fromPosition: [-175, 145, 215],
        toPosition: [195, 130, 185],
        fromTarget: [
          loadPart.position[0],
          loadPart.position[1] - 32,
          loadPart.position[2],
        ],
        toTarget: [
          controlPart.position[0],
          controlPart.position[1] - 32,
          controlPart.position[2],
        ],
        fov: 40,
      },
      narration: {
        text: `Power on ${controlPart.name} to arm the control loop.`,
        subtext: "Off-the-shelf hardware module active",
        anchor: "part",
        partId: controlPart.partId,
        offset: [0, 30, 0],
      },
      partAnimations: [
        {
          partId: controlPart.partId,
          type: "pulse",
          glowColor: "#f3d478",
          glowIntensity: 0.7,
          oscillate: true,
        },
      ],
      effects: [
        {
          type: "led_indicator",
          partId: controlPart.partId,
          label: "System Armed",
          color: "#f3d478",
        },
      ],
    },
    {
      id: "scene-4",
      index: 4,
      title: `Articulate ${actuatorPart.name}`,
      durationSeconds: 4.4,
      camera: {
        fromPosition: [195, 130, 185],
        toPosition: [165, 160, -195],
        fromTarget: [
          controlPart.position[0],
          controlPart.position[1] - 32,
          controlPart.position[2],
        ],
        toTarget: [
          actuatorPart.position[0],
          actuatorPart.position[1] - 32,
          actuatorPart.position[2],
        ],
        fov: 40,
      },
      narration: {
        text: `Adjust ${actuatorPart.name} smoothly through its operating range.`,
        subtext: analysis?.keyMechanisms?.[0] || "Zero-backlash motion path",
        anchor: "part",
        partId: actuatorPart.partId,
        offset: [0, 34, 0],
      },
      partAnimations: [
        {
          partId: actuatorPart.partId,
          type: "rotate",
          fromRotationDelta: [0, -24, 0],
          toRotationDelta: [0, 24, 0],
          glowColor: "#f3d478",
          glowIntensity: 0.65,
        },
      ],
      effects: [
        {
          type: "motion_arc",
          partId: actuatorPart.partId,
          label: "Smooth Articulation",
          color: "#f3d478",
        },
      ],
    },
    {
      id: "scene-5",
      index: 5,
      title: `Full Operation: ${objectName}`,
      durationSeconds: 4.6,
      camera: {
        fromPosition: [165, 160, -195],
        toPosition: [225, 165, 255],
        fromTarget: [
          actuatorPart.position[0],
          actuatorPart.position[1] - 32,
          actuatorPart.position[2],
        ],
        toTarget: [
          outputPart.position[0],
          outputPart.position[1] - 32,
          outputPart.position[2],
        ],
        fov: 40,
      },
      narration: {
        text: `${objectName} runs at full capacity with zero proprietary lock-in.`,
        subtext: "Complete 3D-printed + off-the-shelf DIY build",
        anchor: "part",
        partId: outputPart.partId,
        offset: [0, 36, 0],
      },
      partAnimations: [
        {
          partId: outputPart.partId,
          type: "pulse",
          glowColor: "#f3d478",
          glowIntensity: 0.65,
          oscillate: true,
        },
        {
          partId: actuatorPart.partId,
          type: "spin",
          spinAxis: "y",
          spinSpeed: 1.4,
          glowColor: "#e5bd47",
          glowIntensity: 0.5,
        },
      ],
      effects: [
        {
          type: "motion_arc",
          partId: outputPart.partId,
          label: "Active Cycle",
          color: "#f3d478",
        },
      ],
    },
  ];

  return {
    objectName,
    summary:
      analysis?.functionSummary ||
      `Interactive 5-scene operational guide for ${objectName}.`,
    totalDurationSeconds: 21.2,
    scenes,
  };
}

interface UsagePartNodeProps {
  part: ResolvedAssemblyPart;
  calloutNumber: number;
  projectId?: string;
  activeAnim?: UsagePartAnimation;
  isSceneFocus: boolean;
  isHovered: boolean;
  isSelected: boolean;
  sceneProgress: number;
  reducedMotion: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const UsagePartNode: React.FC<UsagePartNodeProps> = ({
  part,
  calloutNumber,
  projectId,
  activeAnim,
  isSceneFocus,
  isHovered,
  isSelected,
  sceneProgress,
  reducedMotion,
  onHover,
  onSelect,
}) => {
  const { geometry, edgesGeometry, boundRadius } = usePartGeometryAndEdges(
    part,
    projectId,
    24
  );

  const isPurchased = part.category === "purchased";
  const resolvedHex = useMemo(
    () =>
      toRenaissancePartColor(
        part.color,
        part.category,
        Math.max(0, calloutNumber - 1)
      ),
    [part.color, part.category, calloutNumber]
  );

  // Calculate animated position offset and rotation delta on the ASSEMBLED part
  const { animatedPos, animatedEuler, pulseScale, glowBoost } = useMemo(() => {
    const basePos = part.position;
    const baseRot = part.rotation;

    if (!activeAnim) {
      return {
        animatedPos: basePos as [number, number, number],
        animatedEuler: new THREE.Euler(
          toRadians(baseRot[0]),
          toRadians(baseRot[1]),
          toRadians(baseRot[2])
        ),
        pulseScale: 1,
        glowBoost: isSceneFocus ? 0.25 : 0,
      };
    }

    const t = reducedMotion ? 0.65 : sceneProgress;
    const wave = reducedMotion
      ? 0.65
      : activeAnim.oscillate ||
        activeAnim.type === "press" ||
        activeAnim.type === "pulse"
      ? Math.sin(t * Math.PI * (activeAnim.oscillate ? 2 : 1))
      : easeInOutCubic(Math.min(1, t * 1.25));

    const fromOff = activeAnim.fromOffset || [0, 0, 0];
    const toOff =
      activeAnim.toOffset ||
      (activeAnim.type === "press"
        ? [0, -8, 0]
        : activeAnim.type === "translate" || activeAnim.type === "slide"
        ? [0, 16, 0]
        : [0, 0, 0]);

    const dx = fromOff[0] + (toOff[0] - fromOff[0]) * wave;
    const dy = fromOff[1] + (toOff[1] - fromOff[1]) * wave;
    const dz = fromOff[2] + (toOff[2] - fromOff[2]) * wave;

    const fromRot = activeAnim.fromRotationDelta || [0, 0, 0];
    const toRot =
      activeAnim.toRotationDelta ||
      (activeAnim.type === "rotate" || activeAnim.type === "tilt"
        ? [0, 22, 0]
        : [0, 0, 0]);

    let rx = baseRot[0] + fromRot[0] + (toRot[0] - fromRot[0]) * wave;
    let ry = baseRot[1] + fromRot[1] + (toRot[1] - fromRot[1]) * wave;
    let rz = baseRot[2] + fromRot[2] + (toRot[2] - fromRot[2]) * wave;

    if (activeAnim.type === "spin" && !reducedMotion) {
      const spinDeg = t * 360 * (activeAnim.spinSpeed || 1.5);
      if (activeAnim.spinAxis === "x") rx += spinDeg;
      else if (activeAnim.spinAxis === "z") rz += spinDeg;
      else ry += spinDeg;
    }

    const scale =
      activeAnim.type === "pulse" && !reducedMotion
        ? 1 + Math.sin(t * Math.PI * 2) * 0.045
        : 1;

    return {
      animatedPos: [
        basePos[0] + dx,
        basePos[1] + dy,
        basePos[2] + dz,
      ] as [number, number, number],
      animatedEuler: new THREE.Euler(
        toRadians(rx),
        toRadians(ry),
        toRadians(rz)
      ),
      pulseScale: scale,
      glowBoost:
        (activeAnim.glowIntensity || 0.55) *
        (0.65 + 0.35 * Math.sin(t * Math.PI)),
    };
  }, [part.position, part.rotation, activeAnim, isSceneFocus, sceneProgress, reducedMotion]);

  const baseColor = useMemo(() => new THREE.Color(resolvedHex), [resolvedHex]);
  const emissiveColor = useMemo(() => {
    if (activeAnim || isSceneFocus || isSelected) {
      return new THREE.Color("#f3d478");
    }
    if (isHovered) return new THREE.Color("#d4af37");
    return new THREE.Color("#2b1d0e");
  }, [activeAnim, isSceneFocus, isSelected, isHovered]);

  const isHighlighted = Boolean(
    activeAnim || isSceneFocus || isSelected || isHovered
  );

  return (
    <group position={animatedPos}>
      <group
        rotation={animatedEuler}
        scale={[pulseScale, pulseScale, pulseScale]}
      >
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
            roughness={isPurchased ? 0.26 : 0.4}
            metalness={isPurchased ? 0.68 : 0.18}
            emissive={emissiveColor}
            emissiveIntensity={
              activeAnim
                ? Math.max(0.32, glowBoost * 0.58)
                : isSceneFocus || isSelected
                ? 0.34
                : isHovered
                ? 0.22
                : 0.06
            }
          />
        </mesh>

        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial
            color={
              isHighlighted
                ? "#f3d478"
                : isPurchased
                ? "#3b2410"
                : "#2b1d0e"
            }
            transparent
            opacity={isHighlighted ? 0.96 : 0.52}
          />
        </lineSegments>
      </group>

      {/* Active Part Beacon Ring */}
      {(activeAnim || isSceneFocus) && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -Math.min(18, boundRadius * 0.35), 0]}
        >
          <ringGeometry
            args={[
              Math.max(12, boundRadius * 0.52),
              Math.max(14.5, boundRadius * 0.62),
              32,
            ]}
          />
          <meshBasicMaterial
            color="#f3d478"
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};

interface SceneEffectsLayerProps {
  effects: UsageEffect[];
  allParts: ResolvedAssemblyPart[];
  sceneProgress: number;
  reducedMotion: boolean;
}

const SceneEffectsLayer: React.FC<SceneEffectsLayerProps> = ({
  effects,
  allParts,
  sceneProgress,
  reducedMotion,
}) => {
  if (!effects || effects.length === 0) return null;

  return (
    <group>
      {effects.map((eff, idx) => {
        const srcPart =
          matchResolvedPart(allParts, eff.partId) || allParts[0];
        const tgtPart = matchResolvedPart(allParts, eff.targetPartId);
        if (!srcPart) return null;

        const srcPos: [number, number, number] = eff.from || [
          srcPart.position[0],
          srcPart.position[1],
          srcPart.position[2],
        ];
        const tgtPos: [number, number, number] = eff.to
          ? eff.to
          : tgtPart
          ? [tgtPart.position[0], tgtPart.position[1], tgtPart.position[2]]
          : [srcPos[0], srcPos[1] - 36, srcPos[2]];

        if (eff.type === "water_flow" || eff.type === "air_stream") {
          const curvePoints: [number, number, number][] = [];
          const steps = 16;
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const arcLift =
              eff.type === "air_stream"
                ? Math.sin(u * Math.PI) * 28
                : Math.sin(u * Math.PI) * 18;
            curvePoints.push([
              srcPos[0] + (tgtPos[0] - srcPos[0]) * u,
              srcPos[1] + (tgtPos[1] - srcPos[1]) * u + arcLift,
              srcPos[2] + (tgtPos[2] - srcPos[2]) * u,
            ]);
          }

          const beadCount = 4;
          const beads: [number, number, number][] = [];
          for (let b = 0; b < beadCount; b++) {
            const u = reducedMotion
              ? (b + 0.5) / beadCount
              : (sceneProgress * 2.2 + b / beadCount) % 1;
            const arcLift =
              eff.type === "air_stream"
                ? Math.sin(u * Math.PI) * 28
                : Math.sin(u * Math.PI) * 18;
            beads.push([
              srcPos[0] + (tgtPos[0] - srcPos[0]) * u,
              srcPos[1] + (tgtPos[1] - srcPos[1]) * u + arcLift,
              srcPos[2] + (tgtPos[2] - srcPos[2]) * u,
            ]);
          }

          return (
            <group key={`eff-${idx}`}>
              <Line
                points={curvePoints}
                color="#f3d478"
                lineWidth={2}
                dashed
                dashScale={0.35}
                dashSize={4}
                gapSize={3}
                transparent
                opacity={0.78}
              />
              {beads.map((bp, bIdx) => (
                <mesh key={bIdx} position={bp}>
                  <sphereGeometry
                    args={[eff.type === "air_stream" ? 3.2 : 2.6, 14, 14]}
                  />
                  <meshBasicMaterial color="#f3d478" />
                </mesh>
              ))}
            </group>
          );
        }

        if (eff.type === "light_beam") {
          const midPos: [number, number, number] = [
            (srcPos[0] + tgtPos[0]) * 0.5,
            (srcPos[1] + tgtPos[1]) * 0.5,
            (srcPos[2] + tgtPos[2]) * 0.5,
          ];
          const height = Math.max(
            24,
            Math.hypot(
              tgtPos[0] - srcPos[0],
              tgtPos[1] - srcPos[1],
              tgtPos[2] - srcPos[2]
            )
          );
          return (
            <group key={`eff-${idx}`} position={midPos}>
              <mesh>
                <cylinderGeometry args={[6, 20, height, 24, 1, true]} />
                <meshBasicMaterial
                  color="#f3d478"
                  transparent
                  opacity={0.22}
                  side={THREE.DoubleSide}
                />
              </mesh>
            </group>
          );
        }

        if (eff.type === "hand_proxy") {
          const hoverY =
            srcPos[1] +
            26 +
            (reducedMotion ? 0 : Math.sin(sceneProgress * Math.PI * 2) * 5);
          return (
            <group
              key={`eff-${idx}`}
              position={[srcPos[0], hoverY, srcPos[2]]}
            >
              {/* Stylized Operator Action Proxy Cone + Tactile Ring */}
              <mesh rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[5.5, 13, 18]} />
                <meshStandardMaterial
                  color="#f3d478"
                  emissive="#d4af37"
                  emissiveIntensity={0.5}
                  metalness={0.6}
                  roughness={0.25}
                />
              </mesh>
              <mesh position={[0, 9, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[7, 1.3, 12, 28]} />
                <meshBasicMaterial color="#f3d478" />
              </mesh>
            </group>
          );
        }

        if (eff.type === "led_indicator") {
          const pulse = reducedMotion
            ? 1
            : 0.85 + 0.3 * Math.sin(sceneProgress * Math.PI * 4);
          return (
            <group
              key={`eff-${idx}`}
              position={[srcPos[0], srcPos[1] + 16, srcPos[2]]}
              scale={[pulse, pulse, pulse]}
            >
              <mesh>
                <sphereGeometry args={[4.2, 16, 16]} />
                <meshBasicMaterial color="#f3d478" />
              </mesh>
            </group>
          );
        }

        // Default: motion_arc / target_prop ring around the active part
        return (
          <group
            key={`eff-${idx}`}
            position={[srcPos[0], srcPos[1] + 8, srcPos[2]]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[20, 23, 36]} />
              <meshBasicMaterial
                color="#e5bd47"
                transparent
                opacity={0.65}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

interface UsageCameraControllerProps {
  currentScene: UsageScene;
  focusPart: ResolvedAssemblyPart | null;
  sceneFraming: ReturnType<typeof computeAssemblyFraming>;
  sceneProgress: number;
  reducedMotion: boolean;
  resetCounter: number;
  isUserOrbiting: React.MutableRefObject<boolean>;
}

const UsageCameraController: React.FC<UsageCameraControllerProps> = ({
  currentScene,
  focusPart,
  sceneFraming,
  sceneProgress,
  reducedMotion,
  resetCounter,
  isUserOrbiting,
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();

  // Compute well-framed start/end camera positions and targets anchored to the real 3D assembly bounds
  const { startPos, endPos, startTarget, endTarget } = useMemo(() => {
    const center = sceneFraming.defaultTarget;
    const fitDist = Math.max(195, sceneFraming.fitDistance * 0.92);

    const partWorld: [number, number, number] = focusPart
      ? [
          focusPart.position[0],
          focusPart.position[1] - 32,
          focusPart.position[2],
        ]
      : center;

    // Blend assembly center (60%) with the active part position (40%) so the whole product stays framed
    // while gently focusing on the active mechanism
    const blendedTarget: [number, number, number] = [
      center[0] * 0.6 + partWorld[0] * 0.4,
      center[1] * 0.6 + partWorld[1] * 0.4,
      center[2] * 0.6 + partWorld[2] * 0.4,
    ];

    const rawFrom = currentScene.camera.fromPosition;
    const rawTo = currentScene.camera.toPosition;

    const fromDir = new THREE.Vector3(
      rawFrom[0],
      Math.max(45, rawFrom[1]),
      rawFrom[2]
    );
    if (fromDir.lengthSq() < 10) fromDir.set(1, 0.7, 1);
    fromDir.normalize();

    const toDir = new THREE.Vector3(
      rawTo[0],
      Math.max(45, rawTo[1]),
      rawTo[2]
    );
    if (toDir.lengthSq() < 10) toDir.set(0.85, 0.65, 1.1);
    toDir.normalize();

    const sPos = new THREE.Vector3(
      blendedTarget[0] + fromDir.x * fitDist,
      blendedTarget[1] + fromDir.y * fitDist * 0.85,
      blendedTarget[2] + fromDir.z * fitDist
    );

    const ePos = new THREE.Vector3(
      blendedTarget[0] + toDir.x * (fitDist * 0.9),
      blendedTarget[1] + toDir.y * (fitDist * 0.82),
      blendedTarget[2] + toDir.z * (fitDist * 0.9)
    );

    const sTgt = new THREE.Vector3(center[0], center[1], center[2]);
    const eTgt = new THREE.Vector3(
      blendedTarget[0],
      blendedTarget[1],
      blendedTarget[2]
    );

    return {
      startPos: sPos,
      endPos: ePos,
      startTarget: sTgt,
      endTarget: eTgt,
    };
  }, [currentScene, focusPart, sceneFraming]);

  useEffect(() => {
    isUserOrbiting.current = false;
  }, [currentScene.id, resetCounter, isUserOrbiting]);

  useFrame((_, delta) => {
    if (!controlsRef.current || isUserOrbiting.current) return;

    const eased = reducedMotion ? 0.5 : easeInOutCubic(sceneProgress);
    const desiredPos = new THREE.Vector3().lerpVectors(startPos, endPos, eased);
    const desiredTgt = new THREE.Vector3().lerpVectors(
      startTarget,
      endTarget,
      eased
    );

    const dampSpeed = reducedMotion ? 10 : 5.5;
    camera.position.lerp(desiredPos, Math.min(1, delta * dampSpeed));
    controlsRef.current.target.lerp(desiredTgt, Math.min(1, delta * dampSpeed));
    controlsRef.current.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={55}
      maxDistance={Math.max(1400, Math.round(sceneFraming.fitDistance * 2.6))}
      onStart={() => {
        isUserOrbiting.current = true;
      }}
    />
  );
};

export const HowToUseScene: React.FC<HowToUseSceneProps> = ({
  design,
  bom,
  instructions,
  usage,
  analysis,
  projectId,
  autoPlay = true,
  className = "",
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isUserOrbiting = useRef<boolean>(false);

  const allParts = useMemo(
    () => resolveAssemblyParts(design, bom, instructions),
    [design, bom, instructions]
  );

  const storyboard = useMemo<UsageStoryboard>(() => {
    if (
      usage &&
      Array.isArray(usage.scenes) &&
      usage.scenes.length >= 1
    ) {
      return usage;
    }
    return buildClientFallbackStoryboard(allParts, design, analysis);
  }, [usage, allParts, design, analysis]);

  const scenes = storyboard.scenes;
  const totalDuration = useMemo(
    () =>
      Math.max(
        1,
        scenes.reduce((acc, s) => acc + (Number(s.durationSeconds) || 4), 0)
      ),
    [scenes]
  );

  // Precompute cumulative scene start/end timestamps for the scrubber and scene markers
  const sceneTimeline = useMemo(() => {
    let cursor = 0;
    return scenes.map((sc, idx) => {
      const dur = Number(sc.durationSeconds) || 4;
      const start = cursor;
      const end = cursor + dur;
      cursor = end;
      return {
        scene: sc,
        idx,
        start,
        end,
        duration: dur,
        startRatio: start / totalDuration,
        endRatio: end / totalDuration,
      };
    });
  }, [scenes, totalDuration]);

  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetCamCounter, setResetCamCounter] = useState<number>(0);

  // Detect prefers-reduced-motion on mount
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setReducedMotion(true);
      setIsPlaying(false);
    }
    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      if (e.matches) setIsPlaying(false);
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  // Autoplay when scrolled into view
  useEffect(() => {
    if (!autoPlay || reducedMotion) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsPlaying(entry.isIntersecting);
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlay, reducedMotion]);

  // Playback RAF loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;
      setElapsedSec((prev) => {
        const next = prev + dt;
        return next >= totalDuration ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, totalDuration]);

  // Determine active scene and local progress (0..1)
  const activeSlot = useMemo(() => {
    const clamped = Math.max(0, Math.min(totalDuration - 0.001, elapsedSec));
    const found =
      sceneTimeline.find((slot) => clamped >= slot.start && clamped < slot.end) ||
      sceneTimeline[sceneTimeline.length - 1] ||
      sceneTimeline[0];
    const localProgress = found
      ? Math.max(0, Math.min(1, (clamped - found.start) / found.duration))
      : 0;
    return {
      slot: found,
      scene: found.scene,
      sceneIdx: found.idx,
      localProgress,
    };
  }, [elapsedSec, totalDuration, sceneTimeline]);

  const currentScene = activeSlot.scene;
  const sceneIdx = activeSlot.sceneIdx;
  const sceneProgress = activeSlot.localProgress;

  // Map active animations by resolved partId
  const activeAnimByPartId = useMemo(() => {
    const map = new Map<string, UsagePartAnimation>();
    for (const anim of currentScene.partAnimations || []) {
      const matched = matchResolvedPart(allParts, anim.partId);
      if (matched) {
        map.set(matched.partId, anim);
        map.set(matched.instanceId, anim);
      } else {
        map.set(anim.partId, anim);
      }
    }
    return map;
  }, [currentScene, allParts]);

  const focusPart = useMemo(() => {
    return (
      matchResolvedPart(allParts, currentScene.narration.partId) ||
      matchResolvedPart(allParts, currentScene.partAnimations[0]?.partId) ||
      allParts[0] ||
      null
    );
  }, [allParts, currentScene]);

  const sceneFraming = useMemo(
    () =>
      computeAssemblyFraming(allParts, {
        explodeFactor: 0.08,
        minExplodeFactor: 0.22,
        fovDeg: 40,
        groupOffset: [0, -32, 0],
      }),
    [allParts]
  );

  // Smooth fade-in and fade-out opacity for the narration speech bubble on each scene
  const bubbleOpacity = useMemo(() => {
    if (reducedMotion || !isPlaying) return 1;
    if (sceneProgress < 0.1) return Math.max(0.25, sceneProgress / 0.1);
    if (sceneProgress > 0.9) return Math.max(0.25, (1 - sceneProgress) / 0.1);
    return 1;
  }, [sceneProgress, reducedMotion, isPlaying]);

  const jumpToScene = useCallback(
    (idx: number) => {
      const targetSlot =
        sceneTimeline[Math.max(0, Math.min(sceneTimeline.length - 1, idx))];
      if (targetSlot) {
        isUserOrbiting.current = false;
        setElapsedSec(targetSlot.start + 0.02);
      }
    },
    [sceneTimeline]
  );

  const handlePrevScene = useCallback(() => {
    const prevIdx = (sceneIdx - 1 + sceneTimeline.length) % sceneTimeline.length;
    jumpToScene(prevIdx);
  }, [sceneIdx, sceneTimeline.length, jumpToScene]);

  const handleNextScene = useCallback(() => {
    const nextIdx = (sceneIdx + 1) % sceneTimeline.length;
    jumpToScene(nextIdx);
  }, [sceneIdx, sceneTimeline.length, jumpToScene]);

  const handleReplay = useCallback(() => {
    isUserOrbiting.current = false;
    setElapsedSec(0);
    if (!reducedMotion) {
      setIsPlaying(true);
    }
  }, [reducedMotion]);

  // 3D speech bubble anchor position above the focused part
  const speechAnchorPos = useMemo<[number, number, number]>(() => {
    if (!focusPart) return [0, 75, 0];
    const off = currentScene.narration.offset || [0, 34, 0];
    return [
      focusPart.position[0] + off[0] * 0.35,
      focusPart.position[1] + Math.max(26, off[1]),
      focusPart.position[2] + off[2] * 0.35,
    ];
  }, [focusPart, currentScene.narration.offset]);

  return (
    <div
      ref={rootRef}
      data-testid="how-to-use-root"
      className={`space-y-4 select-none ${className}`}
    >
      {/* Main 3D Video Player Container */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-[#0c0a08] border border-[#e5bd47]/35 shadow-2xl flex flex-col">
        {/* Top Header Bar: Title + Usage Director Badge + Reduced Motion & Camera Reset */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#17130e]/95 border-b border-[#dfd3be]/20 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5bd47] shadow-[0_0_10px_#e5bd47] shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#faf4e8] tracking-tight leading-none truncate">
                  3D How to Use — Interactive Operational Walkthrough
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-[#e5bd47]/15 border border-[#e5bd47]/45 text-[10px] font-mono font-bold uppercase tracking-wider text-[#f3d478]">
                  Gemini 4 Argon Usage Director
                </span>
              </div>
              {storyboard.summary && (
                <p className="hidden sm:block text-xs text-[#dfd3be] mt-1 line-clamp-1">
                  {storyboard.summary}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="howto-reduced-motion"
              onClick={() => {
                setReducedMotion((v) => {
                  const next = !v;
                  if (next) setIsPlaying(false);
                  return next;
                });
              }}
              aria-pressed={reducedMotion}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                reducedMotion
                  ? "bg-[#e5bd47]/20 border-[#e5bd47]/60 text-[#f3d478]"
                  : "bg-[#0c0a08] border-[#dfd3be]/25 text-[#dfd3be] hover:text-[#faf4e8]"
              }`}
              title="Toggle reduced motion mode"
            >
              {reducedMotion ? "Reduced Motion: ON" : "Reduced Motion"}
            </button>

            <button
              type="button"
              data-testid="howto-reset-camera"
              onClick={() => {
                isUserOrbiting.current = false;
                setResetCamCounter((c) => c + 1);
              }}
              className="min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#0c0a08] hover:bg-[#231d15] text-[#dfd3be] hover:text-[#faf4e8] border border-[#dfd3be]/25 transition-colors"
              title="Re-lock camera to storyboard keyframes"
            >
              Reset Camera
            </button>
          </div>
        </div>

        {/* 3D Viewport Area */}
        <div className="relative w-full h-[460px] sm:h-[540px] overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 48% 42%, rgba(229, 189, 71, 0.11) 0%, rgba(35, 29, 21, 0.06) 50%, rgba(12, 10, 8, 0.96) 100%)",
            }}
          />

          <Canvas
            shadows
            dpr={[1, 2]}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            camera={{
              position: sceneFraming.defaultCamPos,
              fov: 40,
              near: 1,
              far: 3200,
            }}
            onPointerMissed={() => setSelectedId(null)}
          >
            <color attach="background" args={["#0c0a08"]} />
            <fog
              attach="fog"
              args={[
                "#0c0a08",
                Math.max(750, Math.round(sceneFraming.fitDistance * 1.5)),
                Math.max(1950, Math.round(sceneFraming.fitDistance * 3.3)),
              ]}
            />

            {/* Warm Studio Lighting */}
            <ambientLight intensity={0.82} />
            <hemisphereLight
              args={["#faf4e8", "#231d15", 0.9]}
              position={[0, 220, 0]}
            />
            <directionalLight
              position={[160, 250, 170]}
              intensity={1.55}
              color="#faf4e8"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-bias={-0.0005}
            />
            <directionalLight
              position={[-160, 130, -140]}
              intensity={0.68}
              color="#e5bd47"
            />
            <pointLight
              position={[0, 95, 150]}
              intensity={0.5}
              color="#f3d478"
            />

            {/* Assembled Product Meshes + Per-Scene Part Animations */}
            <group position={[0, -32, 0]}>
              {allParts.map((part, idx) => {
                const anim =
                  activeAnimByPartId.get(part.instanceId) ||
                  activeAnimByPartId.get(part.partId);
                const isFocus =
                  focusPart?.instanceId === part.instanceId ||
                  focusPart?.partId === part.partId;
                return (
                  <UsagePartNode
                    key={part.instanceId}
                    part={part}
                    calloutNumber={part.calloutNumber ?? idx + 1}
                    projectId={projectId}
                    activeAnim={anim}
                    isSceneFocus={isFocus}
                    isHovered={hoveredId === part.instanceId}
                    isSelected={selectedId === part.instanceId}
                    sceneProgress={sceneProgress}
                    reducedMotion={reducedMotion}
                    onHover={setHoveredId}
                    onSelect={setSelectedId}
                  />
                );
              })}

              {/* 3D Usage Effects (Water Flow, Air Stream, Light Beam, Hand Proxy, Motion Arc) */}
              <SceneEffectsLayer
                effects={currentScene.effects || []}
                allParts={allParts}
                sceneProgress={sceneProgress}
                reducedMotion={reducedMotion}
              />

              {/* 3D Anchored Speech-Bubble Overlay */}
              {focusPart && (
                <group>
                  <Line
                    points={[
                      [
                        focusPart.position[0],
                        focusPart.position[1] + 6,
                        focusPart.position[2],
                      ],
                      speechAnchorPos,
                    ]}
                    color="#f3d478"
                    lineWidth={1.8}
                    transparent
                    opacity={0.85 * bubbleOpacity}
                  />
                  <Html
                    position={speechAnchorPos}
                    center
                    distanceFactor={280}
                    zIndexRange={[30, 0]}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      data-testid="howto-3d-speech-bubble"
                      style={{
                        opacity: bubbleOpacity,
                        transition: "opacity 220ms ease",
                      }}
                      className="w-[235px] sm:w-[270px] rounded-xl bg-[#17130e]/95 border-2 border-[#e5bd47] px-3.5 py-2.5 shadow-2xl backdrop-blur-md text-left"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded bg-[#e5bd47] text-[#140e07] font-mono text-[10px] font-extrabold uppercase tracking-wider">
                          Scene 0{currentScene.index}/{scenes.length}
                        </span>
                        <span className="font-mono text-[10px] text-[#f3d478] truncate max-w-[130px]">
                          {focusPart.name}
                        </span>
                      </div>
                      <p className="font-sans text-xs sm:text-[13px] font-bold text-[#faf4e8] leading-snug">
                        “{currentScene.narration.text}”
                      </p>
                      {currentScene.narration.subtext && (
                        <p className="mt-1 font-mono text-[10px] text-[#dfd3be] leading-tight">
                          {currentScene.narration.subtext}
                        </p>
                      )}
                    </div>
                  </Html>
                </group>
              )}
            </group>

            {/* Ground Grid & Contact Shadows */}
            <group position={[0, sceneFraming.groundY, 0]}>
              <ContactShadows
                position={[0, 0.2, 0]}
                opacity={0.55}
                scale={Math.max(340, sceneFraming.gridSpan)}
                blur={2.4}
                far={220}
                color="#050302"
              />
              <gridHelper
                args={[sceneFraming.gridSpan, 18, "#5c4930", "#282016"]}
                position={[0, 0, 0]}
              />
            </group>

            <UsageCameraController
              currentScene={currentScene}
              focusPart={focusPart}
              sceneFraming={sceneFraming}
              sceneProgress={sceneProgress}
              reducedMotion={reducedMotion}
              resetCounter={resetCamCounter}
              isUserOrbiting={isUserOrbiting}
            />
          </Canvas>

          {/* Top-Left Scene Badge Overlay */}
          <div className="absolute top-3 left-3 sm:left-4 z-10 max-w-[88%] sm:max-w-sm rounded-xl bg-[#17130e]/92 border border-[#e5bd47]/45 px-3.5 py-2.5 shadow-xl backdrop-blur-md pointer-events-none">
            <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-[#f3d478]">
              <span>
                Scene 0{currentScene.index} of 0{scenes.length}
              </span>
              <span>·</span>
              <span>{currentScene.durationSeconds.toFixed(1)}s</span>
            </div>
            <div
              data-testid="howto-active-scene-title"
              className="mt-0.5 font-display text-base sm:text-lg font-bold text-[#faf4e8] leading-snug"
            >
              {currentScene.title}
            </div>
          </div>

          {/* Bottom-Centered Synchronized Narration Speech Bubble Banner (Always legible on mobile & desktop) */}
          <div
            data-testid="howto-narration-banner"
            style={{
              opacity: bubbleOpacity,
              transition: "opacity 220ms ease",
            }}
            className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[92%] sm:max-w-2xl z-10 rounded-xl bg-[#17130e]/95 border border-[#e5bd47]/65 px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-2xl backdrop-blur-md"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#f3d478]">
                  <span className="rounded bg-[#e5bd47]/20 border border-[#e5bd47]/50 px-1.5 py-0.5 font-bold">
                    NARRATION
                  </span>
                  {focusPart && (
                    <span className="text-[#dfd3be] truncate">
                      Anchored to: <strong className="text-[#faf4e8]">{focusPart.name}</strong>
                    </span>
                  )}
                </div>
                <p
                  data-testid="howto-narration-text"
                  className="text-xs sm:text-sm font-bold text-[#faf4e8] leading-snug"
                >
                  “{currentScene.narration.text}”
                </p>
                {currentScene.narration.subtext && (
                  <p className="text-[11px] text-[#dfd3be] leading-tight">
                    {currentScene.narration.subtext}
                  </p>
                )}
              </div>

              {/* Active Effect / Action Chips */}
              {currentScene.effects && currentScene.effects.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {currentScene.effects.map((eff, i) => (
                    <span
                      key={i}
                      className="rounded-lg bg-[#231d15] border border-[#e5bd47]/40 px-2 py-1 font-mono text-[10px] font-semibold text-[#f3d478]"
                    >
                      {eff.label || eff.type.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transport Control Bar: Play/Pause, Prev/Next, Replay, Timeline Scrubber with Scene Markers */}
        <div className="relative z-10 bg-[#17130e] border-t border-[#dfd3be]/20 px-3.5 py-3 sm:px-5 sm:py-3.5 space-y-3">
          {/* Scrubber Track + Scene Markers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-[#dfd3be]">
              <span>
                Scene 0{currentScene.index}/{scenes.length} ·{" "}
                <strong className="text-[#faf4e8]">{currentScene.title}</strong>
              </span>
              <span className="text-[#f3d478] font-bold">
                {elapsedSec.toFixed(1)}s / {totalDuration.toFixed(1)}s
              </span>
            </div>

            <div className="relative flex items-center py-1.5">
              <input
                type="range"
                min={0}
                max={totalDuration}
                step={0.05}
                value={elapsedSec}
                aria-label="Scrub 3D usage storyboard timeline"
                data-testid="howto-scrubber"
                onChange={(e) => {
                  isUserOrbiting.current = false;
                  setElapsedSec(parseFloat(e.target.value));
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[#0c0a08] accent-[#e5bd47] border border-[#dfd3be]/25"
              />

              {/* Scene Boundary Marker Dots along Scrubber */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-4">
                {sceneTimeline.map((slot) => (
                  <div
                    key={slot.scene.id}
                    style={{ left: `${slot.startRatio * 100}%` }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#f3d478] border border-[#140e07] shadow"
                    title={`Scene ${slot.idx + 1}: ${slot.scene.title}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Transport Buttons + Direct Scene Marker Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                data-testid="howto-play-pause"
                onClick={() => setIsPlaying((p) => !p)}
                className="btn-primary-gold min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold"
              >
                {isPlaying ? "Pause" : "Play 3D Video"}
              </button>

              <button
                type="button"
                data-testid="howto-prev"
                onClick={handlePrevScene}
                className="btn-secondary-surface min-h-[44px] px-3 py-2 text-xs font-semibold"
                title="Previous Scene"
              >
                Prev
              </button>

              <button
                type="button"
                data-testid="howto-next"
                onClick={handleNextScene}
                className="btn-secondary-surface min-h-[44px] px-3 py-2 text-xs font-semibold"
                title="Next Scene"
              >
                Next
              </button>

              <button
                type="button"
                data-testid="howto-replay"
                onClick={handleReplay}
                className="btn-secondary-surface min-h-[44px] px-3 py-2 text-xs font-semibold"
                title="Replay from Scene 1"
              >
                Replay
              </button>
            </div>

            {/* Scene Marker Buttons */}
            <div
              role="group"
              aria-label="Scene Markers"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar"
            >
              {sceneTimeline.map((slot) => {
                const isActive = slot.idx === sceneIdx;
                return (
                  <button
                    key={slot.scene.id}
                    type="button"
                    data-testid={`howto-scene-marker-${slot.idx + 1}`}
                    onClick={() => jumpToScene(slot.idx)}
                    className={`min-h-[40px] px-2.5 py-1 rounded-lg font-mono text-xs font-bold transition-all shrink-0 border ${
                      isActive
                        ? "bg-[#e5bd47] text-[#140e07] border-[#f3d478] shadow-sm"
                        : "bg-[#0c0a08] text-[#dfd3be] border-[#dfd3be]/20 hover:border-[#f3d478] hover:text-[#faf4e8]"
                    }`}
                    title={`${slot.idx + 1}. ${slot.scene.title}`}
                  >
                    0{slot.idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Storyboard Scene Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {sceneTimeline.map((slot) => {
          const sc = slot.scene;
          const isActive = slot.idx === sceneIdx;
          return (
            <button
              key={sc.id}
              type="button"
              data-testid={`howto-scene-card-${slot.idx + 1}`}
              onClick={() => jumpToScene(slot.idx)}
              className={`rounded-xl p-3.5 text-left transition-all border flex flex-col justify-between gap-2.5 ${
                isActive
                  ? "bg-[#231d15] border-[#e5bd47] shadow-md"
                  : "bg-[#17130e] border-[#dfd3be]/20 hover:border-[#f3d478]/60"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      isActive
                        ? "bg-[#e5bd47] text-[#140e07]"
                        : "bg-[#0c0a08] text-[#f3d478] border border-[#dfd3be]/20"
                    }`}
                  >
                    SCENE 0{sc.index}
                  </span>
                  <span className="text-[#b5a48b]">
                    {sc.durationSeconds.toFixed(1)}s
                  </span>
                </div>

                <h4 className="font-display text-base font-bold text-[#faf4e8] leading-snug">
                  {sc.title}
                </h4>

                <p className="text-xs text-[#dfd3be] leading-relaxed">
                  “{sc.narration.text}”
                </p>
              </div>

              <div className="flex flex-wrap gap-1 pt-2 border-t border-[#dfd3be]/15">
                {sc.partAnimations.slice(0, 2).map((pa, i) => (
                  <span
                    key={i}
                    className="rounded bg-[#0c0a08] border border-[#dfd3be]/20 px-1.5 py-0.5 font-mono text-[10px] text-[#f3d478] truncate max-w-full"
                  >
                    {pa.partId} ({pa.type})
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default HowToUseScene;
