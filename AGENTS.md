# Get Me An Alt — build spec (source of truth for all agents)

Hackathon: Gemini 4 Argon SF Hackathon (Google DeepMind x Cerebral Valley), Oct 25 2026. Submission deadline 5:00 PM PT today.
Prizes to aim for: overall (1st/2nd/3rd) and **Best use of Managed Agents**. Every pipeline stage is an agent powered by Gemini 4 Argon.

## Product
Bespoke gadgets are expensive. "Get Me An Alt" lets a user paste a product link, a video link, or upload an image of an object
(art easel, plant auto-waterer, liquid-handling robot, iPhone magnifier adapter, ...) and get a DIY alternative built from
**3D-printed parts + off-the-shelf components** (Amazon, Walmart, Home Depot, McMaster, AliExpress, etc.).

Final outputs per object:
1. **BOM** — off-the-shelf parts with qty, est. price, retailer links, and a total vs. the original's price ("you save $X").
2. **3D print files** — STL (and 3MF if feasible) parts, packed onto the **fewest possible plates** for the chosen printer.
   Default printer: Bambu Lab A1 (256x256x256 mm). Dropdown of popular printers (Bambu A1, A1 mini, P1S, X1C, H2D, Prusa MK4/MK4S, Prusa Core One, Prusa MINI+, Creality K1/K1 Max/Ender-3 V3, Elegoo Neptune 4 Pro, Anycubic Kobra 3, Voron 2.4 350, etc.) with bed sizes.
   "No printer?" option: send to a print service (Craftcloud / JLC3DP / Xometry / Shapeways style) — show a quote-request flow that hands off STLs + shipping address (mock the checkout, link out to the real service).
3. **IKEA-style animated assembly instructions** built with three.js — step-by-step, parts fly in, numbered steps, minimal line-art look, play/pause/step controls.
4. **Exploded 3D view** — interactive three.js panel (orbit, explode slider, hover/click a part to highlight + see its name, BOM line, and where it sits).

## Agent pipeline (each is a Gemini 4 Argon agent; run via Antigravity CLI `agy -p ... --model gemini-4-argon --output-format json` where possible, fallback to the Gemini REST API)
Each run creates a backend folder `data/objects/<slug>-<id>/` and every agent writes its artifacts there (JSON + files), so the UI can stream progress.
1. **Analyst** — understands the input (URL / video / image; image via Gemini multimodal), identifies the object, function, key dimensions, mechanisms, original price.
2. **Researcher** — searches the web (Gemini Google Search grounding) for videos, schematics, PDFs, teardown/instructions, open-source designs (Printables, Thingiverse, GitHub); saves a `sources.json` with links + summaries.
3. **Designer / Architect** — decomposes the object into printed parts vs. purchased parts; produces a parametric part list with dimensions and an assembly graph (positions, explode vectors, order).
4. **BOM agent** — off-the-shelf components with real retailer search links (use search URLs like amazon.com/s?k=..., homedepot.com/s/..., walmart.com/search?q=... when exact product URLs aren't verified), qty, price estimates, total.
5. **CAD agent** — generates printable geometry for each printed part (parametric, e.g. OpenSCAD-like code or JS CSG via manifold-3d/three-bvh-csg, exported to STL), then a **plate packer** that bin-packs parts onto the minimum number of plates for the chosen printer bed.
6. **Instructions agent** — produces an ordered assembly script (steps, parts, tools, motion) consumed by the three.js IKEA-style player.
A visible **agent timeline / orchestration view** in the UI shows each agent's status, logs, and outputs live (this is what wins "Best use of Managed Agents").

## Tech
- Next.js (App Router, TypeScript) + Tailwind; three.js via @react-three/fiber + drei.
- Server routes run the agents (Node child_process for `agy`, fetch for Gemini REST). SSE for live progress.
- Keys only from env (`GEMINI_API_KEY`); never commit keys.
- Must also run with a **demo mode** using one pre-generated sample object (e.g. "plant auto-waterer") so the demo never breaks.
- Beautiful, polished UI: dark, premium, product-y. Landing hero with input box (link / image upload), then a project page with tabs: Overview · Sources · BOM · Print files · Instructions · Exploded view.

## Team communication
Read COORDINATION.md (lanes, contracts) and MESSAGEBOARD.md (agent-to-agent messages) before every work cycle.
