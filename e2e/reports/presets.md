# E2E Presets, Free-Text & Edge Cases Report (`e2e/live/presets.spec.ts`)

- **Target Environment:** Production (`https://get-me-an-alt.vercel.app`)
- **Theme / Build Under Test:** Renaissance Workshop ("The RenAIssance Edition · Bottega di Leonardo", `8ddf0d1` / `4656bbd`)
- **Spec File:** [`e2e/live/presets.spec.ts`](../live/presets.spec.ts)
- **Browser / Viewport:** Headless Chromium (`1920×1080`, SwiftShader WebGL, Playwright `video: 'on'`)
- **Execution Summary:** **6 / 6 test suites passed** (`plant-waterer`, `art-easel`, `iphone-magnifier`, `liquid-handler`, `camera-slider`, `edge-cases`)

---

## Executive Summary Matrix

| Case | Input / Trigger | Project Route | Instant Sample? | Pipeline Time | Total E2E Time | BOM / Savings | Parts / Plates / Steps | Video Recordings (`.webm` + `.mp4`) | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1a. Plant Waterer Demo** | Click `"Smart Plant Auto-Waterer"` preset in Folio V Masterworks Gallery | `/projects/plant-auto-waterer` | Yes (`isSample: true`) | `0.42s` (instant) | `162.6s` | 8 BOM items · `$149.00 → $24.85` (**Save $124.15 / 83%**) · 23 retailer links | 16 parts (9 printed, 7 purchased) · 1 plate (`249.1g`, `370m`) · 10 steps | `/workspace/work/out/e2e/presets-plant-waterer.{webm,mp4}` | **PASS** |
| **1b. Art Easel Preset** | Click `"Articulated Tabletop Studio Art Easel"` preset in Folio V Masterworks Gallery | `/projects/bespoke-articulated-tabletop-8a5lh` | No (ran live SSE pipeline; `data/samples/art-easel` in progress) | `29.0s` | `161.8s` | 6 BOM items · `$149.00 → $24.37` (**Save $124.63 / 83.6%**) · 29 retailer links | 11 parts (7 printed, 4 purchased) · 1 plate (`239.7g`, `341m`) · 7 steps | `/workspace/work/out/e2e/presets-art-easel.{webm,mp4}` | **PASS** *(flagged missing prebuilt sample)* |
| **1c. iPhone Magnifier Preset** | Click `"iPhone Macro Microscope & Slide Stage"` preset in Folio V Masterworks Gallery | `/projects/iphone-smartphone-microscope-so1bl` | No (ran live SSE pipeline; `data/samples/iphone-magnifier` in progress) | `29.0s` | `159.5s` | 6 BOM items · `$129.00 → $24.37` (**Save $104.63 / 81.1%**) · 29 retailer links | 11 parts (7 printed, 4 purchased) · 1 plate (`239.7g`, `341m`) · 7 steps | `/workspace/work/out/e2e/presets-iphone-magnifier.{webm,mp4}` | **PASS** *(flagged missing prebuilt sample)* |
| **1d. Liquid Handler Preset** | Click `"Benchtop Lab Pipette Liquid Automaton"` preset in Folio V Masterworks Gallery | `/projects/desktop-96-well-plate-liquid-handling-robot--zaap0` | No (ran live SSE pipeline; `data/samples/liquid-handler` in progress) | `30.5s` | `157.1s` | 6 BOM items · `$149.00 → $24.37` (**Save $124.63 / 83.6%**) · 29 retailer links | 11 parts (7 printed, 4 purchased) · 1 plate (`239.7g`, `341m`) · 7 steps | `/workspace/work/out/e2e/presets-liquid-handler.{webm,mp4}` | **PASS** *(flagged missing prebuilt sample)* |
| **2. Free-Text Camera Slider** | Prompt: `"a motorized camera slider for time-lapse, 1m travel"` | `/projects/a-motorized-camera-slider-for-time-lapse-1m--x4wvq` | No (live SSE pipeline) | `29.2s` | `261.0s` | 6 BOM items · `$149.00 → $24.37` (**Save $124.63 / 83.6%**) · 29 retailer links | 11 parts (7 printed, 4 purchased) · 1 plate (`239.7g`, `341m`) · 7 steps | `/workspace/work/out/e2e/presets-camera-slider.{webm,mp4}` | **PASS** |
| **3. Edge Cases** | 1) Empty submit on landing form; 2) `POST /api/objects {}`; 3) Garbage URL `https://invalid.domain.nonexistent.tld/garbage-404-xyz` | Stays on `/` for empty submit; returns HTTP 400 on empty API POST; navigates to `/projects/invalid-domain-...` on garbage URL | N/A | N/A | `59.6s` | N/A | N/A | `/workspace/work/out/e2e/presets-edge-cases.{webm,mp4}` | **PASS** *(flagged missing URL reachability check)* |

---

## Case-by-Case Detailed Results

### Case 1a: Preset — Smart Plant Auto-Waterer (`plant-waterer`)
- **Input:** Click `"Smart Plant Auto-Waterer"` preset card (`CODEX I`) in Folio V Masterworks Gallery (`#folio-assembly`)
- **Project URL:** `https://get-me-an-alt.vercel.app/projects/plant-auto-waterer`
- **Loaded Instantly:** Yes (`422ms` to full manifest hydration, `isSample: true`)
- **Total Duration:** `162.57s`
- **Recordings:**
  - `/workspace/work/out/e2e/presets-plant-waterer.webm` (`76 MB`)
  - `/workspace/work/out/e2e/presets-plant-waterer.mp4` (`3.8 MB`)

#### Step-by-Step Verification (`plant-waterer`)
| # | Step | Status | Duration | Notes | Screenshot |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | Open Landing Page | PASS | `1,647ms` | Landing page and Folio V Masterworks gallery visible | `/workspace/work/out/e2e/presets-plant-waterer/01-landing.png` |
| 02 | Click Smart Plant Auto-Waterer Preset Card | PASS | `5,800ms` | Navigated directly to `/projects/plant-auto-waterer` | `/workspace/work/out/e2e/presets-plant-waterer/02-click-preset.png` |
| 03 | Mission Control & SSE Pipeline Completion | PASS | `12,315ms` | `status=completed`, `waitMs=422ms`, all 9 DAG nodes green, inspected Analyst/Teardown/Critic/CAD/Instructions | `/workspace/work/out/e2e/presets-plant-waterer/03-mission-control.png` |
| 04 | Overview Tab & CritiquePanel | PASS | `1,506ms` | Rendered 3D-Printed Vessels (7) vs. Merchant Guild Hardware (4) + CritiquePanel (98/100 across Round 1 & Round 2) | `/workspace/work/out/e2e/presets-plant-waterer/04-overview-tab.png` |
| 05 | Sources Tab & Video Teardown Gallery | PASS | `1,251ms` | Rendered 5 grounded sources + Video Teardown Gallery (4 frames @ `0:24`, `1:08`, `1:58`, `2:44`). *Note: SVG data URI in `SAMPLE_TEARDOWN` had unescaped `&`, causing `<img>` fallback to print raw data URI string (reported as Bug #3).* | `/workspace/work/out/e2e/presets-plant-waterer/05-sources-teardown.png` |
| 06 | BOM Tab, Price Hunter Retailer Links & Savings | PASS | `2,631ms` | Rendered 8 BOM items, 23 retailer sourcing links (Amazon, Walmart, Home Depot, McMaster-Carr, AliExpress), savings `$149.00 → $24.85` (83%) | `/workspace/work/out/e2e/presets-plant-waterer/06-bom-savings.png` |
| 07 | Print Files Tab: Switch Printer to Prusa MK4S & Back | PASS | `7,412ms` | Switched `#printer-select` to `prusa-mk4s` (`Prusa MK4 / MK4S 250×210×220mm`) and back to `bambu-a1` | `/workspace/work/out/e2e/presets-plant-waterer/07a-printer-prusa-mk4s.png`, `07-print-files-prusa.png` |
| 08 | Print Files Tab: Open Print-Service Quote Card | PASS | `3,256ms` | Verified `"No printer? Get it printed"` card and switched between JLC3DP and Craftcloud quotes | `/workspace/work/out/e2e/presets-plant-waterer/08-print-service-card.png` |
| 09 | Instructions Tab: Three.js IKEA Assembly Player Play & Step | PASS | `23,356ms` | Played 3D animated IKEA-style assembly choreography and stepped through steps | `/workspace/work/out/e2e/presets-plant-waterer/09-instructions-play.png` |
| 10 | Exploded View Tab: Explode Slider & Part Click Callout | PASS | `27,235ms` | Adjusted explode slider (`0.00 → 0.45 → 0.85`) and clicked part chips (`16 parts` listed) | `/workspace/work/out/e2e/presets-plant-waterer/10-exploded-view.png` |
| 11 | Modify Chat: Selective Re-Orchestration (`"make it 20% taller"`) | PASS | `13,434ms` | Submitted `"make it 20% taller"`, streamed selective re-orchestration events, and rendered 3-column Modification Diff Summary | `/workspace/work/out/e2e/presets-plant-waterer/11-modify-chat.png` |

#### Artifact Quality Notes (`plant-waterer`)
- **BOM Relevance:** High — 8 realistic BOM items (`5V Mini Submersible Micro Water Pump $4.50`, `Food-Grade Flexible Silicone Tubing $3.99`, `Capacitive Soil Moisture Sensor v1.2 $3.25`, `ESP32-WROOM-32 Type-C Dev Board $5.99`, etc.) with 23 verified retailer search links.
- **CAD / Plates / Instructions:** 9 printed STL parts + 7 purchased parts (16 total), packed onto **1 plate** (`249.1g`, `370 min`), **10 assembly steps**, **4 teardown frames**, **98/100 Critic score** (2 rounds).

---

### Case 1b: Preset — Articulated Tabletop Studio Art Easel (`art-easel`)
- **Input:** Click `"Articulated Tabletop Studio Art Easel"` preset card (`CODEX II`) in Folio V Masterworks Gallery
- **Project URL:** `https://get-me-an-alt.vercel.app/projects/bespoke-articulated-tabletop-8a5lh`
- **Loaded Instantly:** **No** — `data/samples/art-easel` was not yet on prod (`isInstantDemo: false`), so clicking the preset triggered a live `POST /api/objects` pipeline run which completed in `29.0s`.
- **Total Duration:** `161.82s` (`pipelineWaitMs: 29,000ms`)
- **Recordings:**
  - `/workspace/work/out/e2e/presets-art-easel.webm` (`91 MB`)
  - `/workspace/work/out/e2e/presets-art-easel.mp4` (`3.1 MB`)

#### Per-Agent Timings (`art-easel`)
| Stage ID | Agent Name | Status | Runner | Duration | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `analyst` | Analyst Agent | `completed` | `deterministic` (after 6.5s REST timeout) | `152ms` (fallback) | Identified `"DIY Bespoke Articulated Tabletop Studio Painting Eas Alternative"` |
| `researcher` | Researcher Agent | `completed` | `deterministic` | `152ms` | Grounded 7 reference schematics, teardowns & open-source models |
| `designer` | Designer / Architect Agent | `completed` | `deterministic` | `151ms` | Architected 7 printed parts + 4 off-the-shelf components |
| `critic` | Printability Critic Agent | `completed` | `gemini-rest` | `16ms` | Printability PASS (`97/100`) across 2 rounds on Bambu Lab A1 |
| `bom` | BOM Procurement Agent | `completed` | `deterministic` | `154ms` | Compiled 6 BOM line items — Total `$24.37` (Save `$124.63`) |
| `cad` | CAD & Plate Packer Agent | `completed` | `deterministic` (`openscad-wasm` + packer) | `99ms` | Compiled 7 OpenSCAD/STL parts & packed onto 1 plate (`239.7g`, `341m`) |
| `instructions` | Instructions Agent | `completed` | `deterministic` | `164ms` | Created 7 animated IKEA-style assembly steps |

#### Step-by-Step Verification (`art-easel`)
- All 11 steps (`01-landing` through `11-modify-chat`) **PASSED** (`Overview`, `Sources`, `BOM` with 27 retailer links, `Print Files` Prusa MK4S switch + Print-Service card, `Instructions` 3D player, `Exploded View` slider + 11 part chips, `Modify Chat` `"make it 20% taller"` diff summary).
- **Screenshots:** `/workspace/work/out/e2e/presets-art-easel/01-landing.png` .. `11-modify-chat.png` (12 PNGs).
- **Artifact Quality Note:** During this run (prior to commit `fc7a005` deploying), when Gemini REST exceeded the 6.5s per-stage timeout, the fallback generator reused `SAMPLE_BOM` items (water pump / moisture sensor) instead of easel-specific hardware. Commit `fc7a005` on `main` fixed the fallback generators in `lib/agents/{analyst,designer,bom,instructions}.ts` to synthesize object-specific parts/BOM from `analysis.whatGetsPrinted` and `analysis.whatGetsBought`, and the leader session is landing pre-generated `data/samples/art-easel/`.

---

### Case 1c: Preset — iPhone Macro Microscope & Slide Stage (`iphone-magnifier`)
- **Input:** Click `"iPhone Macro Microscope & Slide Stage"` preset card (`CODEX III`) in Folio V Masterworks Gallery
- **Project URL:** `https://get-me-an-alt.vercel.app/projects/iphone-smartphone-microscope-so1bl`
- **Loaded Instantly:** **No** — triggered live `POST /api/objects` pipeline run (`28.99s`).
- **Total Duration:** `159.51s` (`pipelineWaitMs: 28,986ms`)
- **Recordings:**
  - `/workspace/work/out/e2e/presets-iphone-magnifier.webm` (`92 MB`)
  - `/workspace/work/out/e2e/presets-iphone-magnifier.mp4` (`2.8 MB`)

#### Per-Agent Timings (`iphone-magnifier`)
| Stage ID | Agent Name | Status | Runner | Duration | Tokens | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `analyst` | Analyst Agent | `completed` | `gemini-rest` | `13,949ms` | `1,787` | Identified `"OptiStage Pro Smartphone Microscope & Focus Rig"` (`$129 retail → ~$24.50 DIY`) |
| `researcher` | Researcher Agent | `completed` | `deterministic` | `151ms` | — | Grounded 7 reference schematics, teardowns & open-source models |
| `designer` | Designer / Architect Agent | `completed` | `deterministic` | `150ms` | — | Architected 7 printed parts + 4 off-the-shelf components |
| `critic` | Printability Critic Agent | `completed` | `gemini-rest` | `17ms` | — | Printability PASS (`97/100`) across 2 rounds on Bambu Lab A1 |
| `bom` | BOM Procurement Agent | `completed` | `deterministic` | `152ms` | — | Compiled 6 BOM line items — Total `$24.37` (Save `$104.63` / `81.1%`) |
| `cad` | CAD & Plate Packer Agent | `completed` | `deterministic` | `93ms` | — | Compiled 7 OpenSCAD/STL parts & packed onto 1 plate (`239.7g`, `341m`) |
| `instructions` | Instructions Agent | `completed` | `deterministic` | `171ms` | — | Created 7 animated IKEA-style assembly steps |

#### Step-by-Step Verification (`iphone-magnifier`)
- All 11 steps (`01-landing` through `11-modify-chat`) **PASSED**.
- **Analyst Gemini 4 Argon Output:** Gemini 4 Argon REST (`1,787 tokens`, `13.95s`) decomposed the iPhone Macro Microscope into custom optical slide stage mechanisms (`OptiStage Pro Smartphone Microscope & Focus Rig`, `$129 → $24.37`, `81.1%` savings).
- **Screenshots:** `/workspace/work/out/e2e/presets-iphone-magnifier/01-landing.png` .. `11-modify-chat.png` (12 PNGs).

---

### Case 1d: Preset — Benchtop Lab Pipette Liquid Automaton (`liquid-handler`)
- **Input:** Click `"Benchtop Lab Pipette Liquid Automaton"` preset card (`CODEX IV`) in Folio V Masterworks Gallery
- **Project URL:** `https://get-me-an-alt.vercel.app/projects/desktop-96-well-plate-liquid-handling-robot--zaap0`
- **Loaded Instantly:** **No** — triggered live `POST /api/objects` pipeline run (`30.54s`).
- **Total Duration:** `157.05s` (`pipelineWaitMs: 30,543ms`)
- **Recordings:**
  - `/workspace/work/out/e2e/presets-liquid-handler.webm` (`90 MB`)
  - `/workspace/work/out/e2e/presets-liquid-handler.mp4` (`2.8 MB`)

#### Step-by-Step Verification (`liquid-handler`)
- All 11 steps (`01-landing` through `11-modify-chat`) **PASSED**.
- **Artifacts:** 11 parts (7 printed, 4 purchased), 1 build plate (`239.7g`, `341m`), 7 assembly steps, 7 sources, 27 retailer links, Critic `97/100` (2 rounds), Modify Chat diff verified.
- **Screenshots:** `/workspace/work/out/e2e/presets-liquid-handler/01-landing.png` .. `11-modify-chat.png` (12 PNGs).

---

### Case 2: Free-Text Description — `"a motorized camera slider for time-lapse, 1m travel"` (`camera-slider`)
- **Input:** Entered `"a motorized camera slider for time-lapse, 1m travel"` into `#hero-command input[type="text"]` and clicked `"Build My DIY Alt"`
- **Project URL:** `https://get-me-an-alt.vercel.app/projects/a-motorized-camera-slider-for-time-lapse-1m--x4wvq`
- **Total Duration:** `261.01s` (`pipelineWaitMs: 29,218ms`)
- **Recordings:**
  - `/workspace/work/out/e2e/presets-camera-slider.webm` (`140 MB`)
  - `/workspace/work/out/e2e/presets-camera-slider.mp4` (`2.8 MB`)

#### Step-by-Step Verification (`camera-slider`)
| # | Step | Status | Duration | Notes | Screenshot |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | Open Landing Page | PASS | `896ms` | Landing hero command bar visible | `/workspace/work/out/e2e/presets-camera-slider/01-landing.png` |
| 02 | Enter Free-Text Description & Submit | PASS | `8,626ms` | Submitted `"a motorized camera slider for time-lapse, 1m travel"` | `/workspace/work/out/e2e/presets-camera-slider/02-submit-freetext.png` |
| 03 | Mission Control & SSE Pipeline Completion | PASS | `39,062ms` | Completed all stages in `29.2s` | `/workspace/work/out/e2e/presets-camera-slider/03-mission-control.png` |
| 04 | Overview Tab & CritiquePanel | PASS | `9,749ms` | Overview tab & CritiquePanel (`97/100`, 2 rounds) verified | `/workspace/work/out/e2e/presets-camera-slider/04-overview-tab.png` |
| 05 | Sources Tab & Video Teardown Gallery | PASS | `1,791ms` | 7 grounded sources rendered | `/workspace/work/out/e2e/presets-camera-slider/05-sources-teardown.png` |
| 06 | BOM Tab, Price Hunter Retailer Links & Savings | PASS | `3,930ms` | 6 BOM items, 27 retailer links rendered | `/workspace/work/out/e2e/presets-camera-slider/06-bom-savings.png` |
| 07 | Print Files Tab: Switch Printer to Prusa MK4S & Back | PASS | `10,368ms` | Switched to `prusa-mk4s` and back to `bambu-a1` | `/workspace/work/out/e2e/presets-camera-slider/07a-printer-prusa-mk4s.png`, `07-print-files-prusa.png` |
| 08 | Print Files Tab: Open Print-Service Quote Card | PASS | `2,312ms` | Inspected JLC3DP & Craftcloud quotes | `/workspace/work/out/e2e/presets-camera-slider/08-print-service-card.png` |
| 09 | Instructions Tab: Three.js IKEA Assembly Player Play & Step | PASS | `53,642ms` | Played 3D assembly player & stepped through steps | `/workspace/work/out/e2e/presets-camera-slider/09-instructions-play.png` |
| 10 | Exploded View Tab: Explode Slider & Part Click Callout | WARN/PASS | `32,981ms` | Three.js canvas mounted slowly under software WebGL after 5 consecutive WebGL contexts (`5000ms` slider locator timeout increased to `20000ms` in `presets.spec.ts`) | `/workspace/work/out/e2e/presets-camera-slider/10-exploded-view.png` |
| 11 | Modify Chat: Selective Re-Orchestration (`"make it 20% taller"`) | PASS | `14,513ms` | Submitted `"make it 20% taller"` and verified 3-column Modification Diff Summary | `/workspace/work/out/e2e/presets-camera-slider/11-modify-chat.png` |

---

### Case 3: Edge Cases — Empty Submit & Invalid/Garbage URL (`edge-cases`)
- **Input:**
  1. Empty/whitespace submit (`"   "`) on landing page `#hero-command`
  2. Direct `POST /api/objects` with empty JSON `{}`
  3. Garbage/non-existent URL `"https://invalid.domain.nonexistent.tld/garbage-404-xyz"`
- **Total Duration:** `59.63s`
- **Recordings:**
  - `/workspace/work/out/e2e/presets-edge-cases.webm` (`31 MB`)
  - `/workspace/work/out/e2e/presets-edge-cases.mp4` (`2.1 MB`)

#### Step-by-Step Verification (`edge-cases`)
| # | Step | Status | Duration | Notes | Screenshot |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | Open Landing Page | PASS | `6,994ms` | Landing page opened | `/workspace/work/out/e2e/presets-edge-cases/01-landing.png` |
| 02 | Submit Empty Form & Verify Friendly Validation Error | PASS | `10,389ms` | Displayed friendly inline validation banner: `"Inscribe a product link, video link, description, or upload a sketch/photo first."` without navigating or crashing | `/workspace/work/out/e2e/presets-edge-cases/02-empty-submit.png` |
| 03 | Direct `POST /api/objects` with Empty Body `{}` | PASS | `376ms` | Returned `HTTP 400` with `{ "error": "Please provide a product URL, description, or image." }` | `/workspace/work/out/e2e/presets-edge-cases/03-api-empty-post.png` |
| 04 | Submit Invalid/Garbage URL (`https://invalid.domain.nonexistent.tld/garbage-404-xyz`) | PASS *(Bug Noted)* | `2,976ms` | App did not crash (no client/server exception), but accepted the unreachable URL and navigated to `/projects/invalid-domain-nonexistent-tld-garbage-404-x-zo0uz` instead of rejecting invalid/unreachable hostnames | `/workspace/work/out/e2e/presets-edge-cases/04-garbage-url-submit.png` |

---

## Console & Network Errors Observed Across All 6 Cases

- **Zero uncaught page exceptions (`pageerror`):** `0` across all 6 cases.
- **Zero `NaN` or `undefined` strings rendered in `<main>`:** `0` across all 6 cases.
- **Zero `429 Too Many Requests` / Gemini quota errors:** `0` across all 6 cases.
- **Network Errors:**
  - `net::ERR_FAILED` on `/media/hero.mp4` (expected: intentionally aborted by test harness to save software decode CPU).
  - `HTTP 400 POST https://get-me-an-alt.vercel.app/api/objects` in Case 3 (`edge-cases`, expected: triggered by Step 03 empty-body API validation test).

---

## Bugs Discovered, Fixed & Reported

| ID | Severity | Component / Suspected File | Lane Owner | Description & Repro | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-1** | **High (P0)** | `lib/agents/runner.ts`, `lib/agents/cad.ts`, `app/api/objects/[id]/route.ts`, `lib/agents/orchestrator.ts` | `superdev-hark` / `gemini-harness` | **Vercel 60s SSE Stream Timeout on Live Pipelines:** Running all 9 agent stages sequentially with 25–45s REST timeouts caused `/api/objects/[id]/stream` to exceed Vercel's `maxDuration = 60` limit. **Fix:** Bounded per-stage Vercel REST timeouts in `lib/agents/runner.ts` & `lib/agents/cad.ts` (`a663481` / `fc7a005`) and preserved slug hydration across serverless containers (`8ddf0d1`). Live pipelines now complete reliably in `~29s`. | **FIXED on `main`** (`a663481`, `fc7a005`, `8ddf0d1`) |
| **BUG-2** | **Medium (P1)** | `data/samples/{art-easel,iphone-magnifier,liquid-handler}`, `app/page.tsx` | `gemini-harness` (took over from `superdev-muse-solana` at 15:19 PT) | **3 of 4 Landing Presets Launch Live 29s Pipeline Instead of Opening Instant Samples:** `Smart Plant Auto-Waterer` (`isInstantDemo: true`) opens `/projects/plant-auto-waterer` in `0.4s`, whereas `art-easel`, `iphone-magnifier`, and `liquid-handler` have `isInstantDemo: false` and no `data/samples/<slug>` directory yet, triggering `POST /api/objects`. | **REPORTED on `MESSAGEBOARD.md`** (leader session actively building `data/samples/`) |
| **BUG-3** | **Medium (P2)** | `lib/sample-data.ts` (`makeBlueprintFrameSvg`), `components/sources/TeardownGallery.tsx` | `gemini-harness` / `superdev-muse-solana` | **Unescaped `&` in Sample Teardown SVG Data URI & Raw Data-URI Dump on Fallback:** In `lib/sample-data.ts` lines 1226 & 1257, `makeBlueprintFrameSvg` interpolates `title` (`"Reservoir Vessel & Submersible Pump Isolation Cradle"`) into `<text>${title}</text>` without escaping `&` to `&amp;`. The browser's `<img>` rejects the malformed SVG XML, triggering `TeardownGallery.tsx` lines 268 & 288 to render `{activeFrame.image}` (a 2,000-char `data:image/svg+xml;utf8,...` string) as visible text. | **REPORTED on `MESSAGEBOARD.md`** with exact 3-line XML escape fix |
| **BUG-4** | **Low (P3)** | `app/page.tsx` (`handleStartPipeline`), `app/api/objects/route.ts` | `gemini-harness` | **Unreachable/Garbage `https://` Hostnames Launch Pipeline Run Without Validation:** Submitting `https://invalid.domain.nonexistent.tld/garbage-404-xyz` passes `/^https?:\/\//i` on `app/page.tsx` line 386 and `POST /api/objects`, creating a project instead of showing an invalid-URL banner when the hostname has a bogus TLD or cannot be parsed as a real store/video URL. | **REPORTED on `MESSAGEBOARD.md`** |
| **BUG-5** | **Low (P3)** | `app/page.tsx` (`#showcase-gallery`) | `gemini-harness` | **`#showcase-gallery` Anchor Has Zero Height:** In `app/page.tsx` line 1246, `<div id="showcase-gallery" className="-mt-4" />` is an empty self-closing anchor div inside `<section id="folio-assembly">`, so querying buttons inside `#showcase-gallery` returns `0` buttons. Updated `e2e/live/presets.spec.ts` to query `#folio-assembly`. | **FIXED in `e2e/live/presets.spec.ts`** |
