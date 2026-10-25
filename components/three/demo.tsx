"use client";

import React, { useState } from "react";
import {
  DesignData,
  InstructionsData,
  BomData,
  PlatesData,
} from "./types";
import { ExplodedView } from "./ExplodedView";
import { AssemblyPlayer } from "./AssemblyPlayer";
import { PlatePreview } from "./PlatePreview";

export const FALLBACK_PLANT_WATERER_DESIGN: DesignData = {
  name: "HydroPulse Self-Watering Plant System",
  description:
    "Parametric DIY alternative to $89 smart self-watering planters — built with 7 FDM printed parts (185g PETG) and $14.20 in off-the-shelf components.",
  printed: [
    {
      id: "reservoir_base",
      name: "Outer Water Reservoir Basin",
      shape: "custom_csg",
      params: { r: 54, w: 108, d: 108, h: 64, wall: 5 },
      color: "#0EA5E9",
      quantity: 1,
    },
    {
      id: "pump_mount_plate",
      name: "Submersible Pump Carrier Plate",
      shape: "plate_with_holes",
      params: {
        w: 68,
        d: 44,
        t: 5,
        holeRadius: 2.5,
        holes: 4,
        centerHoleRadius: 8,
      },
      color: "#6366F1",
      quantity: 1,
    },
    {
      id: "inner_planter_cup",
      name: "Perforated Inner Planter Cup",
      shape: "tube",
      params: { outerRadius: 45, innerRadius: 40, h: 54, closedBottom: 1 },
      color: "#10B981",
      quantity: 1,
    },
    {
      id: "float_guide_tube",
      name: "Water-Level Sight Float Tube",
      shape: "tube",
      params: { outerRadius: 9, innerRadius: 6.5, h: 62 },
      color: "#38BDF8",
      quantity: 1,
    },
    {
      id: "refill_funnel",
      name: "Quick-Fill Conical Funnel",
      shape: "funnel",
      params: {
        topRadius: 20,
        bottomRadius: 6,
        h: 36,
        spoutHeight: 14,
        wall: 2.2,
      },
      color: "#F59E0B",
      quantity: 1,
    },
    {
      id: "sensor_bracket",
      name: "Soil Sensor L-Bracket Mount",
      shape: "bracketL",
      params: { leg1: 36, leg2: 28, w: 18, thickness: 4.5 },
      color: "#A855F7",
      quantity: 1,
    },
    {
      id: "flow_dosing_gear",
      name: "Drip Flow Indexing Gear",
      shape: "gear_simple",
      params: { r: 16, teeth: 12, h: 7, bore: 4 },
      color: "#F43F5E",
      quantity: 1,
    },
    {
      id: "drip_rim_clip",
      name: "Rim Tubing Snap Clip",
      shape: "clip",
      params: { r: 10, t: 3.5, h: 14, openAngle: 75 },
      color: "#2DD4BF",
      quantity: 2,
    },
  ],
  purchased: [
    {
      id: "submersible_pump",
      name: "5V Mini Submersible DC Pump",
      bomLine: "5V Low-Noise Micro Submersible Water Pump (120L/h)",
      color: "#94A3B8",
      quantity: 1,
      proxyShape: {
        shape: "box",
        params: { w: 36, h: 26, d: 24 },
      },
    },
    {
      id: "soil_sensor_probe",
      name: "Capacitive Soil Moisture Sensor",
      bomLine: "Corrosion-Resistant Capacitive Soil Sensor v1.2",
      color: "#64748B",
      quantity: 1,
      proxyShape: {
        shape: "box",
        params: { w: 18, h: 48, d: 4 },
      },
    },
    {
      id: "silicone_drip_riser",
      name: "Silicone Feed Tube & M3 Hardware",
      bomLine: "6mm ID Food-Grade Silicone Tubing + M3x12 Stainless Screws",
      color: "#E2E8F0",
      quantity: 1,
      proxyShape: {
        shape: "cylinder",
        params: { r: 4.5, h: 64 },
      },
    },
  ],
  assembly: [
    {
      partId: "reservoir_base",
      position: [0, -20, 0],
      rotation: [0, 0, 0],
      explode: [0, -58, 0],
      step: 1,
    },
    {
      partId: "pump_mount_plate",
      position: [0, -46, 0],
      rotation: [0, 0, 0],
      explode: [0, -96, 0],
      step: 1,
    },
    {
      partId: "submersible_pump",
      position: [-14, -30, 0],
      rotation: [0, 0, 0],
      explode: [-85, -35, 0],
      step: 2,
    },
    {
      partId: "inner_planter_cup",
      position: [0, 12, 0],
      rotation: [0, 0, 0],
      explode: [0, 42, 0],
      step: 3,
    },
    {
      partId: "float_guide_tube",
      position: [36, 8, 24],
      rotation: [0, 0, 0],
      explode: [65, 45, 50],
      step: 4,
    },
    {
      partId: "refill_funnel",
      position: [36, 48, 24],
      rotation: [0, 0, 0],
      explode: [88, 96, 65],
      step: 4,
    },
    {
      partId: "sensor_bracket",
      position: [-40, 32, 22],
      rotation: [0, 25, 0],
      explode: [-82, 58, 46],
      step: 5,
    },
    {
      partId: "soil_sensor_probe",
      position: [-28, 22, 22],
      rotation: [0, 25, 0],
      explode: [-62, 92, 56],
      step: 5,
    },
    {
      partId: "flow_dosing_gear",
      position: [0, 38, -47],
      rotation: [90, 0, 0],
      explode: [0, 74, -88],
      step: 6,
    },
    {
      partId: "drip_rim_clip",
      position: [0, 38, 45],
      rotation: [0, 0, 0],
      explode: [0, 88, 84],
      step: 6,
    },
    {
      partId: "silicone_drip_riser",
      position: [-14, 6, 42],
      rotation: [0, 0, 0],
      explode: [-45, 65, 88],
      step: 6,
    },
  ],
};

export const FALLBACK_PLANT_WATERER_INSTRUCTIONS: InstructionsData = {
  steps: [
    {
      n: 1,
      title: "Seat Pump Carrier Plate into Reservoir Base",
      partIds: ["reservoir_base", "pump_mount_plate"],
      action: "place",
      tools: ["hand"],
      note: "Align the 4 corner bosses on the carrier plate with the bottom standoffs inside the outer water basin.",
    },
    {
      n: 2,
      title: "Fasten 5V Mini Submersible Water Pump",
      partIds: ["submersible_pump"],
      action: "screw",
      tools: ["screwdriver", "hex key"],
      note: "Secure pump housing onto the carrier plate using 2× M3×12 stainless socket head screws.",
    },
    {
      n: 3,
      title: "Insert Perforated Inner Planter Cup",
      partIds: ["inner_planter_cup"],
      action: "insert",
      tools: ["hand"],
      note: "Lower the inner planter cup into the upper rim flange of the reservoir basin.",
    },
    {
      n: 4,
      title: "Install Sight Float Tube & Quick-Fill Funnel",
      partIds: ["float_guide_tube", "refill_funnel"],
      action: "insert",
      tools: ["hand"],
      note: "Slide the float tube into the side bypass port and seat the conical refill funnel on top.",
    },
    {
      n: 5,
      title: "Mount Sensor L-Bracket & Capacitive Soil Probe",
      partIds: ["sensor_bracket", "soil_sensor_probe"],
      action: "screw",
      tools: ["hex key", "screwdriver"],
      note: "Attach the L-bracket to the planter rim and slide the capacitive moisture probe vertically into the soil slot.",
    },
    {
      n: 6,
      title: "Snap Rim Clip, Flow Gear & Connect Silicone Feed Tube",
      partIds: ["flow_dosing_gear", "drip_rim_clip", "silicone_drip_riser"],
      action: "connect",
      tools: ["tube", "hand"],
      note: "Snap the tube clip onto the front rim, press-fit the flow indexing gear, and route the 6mm silicone riser tube from the pump outlet.",
    },
  ],
};

export const FALLBACK_PLANT_WATERER_BOM: BomData = {
  originalPriceUsd: 89.0,
  items: [
    {
      id: "submersible_pump",
      name: "5V Low-Noise Micro Submersible Water Pump (120L/h)",
      qty: 1,
      priceUsd: 5.49,
      links: [
        {
          retailer: "Amazon",
          url: "https://www.amazon.com/s?k=5V+mini+submersible+water+pump+usb",
        },
        {
          retailer: "AliExpress",
          url: "https://www.aliexpress.com/w/wholesale-5v-submersible-pump.html",
        },
      ],
    },
    {
      id: "soil_sensor_probe",
      name: "Corrosion-Resistant Capacitive Soil Sensor v1.2",
      qty: 1,
      priceUsd: 3.95,
      links: [
        {
          retailer: "Amazon",
          url: "https://www.amazon.com/s?k=capacitive+soil+moisture+sensor+v1.2",
        },
      ],
    },
    {
      id: "silicone_drip_riser",
      name: "6mm ID Food-Grade Silicone Tubing (1m) + M3x12 Stainless Screws",
      qty: 1,
      priceUsd: 4.75,
      links: [
        {
          retailer: "McMaster-Carr",
          url: "https://www.mcmaster.com/silicone-tubing/",
        },
        {
          retailer: "Home Depot",
          url: "https://www.homedepot.com/s/silicone%20tubing",
        },
      ],
    },
  ],
};

export const FALLBACK_PLANT_WATERER_PLATES: PlatesData = {
  printer: {
    name: "Bambu Lab A1",
    bed: { x: 256, y: 256, z: 256 },
  },
  plates: [
    {
      index: 1,
      utilization: 0.684,
      items: [
        {
          partId: "reservoir_base",
          name: "Outer Water Reservoir Basin",
          x: 16,
          y: 18,
          w: 112,
          h: 112,
          rotated: false,
          color: "#0EA5E9",
        },
        {
          partId: "inner_planter_cup",
          name: "Perforated Inner Planter Cup",
          x: 140,
          y: 22,
          w: 94,
          h: 94,
          rotated: false,
          color: "#10B981",
        },
        {
          partId: "pump_mount_plate",
          name: "Submersible Pump Carrier Plate",
          x: 20,
          y: 146,
          w: 72,
          h: 48,
          rotated: false,
          color: "#6366F1",
        },
        {
          partId: "refill_funnel",
          name: "Quick-Fill Conical Funnel",
          x: 108,
          y: 144,
          w: 46,
          h: 46,
          rotated: false,
          color: "#F59E0B",
        },
        {
          partId: "sensor_bracket",
          name: "Soil Sensor L-Bracket Mount",
          x: 168,
          y: 134,
          w: 42,
          h: 34,
          rotated: true,
          color: "#A855F7",
        },
      ],
    },
    {
      index: 2,
      utilization: 0.342,
      items: [
        {
          partId: "float_guide_tube",
          name: "Water-Level Sight Float Tube",
          x: 28,
          y: 30,
          w: 32,
          h: 68,
          rotated: true,
          color: "#38BDF8",
        },
        {
          partId: "flow_dosing_gear",
          name: "Drip Flow Indexing Gear",
          x: 80,
          y: 34,
          w: 38,
          h: 38,
          rotated: false,
          color: "#F43F5E",
        },
        {
          partId: "drip_rim_clip",
          name: "Rim Tubing Snap Clip #1",
          x: 134,
          y: 36,
          w: 30,
          h: 30,
          rotated: false,
          color: "#2DD4BF",
        },
        {
          partId: "drip_rim_clip",
          name: "Rim Tubing Snap Clip #2",
          x: 176,
          y: 36,
          w: 30,
          h: 30,
          rotated: true,
          color: "#2DD4BF",
        },
      ],
    },
  ],
};

export type DemoTabKey = "exploded" | "assembly" | "plates" | "all";

export interface DemoViewerProps {
  design?: DesignData;
  instructions?: InstructionsData;
  bom?: BomData;
  plates?: PlatesData;
  initialTab?: DemoTabKey;
  externalStep?: number;
  onStepDone?: (stepNumber: number) => void;
  className?: string;
}

export const DemoViewer: React.FC<DemoViewerProps> = ({
  design = FALLBACK_PLANT_WATERER_DESIGN,
  instructions = FALLBACK_PLANT_WATERER_INSTRUCTIONS,
  bom = FALLBACK_PLANT_WATERER_BOM,
  plates = FALLBACK_PLANT_WATERER_PLATES,
  initialTab = "exploded",
  externalStep,
  onStepDone,
  className = "",
}) => {
  const [activeTab, setActiveTab] = useState<DemoTabKey>(initialTab);

  const safeDesign =
    design &&
    ((design.printed && design.printed.length > 0) ||
      (design.assembly && design.assembly.length > 0))
      ? design
      : FALLBACK_PLANT_WATERER_DESIGN;

  const safeInstructions =
    instructions && instructions.steps && instructions.steps.length > 0
      ? instructions
      : FALLBACK_PLANT_WATERER_INSTRUCTIONS;

  const safeBom =
    bom && bom.items && bom.items.length > 0 ? bom : FALLBACK_PLANT_WATERER_BOM;

  const safePlates =
    plates && plates.plates && plates.plates.length > 0
      ? plates
      : FALLBACK_PLANT_WATERER_PLATES;

  const totalBomCost = safeBom.items.reduce(
    (sum, item) => sum + item.priceUsd * (item.qty || 1),
    0
  );
  const retailPrice = safeBom.originalPriceUsd || 89.0;
  const savings = Math.max(0, retailPrice - (totalBomCost + 3.8));

  return (
    <div
      className={`w-full space-y-4 text-slate-100 ${className}`}
      data-testid="demo-viewer-root"
    >
      {/* Top Product Summary & View Switcher Header */}
      <div className="rounded-2xl bg-slate-950/90 border border-slate-800/90 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              DIY Alt Ready · You Save ${savings.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-400">
              {safeDesign.printed.length} Printed ·{" "}
              {safeDesign.purchased.length} Purchased ·{" "}
              {safeInstructions.steps.length} Steps
            </span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight mt-1">
            {safeDesign.name || "HydroPulse Self-Watering Plant System"}
          </h2>
        </div>

        {/* View Mode Tabs */}
        <div
          className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 flex-wrap"
          role="tablist"
          aria-label="3D viewer mode tabs"
        >
          {(
            [
              { id: "exploded", label: "1. Exploded 3D View" },
              { id: "assembly", label: "2. IKEA Assembly Player" },
              { id: "plates", label: "3. Build Plate Preview" },
              { id: "all", label: "All Views" },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`demo-tab-${tab.id}`}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active View Panel(s) */}
      {(activeTab === "exploded" || activeTab === "all") && (
        <ExplodedView
          design={safeDesign}
          bom={safeBom}
          instructions={safeInstructions}
          initialSelectedPartId="submersible_pump-2"
        />
      )}

      {(activeTab === "assembly" || activeTab === "all") && (
        <AssemblyPlayer
          design={safeDesign}
          instructions={safeInstructions}
          externalStep={externalStep}
          onStepDone={onStepDone}
        />
      )}

      {(activeTab === "plates" || activeTab === "all") && (
        <PlatePreview plates={safePlates} design={safeDesign} />
      )}
    </div>
  );
};

export default DemoViewer;
