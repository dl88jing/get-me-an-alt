# Get Me An Alt — Gemini 4 Argon SF Hackathon Submission

## Title
Get Me An Alt

## Tagline
Paste any pricey gadget link or photo; Gemini 4 Argon agents build a 3D-printable DIY alternative.

*(98 characters)*

## Project Description (~250 words)
Consumer gadgets—like $149 smart plant auto-waterers, $189 articulated studio easels, or $590 benchtop lab liquid handlers—typically consist of $15–$30 of standard electronics, pumps, and fasteners inside proprietary injection-molded plastic. **Get Me An Alt** lets anyone paste a product link, YouTube video, or photo of an overpriced object and receive a complete, build-ready DIY alternative combining **3D-printed parts + off-the-shelf retail hardware**.

Under the hood, a managed swarm of **Gemini 4 Argon** agents (`lib/agents/`) executes a 9-node hardware engineering pipeline streamed live to **Mission Control** over Server-Sent Events:
1. **Analyst** deconstructs the input URL or photo into target dimensions, mechanisms, and retail markup (`analysis.json`).
2. **Researcher** uses Google Search grounding to find open-source CAD priors (Printables, Thingiverse, GitHub), schematics, and teardowns (`sources.json`), while the **Video Teardown** agent inspects YouTube videos via `file_data` timestamps (`teardown.json`).
3. **Designer** decomposes the build into parametric 3D-printed parts vs. purchased hardware with 3D assembly and explosion vectors (`design.json`).
4. **Printability Critic** audits overhangs, wall thickness, tolerances, and bed fit against 21 popular printers, looping fixes back to the Designer in a 2-round DFM revision cycle (`critique.json`).
5. **BOM + Price Hunter** uses Google Search grounding across Amazon, Walmart, Home Depot, and McMaster-Carr to find the lowest component prices (`bom.json`).
6. **CAD & Plate Packer** writes OpenSCAD per part, compiles watertight STLs via `openscad-wasm-prebuilt` in a 3-attempt compiler retry loop, bin-packs onto the fewest build plates, and exports multi-plate `.3mf` files (`plates.json`).
7. **Instructions** choreographs an interactive Three.js IKEA-style animated assembly guide (`instructions.json`).

On our flagship Smart Plant Auto-Waterer, Get Me An Alt cuts a **$149.00** commercial unit down to **$24.85** (**83.3% savings**), packed onto **1 Bambu Lab A1 plate** (185g, 3h 24m).

## How Gemini 4 Argon Is Used
Every stage in `lib/agents/` is powered by **Gemini 4 Argon** (`gemini-4-argon`), orchestrated via `lib/agents/orchestrator.ts` and `lib/agents/runner.ts`:

- **Managed Antigravity CLI (`agy`) + Serverless REST Dual Runner (`lib/agents/runner.ts`):** Locally, each stage invokes `agy -p "<prompt>" --model gemini-4-argon --output-format json --dangerously-skip-permissions`, capturing conversation IDs, token counts, and JSON artifacts in `data/objects/<slug>-<id>/`. On Vercel serverless (or when tool calls like `google_search` or multimodal `inlineData` / `file_data` are required), the runner seamlessly calls `https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent`.
- **Multimodal Vision & Video Understanding (`analyst.ts`, `teardown.ts`):** The Analyst agent inspects uploaded gadget photos via `inlineData` to infer physical dimensions and internal mechanisms. The Video Teardown agent passes YouTube URLs via `file_data` to Gemini 4 Argon to pinpoint timestamps where internal parts are visible and classify each part as `print` vs. `buy`.
- **Google Search Grounding (`researcher.ts`, `price-hunter.ts`):** Both the Researcher agent and the Price Hunter agent enable `tools: [{ google_search: {} }]` on Gemini 4 Argon—grounding CAD priors on Printables/GitHub/iFixit and comparing live component pricing across Amazon, Walmart, Home Depot, and McMaster-Carr.
- **Closed-Loop Agent Reflection (`critic.ts` ↺ `designer.ts`, `cad.ts` ↺ `openscad-wasm`):**
  - **Critic → Designer Loop:** The Printability Critic agent audits `design.json` for FDM constraints (watertight perimeter wall thickness, <=45° support-free overhangs, 0.25–0.30mm bayonet/fastener tolerances, and printer bed fit) and loops structured DFM fixes back into a second Designer pass (`74/100` Round 1 → `98/100` Round 2).
  - **CAD Self-Healing Compiler Loop:** In `lib/agents/cad.ts`, Gemini 4 Argon generates parametric OpenSCAD (`.scad`) modules per part, compiles them to STL in-process via `openscad-wasm-prebuilt`, verifies manifold watertightness and bounding-box accuracy (±15%), and feeds compiler/bbox errors back to Gemini 4 Argon for up to 3 self-correcting attempts.
- **Multi-Agent Development Swarm:** The repository itself was built by 4 parallel Gemini 4 Argon agent sessions (`gemini-harness`, `superdev-hark`, `superdev-muse-solana`, `superdev-muse-dl88jing`) coordinating lanes, TypeScript contracts, and handoffs through `COORDINATION.md` and `MESSAGEBOARD.md`.

## Challenges We Ran Into
- **Ensuring LLM-Generated CAD Is Actually Printable and Watertight:** Raw LLM geometry often has non-manifold edges, wrong bounding boxes, or 90° overhangs that fail on an FDM printer. We solved this with a two-tier verification loop: first, the **Printability Critic** enforces wall thickness, 42° teardrop barb overhangs, and M2.5 screw boss tolerances on `design.json`; second, the **CAD Agent** compiles Argon's OpenSCAD code through `openscad-wasm-prebuilt`, checks manifold topology and bounding boxes against target `dims_mm`, and retries with compiler diagnostics before falling back to deterministic CSG meshes.
- **Real-Time Multi-Agent Telemetry Across Local CLI and Serverless:** Bridging local `agy` CLI subprocesses and Vercel's read-only filesystem required a unified runner (`lib/agents/runner.ts`) that writes to `/tmp/data/objects/<id>` on Vercel, persists event logs to `events.json`, and streams structured `{ agent, phase, message, data, ts }` Server-Sent Events into the 9-node **Mission Control** DAG (`components/ui/MissionControl.tsx`).
- **Dynamic Multi-Printer Plate Packing & 3MF Export:** Different users own beds ranging from 180×180 mm (Bambu A1 mini, Prusa MINI+) to 350×350 mm (Voron 2.4, Bambu H2D). We built a client+server 2D MaxRects/shelf bin-packer (`lib/cad/packer.ts`) and a ZIP-based `.3mf` generator (`lib/cad/stl.ts`) that dynamically re-packs parts and updates plate counts, gram weights, and print times whenever the user switches among 21 printer profiles.

## What's Next for Get Me An Alt
- **Interactive "Ask Argon to Modify" CAD Chat:** Let users request natural-language parametric edits on any project (*"make the reservoir 1.2L, switch to M3 heat-set inserts, and split for a 180mm bed"*) and selectively re-run only the Designer, Critic, and CAD agents.
- **Automated Firmware & Wiring Harness Generation:** Add an Electronics & Firmware agent that outputs ready-to-flash ESPHome / Arduino sketches and pin-to-pin breadboard/PCB wiring diagrams for BOM microcontrollers and sensors.
- **Direct Slicer & One-Click Cart Checkout:** Deep-link multi-plate `.3mf` files directly into `bambustudio://` / `prusaslicer://` URI handlers and bundle all Amazon / McMaster-Carr BOM items into a single one-click shopping cart.

## Links
- **Live Application:** https://get-me-an-alt.vercel.app
- **Flagship Demo Project (Smart Plant Auto-Waterer):** https://get-me-an-alt.vercel.app/projects/plant-auto-waterer
- **Demo Manifest API:** https://get-me-an-alt.vercel.app/api/objects/demo
