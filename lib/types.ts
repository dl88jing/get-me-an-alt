export type AgentStageId =
  | 'analyst'
  | 'researcher'
  | 'designer'
  | 'critic'
  | 'bom'
  | 'cad'
  | 'instructions';

export type SsePhase = 'start' | 'thought' | 'artifact' | 'done' | 'error';

export interface SsePipelineEvent {
  agent: string;
  phase: SsePhase;
  message: string;
  data?: unknown;
  ts: string;
}

export type AgentStatus = 'pending' | 'running' | 'completed' | 'error';

export type RunnerMode = 'agy-cli' | 'gemini-rest' | 'sample' | 'deterministic';

export interface AgentLogEntry {
  timestamp: string;
  level: 'info' | 'cmd' | 'output' | 'success' | 'warn' | 'error';
  message: string;
}

export interface AgentStageState {
  id: AgentStageId;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  runner?: RunnerMode;
  command?: string;
  conversationId?: string;
  model: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  artifactFile: string;
  summary?: string;
  logs: AgentLogEntry[];
  error?: string;
}

export interface ObjectAnalysis {
  objectName: string;
  slug: string;
  category: string;
  tagline: string;
  description: string;
  functionSummary: string;
  inputUrl?: string;
  inputType: 'url' | 'video' | 'image' | 'prompt';
  originalProduct: {
    name: string;
    brand: string;
    retailPrice: number;
    currency: string;
    url?: string;
    whyExpensive: string;
  };
  targetDiyCost: number;
  estimatedSavings: number;
  estimatedPrintTimeHours: number;
  estimatedAssemblyMinutes: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  overallDimensionsMm: [number, number, number];
  keyMechanisms: string[];
  engineeringNotes: string[];
  materialsNeeded: string[];
  whatGetsPrinted: string[];
  whatGetsBought: string[];
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  type: 'video' | 'printable' | 'schematic' | 'teardown' | 'article' | 'github';
  summary: string;
  keyTakeaways: string[];
  relevanceScore: number;
  thumbnailUrl?: string;
}

export interface ResearchData {
  querySummary: string;
  groundingUsed: boolean;
  searchQueries: string[];
  sources: ResearchSource[];
  technicalInsights: string[];
  referenceDimensions: Record<string, string>;
}

/**
 * Shared contract in COORDINATION.md for design.json parts:
 * `{ id, name, kind: "printed"|"purchased", dims_mm:[x,y,z], shape, params, position:[x,y,z], rotation:[x,y,z], explode:[x,y,z], color, bomRef? }`
 */
export interface DesignPart {
  id: string;
  partNumber?: string;
  name: string;
  kind: 'printed' | 'purchased';
  dims_mm: [number, number, number];
  shape: 'box' | 'cylinder' | 'tube' | 'cone' | 'sphere' | 'bracket' | 'enclosure';
  params: Record<string, number | string | boolean | number[]>;
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
}

export interface DesignSpec {
  objectName: string;
  designPhilosophy: string;
  overallBoundingBoxMm: [number, number, number];
  printedPartsCount: number;
  purchasedPartsCount: number;
  parts: DesignPart[];
  assemblyNotes: string[];
}

export interface RetailerLink {
  retailer:
    | 'Amazon'
    | 'Home Depot'
    | 'Walmart'
    | 'McMaster-Carr'
    | 'AliExpress'
    | 'Adafruit';
  url: string;
  estPrice: number;
  inStock?: boolean;
}

export interface BomItem {
  id: string;
  partNumber: string;
  name: string;
  category:
    | 'electronics'
    | 'hardware'
    | 'plumbing'
    | 'power'
    | 'consumable'
    | 'printed-filament';
  specification: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  primaryRetailer: string;
  primaryUrl: string;
  retailerLinks: RetailerLink[];
  linkedPartIds: string[];
  notes: string;
}

export interface BomData {
  currency: string;
  items: BomItem[];
  summary: {
    purchasedPartsTotal: number;
    filamentCostTotal: number;
    totalDiyCost: number;
    originalRetailPrice: number;
    totalSavings: number;
    savingsPercent: number;
  };
}

export interface PlatePlacement {
  partId: string;
  name: string;
  copyIndex?: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotated?: boolean;
  color?: string;
  stlFile?: string;
}

export interface PlateSpec {
  plateNumber: number;
  name: string;
  printerId: string;
  printerName: string;
  bedDimensionsMm: [number, number, number];
  utilizationPercent: number;
  estimatedMinutes: number;
  weightGrams: number;
  stlFile?: string;
  placements: PlatePlacement[];
}

export interface PlatesData {
  printerId: string;
  printerName: string;
  bedDimensionsMm: [number, number, number];
  totalPlates: number;
  totalWeightGrams: number;
  totalPrintTimeMinutes: number;
  parts: {
    partId: string;
    name: string;
    stlFile: string;
    dims_mm: [number, number, number];
    weightGrams: number;
    estimatedMinutes: number;
    color: string;
    material: string;
  }[];
  plates: PlateSpec[];
}

/**
 * Shared contract in COORDINATION.md for instructions.json:
 * `{ steps: [{ n, title, partIds:[], tools:[], note, motion:{ partId, from:[x,y,z], to:[x,y,z] }[] }] }`
 */
export interface StepMotion {
  partId: string;
  from: [number, number, number];
  to: [number, number, number];
}

export interface InstructionStep {
  n: number;
  title: string;
  partIds: string[];
  tools: string[];
  note: string;
  motion: StepMotion[];
  description?: string;
  actionType?: 'place' | 'insert' | 'fasten' | 'connect' | 'route' | 'test';
  proTip?: string;
}

export interface InstructionsData {
  objectName?: string;
  estimatedTotalMinutes?: number;
  difficulty?: string;
  safetyNotes?: string[];
  steps: InstructionStep[];
}

export interface CritiqueIssue {
  part: string;
  partId: string;
  partName: string;
  category:
    | 'overhang'
    | 'wall_thickness'
    | 'tolerance'
    | 'bed_fit'
    | 'orientation'
    | 'fastener';
  severity: 'pass' | 'info' | 'warning' | 'critical';
  problem: string;
  finding: string;
  fix: string;
  fixApplied: string;
  parameterAdjusted?: string;
}

export interface CritiqueRound {
  round: number;
  passed: boolean;
  score: number;
  summary: string;
  issues: CritiqueIssue[];
  fixesApplied?: string[];
  runner?: RunnerMode;
  durationMs?: number;
}

export interface CritiqueData {
  objectName: string;
  printerId: string;
  printerName?: string;
  bedDimensionsMm: [number, number, number];
  passed: boolean;
  finalScore: number;
  totalRounds: number;
  revisionRoundsUsed?: number;
  degradedGracefully?: boolean;
  rounds: CritiqueRound[];
  checksSummary: {
    overhangsPass: boolean;
    wallThicknessPass: boolean;
    tolerancesPass: boolean;
    bedFitPass: boolean;
  };
  designAdjustments: string[];
  issues: CritiqueIssue[];
}

export interface ProjectManifest {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'running' | 'completed' | 'error';
  isSample?: boolean;
  input: {
    prompt?: string;
    url?: string;
    imageName?: string;
    hasImage?: boolean;
    printerId?: string;
  };
  stages: AgentStageState[];
  analysis?: ObjectAnalysis;
  sources?: ResearchData;
  design?: DesignSpec;
  critique?: CritiqueData;
  bom?: BomData;
  plates?: PlatesData;
  instructions?: InstructionsData;
}
