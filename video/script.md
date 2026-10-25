# Get Me An Alt — Presentation Video Script (v2)

- **Target Total Duration:** ~2:27 (147 seconds, strictly <= 170 seconds)
- **Narration Word Count:** ~350 words
- **Voice:** Kokoro TTS (`af_heart` default voice via `npx hyperframes tts`)
- **Hackathon:** Gemini 4 Argon SF Hackathon (Google DeepMind x Cerebral Valley)

---

## Scene 1 — Hook: Bespoke Gadgets Are Pricey (0:00 – 0:18 | 18s)
**Visual:** Title card transitions into side-by-side comparison of the commercial **$149.00** Smart Plant Auto-Waterer vs. the **$24.85** Get Me An Alt DIY build (**Save $124.15 / 83%**, **11 parts**: 7 watertight 3D-printed STLs + 4 off-the-shelf components).
**Narration:**
> Bespoke gadgets are absurdly overpriced. A commercial smart plant auto-waterer retails for a hundred and forty-nine dollars—yet inside, it is twenty-one dollars of standard pumps, sensors, and tubing wrapped in injection-molded plastic. What if any product link, video, or photo could become an open-source DIY build?

---

## Scene 2 — Multi-Agent Mission Control, Printability Critic & Video Teardown (0:18 – 0:46 | 28s)
**Visual:** Large, bright screen recording (`assets/recording.mp4`, `0s–28s`) showing the new full-bleed landing page, 3D scroll-explode story, and the live **Mission Control** 9-agent DAG (`Analyst`, `Researcher`, `Teardown`, `Designer`, `Critic`, `BOM`, `Price Hunter`, `CAD`, `Instructions`) with the 2-round `Critic → Designer` DFM printability loop (`CritiquePanel`) and grounded `SourcesTab`.
**Narration:**
> Meet Get Me An Alt. Paste a product link, YouTube video, or gadget photo, and our six-stage Gemini 4 Argon agent pipeline runs through the Antigravity CLI, streaming live to Mission Control. First, the Analyst extracts dimensions and mechanisms. Next, the Researcher combines Google Search grounding with our Video Teardown Agent—inspecting disassembly frames to map every internal part, material, and fastener before the Designer splits printed geometry from purchased hardware.

---

## Scene 3 — Bill of Materials (BOM) with Real Retailer Links & 83% Savings (0:46 – 1:10 | 24s)
**Visual:** Large, bright screen recording (`assets/recording.mp4`, `28s–52s`) on the BOM tab showing `$149.00` commercial price vs. `$24.85` DIY build (`You Save $124.15 / 83%`), 5V brushless submersible pump, capacitive soil probe, ESP32-C3 controller, silicone tubing, and M2.5/M3 fasteners with live retailer links across Amazon, Home Depot, Walmart, McMaster-Carr, and AliExpress.
**Narration:**
> Next, the BOM Agent builds a complete bill of materials for every off-the-shelf component—submersible pump, capacitive moisture probe, ESP32 controller, silicone tubing, and brass inserts—complete with real search links across Amazon, Home Depot, Walmart, McMaster-Carr, and AliExpress. Instead of paying a hundred and forty-nine dollars retail, your entire DIY build costs twenty-four eighty-five—saving a hundred and twenty-four dollars, or eighty-three percent.

---

## Scene 4 — OpenSCAD-WASM STL/3MF Packer for 22 Printers & Print-Service Delivery (1:10 – 1:37 | 27s)
**Visual:** Large, bright screen recording (`assets/recording.mp4`, `52s–79s`) on the Print Files tab (`PrintPanel`) showing OpenSCAD-compiled watertight STL parts bin-packed onto 1 plate on a Bambu Lab A1 (256×256×256 mm), live re-packing across 22 popular printers (Bambu A1 mini, Prusa MK4S, Voron 2.4), multi-plate `.3MF` export, and the inline `"No printer? Get it printed"` quote handoff to Craftcloud, JLC3DP, and Xometry.
**Narration:**
> Meanwhile, the CAD Agent generates watertight parametric STL meshes and multi-plate 3MF bundles, bin-packing all seven printed parts onto the fewest possible build plates. It defaults to the Bambu Lab A1 and re-packs live across more than twenty popular printers from Bambu, Prusa, Creality, Elegoo, Anycubic, and Voron. No 3D printer? One click hands off your STL bundle for instant delivered quotes from Craftcloud, JLC3DP, or Xometry.

---

## Scene 5 — Three.js IKEA-Style Assembly Player & Interactive Exploded 3D View (1:37 – 2:01 | 24s)
**Visual:** Large, bright screen recording (`assets/recording.mp4`, `79s–103s`) showing the Three.js IKEA-style animated 7-step assembly player (`AssemblyPlayer` with toon/line-art shader and motion vectors) followed by the interactive Three.js Exploded 3D View (`ExplodedView` with 11 parts, smooth explode slider, orbit camera, numbered callouts, and click-to-inspect BOM mapping).
**Narration:**
> Ready to assemble? Open the Three.js IKEA-style instructions player, where our Instructions Agent choreographs each step in crisp line-art as parts fly along motion vectors with tool callouts. Then switch to the interactive exploded 3D view—drag the explode slider from zero to a hundred percent, orbit the assembly, and click any part to inspect its dimensions and linked BOM item.

---

## Scene 6 — Why Managed Agents & Antigravity CLI Shine + Close (2:01 – 2:27 | 26s)
**Visual:** Closing architecture card highlighting runtime Gemini 4 Argon agents via Antigravity CLI (`agy`) + SSE (including the Critic → Designer DFM loop and OpenSCAD-WASM retry loop) and parallel build-time multi-agent engineering lanes.
**Narration:**
> Get Me An Alt showcases Managed Agents at two levels: at runtime, six Gemini 4 Argon agents collaborate via the Antigravity CLI through typed JSON, teardown, and STL contracts; at build time, coordinated Antigravity agents engineered our CAD packer, Three.js players, teardown pipeline, and video studio in parallel. Stop overpaying for bespoke hardware—Get Me An Alt.
