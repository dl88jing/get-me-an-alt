# Get Me An Alt — Presentation Video Script

- **Target Total Duration:** ~2:32 (152 seconds, strictly <= 180 seconds)
- **Narration Word Count:** ~350 words
- **Voice:** Kokoro TTS (`af_heart` default voice via `npx hyperframes tts`)
- **Hackathon:** Gemini 4 Argon SF Hackathon (Google DeepMind x Cerebral Valley)

---

## Scene 1 — Hook: Bespoke Gadgets Are Pricey (0:00 – 0:19 | 19s)
**Visual:** Title card transitions into side-by-side comparison of the commercial $149 Smart Plant Auto-Waterer vs. the $24.85 Get Me An Alt DIY build (Save $124 / 83%).
**Narration:**
> Bespoke gadgets are absurdly overpriced. A commercial smart plant auto-waterer retails for a hundred and forty-nine dollars—yet inside, it is twenty-one dollars of standard pumps, sensors, and tubing wrapped in injection-molded plastic. What if any product link, video, or photo could become an open-source DIY build?

---

## Scene 2 — Multi-Agent Pipeline & Research + Video Teardown (0:19 – 0:49 | 30s)
**Visual:** Screen recording (`assets/recording.mp4`, `0s–30s`) alongside the 6-stage Mission Control timeline. User pastes a product link or launches the Smart Plant Auto-Waterer demo; 6 Gemini 4 Argon agents run via the Antigravity CLI (`agy --model gemini-4-argon`), streaming SSE updates, web-grounded research, and frame-by-frame video teardown callouts.
**Narration:**
> Meet Get Me An Alt. Paste a product link, YouTube video, or gadget photo, and our six-stage Gemini 4 Argon agent pipeline runs through the Antigravity CLI, streaming live to Mission Control. First, the Analyst extracts dimensions and mechanisms. Next, the Researcher combines Google Search grounding with our Video Teardown Agent—inspecting disassembly frames to map every internal part, material, and fastener before the Designer splits printed geometry from purchased hardware.

---

## Scene 3 — Bill of Materials (BOM) with Real Retailer Links & Savings (0:49 – 1:14 | 25s)
**Visual:** Screen recording (`assets/recording.mp4`, `30s–55s`) alongside the BOM tab showing 5V brushless submersible pump, capacitive soil probe, ESP32-C3 controller, silicone tubing, and M3 brass inserts with live retailer links and the "You Save $124.15 (83%)" badge.
**Narration:**
> Next, the BOM Agent builds a complete bill of materials for every off-the-shelf component—submersible pump, capacitive moisture probe, ESP32 controller, silicone tubing, and brass inserts—complete with real search links across Amazon, Home Depot, Walmart, McMaster-Carr, and AliExpress. Instead of paying a hundred and forty-nine dollars retail, your entire DIY build costs twenty-four eighty-five—saving a hundred and twenty-four dollars, or eighty-three percent.

---

## Scene 4 — Plate-Optimized STL/3MF for 20+ Printers & Print-Service Delivery (1:14 – 1:43 | 29s)
**Visual:** Screen recording (`assets/recording.mp4`, `55s–84s`) alongside Print Files showing 7 watertight STL parts bin-packed onto a Bambu Lab A1 build plate (256×256×256 mm), switching the 20+ printer dropdown, multi-plate 3MF export, and the "No printer? Get it printed & delivered" quote flow.
**Narration:**
> Meanwhile, the CAD Agent generates watertight parametric STL meshes and multi-plate 3MF bundles, bin-packing all seven printed parts onto the fewest possible build plates. It defaults to the Bambu Lab A1 and re-packs live across more than twenty popular printers from Bambu, Prusa, Creality, Elegoo, Anycubic, and Voron. No 3D printer? One click hands off your STL bundle for instant delivered quotes from Craftcloud, JLC3DP, or Xometry.

---

## Scene 5 — IKEA-Style Assembly Player & Interactive Exploded 3D View (1:43 – 2:08 | 25s)
**Visual:** Screen recording (`assets/recording.mp4`, `84s–109s`) alongside the Three.js IKEA-style animated assembly player and the interactive Exploded 3D View with explode slider, camera orbit, and click-to-inspect BOM mapping.
**Narration:**
> Ready to assemble? Open the Three.js IKEA-style instructions player, where our Instructions Agent choreographs each step in crisp line-art as parts fly along motion vectors with tool callouts. Then switch to the interactive exploded 3D view—drag the explode slider from zero to a hundred percent, orbit the assembly, and click any part to inspect its dimensions and linked BOM item.

---

## Scene 6 — Why Managed Agents & Antigravity CLI Shine + Close (2:08 – 2:34 | 26s)
**Visual:** Closing architecture card highlighting runtime Gemini 4 Argon agents via Antigravity CLI (`agy`) + SSE and parallel build-time multi-agent engineering lanes.
**Narration:**
> Get Me An Alt showcases Managed Agents at two levels: at runtime, six Gemini 4 Argon agents collaborate via the Antigravity CLI through typed JSON, teardown, and STL contracts; at build time, coordinated Antigravity agents engineered our CAD packer, Three.js players, teardown pipeline, and video studio in parallel. Stop overpaying for bespoke hardware—Get Me An Alt.
