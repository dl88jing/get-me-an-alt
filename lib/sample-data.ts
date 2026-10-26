import {
  AgentStageState,
  BomData,
  CritiqueData,
  DesignSpec,
  InstructionsData,
  ObjectAnalysis,
  PlatesData,
  ResearchData,
  TeardownData,
  UsageStoryboard,
} from './types';

export const SAMPLE_SLUG = 'plant-auto-waterer';

export const SAMPLE_ANALYSIS: ObjectAnalysis = {
  objectName: 'HydroPulse Smart Plant Auto-Waterer',
  slug: SAMPLE_SLUG,
  category: 'Smart Home & Gardening Hardware',
  tagline:
    'Closed-loop capacitive soil moisture irrigation system with 750mL modular PETG reservoir & precision root-zone drip spikes',
  description:
    'Commercial smart plant watering systems like the Sustee + Blumat Digital Tropf or Click & Grow Smart Pump kits cost $129–$169 for proprietary plastic reservoirs, a basic submersible pump, and a soil probe. This DIY alternative combines 7 watertight 3D-printed parts with $21.30 of off-the-shelf electronics and silicone plumbing.',
  functionSummary:
    'Continuously reads root-zone dielectric permittivity via a corrosion-free capacitive probe, triggers a 5V brushless submersible micro-pump inside a 750mL baffled reservoir when moisture drops below threshold, and delivers metered water through a labyrinth drip emitter spike.',
  inputUrl: 'https://www.amazon.com/dp/B09SMARTWATERER-REF',
  inputType: 'url',
  originalProduct: {
    name: 'AeroDrop Pro Smart Autonomous Plant Watering Station',
    brand: 'AeroDrop / Blumat Digital',
    retailPrice: 149.0,
    currency: 'USD',
    url: 'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+wifi+reservoir',
    whyExpensive:
      'Proprietary injection-molded enclosure, Cloud app subscription markup, and bundled $40 wall adapter for $8 worth of ESP32 + pump hardware.',
  },
  targetDiyCost: 24.85,
  estimatedSavings: 124.15,
  estimatedPrintTimeHours: 3.4,
  estimatedAssemblyMinutes: 25,
  difficulty: 'Beginner',
  overallDimensionsMm: [145, 148, 120],
  keyMechanisms: [
    'Submersible centrifugal micro-pump seated in a vibration-isolating bottom baffle cradle',
    'Bayonet twist-lock reservoir lid with integrated fill funnel & silicone tube pass-through',
    'Dual-outlet pressure-compensating Y-manifold with 6mm barbed hose fittings',
    'Conical labyrinth-channel soil emitter spikes for clog-free root-zone delivery',
  ],
  engineeringNotes: [
    'Print PRT-01 (Reservoir Tank) and PRT-06 (Drip Manifold) in PETG with 4 perimeter walls and 0.20mm layer height for 100% watertightness.',
    'All overhangs are designed at <=45 degrees so zero support material is required across all 7 printed parts.',
    'Fits onto 1 build plate on a Bambu Lab A1 / P1S / X1C (256x256mm) or 2 plates on a Bambu A1 mini (180x180mm).',
  ],
  materialsNeeded: [
    'PETG Filament (~145g) for watertight reservoir, pump cradle & manifold',
    'PLA+ Filament (~75g) for controller enclosure, lid & soil spikes',
    '5V Brushless Submersible Pump + 6mm Silicone Tubing + Capacitive Sensor + ESP32-C3',
  ],
  whatGetsPrinted: [
    'PRT-01: 750mL Ribbed Water Reservoir Tank (110×95×110mm)',
    'PRT-02: Twist-Lock Funnel Lid & Bayonet Collar (116×18×116mm)',
    'PRT-03: Anti-Vibration Submersible Pump Cradle (46×34×42mm)',
    'PRT-04: Top Controller PCB Enclosure with M2.5 Standoffs (68×28×54mm)',
    'PRT-05: Vented Status LED Top Cover (70×10×56mm)',
    'PRT-06: Rim-Mount Barbed Drip Manifold Splitter (54×24×36mm)',
    'PRT-07: Conical Root-Zone Drip Emitter Spikes ×2 (32×96×32mm)',
  ],
  whatGetsBought: [
    'OTS-01: 5V USB/DC Brushless Submersible Micro Water Pump (120L/h)',
    'OTS-02: Capacitive Soil Moisture Sensor v1.2 (Corrosion-Resistant)',
    'OTS-03: Seeed Studio XIAO ESP32-C3 + 5V MOSFET Switch Module',
    'OTS-04: 6mm ID × 8mm OD Food-Grade Silicone Tubing (2m roll)',
    'OTS-05: M2.5 / M3 Stainless Socket Head Cap Screws & Diode Kit',
  ],
};

export const SAMPLE_SOURCES: ResearchData = {
  querySummary:
    'Analyzed teardowns of commercial automatic plant waterers, Printables/Thingiverse watertight PETG reservoir geometries, and open-source ESPHome / Arduino capacitive irrigation schematics.',
  groundingUsed: true,
  searchQueries: [
    'automatic plant watering system teardown submersible pump reservoir dimensions',
    'printables 3d printed plant auto waterer drip spike barbed fitting stl',
    'capacitive soil moisture sensor v1.2 esp32 mosfet pump wiring schematic',
    'bambu lab watertight petg slicer settings 4 perimeters reservoir',
  ],
  sources: [
    {
      id: 'src-1',
      title: 'Printables: Modular Self-Watering Planter & Barbed Drip Spike System',
      url: 'https://www.printables.com/search/models?q=plant+watering+spike+reservoir',
      domain: 'printables.com',
      type: 'printable',
      summary:
        'Open-source parametric barbed hose fittings (6mm OD) and conical soil insertion spikes with anti-clog side vents.',
      keyTakeaways: [
        'Use a 6.4mm outer barb taper down to 5.6mm shaft for airtight grip on 6mm ID silicone tubing.',
        'Cross-shaped conical spike profile prevents soil compaction while adding bending stiffness.',
      ],
      relevanceScore: 0.98,
    },
    {
      id: 'src-2',
      title: 'GitHub: ESPHome Smart Plant Irrigation Controller (ESP32-C3 + Capacitive Probe)',
      url: 'https://github.com/topics/plant-watering-system',
      domain: 'github.com',
      type: 'github',
      summary:
        'Reference firmware and PCB layout using Seeed XIAO ESP32-C3, AO3400 MOSFET low-side switch, and v1.2 capacitive moisture sensor.',
      keyTakeaways: [
        'Capacitive sensor operates at 3.3V analog out (1.2V wet to 2.8V dry) and avoids electrolysis corrosion.',
        'Run pump in 4-second bursts with 60-second soak intervals to prevent pot overflow.',
      ],
      relevanceScore: 0.96,
    },
    {
      id: 'src-3',
      title: 'Prusa & Bambu Knowledgebase: Printing Watertight Containers in PETG',
      url: 'https://help.prusa3d.com/article/watertight-prints_112324',
      domain: 'help.prusa3d.com',
      type: 'article',
      summary:
        'Engineering guidelines for leak-free 3D printed fluid reservoirs without epoxy post-processing.',
      keyTakeaways: [
        '4 perimeters (1.6mm minimum wall), 5 bottom solid layers, 105% extrusion flow multiplier, and randomized seam position.',
        'Fillet internal floor-to-wall transitions with at least 2.5mm radius to eliminate perimeter delamination.',
      ],
      relevanceScore: 0.94,
    },
    {
      id: 'src-4',
      title: 'YouTube Teardown: Inside a $150 Smart Indoor Irrigation System',
      url: 'https://www.youtube.com/results?search_query=smart+plant+watering+system+teardown+diy',
      domain: 'youtube.com',
      type: 'video',
      summary:
        'Teardown showing commercial units use a standard $3 JT-180A 5V brushless pump and a molded ABS housing.',
      keyTakeaways: [
        'Submersible centrifugal pumps require a 4mm bottom clearance grate for unrestricted water intake.',
        'Positioning the drip manifold above the high-water line prevents siphon drainage.',
      ],
      relevanceScore: 0.91,
    },
    {
      id: 'src-5',
      title: 'Instructables: Automated House-Plant Watering Station with 3D Printed Manifold',
      url: 'https://www.instructables.com/howto/automatic+plant+waterer+3d+print/',
      domain: 'instructables.com',
      type: 'schematic',
      summary:
        'Step-by-step wiring diagram, flyback diode protection across 5V pump leads, and multi-pot manifold calibration.',
      keyTakeaways: [
        'Include a 1N4007 flyback diode across motor terminals to suppress inductive voltage spikes.',
        'Seal sensor PCB edges with clear silicone conformal coating before soil insertion.',
      ],
      relevanceScore: 0.89,
    },
    {
      id: 'src-6',
      title: 'iFixit & Hardware Teardown: Disassembling Commercial Smart Drip Irrigation Units',
      url: 'https://www.ifixit.com/Search?query=smart+plant+watering+pump+teardown',
      domain: 'ifixit.com',
      type: 'teardown',
      summary:
        'Internal teardown analysis of commercial $149 smart watering hubs showing ultrasonic-welded ABS shells, 5V centrifugal pumps, and O-ring bayonet collars.',
      keyTakeaways: [
        'Commercial units fail primarily at glued hose barbs; printable 1-piece PETG barbed manifolds eliminate glue joints.',
        'Replace proprietary clip-on lids with a 3-lug twist-lock bayonet collar (0.30mm clearance) for tool-free service.',
      ],
      relevanceScore: 0.93,
    },
    {
      id: 'src-7',
      title: 'Datasheet & Application Note (PDF): Capacitive Soil Moisture Sensor v1.2 + ESP32 ADC Calibration',
      url: 'https://www.google.com/search?q=capacitive+soil+moisture+sensor+v1.2+datasheet+filetype:pdf',
      domain: 'dfrobot.com',
      type: 'article',
      summary:
        'Reference PDF datasheet covering TLC555 capacitive oscillator frequency response, 3.3V regulator dropout, and ADC calibration curve.',
      keyTakeaways: [
        'Verify onboard LDO is the 3.3V TL750L05/XC6206 variant so analog output stays within ESP32-C3 0–2.8V ADC range.',
      ],
      relevanceScore: 0.87,
    },
  ],
  technicalInsights: [
    'Anti-Siphon Geometry: Mounting PRT-06 (Drip Manifold) at Z=98mm on the top rim breaks any gravity siphon when the pump turns off.',
    'Serviceability: Twist-lock lid (PRT-02) lets users refill water without unplugging the sensor or pump harness.',
    'Acoustic Damping: PRT-03 cradle elevates the pump by 4mm on compliant flex ribs, cutting resonance noise by ~12 dB.',
  ],
  referenceDimensions: {
    'Reservoir Outer Diameter': '110 mm (Wall thickness 3.2 mm)',
    'Reservoir Usable Capacity': '750 mL (~14 days per houseplant)',
    'Submersible Pump Cavity': '42 × 32 × 30 mm (fits standard JT-80 / JT-180 5V pumps)',
    'Tubing Standard': '6 mm ID × 8 mm OD Food-Grade Silicone',
    'Controller PCB Mount': 'M2.5 / M3 standoffs on 54 × 38 mm grid',
  },
};

export const SAMPLE_DESIGN: DesignSpec = {
  objectName: 'HydroPulse Smart Plant Auto-Waterer',
  designPhilosophy:
    'Support-free cylindrical architecture with watertight PETG fluid wetted parts, snap-fit pump isolation cradle, and top-mounted modular electronics bay.',
  overallBoundingBoxMm: [145, 148, 120],
  printedPartsCount: 7,
  purchasedPartsCount: 4,
  assemblyNotes: [
    'All 7 printed parts require zero slicer supports when oriented flat on their base.',
    'PRT-06 (Drip Manifold) sits above the reservoir waterline to prevent accidental passive siphoning.',
    'PRT-07 (Emitter Spike) is printed with quantity = 2 so one unit can irrigate two pots simultaneously.',
  ],
  parts: [
    {
      id: 'reservoir-tank',
      partNumber: 'PRT-01',
      name: '750mL Watertight Reservoir Tank',
      kind: 'printed',
      dims_mm: [110, 95, 110],
      shape: 'tube',
      params: { outerRadius: 55, innerRadius: 51.5, height: 95, floorThickness: 4 },
      position: [0, 47.5, 0],
      rotation: [0, 0, 0],
      explode: [0, -70, 0],
      color: '#d4af37',
      bomRef: 'bom-filament-petg',
      material: 'PETG (Watertight)',
      quantity: 1,
      description: 'Main cylindrical 750mL water tank with thick 4mm floor and top bayonet collar.',
      roleInAssembly: 'Primary structural base and water storage vessel.',
      infillPercent: 30,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'pump-cradle',
      partNumber: 'PRT-03',
      name: 'Submersible Pump Isolation Cradle',
      kind: 'printed',
      dims_mm: [50, 26, 46],
      shape: 'tube',
      params: { outerRadius: 24, innerRadius: 19, height: 26 },
      position: [0, 15, 0],
      rotation: [0, 0, 0],
      explode: [-75, -15, 45],
      color: '#e6c365',
      bomRef: 'bom-filament-petg',
      material: 'PETG',
      quantity: 1,
      description: 'Snap-fit retention basket that centers the 5V submersible pump on the reservoir floor.',
      roleInAssembly: 'Holds OTS-01 pump at bottom of reservoir and damps vibration.',
      infillPercent: 25,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'pump-5v',
      partNumber: 'OTS-01',
      name: '5V Brushless Submersible Micro-Pump',
      kind: 'purchased',
      dims_mm: [38, 34, 32],
      shape: 'box',
      params: { width: 38, height: 34, depth: 32, outletDiameter: 6 },
      position: [0, 26, 0],
      rotation: [0, 0, 0],
      explode: [75, -5, 50],
      color: '#b45309',
      bomRef: 'bom-pump-5v',
      material: 'ABS / Brushless Stator (Purchased)',
      quantity: 1,
      description: 'Ultra-quiet 5V DC brushless centrifugal submersible water pump (120 L/h) with vertical 6mm outlet.',
      roleInAssembly: 'Pumps water from reservoir base through silicone tubing to drip manifold.',
    },
    {
      id: 'reservoir-lid',
      partNumber: 'PRT-02',
      name: 'Twist-Lock Reservoir Funnel Lid',
      kind: 'printed',
      dims_mm: [118, 18, 118],
      shape: 'cylinder',
      params: { radius: 59, height: 18, funnelHoleRadius: 12 },
      position: [0, 98, 0],
      rotation: [0, 0, 0],
      explode: [0, 42, 0],
      color: '#b89b4a',
      bomRef: 'bom-filament-petg',
      material: 'PLA+',
      quantity: 1,
      description: 'Bayonet deck lid with recessed water refill funnel, tubing pass-through grommet, and controller rails.',
      roleInAssembly: 'Seals the reservoir top while supporting the controller housing and manifold.',
      infillPercent: 25,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'drip-manifold',
      partNumber: 'PRT-06',
      name: 'Anti-Siphon Dual Barbed Drip Manifold',
      kind: 'printed',
      dims_mm: [52, 26, 36],
      shape: 'box',
      params: { width: 52, height: 26, depth: 36, barbDiameter: 6 },
      position: [56, 98, 0],
      rotation: [0, 0, 0],
      explode: [95, 55, 0],
      color: '#9c7a4c',
      bomRef: 'bom-filament-petg',
      material: 'PETG (Watertight)',
      quantity: 1,
      description: 'Rim-mounted Y-splitter manifold with 6mm barbed inlet and dual pressure-equalized barbed outlets.',
      roleInAssembly: 'Splits pump output flow and prevents gravity siphon backflow.',
      infillPercent: 40,
      layerHeightMm: 0.16,
      supportsRequired: false,
    },
    {
      id: 'controller-enclosure',
      partNumber: 'PRT-04',
      name: 'ESP32 Controller & MOSFET Housing',
      kind: 'printed',
      dims_mm: [68, 28, 54],
      shape: 'enclosure',
      params: { width: 68, height: 28, depth: 54, wallThickness: 2.0 },
      position: [-6, 116, 0],
      rotation: [0, 0, 0],
      explode: [-30, 85, -35],
      color: '#c87d4b',
      bomRef: 'bom-filament-petg',
      material: 'PLA+',
      quantity: 1,
      description: 'Splash-resistant electronics bay with M2.5 PCB bosses, USB-C access port, and sensor wire grommet.',
      roleInAssembly: 'Houses and protects OTS-03 microcontroller and MOSFET pump driver.',
      infillPercent: 20,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'mcu-board',
      partNumber: 'OTS-03',
      name: 'Seeed XIAO ESP32-C3 + MOSFET Driver Board',
      kind: 'purchased',
      dims_mm: [50, 10, 38],
      shape: 'box',
      params: { width: 50, height: 10, depth: 38 },
      position: [-6, 116, 0],
      rotation: [0, 0, 0],
      explode: [-95, 115, 0],
      color: '#c84b31',
      bomRef: 'bom-esp32-controller',
      material: 'FR4 PCB / SMD Electronics (Purchased)',
      quantity: 1,
      description: 'Wi-Fi/BLE microcontroller board paired with a 5V logic-level MOSFET trigger switch.',
      roleInAssembly: 'Reads soil moisture sensor and switches 5V power to the submersible pump.',
    },
    {
      id: 'enclosure-cover',
      partNumber: 'PRT-05',
      name: 'Vented Status LED Top Cover',
      kind: 'printed',
      dims_mm: [70, 10, 56],
      shape: 'box',
      params: { width: 70, height: 10, depth: 56 },
      position: [-6, 134, 0],
      rotation: [0, 0, 0],
      explode: [-30, 145, -35],
      color: '#b87333',
      bomRef: 'bom-filament-petg',
      material: 'PLA+',
      quantity: 1,
      description: 'Snap-fit top bezel cover with central light-pipe ring for the ESP32 status LED.',
      roleInAssembly: 'Encloses the electronics bay on top of PRT-04.',
      infillPercent: 20,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'emitter-spike',
      partNumber: 'PRT-07',
      name: 'Root-Zone Labyrinth Drip Emitter Spike',
      kind: 'printed',
      dims_mm: [30, 96, 30],
      shape: 'cone',
      params: { radiusTop: 15, radiusBottom: 2, height: 96 },
      position: [104, 48, 24],
      rotation: [0, 0, 0],
      explode: [135, 15, 65],
      color: '#d4af37',
      bomRef: 'bom-filament-petg',
      material: 'PETG',
      quantity: 2,
      description: 'Conical soil stake with top 6mm hose barb, soil depth stop flange, and internal drip channel.',
      roleInAssembly: 'Anchors silicone delivery tube in the plant pot and directs water to roots.',
      infillPercent: 35,
      layerHeightMm: 0.2,
      supportsRequired: false,
    },
    {
      id: 'soil-sensor',
      partNumber: 'OTS-02',
      name: 'Capacitive Soil Moisture Sensor Probe v1.2',
      kind: 'purchased',
      dims_mm: [24, 92, 8],
      shape: 'box',
      params: { width: 24, height: 92, depth: 8 },
      position: [98, 48, -26],
      rotation: [0, 0.3, 0],
      explode: [135, 25, -70],
      color: '#e6c365',
      bomRef: 'bom-soil-sensor',
      material: 'Corrosion-Resistant Coated FR4 (Purchased)',
      quantity: 1,
      description: 'Analog capacitive soil moisture sensor probe with 3-pin JST PH2.0 cable.',
      roleInAssembly: 'Measures root-zone moisture level continuously without metallic corrosion.',
    },
    {
      id: 'silicone-tubing',
      partNumber: 'OTS-04',
      name: '6mm Food-Grade Silicone Delivery Hose',
      kind: 'purchased',
      dims_mm: [64, 36, 16],
      shape: 'tube',
      params: { outerRadius: 4, innerRadius: 3, height: 64 },
      position: [78, 96, 12],
      rotation: [0, 0, 1.57],
      explode: [110, 90, 45],
      color: '#bda782',
      bomRef: 'bom-silicone-tubing',
      material: 'Translucent Platinum Silicone (Purchased)',
      quantity: 1,
      description: 'Flexible 6mm ID × 8mm OD silicone tubing linking the pump, manifold, and soil emitter spikes.',
      roleInAssembly: 'Fluid conduit from pump outlet through manifold to emitter spikes.',
    },
  ],
};

export const SAMPLE_BOM: BomData = {
  currency: 'USD',
  items: [
    {
      id: 'bom-pump-5v',
      partNumber: 'OTS-01',
      name: '5V Low-Noise Brushless Submersible Water Pump (JT-180A / 120L/h)',
      category: 'plumbing',
      specification: '3V–5V DC, 1.1m max head, 6mm vertical barb outlet, IP68 waterproof',
      qty: 1,
      unit: 'pc',
      unitPrice: 4.95,
      totalPrice: 4.95,
      primaryRetailer: 'Amazon',
      primaryUrl:
        'https://www.amazon.com/s?k=5V+brushless+submersible+micro+water+pump+USB+low+noise',
      retailerLinks: [
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=5V+brushless+submersible+micro+water+pump+USB+low+noise',
          estPrice: 4.95,
          inStock: true,
        },
        {
          retailer: 'Walmart',
          url: 'https://www.walmart.com/search?q=5V+mini+submersible+water+pump',
          estPrice: 5.49,
          inStock: true,
        },
        {
          retailer: 'AliExpress',
          url: 'https://www.aliexpress.com/w/wholesale-5V-submersible-mini-water-pump.html',
          estPrice: 2.1,
          inStock: true,
        },
      ],
      linkedPartIds: ['pump-5v'],
      notes: 'Drops directly into printed PRT-03 isolation cradle.',
    },
    {
      id: 'bom-soil-sensor',
      partNumber: 'OTS-02',
      name: 'Capacitive Soil Moisture Sensor v1.2 with 3-Pin JST Cable',
      category: 'electronics',
      specification: '3.3V–5.5V DC, corrosion-resistant capacitive sensing, analog voltage output',
      qty: 1,
      unit: 'pc',
      unitPrice: 3.25,
      totalPrice: 3.25,
      primaryRetailer: 'Amazon',
      primaryUrl:
        'https://www.amazon.com/s?k=capacitive+soil+moisture+sensor+v1.2+corrosion+resistant',
      retailerLinks: [
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=capacitive+soil+moisture+sensor+v1.2+corrosion+resistant',
          estPrice: 3.25,
          inStock: true,
        },
        {
          retailer: 'Adafruit',
          url: 'https://www.adafruit.com/search?q=capacitive+soil+moisture+sensor',
          estPrice: 7.5,
          inStock: true,
        },
        {
          retailer: 'AliExpress',
          url: 'https://www.aliexpress.com/w/wholesale-capacitive-soil-moisture-sensor-v1.2.html',
          estPrice: 1.25,
          inStock: true,
        },
      ],
      linkedPartIds: ['soil-sensor'],
      notes: 'Uses capacitive frequency shift instead of exposed copper traces so it never rusts.',
    },
    {
      id: 'bom-esp32-controller',
      partNumber: 'OTS-03',
      name: 'Seeed Studio XIAO ESP32-C3 + 5V Logic MOSFET Switch Module',
      category: 'electronics',
      specification: 'RISC-V Wi-Fi/BLE MCU (USB-C) + AO3400 PWM MOSFET trigger board',
      qty: 1,
      unit: 'set',
      unitPrice: 7.9,
      totalPrice: 7.9,
      primaryRetailer: 'Amazon',
      primaryUrl: 'https://www.amazon.com/s?k=Seeed+XIAO+ESP32C3+MOSFET+switch+module+5V',
      retailerLinks: [
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=Seeed+XIAO+ESP32C3+MOSFET+switch+module+5V',
          estPrice: 7.9,
          inStock: true,
        },
        {
          retailer: 'Adafruit',
          url: 'https://www.adafruit.com/search?q=XIAO+ESP32-C3',
          estPrice: 4.99,
          inStock: true,
        },
        {
          retailer: 'AliExpress',
          url: 'https://www.aliexpress.com/w/wholesale-xiao-esp32-c3-mosfet-module.html',
          estPrice: 4.5,
          inStock: true,
        },
      ],
      linkedPartIds: ['mcu-board'],
      notes: 'Mounts onto the 4 internal M2.5 standoffs inside PRT-04.',
    },
    {
      id: 'bom-silicone-tubing',
      partNumber: 'OTS-04',
      name: 'Food-Grade Flexible Silicone Tubing (6mm ID × 8mm OD, 2m Roll)',
      category: 'plumbing',
      specification: 'Shore 60A platinum-cured flexible silicone hose, kink-resistant',
      qty: 1,
      unit: 'roll (2m)',
      unitPrice: 3.8,
      totalPrice: 3.8,
      primaryRetailer: 'Home Depot',
      primaryUrl: 'https://www.homedepot.com/s/1%204%20inch%20silicone%20tubing%20vinyl%20tubing',
      retailerLinks: [
        {
          retailer: 'Home Depot',
          url: 'https://www.homedepot.com/s/1%204%20inch%20silicone%20tubing%20vinyl%20tubing',
          estPrice: 3.8,
          inStock: true,
        },
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=6mm+ID+8mm+OD+silicone+tubing+food+grade+water+pump',
          estPrice: 4.2,
          inStock: true,
        },
        {
          retailer: 'McMaster-Carr',
          url: 'https://www.mcmaster.com/#silicone-tubing/=',
          estPrice: 5.5,
          inStock: true,
        },
      ],
      linkedPartIds: ['silicone-tubing'],
      notes: 'Push-fits tightly onto PRT-06 manifold and PRT-07 drip spikes.',
    },
    {
      id: 'bom-fasteners',
      partNumber: 'OTS-05',
      name: 'M2.5 / M3 Stainless Screws & 1N4007 Flyback Diode Hardware Pack',
      category: 'hardware',
      specification: '4× M2.5×6mm PCB screws + 1× 1N4007 diode + silicone cable grommet',
      qty: 1,
      unit: 'pack',
      unitPrice: 1.4,
      totalPrice: 1.4,
      primaryRetailer: 'McMaster-Carr',
      primaryUrl: 'https://www.mcmaster.com/#socket-head-cap-screws/=m2.5',
      retailerLinks: [
        {
          retailer: 'McMaster-Carr',
          url: 'https://www.mcmaster.com/#socket-head-cap-screws/=m2.5',
          estPrice: 1.4,
          inStock: true,
        },
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=M2.5+M3+stainless+screw+assortment+kit',
          estPrice: 1.9,
          inStock: true,
        },
        {
          retailer: 'Home Depot',
          url: 'https://www.homedepot.com/s/m3%20machine%20screws%20stainless',
          estPrice: 1.65,
          inStock: true,
        },
      ],
      linkedPartIds: ['controller-enclosure'],
      notes: 'Secures PCB inside controller enclosure.',
    },
    {
      id: 'bom-filament-petg',
      partNumber: 'FIL-01',
      name: '3D Print Filament — PETG + PLA+ (~185g Total Printed Weight)',
      category: 'printed-filament',
      specification: '1.75mm PETG (Reservoir, Cradle, Manifold, Spikes) + PLA+ (Lid & Enclosure)',
      qty: 185,
      unit: 'g',
      unitPrice: 0.0192, // 185g x $0.0192 = $3.552 -> $3.55 totalPrice
      totalPrice: 3.55,
      primaryRetailer: 'Amazon',
      primaryUrl: 'https://www.amazon.com/s?k=PETG+1.75mm+filament+1kg+spool+watertight',
      retailerLinks: [
        {
          retailer: 'Amazon',
          url: 'https://www.amazon.com/s?k=PETG+1.75mm+filament+1kg+spool+watertight',
          estPrice: 3.55,
          inStock: true,
        },
        {
          retailer: 'Walmart',
          url: 'https://www.walmart.com/search?q=PETG+3D+printer+filament+1.75mm',
          estPrice: 3.9,
          inStock: true,
        },
      ],
      linkedPartIds: [
        'reservoir-tank',
        'reservoir-lid',
        'pump-cradle',
        'controller-enclosure',
        'enclosure-cover',
        'drip-manifold',
        'emitter-spike',
      ],
      notes: 'Calculated from STL mesh volume at $19/kg spool cost.',
    },
  ],
  summary: {
    purchasedPartsTotal: 21.3,
    filamentCostTotal: 3.55,
    totalDiyCost: 24.85,
    originalRetailPrice: 149.0,
    totalSavings: 124.15,
    savingsPercent: 83.3,
  },
};

export const SAMPLE_PLATES: PlatesData = {
  printerId: 'bambu-a1',
  printerName: 'Bambu Lab A1 (256×256×256 mm)',
  bedDimensionsMm: [256, 256, 256],
  totalPlates: 1,
  totalWeightGrams: 185,
  totalPrintTimeMinutes: 204,
  parts: [
    {
      partId: 'reservoir-tank',
      name: '750mL Watertight Reservoir Tank',
      stlFile: 'parts/reservoir-tank.stl',
      dims_mm: [110, 95, 110],
      weightGrams: 78,
      estimatedMinutes: 85,
      color: '#d4af37',
      material: 'PETG',
    },
    {
      partId: 'reservoir-lid',
      name: 'Twist-Lock Reservoir Funnel Lid',
      stlFile: 'parts/reservoir-lid.stl',
      dims_mm: [118, 18, 118],
      weightGrams: 34,
      estimatedMinutes: 38,
      color: '#b89b4a',
      material: 'PLA+',
    },
    {
      partId: 'pump-cradle',
      name: 'Submersible Pump Isolation Cradle',
      stlFile: 'parts/pump-cradle.stl',
      dims_mm: [50, 26, 46],
      weightGrams: 14,
      estimatedMinutes: 16,
      color: '#e6c365',
      material: 'PETG',
    },
    {
      partId: 'controller-enclosure',
      name: 'ESP32 Controller & MOSFET Housing',
      stlFile: 'parts/controller-enclosure.stl',
      dims_mm: [68, 28, 54],
      weightGrams: 19,
      estimatedMinutes: 22,
      color: '#c87d4b',
      material: 'PLA+',
    },
    {
      partId: 'enclosure-cover',
      name: 'Vented Status LED Top Cover',
      stlFile: 'parts/enclosure-cover.stl',
      dims_mm: [70, 10, 56],
      weightGrams: 11,
      estimatedMinutes: 12,
      color: '#b87333',
      material: 'PLA+',
    },
    {
      partId: 'drip-manifold',
      name: 'Anti-Siphon Dual Barbed Drip Manifold',
      stlFile: 'parts/drip-manifold.stl',
      dims_mm: [52, 26, 36],
      weightGrams: 11,
      estimatedMinutes: 13,
      color: '#9c7a4c',
      material: 'PETG',
    },
    {
      partId: 'emitter-spike',
      name: 'Root-Zone Labyrinth Drip Emitter Spike (×2)',
      stlFile: 'parts/emitter-spike.stl',
      dims_mm: [30, 96, 30],
      weightGrams: 18,
      estimatedMinutes: 18,
      color: '#d4af37',
      material: 'PETG',
    },
  ],
  plates: [
    {
      plateNumber: 1,
      name: 'Plate 1 — All 8 Printed Parts (Single-Plate Pack)',
      printerId: 'bambu-a1',
      printerName: 'Bambu Lab A1',
      bedDimensionsMm: [256, 256, 256],
      utilizationPercent: 64.2,
      estimatedMinutes: 204,
      weightGrams: 185,
      stlFile: 'plates/plate-1.stl',
      placements: [
        {
          partId: 'reservoir-tank',
          name: '750mL Reservoir Tank',
          x: -58,
          y: -52,
          width: 110,
          depth: 110,
          height: 95,
          color: '#d4af37',
          stlFile: 'parts/reservoir-tank.stl',
        },
        {
          partId: 'reservoir-lid',
          name: 'Twist-Lock Funnel Lid',
          x: 62,
          y: -50,
          width: 118,
          depth: 118,
          height: 18,
          color: '#b89b4a',
          stlFile: 'parts/reservoir-lid.stl',
        },
        {
          partId: 'controller-enclosure',
          name: 'Controller Housing',
          x: -72,
          y: 54,
          width: 68,
          depth: 54,
          height: 28,
          color: '#c87d4b',
          stlFile: 'parts/controller-enclosure.stl',
        },
        {
          partId: 'enclosure-cover',
          name: 'Vented Top Cover',
          x: 4,
          y: 54,
          width: 70,
          depth: 56,
          height: 10,
          color: '#b87333',
          stlFile: 'parts/enclosure-cover.stl',
        },
        {
          partId: 'pump-cradle',
          name: 'Pump Cradle',
          x: 74,
          y: 48,
          width: 50,
          depth: 46,
          height: 26,
          color: '#e6c365',
          stlFile: 'parts/pump-cradle.stl',
        },
        {
          partId: 'drip-manifold',
          name: 'Drip Manifold',
          x: -72,
          y: 102,
          width: 52,
          depth: 36,
          height: 26,
          color: '#9c7a4c',
          stlFile: 'parts/drip-manifold.stl',
        },
        {
          partId: 'emitter-spike',
          name: 'Emitter Spike #1',
          copyIndex: 1,
          x: 2,
          y: 102,
          width: 30,
          depth: 30,
          height: 96,
          color: '#d4af37',
          stlFile: 'parts/emitter-spike.stl',
        },
        {
          partId: 'emitter-spike',
          name: 'Emitter Spike #2',
          copyIndex: 2,
          x: 42,
          y: 102,
          width: 30,
          depth: 30,
          height: 96,
          color: '#d4af37',
          stlFile: 'parts/emitter-spike.stl',
        },
      ],
    },
  ],
};

export const SAMPLE_INSTRUCTIONS: InstructionsData = {
  objectName: 'HydroPulse Smart Plant Auto-Waterer',
  estimatedTotalMinutes: 25,
  difficulty: 'Beginner',
  safetyNotes: [
    'Perform a 10-minute tap-water leak test on PRT-01 (Reservoir Tank) before installing electronics.',
    'Keep PRT-04 (Controller Housing) above the lid seal; only the IP68 pump (OTS-01) and silicone tube belong inside the water tank.',
  ],
  steps: [
    {
      n: 1,
      title: 'Position the 750mL Reservoir Base',
      partIds: ['reservoir-tank'],
      tools: [],
      note: 'Place the printed PETG Reservoir Tank (PRT-01) on a flat workbench and verify the inner floor perimeter seal.',
      motion: [
        {
          partId: 'reservoir-tank',
          from: [0, 120, 0],
          to: [0, 47.5, 0],
        },
      ],
      actionType: 'place',
    },
    {
      n: 2,
      title: 'Seat Submersible Pump in Isolation Cradle',
      partIds: ['pump-cradle', 'pump-5v'],
      tools: [],
      note: 'Snap the 5V Brushless Submersible Pump (OTS-01) into the Isolation Cradle (PRT-03) and lower onto the center boss of the reservoir floor.',
      motion: [
        {
          partId: 'pump-cradle',
          from: [-60, 130, 40],
          to: [0, 15, 0],
        },
        {
          partId: 'pump-5v',
          from: [60, 140, 40],
          to: [0, 26, 0],
        },
      ],
      actionType: 'insert',
    },
    {
      n: 3,
      title: 'Lock Twist-Lock Funnel Lid onto Reservoir',
      partIds: ['reservoir-lid'],
      tools: [],
      note: 'Thread the pump power lead and riser tube through the pass-through collar in PRT-02, align the bayonet tabs, and twist 15° clockwise.',
      motion: [
        {
          partId: 'reservoir-lid',
          from: [0, 175, 0],
          to: [0, 98, 0],
        },
      ],
      actionType: 'fasten',
    },
    {
      n: 4,
      title: 'Clip Anti-Siphon Drip Manifold to Rim',
      partIds: ['drip-manifold'],
      tools: [],
      note: 'Snap the Dual Barbed Drip Manifold (PRT-06) onto the right-hand rim boss of the lid above the high-water line.',
      motion: [
        {
          partId: 'drip-manifold',
          from: [140, 140, 0],
          to: [56, 98, 0],
        },
      ],
      actionType: 'connect',
    },
    {
      n: 5,
      title: 'Mount ESP32-C3 & MOSFET Driver in Enclosure',
      partIds: ['controller-enclosure', 'mcu-board'],
      tools: ['2.0mm Hex Driver'],
      note: 'Seat PRT-04 onto the lid deck, place the Seeed XIAO ESP32-C3 + MOSFET board (OTS-03) onto the 4 internal standoffs, and secure with M2.5×6mm screws.',
      motion: [
        {
          partId: 'controller-enclosure',
          from: [-6, 195, -40],
          to: [-6, 116, 0],
        },
        {
          partId: 'mcu-board',
          from: [-80, 195, 0],
          to: [-6, 116, 0],
        },
      ],
      actionType: 'fasten',
    },
    {
      n: 6,
      title: 'Snap Vented Status LED Top Cover in Place',
      partIds: ['enclosure-cover'],
      tools: [],
      note: 'Connect pump leads to MOSFET screw terminals, plug the JST soil sensor cable into A0/3V3/GND, and press PRT-05 flush.',
      motion: [
        {
          partId: 'enclosure-cover',
          from: [-6, 210, 0],
          to: [-6, 134, 0],
        },
      ],
      actionType: 'place',
    },
    {
      n: 7,
      title: 'Route Silicone Tubing, Emitter Spikes & Soil Probe',
      partIds: ['emitter-spike', 'soil-sensor', 'silicone-tubing'],
      tools: ['Flush Cutters / Scissors'],
      note: 'Push 6mm Silicone Tubing (OTS-04) onto the manifold outlets and Emitter Spikes (PRT-07 ×2), then insert spikes and Capacitive Probe (OTS-02) into the pot.',
      motion: [
        {
          partId: 'emitter-spike',
          from: [185, 110, 75],
          to: [104, 48, 24],
        },
        {
          partId: 'soil-sensor',
          from: [185, 110, -75],
          to: [98, 48, -26],
        },
        {
          partId: 'silicone-tubing',
          from: [155, 160, 45],
          to: [78, 96, 12],
        },
      ],
      actionType: 'route',
    },
  ],
};

export const SAMPLE_CRITIQUE: CritiqueData = {
  objectName: 'HydroPulse Smart Plant Auto-Waterer',
  printerId: 'bambu-a1',
  printerName: 'Bambu Lab A1 (256×256×256 mm)',
  bedDimensionsMm: [256, 256, 256],
  passed: true,
  finalScore: 98,
  totalRounds: 2,
  revisionRoundsUsed: 1,
  checksSummary: {
    overhangsPass: true,
    wallThicknessPass: true,
    tolerancesPass: true,
    bedFitPass: true,
  },
  designAdjustments: [
    'Round 1 -> Designer Revision 1: Increased PRT-01 reservoir radial wall thickness from 1.2mm to 3.5mm (4 PETG perimeters) and floor thickness to 4.0mm for hydrostatic watertightness.',
    'Round 1 -> Designer Revision 1: Added 0.30mm radial clearance and 45° lead-in chamfer on PRT-02 twist-lock bayonet collar.',
    'Round 1 -> Designer Revision 1: Calibrated PRT-04 M2.5 standoff pilot bores to 2.15mm ID for direct self-tapping thread engagement.',
    'Round 1 -> Designer Revision 1: Added 45° teardrop underside relief on PRT-06 horizontal 6mm hose barbs so all 7 printed parts print 100% support-free.',
  ],
  rounds: [
    {
      round: 1,
      passed: false,
      score: 74,
      summary:
        'Round 1 DFM audit flagged 4 printability issues (1 critical watertight wall thickness deficit on PRT-01, 2 fastener/bayonet fit tolerance risks on PRT-02 & PRT-04, and 1 unsupported 90° barb overhang on PRT-06). Looping fixes back to Designer.',
      fixesApplied: [
        'PRT-01 (reservoir-tank): innerRadius adjusted 53.8mm -> 51.5mm (wallThickness = 3.5mm, floorThickness = 4.0mm)',
        'PRT-02 (reservoir-lid): bayonetClearanceMm set to 0.30mm with 45° entry chamfer',
        'PRT-04 (controller-enclosure): M2.5 screw boss pilot bore set to 2.15mm ID (5.0mm OD)',
        'PRT-06 (drip-manifold): added 45° teardrop underside profile on 6mm barbed outlets (supportsRequired = false)',
      ],
      issues: [
        {
          part: 'PRT-01 · 750mL Watertight Reservoir Tank',
          partId: 'reservoir-tank',
          partName: '750mL Watertight Reservoir Tank',
          category: 'wall_thickness',
          severity: 'critical',
          problem:
            'Initial 1.2mm cylinder wall (3 perimeters) risks micro-porosity weeping under 95mm hydrostatic water head.',
          finding:
            'Initial 1.2mm cylinder wall (3 perimeters) risks micro-porosity weeping under 95mm hydrostatic water head.',
          fix: 'Increase radial wall thickness to 3.5mm (outerRadius 55mm, innerRadius 51.5mm) and floor thickness to 4.0mm.',
          fixApplied:
            'Increased radial wall thickness to 3.5mm and base floor to 4.0mm with 2.5mm internal chine fillet.',
          parameterAdjusted: 'params.innerRadius = 51.5, params.floorThickness = 4.0',
        },
        {
          part: 'PRT-02 · Twist-Lock Reservoir Funnel Lid',
          partId: 'reservoir-lid',
          partName: 'Twist-Lock Reservoir Funnel Lid',
          category: 'tolerance',
          severity: 'warning',
          problem:
            'Nominal 0.05mm radial gap on twist-lock bayonet tabs will bind due to FDM seam bulge and thermal shrinkage.',
          finding:
            'Nominal 0.05mm radial gap on twist-lock bayonet tabs will bind due to FDM seam bulge and thermal shrinkage.',
          fix: 'Widen radial bayonet clearance to 0.30mm and add 1.0mm × 45° lead-in chamfer.',
          fixApplied:
            'Applied 0.30mm radial clearance and 45° self-centering lead-in chamfer on bayonet locking lugs.',
          parameterAdjusted: 'params.clearanceMm = 0.30',
        },
        {
          part: 'PRT-04 · ESP32 Controller & MOSFET Housing',
          partId: 'controller-enclosure',
          partName: 'ESP32 Controller & MOSFET Housing',
          category: 'tolerance',
          severity: 'warning',
          problem:
            'M2.5 PCB mounting standoffs modeled with 2.50mm thru-holes provide zero thread bite for M2.5×6mm machine screws.',
          finding:
            'M2.5 PCB mounting standoffs modeled with 2.50mm thru-holes provide zero thread bite for M2.5×6mm machine screws.',
          fix: 'Set standoff pilot hole diameter to 2.15mm ID with 5.0mm boss OD and 0.25mm lid snap-fit lip clearance.',
          fixApplied:
            'Updated M2.5 standoff bores to 2.15mm self-tapping ID and set PRT-05 bezel snap clearance to 0.25mm.',
          parameterAdjusted: 'params.fastenerBoreMm = 2.15, params.lidClearanceMm = 0.25',
        },
        {
          part: 'PRT-06 · Anti-Siphon Dual Barbed Drip Manifold',
          partId: 'drip-manifold',
          partName: 'Anti-Siphon Dual Barbed Drip Manifold',
          category: 'overhang',
          severity: 'warning',
          problem:
            'Horizontal 6mm barbed hose outlets have a 90° bottom step overhang that would sag without internal supports.',
          finding:
            'Horizontal 6mm barbed hose outlets have a 90° bottom step overhang that would sag without internal supports.',
          fix: 'Add 45° teardrop underside ramp to external barb rings and orient manifold flat on base.',
          fixApplied:
            'Converted barb undercuts to 42° self-supporting ramps; internal bore uses teardrop crown.',
          parameterAdjusted: 'params.maxOverhangDeg = 42, supportsRequired = false',
        },
      ],
    },
    {
      round: 2,
      passed: true,
      score: 98,
      summary:
        'Round 2 verification passed (98/100): All 7 printed parts fit comfortably within the Bambu Lab A1 256×256×256 mm build volume, meet >=2.0mm structural / 3.5mm watertight wall thickness, include 0.25–0.30mm mating & M2.5 fastener clearances, and print with zero support material (max overhang 42°).',
      fixesApplied: [
        'Verified all Round 1 DFM fixes in revised design.json; approved for BOM & STL plate packing.',
      ],
      issues: [
        {
          part: 'PRT-01 · 750mL Watertight Reservoir Tank',
          partId: 'reservoir-tank',
          partName: '750mL Watertight Reservoir Tank',
          category: 'wall_thickness',
          severity: 'pass',
          problem: 'Verified 3.5mm PETG wall & 4.0mm floor meet watertight pressure vessel spec.',
          finding: 'Verified 3.5mm PETG wall & 4.0mm floor meet watertight pressure vessel spec.',
          fix: 'No further change needed (110×95×110 mm fits 256×256×256 mm bed).',
          fixApplied: 'Verified 3.5mm wall thickness & 4.0mm floor.',
        },
        {
          part: 'PRT-02 · Twist-Lock Reservoir Funnel Lid',
          partId: 'reservoir-lid',
          partName: 'Twist-Lock Reservoir Funnel Lid',
          category: 'tolerance',
          severity: 'pass',
          problem: 'Verified 0.30mm radial bayonet clearance and 45° chamfer.',
          finding: 'Verified 0.30mm radial bayonet clearance and 45° chamfer.',
          fix: 'No further change needed (118×18×118 mm fits 256×256×256 mm bed).',
          fixApplied: 'Verified 0.30mm radial clearance.',
        },
        {
          part: 'PRT-04 · ESP32 Controller & MOSFET Housing',
          partId: 'controller-enclosure',
          partName: 'ESP32 Controller & MOSFET Housing',
          category: 'tolerance',
          severity: 'pass',
          problem: 'Verified 2.0mm enclosure walls, 2.15mm M2.5 self-tapping bosses, and 0.25mm lid fit.',
          finding: 'Verified 2.0mm enclosure walls, 2.15mm M2.5 self-tapping bosses, and 0.25mm lid fit.',
          fix: 'No further change needed (68×28×54 mm fits 256×256×256 mm bed).',
          fixApplied: 'Verified 2.15mm M2.5 standoff bores.',
        },
        {
          part: 'PRT-06 · Anti-Siphon Dual Barbed Drip Manifold',
          partId: 'drip-manifold',
          partName: 'Anti-Siphon Dual Barbed Drip Manifold',
          category: 'overhang',
          severity: 'pass',
          problem: 'Verified 42° support-free barb ramps and +0.3mm interference fit for 6mm ID silicone tubing.',
          finding: 'Verified 42° support-free barb ramps and +0.3mm interference fit for 6mm ID silicone tubing.',
          fix: 'No further change needed (52×26×36 mm fits 256×256×256 mm bed).',
          fixApplied: 'Verified 42° support-free barb overhangs.',
        },
      ],
    },
  ],
  issues: [
    {
      part: 'PRT-01 · 750mL Watertight Reservoir Tank',
      partId: 'reservoir-tank',
      partName: '750mL Watertight Reservoir Tank',
      category: 'wall_thickness',
      severity: 'critical',
      problem:
        'Initial 1.2mm cylinder wall (3 perimeters) risks micro-porosity weeping under 95mm hydrostatic water head.',
      finding:
        'Initial 1.2mm cylinder wall (3 perimeters) risks micro-porosity weeping under 95mm hydrostatic water head.',
      fix: 'Increased radial wall thickness to 3.5mm (outerRadius 55mm, innerRadius 51.5mm) and floor thickness to 4.0mm.',
      fixApplied:
        'Increased radial wall thickness to 3.5mm and base floor to 4.0mm with 2.5mm internal chine fillet.',
      parameterAdjusted: 'params.innerRadius = 51.5, params.floorThickness = 4.0',
    },
    {
      part: 'PRT-02 · Twist-Lock Reservoir Funnel Lid',
      partId: 'reservoir-lid',
      partName: 'Twist-Lock Reservoir Funnel Lid',
      category: 'tolerance',
      severity: 'warning',
      problem:
        'Nominal 0.05mm radial gap on twist-lock bayonet tabs will bind due to FDM seam bulge and thermal shrinkage.',
      finding:
        'Nominal 0.05mm radial gap on twist-lock bayonet tabs will bind due to FDM seam bulge and thermal shrinkage.',
      fix: 'Widened radial bayonet clearance to 0.30mm and added 1.0mm × 45° lead-in chamfer.',
      fixApplied:
        'Applied 0.30mm radial clearance and 45° self-centering lead-in chamfer on bayonet locking lugs.',
      parameterAdjusted: 'params.clearanceMm = 0.30',
    },
    {
      part: 'PRT-04 · ESP32 Controller & MOSFET Housing',
      partId: 'controller-enclosure',
      partName: 'ESP32 Controller & MOSFET Housing',
      category: 'tolerance',
      severity: 'warning',
      problem:
        'M2.5 PCB mounting standoffs modeled with 2.50mm thru-holes provide zero thread bite for M2.5×6mm machine screws.',
      finding:
        'M2.5 PCB mounting standoffs modeled with 2.50mm thru-holes provide zero thread bite for M2.5×6mm machine screws.',
      fix: 'Set standoff pilot hole diameter to 2.15mm ID with 5.0mm boss OD and 0.25mm lid snap-fit lip clearance.',
      fixApplied:
        'Updated M2.5 standoff bores to 2.15mm self-tapping ID and set PRT-05 bezel snap clearance to 0.25mm.',
      parameterAdjusted: 'params.fastenerBoreMm = 2.15, params.lidClearanceMm = 0.25',
    },
    {
      part: 'PRT-06 · Anti-Siphon Dual Barbed Drip Manifold',
      partId: 'drip-manifold',
      partName: 'Anti-Siphon Dual Barbed Drip Manifold',
      category: 'overhang',
      severity: 'warning',
      problem:
        'Horizontal 6mm barbed hose outlets have a 90° bottom step overhang that would sag without internal supports.',
      finding:
        'Horizontal 6mm barbed hose outlets have a 90° bottom step overhang that would sag without internal supports.',
      fix: 'Converted barb undercuts to 42° self-supporting ramps; internal bore uses teardrop crown.',
      fixApplied:
        'Converted barb undercuts to 42° self-supporting ramps; internal bore uses teardrop crown.',
      parameterAdjusted: 'params.maxOverhangDeg = 42, supportsRequired = false',
    },
  ],
};

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function makeBlueprintFrameSvg(
  timeLabel: string,
  title: string,
  callouts: string[],
  accent = '#d4af37'
): string {
  const safeTime = escapeXml(timeLabel);
  const safeTitle = escapeXml(title);
  const safeCallout1 = escapeXml(callouts[0] || '');
  const safeCallout2 = escapeXml(callouts[1] || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs>
      <radialGradient id="vellum" cx="50%" cy="42%" r="68%">
        <stop offset="0%" stop-color="#281e14"/>
        <stop offset="65%" stop-color="#19130c"/>
        <stop offset="100%" stop-color="#0f0b07"/>
      </radialGradient>
      <pattern id="codexGrid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d4af37" stroke-opacity="0.12" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="640" height="360" fill="url(#vellum)"/>
    <rect width="640" height="360" fill="url(#codexGrid)"/>
    <rect x="16" y="16" width="608" height="328" rx="12" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.5"/>
    <rect x="22" y="22" width="596" height="316" rx="8" fill="none" stroke="#d4af37" stroke-opacity="0.22" stroke-dasharray="4 4" stroke-width="1"/>
    <circle cx="192" cy="194" r="82" fill="#140f0a" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.8"/>
    <circle cx="192" cy="194" r="58" fill="none" stroke="#e6d3b3" stroke-opacity="0.55" stroke-dasharray="6 4" stroke-width="1.4"/>
    <circle cx="192" cy="194" r="32" fill="none" stroke="#d4af37" stroke-opacity="0.4" stroke-width="1"/>
    <line x1="100" y1="194" x2="284" y2="194" stroke="#d4af37" stroke-opacity="0.28" stroke-dasharray="3 3" stroke-width="1"/>
    <line x1="192" y1="102" x2="192" y2="286" stroke="#d4af37" stroke-opacity="0.28" stroke-dasharray="3 3" stroke-width="1"/>
    <rect x="156" y="162" width="72" height="64" rx="6" fill="#231910" stroke="#f3d478" stroke-width="1.8"/>
    <line x1="228" y1="176" x2="324" y2="136" stroke="${accent}" stroke-width="1.8"/>
    <circle cx="228" cy="176" r="4" fill="${accent}"/>
    <line x1="228" y1="210" x2="324" y2="224" stroke="#52b788" stroke-width="1.8"/>
    <circle cx="228" cy="210" r="4" fill="#52b788"/>
    <text x="36" y="50" fill="#f3d478" font-family="Georgia, serif" font-size="12" font-weight="bold" letter-spacing="1.5">CODEX ANATOMICA · FOLIO DISASSEMBLY @ ${safeTime}</text>
    <text x="36" y="76" fill="#f5ebd6" font-family="Georgia, serif" font-size="16" font-weight="bold">${safeTitle}</text>
    <rect x="324" y="106" width="276" height="74" rx="8" fill="#15100b" stroke="${accent}" stroke-opacity="0.65" stroke-width="1.2"/>
    <text x="338" y="128" fill="#f3d478" font-family="Georgia, serif" font-size="10" font-weight="bold" letter-spacing="1.2">FIGURA I · PRINTED / PRIMARY VESSEL</text>
    <text x="338" y="152" fill="#f5ebd6" font-family="monospace" font-size="11.5">${safeCallout1}</text>
    <rect x="324" y="194" width="276" height="74" rx="8" fill="#15100b" stroke="#52b788" stroke-opacity="0.65" stroke-width="1.2"/>
    <text x="338" y="216" fill="#6ee7b7" font-family="Georgia, serif" font-size="10" font-weight="bold" letter-spacing="1.2">FIGURA II · COUPLED MECHANISM</text>
    <text x="338" y="240" fill="#f5ebd6" font-family="monospace" font-size="11.5">${safeCallout2}</text>
    <text x="36" y="322" fill="#bda782" font-family="Georgia, serif" font-size="11" font-style="italic">De Mechanica · Gemini 4 Argon Multimodal Internal Part Callout</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const SAMPLE_TEARDOWN: TeardownData = {
  videos: [
    {
      url: 'https://www.youtube.com/watch?v=uRrnA6kK3FU',
      title: 'Building a 200€ Product for 30€: ESP32 Autonomous Plant Waterer Teardown & Build',
      videoId: 'uRrnA6kK3FU',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-68s.webp',
    },
    {
      url: 'https://www.youtube.com/watch?v=Ix3a3ThsHfA',
      title: 'ESP32 Submersible Pump, Reservoir & Capacitive Soil Sensor Assembly',
      videoId: 'Ix3a3ThsHfA',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-24s.webp',
    },
  ],
  note: 'Analyzed 4 key disassembly timestamps via Gemini 4 Argon multimodal video inspection.',
  generatedAt: '2026-10-25T19:45:00.000Z',
  frames: [
    {
      video: 'https://www.youtube.com/watch?v=Ix3a3ThsHfA',
      t: 24,
      image: '/media/teardown/plant-waterer/frame-24s.webp',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-24s.webp',
      description:
        'Lower housing separated to expose the 750mL cylindrical water reservoir, bottom acoustic isolation cradle, and 5V brushless centrifugal micro-pump.',
      captureMode: 'yt-dlp-ffmpeg',
      parts: [
        {
          name: '750mL Watertight Reservoir Tank',
          function: 'Stores 750mL of irrigation water with 3.5mm watertight PETG perimeter walls and top bayonet locking ring.',
          material: 'PETG (4 perimeters, 0.20mm layer)',
          dims_mm: [110, 95, 110],
          fasteners: '3-lug twist-lock bayonet collar (0.30mm radial clearance)',
          buyOrPrint: 'print',
          offTheShelfQuery: 'PETG 1.75mm filament watertight reservoir',
          confidence: 0.97,
          partId: 'reservoir-tank',
          bomRef: 'bom-filament-petg',
        },
        {
          name: '5V Brushless Submersible Micro-Pump',
          function: 'Delivers 120 L/h water flow from reservoir floor through vertical 6mm outlet barb.',
          material: 'ABS impeller housing + epoxy-potted brushless stator',
          dims_mm: [38, 34, 32],
          fasteners: 'Snap-fits into PRT-03 compliant isolation cradle + 6mm silicone barb',
          buyOrPrint: 'buy',
          offTheShelfQuery: '5V mini submersible brushless water pump 120L/h',
          confidence: 0.96,
          partId: 'pump-5v',
          bomRef: 'bom-pump-5v',
        },
      ],
    },
    {
      video: 'https://www.youtube.com/watch?v=uRrnA6kK3FU',
      t: 68,
      image: '/media/teardown/plant-waterer/frame-68s.webp',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-68s.webp',
      description:
        'Top deck removal revealing the twist-lock refill funnel lid, silicone riser grommet, and rim-mounted dual barbed Y-manifold seated above the high-water line.',
      captureMode: 'yt-dlp-ffmpeg',
      parts: [
        {
          name: 'Twist-Lock Reservoir Funnel Lid',
          function: 'Seals reservoir top while providing a recessed refill funnel and controller mounting rails.',
          material: 'PLA+ / PETG (25% gyroid infill)',
          dims_mm: [118, 18, 118],
          fasteners: 'Bayonet twist-lock tabs + 8mm silicone pass-through grommet',
          buyOrPrint: 'print',
          offTheShelfQuery: 'PLA+ 1.75mm filament',
          confidence: 0.95,
          partId: 'reservoir-lid',
          bomRef: 'bom-filament-petg',
        },
        {
          name: 'Anti-Siphon Dual Barbed Drip Manifold',
          function: 'Splits pump output to 2 pots at Z=98mm above waterline to break gravity siphons.',
          material: 'PETG (42° support-free teardrop barbs)',
          dims_mm: [52, 26, 36],
          fasteners: 'Rim snap-clip + 3x 6.3mm barbed hose outlets',
          buyOrPrint: 'print',
          offTheShelfQuery: '6mm barbed Y splitter irrigation fitting',
          confidence: 0.94,
          partId: 'drip-manifold',
          bomRef: 'bom-filament-petg',
        },
      ],
    },
    {
      video: 'https://www.youtube.com/watch?v=Ix3a3ThsHfA',
      t: 118,
      image: '/media/teardown/plant-waterer/frame-118s.webp',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-118s.webp',
      description:
        'Close-up of the top electronics bench showing 4 self-tapping 2.15mm M2.5 standoffs, Seeed XIAO ESP32-C3 MCU, and low-side MOSFET pump switch.',
      captureMode: 'yt-dlp-ffmpeg',
      parts: [
        {
          name: 'ESP32 Controller & MOSFET Housing',
          function: 'Protects microcontroller and MOSFET driver above the lid splash zone.',
          material: 'PLA+ (2.0mm walls, 2.15mm M2.5 pilot bores)',
          dims_mm: [68, 28, 54],
          fasteners: '4x M2.5x6mm stainless socket head cap screws + 0.25mm snap bezel',
          buyOrPrint: 'print',
          offTheShelfQuery: 'M2.5x6mm stainless socket head cap screws',
          confidence: 0.95,
          partId: 'controller-enclosure',
          bomRef: 'bom-fasteners-kit',
        },
        {
          name: 'Seeed XIAO ESP32-C3 & MOSFET Driver',
          function: 'Reads capacitive moisture analog voltage and pulses 5V pump via PWM MOSFET switch.',
          material: 'FR4 PCB + USB-C connector',
          dims_mm: [54, 14, 38],
          fasteners: '4x M2.5 mounting holes + 2-pin screw terminal',
          buyOrPrint: 'buy',
          offTheShelfQuery: 'Seeed Studio XIAO ESP32C3 MOSFET switch module',
          confidence: 0.96,
          partId: 'mcu-board',
          bomRef: 'bom-esp32-mosfet',
        },
      ],
    },
    {
      video: 'https://www.youtube.com/watch?v=K11lxI0kJVM',
      t: 164,
      image: '/media/teardown/plant-waterer/frame-164s.webp',
      thumbnailUrl: '/media/teardown/plant-waterer/frame-164s.webp',
      description:
        'Root-zone delivery assembly pairing two 3D-printed conical labyrinth emitter spikes with a corrosion-free capacitive soil moisture sensor probe.',
      captureMode: 'yt-dlp-ffmpeg',
      parts: [
        {
          name: 'Root-Zone Labyrinth Drip Emitter Spike (×2)',
          function: 'Guides water directly to plant roots with cross-ribbed conical shaft and top 6mm barb.',
          material: 'PETG (30% infill, zero supports)',
          dims_mm: [30, 96, 30],
          fasteners: '6mm barbed top inlet for 6mm ID silicone tubing',
          buyOrPrint: 'print',
          offTheShelfQuery: 'drip irrigation emitter stakes 1/4 inch barb',
          confidence: 0.93,
          partId: 'emitter-spike',
          bomRef: 'bom-filament-petg',
        },
        {
          name: 'Capacitive Soil Moisture Sensor Probe v1.2',
          function: 'Measures soil dielectric permittivity (1.2V wet to 2.8V dry) without exposed metal electrodes.',
          material: 'Conformal-coated FR4 PCB + JST-PH 3-pin lead',
          dims_mm: [22, 98, 5],
          fasteners: 'JST-PH 2.0mm 3-pin cable to controller ADC input',
          buyOrPrint: 'buy',
          offTheShelfQuery: 'capacitive soil moisture sensor v1.2 corrosion resistant',
          confidence: 0.98,
          partId: 'soil-sensor',
          bomRef: 'bom-soil-sensor',
        },
      ],
    },
  ],
};

export function createInitialStages(): AgentStageState[] {
  const model = process.env.GEMINI_MODEL || 'gemini-4-argon';
  return [
    {
      id: 'analyst',
      name: 'Analyst Agent',
      role: 'Product Deconstruction & Mechanism Specialist',
      description:
        'Identifies object function, target dimensions, core mechanisms, and original vs. DIY cost structure.',
      status: 'pending',
      model,
      artifactFile: 'analysis.json',
      logs: [],
    },
    {
      id: 'researcher',
      name: 'Researcher Agent',
      role: 'Web Grounding & Open-Source Hardware Scout',
      description:
        'Searches videos, teardowns, Printables/Thingiverse CAD priors, and schematics via Google Search grounding.',
      status: 'pending',
      model,
      artifactFile: 'sources.json',
      logs: [],
    },
    {
      id: 'designer',
      name: 'Designer / Architect Agent',
      role: 'Parametric Systems & Assembly Graph Architect',
      description:
        'Splits object into 3D-printed vs. off-the-shelf parts with parametric shapes and 3D assembly coordinates.',
      status: 'pending',
      model,
      artifactFile: 'design.json',
      logs: [],
    },
    {
      id: 'critic',
      name: 'Printability Critic Agent',
      role: 'DFM, Overhang, Wall Thickness, Tolerance & Bed-Fit Verifier',
      description:
        'Audits design.json against the selected printer bed and loops printability fixes back to the Designer.',
      status: 'pending',
      model,
      artifactFile: 'critique.json',
      logs: [],
    },
    {
      id: 'bom',
      name: 'BOM Procurement Agent',
      role: 'Retail Sourcing & Cost Optimization Specialist',
      description:
        'Generates verified search links across Amazon, Home Depot, Walmart, McMaster-Carr, and AliExpress with savings math.',
      status: 'pending',
      model,
      artifactFile: 'bom.json',
      logs: [],
    },
    {
      id: 'cad',
      name: 'CAD & Plate Packer Agent',
      role: 'Parametric CSG STL Generator & 2D Bin-Packer',
      description:
        'Synthesizes watertight STL meshes for each printed part and bin-packs onto the fewest plates for your printer bed.',
      status: 'pending',
      model,
      artifactFile: 'plates.json',
      logs: [],
    },
    {
      id: 'instructions',
      name: 'Instructions Agent',
      role: 'IKEA-Style Animated Assembly Choreographer',
      description:
        'Produces step-by-step animated motion vectors, tool callouts, and notes for the 3D assembly player.',
      status: 'pending',
      model,
      artifactFile: 'instructions.json',
      logs: [],
    },
    {
      id: 'usage',
      name: 'Usage Director Agent',
      role: '3D Operational Storyboard & Camera Choreographer',
      description:
        'Directs a 5-scene interactive 3D usage storyboard with camera keyframes, part animations, and narration bubbles.',
      status: 'pending',
      model,
      artifactFile: 'usage.json',
      logs: [],
    },
  ];
}

export const SAMPLE_USAGE: UsageStoryboard = {
  objectName: 'HydroPulse Smart Plant Auto-Waterer',
  summary:
    'Five-step operational walkthrough: twist-open the funnel lid to fill the 750mL PETG reservoir, insert the capacitive probe and emitter spikes into soil, connect 5V USB-C power to arm the ESP32-C3, calibrate the anti-siphon drip manifold, and watch automated root-zone watering.',
  totalDurationSeconds: 21.4,
  scenes: [
    {
      id: 'scene-1',
      index: 1,
      title: 'Top-Fill 750mL Reservoir',
      durationSeconds: 4.2,
      camera: {
        fromPosition: [215, 175, 245],
        toPosition: [148, 168, 178],
        fromTarget: [8, 42, 0],
        toTarget: [0, 72, 0],
        fov: 40,
      },
      narration: {
        text: 'Twist open the bayonet lid and pour water into the funnel.',
        subtext: '750mL watertight PETG tank (~14 days supply)',
        anchor: 'part',
        partId: 'reservoir-lid',
        offset: [0, 34, 0],
      },
      partAnimations: [
        {
          partId: 'reservoir-lid',
          type: 'translate',
          fromOffset: [0, 0, 0],
          toOffset: [0, 22, 0],
          fromRotationDelta: [0, 0, 0],
          toRotationDelta: [0, 25, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.55,
        },
        {
          partId: 'reservoir-tank',
          type: 'glow',
          glowColor: '#e5bd47',
          glowIntensity: 0.45,
        },
      ],
      effects: [
        {
          type: 'hand_proxy',
          partId: 'reservoir-lid',
          label: 'Refill Pitcher',
          color: '#f3d478',
        },
        {
          type: 'water_flow',
          partId: 'reservoir-lid',
          targetPartId: 'reservoir-tank',
          color: '#e5bd47',
          label: 'Water Fill Stream',
        },
      ],
    },
    {
      id: 'scene-2',
      index: 2,
      title: 'Insert Soil Probe & Drip Spikes',
      durationSeconds: 4.4,
      camera: {
        fromPosition: [148, 168, 178],
        toPosition: [-195, 118, 210],
        fromTarget: [0, 72, 0],
        toTarget: [65, 22, 12],
        fov: 40,
      },
      narration: {
        text: 'Push capacitive moisture probe and emitter spikes into soil.',
        subtext: 'Corrosion-free dielectric root-zone sensing',
        anchor: 'part',
        partId: 'soil-sensor',
        offset: [0, 38, 0],
      },
      partAnimations: [
        {
          partId: 'soil-sensor',
          type: 'translate',
          fromOffset: [0, 34, 0],
          toOffset: [0, 0, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.55,
        },
        {
          partId: 'emitter-spike',
          type: 'translate',
          fromOffset: [0, 28, 0],
          toOffset: [0, 0, 0],
          glowColor: '#d4af37',
          glowIntensity: 0.45,
        },
      ],
      effects: [
        {
          type: 'hand_proxy',
          partId: 'soil-sensor',
          label: 'Insert Probe',
          color: '#f3d478',
        },
        {
          type: 'target_prop',
          partId: 'emitter-spike',
          label: 'Plant Root Zone',
          color: '#c86d51',
        },
      ],
    },
    {
      id: 'scene-3',
      index: 3,
      title: 'Connect 5V USB-C & Arm ESP32-C3',
      durationSeconds: 4.0,
      camera: {
        fromPosition: [-195, 118, 210],
        toPosition: [185, 145, 195],
        fromTarget: [65, 22, 12],
        toTarget: [0, 88, 0],
        fov: 40,
      },
      narration: {
        text: 'Plug in 5V USB-C power to arm the ESP32-C3 controller.',
        subtext: 'Samples soil dielectric reading every 60s',
        anchor: 'part',
        partId: 'controller-enclosure',
        offset: [0, 34, 0],
      },
      partAnimations: [
        {
          partId: 'mcu-board',
          type: 'pulse',
          glowColor: '#f3d478',
          glowIntensity: 0.7,
          oscillate: true,
        },
        {
          partId: 'controller-enclosure',
          type: 'glow',
          glowColor: '#e5bd47',
          glowIntensity: 0.5,
        },
      ],
      effects: [
        {
          type: 'led_indicator',
          partId: 'controller-enclosure',
          color: '#f3d478',
          label: 'ESP32-C3 Armed',
        },
      ],
    },
    {
      id: 'scene-4',
      index: 4,
      title: 'Balance Dual Barbed Y-Manifold',
      durationSeconds: 4.0,
      camera: {
        fromPosition: [185, 145, 195],
        toPosition: [135, 152, 205],
        fromTarget: [0, 88, 0],
        toTarget: [36, 68, 24],
        fov: 40,
      },
      narration: {
        text: 'Seat the rim-mounted Y-manifold above the waterline.',
        subtext: 'Anti-siphon height prevents passive gravity drainage',
        anchor: 'part',
        partId: 'drip-manifold',
        offset: [0, 30, 0],
      },
      partAnimations: [
        {
          partId: 'drip-manifold',
          type: 'press',
          fromOffset: [0, 14, 0],
          toOffset: [0, 0, 0],
          glowColor: '#f3d478',
          glowIntensity: 0.6,
        },
      ],
      effects: [
        {
          type: 'hand_proxy',
          partId: 'drip-manifold',
          label: 'Clip Rim Manifold',
          color: '#f3d478',
        },
        {
          type: 'motion_arc',
          partId: 'drip-manifold',
          color: '#e5bd47',
          label: 'Anti-Siphon Break',
        },
      ],
    },
    {
      id: 'scene-5',
      index: 5,
      title: 'Autonomous Root-Zone Watering Pulse',
      durationSeconds: 4.8,
      camera: {
        fromPosition: [135, 152, 205],
        toPosition: [215, 155, 255],
        fromTarget: [36, 68, 24],
        toTarget: [12, 34, 8],
        fov: 40,
      },
      narration: {
        text: 'Submersible pump pulses metered water directly to plant roots.',
        subtext: '4-second silent burst at 120 L/h flow',
        anchor: 'part',
        partId: 'emitter-spike',
        offset: [0, 36, 0],
      },
      partAnimations: [
        {
          partId: 'pump-5v',
          type: 'spin',
          spinAxis: 'y',
          spinSpeed: 3.0,
          glowColor: '#f3d478',
          glowIntensity: 0.7,
        },
        {
          partId: 'silicone-tubing',
          type: 'glow',
          glowColor: '#e5bd47',
          glowIntensity: 0.55,
        },
        {
          partId: 'emitter-spike',
          type: 'pulse',
          glowColor: '#f3d478',
          glowIntensity: 0.65,
          oscillate: true,
        },
      ],
      effects: [
        {
          type: 'water_flow',
          partId: 'pump-5v',
          targetPartId: 'emitter-spike',
          color: '#f3d478',
          label: '120 L/h Root Drip',
        },
        {
          type: 'target_prop',
          partId: 'emitter-spike',
          color: '#c86d51',
          label: 'Hydrated Soil',
        },
      ],
    },
  ],
};
