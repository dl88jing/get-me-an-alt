export type PrintedPartShape =
  | "box"
  | "cylinder"
  | "tube"
  | "bracketL"
  | "plate_with_holes"
  | "hook"
  | "clip"
  | "funnel"
  | "gear_simple"
  | "custom_csg";

export type DesignPartShape =
  | PrintedPartShape
  | "cone"
  | "sphere"
  | "bracket"
  | "enclosure";

export const PRINTED_PART_SHAPES: readonly PrintedPartShape[] = [
  "box",
  "cylinder",
  "tube",
  "bracketL",
  "plate_with_holes",
  "hook",
  "clip",
  "funnel",
  "gear_simple",
  "custom_csg",
] as const;

export interface HoleSpec {
  /** Hole center X offset from plate center in mm */
  x: number;
  /** Hole center Y offset from plate center in mm */
  y: number;
  /** Hole radius in mm */
  radius: number;
}

export interface BoxParams {
  width: number;
  depth: number;
  height: number;
  cornerRadius?: number;
  wallThickness?: number;
  openTop?: boolean;
}

export interface CylinderParams {
  radius?: number;
  diameter?: number;
  topRadius?: number;
  height: number;
  segments?: number;
}

export interface TubeParams {
  outerRadius?: number;
  outerDiameter?: number;
  innerRadius?: number;
  innerDiameter?: number;
  wallThickness?: number;
  height: number;
  flangeRadius?: number;
  flangeHeight?: number;
  segments?: number;
}

export interface BracketLParams {
  /** Horizontal leg length in mm */
  legA: number;
  /** Vertical leg length in mm */
  legB: number;
  /** Extrusion width of the bracket in mm */
  width: number;
  /** Wall thickness of the L-legs in mm */
  thickness: number;
  /** Inner corner fillet radius in mm */
  filletRadius?: number;
}

export interface PlateWithHolesParams {
  width: number;
  depth: number;
  thickness: number;
  cornerRadius?: number;
  holes?: HoleSpec[];
  holeRadius?: number;
  holeMargin?: number;
  holePattern?: "corners" | "center" | "row" | "grid";
}

export interface HookParams {
  /** Straight shank length in mm */
  shankLength: number;
  /** Inner bend radius of the hook throat in mm */
  throatRadius: number;
  /** Extruded width of the hook in mm */
  width: number;
  /** Cross-sectional strip thickness in mm */
  thickness: number;
  /** Return tip extension length in mm */
  tipLength?: number;
}

export interface ClipParams {
  /** Inner radius of the C-clip grip in mm */
  innerRadius?: number;
  /** Inner diameter of the C-clip grip in mm */
  innerDiameter?: number;
  /** Wall thickness of the clip ring in mm */
  wallThickness: number;
  /** Extrusion height (width along tube axis) in mm */
  height: number;
  /** Opening angle of the C-clip jaw in degrees (default 80) */
  openAngleDeg?: number;
  /** Flat backing tab width in mm */
  tabWidth?: number;
  /** Flat backing tab depth/thickness in mm */
  tabDepth?: number;
}

export interface FunnelParams {
  /** Wide mouth outer radius in mm */
  topRadius: number;
  /** Narrow spout outer radius in mm */
  spoutRadius: number;
  /** Height of the conical section in mm */
  coneHeight: number;
  /** Height of the narrow stem/spout section in mm */
  spoutHeight: number;
  /** Wall thickness in mm */
  wallThickness: number;
  /** Optional rim flange width at the mouth in mm */
  flangeWidth?: number;
  segments?: number;
}

export interface GearSimpleParams {
  /** Number of gear teeth (e.g. 8..64) */
  teeth: number;
  /** Metric gear module (pitch diameter / teeth) in mm */
  module?: number;
  /** Optional explicit outer tip radius in mm */
  outerRadius?: number;
  /** Optional explicit root radius in mm */
  rootRadius?: number;
  /** Central shaft bore radius in mm */
  boreRadius?: number;
  /** Central shaft bore diameter in mm */
  boreDiameter?: number;
  /** Gear face thickness in mm */
  thickness: number;
}

export interface CsgOperationSpec {
  op: "union" | "subtract";
  shape: "box" | "cylinder";
  width?: number;
  depth?: number;
  radius?: number;
  diameter?: number;
  height?: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface CustomCsgParams {
  /** Optional preset type: 'enclosure' | 'reservoir' | 'manifold_block' | 'flanged_hub' */
  preset?: "enclosure" | "reservoir" | "manifold_block" | "flanged_hub";
  width?: number;
  depth?: number;
  radius?: number;
  height?: number;
  wallThickness?: number;
  floorThickness?: number;
  cornerRadius?: number;
  rimWidth?: number;
  rimHeight?: number;
  holes?: HoleSpec[];
  operations?: CsgOperationSpec[];
  [key: string]: unknown;
}

export type PartParams =
  | BoxParams
  | CylinderParams
  | TubeParams
  | BracketLParams
  | PlateWithHolesParams
  | HookParams
  | ClipParams
  | FunnelParams
  | GearSimpleParams
  | CustomCsgParams
  | Record<string, any>;

export interface PrintedPart {
  id: string;
  name: string;
  shape: DesignPartShape;
  /** Shape dimensions in millimeters */
  params: Record<string, any>;
  /** Bounding box dimensions [x, y, z] in mm (shared contract) */
  dims_mm?: [number, number, number];
  /** Filament material recommendation (e.g. "PLA", "PETG", "TPU", "ABS") */
  material?: string;
  /** Hex color string for 3D viewer and plate preview (e.g. "#10b981") */
  color: string;
  /** Number of copies needed for the full assembly */
  quantity?: number;
  /** Optional functional description */
  description?: string;
}

export interface ProxyShapeSpec {
  shape: DesignPartShape;
  params: Record<string, any>;
  color?: string;
}

export interface PurchasedPart {
  id: string;
  name: string;
  /** Reference ID or description matching the BOM item */
  bomLine: string;
  /** Proxy parametric geometry for rendering the purchased component in 3D views */
  proxyShape: ProxyShapeSpec;
  quantity?: number;
  color?: string;
  description?: string;
}

export interface AssemblyNode {
  /** Optional unique node identifier when multiple copies of a partId exist in assembly */
  id?: string;
  /** References PrintedPart.id or PurchasedPart.id */
  partId: string;
  /** 1-based copy index when multiple instances of the same partId are placed */
  copy?: number;
  /** Assembled world position [x, y, z] in mm (Z-up) */
  position: [number, number, number];
  /** Assembled Euler rotation [rx, ry, rz] in degrees */
  rotation: [number, number, number];
  /** Explode displacement vector [dx, dy, dz] in mm at explode factor = 1.0 */
  explode: [number, number, number];
  /** 1-based IKEA assembly instruction step number when this part is installed */
  step: number;
}

/**
 * Shared contract in COORDINATION.md for design.json parts:
 * `{ id, name, kind: "printed"|"purchased", dims_mm:[x,y,z], shape, params, position:[x,y,z], rotation:[x,y,z], explode:[x,y,z], color, bomRef? }`
 */
export interface DesignPart {
  id: string;
  partNumber?: string;
  name: string;
  kind: "printed" | "purchased";
  dims_mm: [number, number, number];
  shape: DesignPartShape;
  params: Record<string, any>;
  position: [number, number, number];
  rotation: [number, number, number];
  explode: [number, number, number];
  color: string;
  bomRef?: string;
  material?: string;
  quantity?: number;
  description?: string;
  roleInAssembly?: string;
  infillPercent?: number;
  layerHeightMm?: number;
  supportsRequired?: boolean;
  step?: number;
  scadCode?: string;
  stlBase64?: string;
  stlFile?: string;
  cadGrounded?: boolean;
}

export interface DesignSpec {
  objectName?: string;
  designPhilosophy?: string;
  summary?: string;
  overallBoundingBoxMm?: [number, number, number];
  printedPartsCount?: number;
  purchasedPartsCount?: number;
  assemblyNotes?: string[];
  /** Shared contract: flat parts array of printed + purchased parts */
  parts: DesignPart[];
  /** Optional legacy arrays supported via adapters */
  printedParts?: PrintedPart[];
  purchasedParts?: PurchasedPart[];
  assembly?: AssemblyNode[];
}

/**
 * Shared contract in COORDINATION.md for instructions.json:
 * `{ steps: [{ n, title, partIds:[], tools:[], note, motion:{ partId, from:[x,y,z], to:[x,y,z] }[] }] }`
 */
export interface InstructionMotion {
  partId: string;
  from: [number, number, number];
  to: [number, number, number];
}

export interface InstructionStepSpec {
  n: number;
  title: string;
  partIds: string[];
  tools: string[];
  note: string;
  motion: InstructionMotion[];
  /** Optional legacy/extended fields */
  step?: number;
  description?: string;
  action?: string;
  actionType?: string;
  cameraHint?: {
    position: [number, number, number];
    target: [number, number, number];
    zoom?: number;
    angle?: string;
  };
}

export interface InstructionsSpec {
  objectId?: string;
  objectName?: string;
  totalSteps?: number;
  estimatedMinutes?: number;
  estimatedTotalMinutes?: number;
  difficulty?: string;
  safetyNotes?: string[];
  steps: InstructionStepSpec[];
}
