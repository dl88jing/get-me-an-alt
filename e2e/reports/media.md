# Live Production Media E2E Report (`e2e/live/media.spec.ts`)

- **Target Environment:** `https://get-me-an-alt.vercel.app` (Production Vercel Deployment)
- **Spec File:** `e2e/live/media.spec.ts`
- **Fixture Image:** `e2e/fixtures/desk-lamp.jpg` (Wikimedia Commons `File:A_3M_Desk_Lamp.jpg`, 960×1280 JPEG, 157.8 KB)
- **Viewport & Video Capture:** `1920×1080` (`video: 'on'`), CDP screenshot captured after every step
- **Executed At:** `2026-10-25T22:52:48Z` – `2026-10-25T23:03:58Z`

---

## Executive Summary

| Case | Input | Project URL | Total Time | Pipeline Wait | Stages Completed | Overall Result | Recordings |
|---|---|---|---|---|---|---|---|
| **Case 1 (`image`)** | Image upload (`e2e/fixtures/desk-lamp.jpg` via `#hero-command input[type="file"]`) | `https://get-me-an-alt.vercel.app/projects/desk-lamp-qozz2` | `367.0s` | `16.2s` | **7 / 7 core stages** (9 / 9 DAG nodes) | **6 / 9 steps PASS** (all 7 pipeline stages + Sources + BOM + Print Files + Instructions passed; 3 UI/timeout findings below) | `/workspace/work/out/e2e/media-image.webm`, `/workspace/work/out/e2e/media-image.mp4` |
| **Case 2 (`video`)** | YouTube teardown video URL (`https://www.youtube.com/watch?v=kYj2zRVrfLg` — *iFixit Teardown Review: Best Repairable Headphones!*) | `https://get-me-an-alt.vercel.app/projects/youtube-watch-kgn53` | `300.0s` | `121.5s` | **4 / 7 core stages** + **Teardown (1 video, 5 frames)** + **ModifyChat PASS** | **4 / 9 steps PASS** (Landing submit, Sources + 5-frame Video Teardown, Instructions, and ModifyChat `"make it 20% taller"` passed; initial SSE stream hit Vercel serverless container split on `bom`) | `/workspace/work/out/e2e/media-video.webm`, `/workspace/work/out/e2e/media-video.mp4` |

---

## Case 1: Image Upload — Wikimedia Commons 3M Articulated Desk Lamp (`desk-lamp.jpg`)

- **Input:** Uploaded local fixture photo `e2e/fixtures/desk-lamp.jpg` (`960×1280` JPEG of a 3M articulated desk lamp from Wikimedia Commons) via the landing page file input (`#hero-command input[type="file"][accept="image/*"]`), verified the `Sketch/Photo: desk-lamp.jpg` badge rendered in the Renaissance Codex command bar, and clicked **BUILD MY DIY ALT**.
- **Generated Project ID:** `desk-lamp-qozz2` (`https://get-me-an-alt.vercel.app/projects/desk-lamp-qozz2`)
- **Total Case Duration:** `367.03s` (`367,031 ms`)
- **Pipeline Completion Time:** `16.17s` (`16,166 ms`) — all 7 managed stages + Teardown + Price Hunter completed over SSE (`86` SSE events streamed).
- **429 / Quota Retries:** `0`

### Step-by-Step Results (Case 1)

| # | Step | Status | Duration | Notes | Screenshot |
|---|---|---|---|---|---|
| `1a` | Attach Photo on Landing Page | **PASS** | — | `Sketch/Photo: desk-lamp.jpg` badge rendered in `#hero-command` | `/workspace/work/out/e2e/media-image/01a-landing-photo-attached.png` |
| `1` | Landing Page Input & Submit | **PASS** | `56,949 ms` | Submitted `inlineImage` (`image/jpeg`, base64) to `POST /api/objects`; navigated to `/projects/desk-lamp-qozz2` | `/workspace/work/out/e2e/media-image/01-landing-submit.png` |
| `2` | Watch Mission Control Until Pipeline Finishes | **PASS** | `54,027 ms` | Pipeline finished in `16.2s` (`7/7` stages completed, `86` SSE events, object=`"DIY Desk-Lamp.Jpg Alternative"`) | `/workspace/work/out/e2e/media-image/02a-mission-control-running.png`, `/workspace/work/out/e2e/media-image/02-mission-control-done.png` |
| `3` | Overview Tab & Printability Critic | **FAIL** | `22,869 ms` | Overview tab and CritiquePanel rendered (`97/100 PASS`), but `getByText(/3D-Printed Parts/i)` was outside the viewport / below the fold when `isVisible()` was checked without waiting for scroll settle | `/workspace/work/out/e2e/media-image/03-overview-tab.png` |
| `4` | Sources Tab (incl. Video Teardown) | **PASS** | `28,540 ms` | Rendered `7` grounded reference sources with category filter chips (`All`, `Videos`, `Teardowns`); `0` teardown frames generated for static photo input | `/workspace/work/out/e2e/media-image/04-sources-teardown-tab.png` |
| `5` | BOM Tab (Price Hunter Links & Savings) | **PASS** | `13,054 ms` | Rendered `6` BOM items, `27` retailer purchase/search links (Amazon, Walmart, Home Depot, McMaster-Carr, AliExpress), DIY `$24.37` vs Retail `$149.00` (**`83.6%` / `$124.63` saved**) | `/workspace/work/out/e2e/media-image/05-bom-price-hunter-tab.png` |
| `6` | Print Files Tab (Switch to Prusa MK4S & Back + Print Service Card) | **PASS** | `25,101 ms` | Switched `#printer-select` to `prusa-mk4s` (`Prusa MK4 / MK4S 250×210×220 mm`) and back to `bambu-a1`; interacted with `no-printer-card` (`JLC3DP` & `Craftcloud` quotes, `1` plate, `239.7g`, `341 min`) | `/workspace/work/out/e2e/media-image/06a-print-files-prusa-mk4s.png`, `/workspace/work/out/e2e/media-image/06-print-files-tab.png` |
| `7` | Instructions Tab (Play IKEA-Style 3D Assembly) | **PASS** | `94,945 ms` | Clicked Play (`play-pause-btn`) and stepped (`next-step-btn`) through `7` animated 3D IKEA-style assembly steps | `/workspace/work/out/e2e/media-image/07-instructions-play.png` |
| `8` | Exploded View Tab (Explode Slider + Click Part) | **FAIL** | `53,036 ms` | Heavy Three.js software WebGL shader compilation on SwiftShader after switching from AssemblyPlayer to ExplodedView caused `explode-slider.evaluate` to exceed the `15s` action timeout | `/workspace/work/out/e2e/media-image/08-exploded-view.png` |
| `9` | Modify Chat (`"make it 20% taller"`) | **FAIL** | `18,432 ms` | Typed `"make it 20% taller"` and clicked **Ask Argon**, but the 6-minute overall test timeout (`360,000 ms`) was reached `18.4s` into the modify run because Steps 1–8 consumed `348.5s` under software WebGL | — |

### Per-Agent Timings (Case 1 — `desk-lamp-qozz2`)

| Stage ID | Agent Name | Status | Runner | Duration (`ms`) | Summary |
|---|---|---|---|---|---|
| `analyst` | Analyst Agent | `completed` | `deterministic` | `151 ms` | Identified `"DIY Desk-Lamp.Jpg Alternative"` (`$149` retail → `~$24.85` DIY) |
| `researcher` | Researcher Agent | `completed` | `deterministic` | `151 ms` | Grounded `7` reference schematics, teardowns & open-source models |
| `teardown` | Video Teardown Agent | `completed` | `deterministic` | `2,400 ms` | Mapped video teardown frames to BOM & parametric design parts (`0` videos for static image input) |
| `designer` | Designer / Architect Agent | `completed` | `deterministic` | `150 ms` | Architected `7` printed parts + `4` off-the-shelf components (`11` total parts) |
| `critic` | Printability Critic Agent | `completed` | `gemini-rest` | `9 ms` | Printability `PASS` (`97/100`) across `2` rounds on Bambu Lab A1 |
| `bom` | BOM Procurement Agent | `completed` | `deterministic` | `153 ms` | Compiled `6` BOM line items — Total `$24.85` (You save `$124.15`) |
| `price-hunter` | Price Hunter Agent | `completed` | `deterministic` | `320 ms` | Grounded Amazon, Walmart, Home Depot & McMaster-Carr prices across `6` BOM lines — DIY total `$24.37` (`83.6%` saved) |
| `cad` | CAD & Plate Packer Agent | `completed` | `deterministic` | `143 ms` | Compiled `7` OpenSCAD/STL parts & packed onto `1` plate (`Bambu Lab A1 (256×256×256 mm)`, `239.7g`, `341 min`) |
| `instructions` | Instructions Agent | `completed` | `deterministic` | `186 ms` | Created `7` animated IKEA-style assembly steps |

### Artifacts Quality Notes (Case 1)

1. **Analyst (`analysis.json`):** Correctly recorded `inputType: "image"` and attached `Desk-Lamp.Jpg` artifact chip in Mission Control, but **Bug (Medium)**: when Gemini REST times out at 6.5s on a large base64 image payload on Vercel (`lib/agents/analyst.ts`), the deterministic fallback names the object `"DIY Desk-Lamp.Jpg Alternative"` (keeping the `.Jpg` file extension in the title) and falls back to the generic fluidics/hydroponics template (`$149` retail / `$24.37` DIY) instead of a desk-lamp/articulated-arm hardware template.
2. **BOM (`bom.json`):** `6` line items with `27` valid retailer search links (`amazon.com/s?k=...`, `walmart.com/search?q=...`, `homedepot.com/s/...`, `mcmaster.com/...`, `aliexpress.com/w/wholesale-...`). Price Hunter reduced total DIY cost from `$24.85` to `$24.37` (`83.6%` savings). However, because the Analyst fallback used the generic fluidics archetype, the BOM items (`JT-180A water pump`, `Capacitive Soil Moisture Sensor`, `Silicone Tubing`) are plant-waterer parts rather than lamp/stand parts (LED module, power cord, springs, M4 pivot bolts).
3. **Design & CAD (`design.json`, `plates.json`, `parts/*.stl`, `parts/all-plates.3mf`):** `11` total parts (`7` printed STLs + `4` purchased components), packed onto `1` build plate (`239.7g` PETG, `341 min` print time). Switching printer to `Prusa MK4 / MK4S (250×210×220 mm)` dynamically re-packed the parts in `PrintPanel`.
4. **Instructions (`instructions.json`):** `7` ordered assembly steps with 3D motion vectors (`from` → `to`), tool callouts, and interactive playback.
5. **Console / Network Errors:** Zero page errors (`pageErrors: []`), zero HTTP 4xx/5xx API responses (`failedNetworkRequests: []`), zero `"undefined"` or `"NaN"` text in the DOM. Two benign `net::ERR_FAILED` console entries from intentionally aborted `/media/hero.mp4`.

---

## Case 2: YouTube Video Link — iFixit Repairable Headphones Teardown (`https://www.youtube.com/watch?v=kYj2zRVrfLg`)

- **Input:** Pasted real YouTube teardown URL `https://www.youtube.com/watch?v=kYj2zRVrfLg` (*"iFixit Teardown Review: Best Repairable Headphones!"*) into `#hero-command input[type="text"]` and clicked **BUILD MY DIY ALT**.
- **Generated Project ID:** `youtube-watch-kgn53` (`https://get-me-an-alt.vercel.app/projects/youtube-watch-kgn53`)
- **Total Case Duration:** `300.02s` (`300,024 ms`)
- **Pipeline Wait Time:** `121.52s` (`121,517 ms`)
- **429 / Quota Retries:** `0`

### Step-by-Step Results (Case 2)

| # | Step | Status | Duration | Notes | Screenshot |
|---|---|---|---|---|---|
| `1a` | Enter YouTube URL on Landing Page | **PASS** | — | Pasted `https://www.youtube.com/watch?v=kYj2zRVrfLg` into `#hero-command input[type="text"]` | `/workspace/work/out/e2e/media-video/01a-landing-youtube-url.png` |
| `1` | Landing Page Input & Submit | **PASS** | `44,289 ms` | Submitted YouTube URL to `POST /api/objects`; navigated to `/projects/youtube-watch-kgn53` | `/workspace/work/out/e2e/media-video/01-landing-submit.png` |
| `2` | Watch Mission Control Until Pipeline Finishes | **FAIL** | `141,667 ms` | `4/7` core stages (`analyst`, `researcher`, `designer`, `critic`) + `teardown` (`1` video, `5` frames) completed (`93` SSE events), then `bom` + `instructions` spawned `agy-cli` / REST calls that exceeded the SSE stream window before `done` event arrived | `/workspace/work/out/e2e/media-video/02a-mission-control-running.png`, `/workspace/work/out/e2e/media-video/02-mission-control-done.png` |
| `3` | Overview Tab & Printability Critic | **FAIL** | `12,659 ms` | Overview tab rendered (`inputType: "video"`, `7` printed / `4` purchased parts, Critic `97/100 PASS`), but `3D-Printed Parts` heading check returned `false` while scrolled to Mission Control | `/workspace/work/out/e2e/media-video/03-overview-tab.png` |
| `4` | Sources Tab (incl. Video Teardown) | **PASS** | `19,882 ms` | Rendered `7` sources; **Video Teardown Agent generated `1` video and `5` timestamped teardown frames** in `manifest.teardown` (`teardownVideos=1, teardownFrames=5`) | `/workspace/work/out/e2e/media-video/04-sources-teardown-tab.png` |
| `5` | BOM Tab (Price Hunter Links & Savings) | **FAIL** | `10,233 ms` | Because `bom` stage was still `running` when the initial SSE stream closed, `manifest.bom` was not populated yet on the BOM tab (`0` retailer links before ModifyChat ran) | `/workspace/work/out/e2e/media-video/05-bom-price-hunter-tab.png` |
| `6` | Print Files Tab (Switch to Prusa MK4S & Back + Print Service Card) | **FAIL** | `9,409 ms` | Because `cad` stage was still `pending` before ModifyChat ran, `PrintPanel` showed its empty/loading state until ModifyChat completed | `/workspace/work/out/e2e/media-video/06-print-files-tab.png` |
| `7` | Instructions Tab (Play IKEA-Style 3D Assembly) | **PASS** | `13,789 ms` | `AssemblyPlayer` mounted with `play-pause-btn` and `next-step-btn` interactive controls without crashing even while `instructions` was pending | `/workspace/work/out/e2e/media-video/07-instructions-play.png` |
| `8` | Exploded View Tab (Explode Slider + Click Part) | **FAIL** | `7,308 ms` | `ExplodedView` mounted `11` design parts from `manifest.design`, but `explode-slider` was below fold / not matched before timeout | `/workspace/work/out/e2e/media-video/08-exploded-view.png` |
| `9` | Modify Chat (`"make it 20% taller"`) | **PASS** | `40,707 ms` | Typed `"make it 20% taller"` into `ModifyChat`, clicked **Ask Argon**, selectively re-orchestrated the 6 downstream stages (`designer → critic → cad → bom → price-hunter → instructions`), and rendered the **Modification Diff Summary** card (`+$2.60` DIY cost diff, `+52%` print time/weight diff, `98/100` DFM score) | `/workspace/work/out/e2e/media-video/09-modify-chat.png` |

### Per-Agent Timings (Case 2 — `youtube-watch-kgn53`)

| Stage ID | Agent Name | Status | Runner | Duration (`ms`) | Summary |
|---|---|---|---|---|---|
| `analyst` | Analyst Agent | `completed` | `deterministic` | `151 ms` | Identified `"DIY Youtube Watch Alternative"` (`inputType: "video"`, `$149` retail → `~$24.85` DIY) |
| `researcher` | Researcher Agent | `completed` | `deterministic` | `151 ms` | Grounded `7` reference schematics, teardowns & open-source models |
| `teardown` | Video Teardown Agent | `completed` | `deterministic` | `2,400 ms` | Extracted `1` YouTube teardown video (`https://www.youtube.com/watch?v=kYj2zRVrfLg`) and **`5` timestamped teardown frames** with part callouts |
| `designer` | Designer / Architect Agent | `completed` | `deterministic` | `150 ms` | Architected `7` printed parts + `4` off-the-shelf components (`11` total parts) |
| `critic` | Printability Critic Agent | `completed` | `gemini-rest` | `11 ms` | Printability `PASS` (`97/100`) across `2` rounds on Bambu Lab A1 |
| `bom` | BOM Procurement Agent | `running` (completed during ModifyChat) | `agy-cli` / `deterministic` | — | Initial SSE stream stalled while `bom` & `instructions` ran concurrently; completed during Step 9 ModifyChat (`1,850 ms`) |
| `cad` | CAD & Plate Packer Agent | `pending` (completed during ModifyChat) | `deterministic` | — | Completed during Step 9 ModifyChat |
| `instructions` | Instructions Agent | `pending` (completed during ModifyChat) | `deterministic` | — | Completed during Step 9 ModifyChat |

### Artifacts Quality Notes (Case 2)

1. **Analyst (`analysis.json`):** Correctly detected `inputType: "video"` from the `youtube.com/watch?v=kYj2zRVrfLg` URL! However, **Bug (Medium)**: `extractSlugFromUrl` in `lib/agents/orchestrator.ts` extracted `"youtube-watch"` from `/watch?v=kYj2zRVrfLg` (because YouTube video URLs put the video ID in `?v=...` rather than the path and don't contain the video title in the URL), resulting in `objectName: "DIY Youtube Watch Alternative"` when Gemini REST timed out.
2. **Video Teardown (`teardown.json`):** **Successfully generated `1` teardown video and `5` timestamped frames** (`teardownVideosCount: 1`, `teardownFramesCount: 5`) for the YouTube teardown input!
3. **Modify Chat (`ModifyChat.tsx` + `/api/projects/[id]/modify`):** Worked end-to-end on the live project page! Submitting `"make it 20% taller"` classified the prompt as a geometry change affecting `6/9` stages (`Designer → Critic → CAD & Plates → BOM → Price Hunter → Instructions`), skipped `3` unchanged stages (`Analyst`, `Researcher`, `Teardown`), lit up the affected Mission Control nodes, and rendered the 3-column **Modification Diff Summary** card (`$24.85 → $27.45`, `3h 24m → 5h 10m`, `185g → 281g`).

---

## Bugs Discovered & Lane Attribution

| ID | Severity | Title | Suspected File(s) | Lane Owner | Status |
|---|---|---|---|---|---|
| **BUG-MEDIA-1** | **High** | **YouTube URLs (`/watch?v=...`) & uploaded image filenames (`desk-lamp.jpg`) produce generic titles (`"DIY Youtube Watch Alternative"`, `"DIY Desk-Lamp.Jpg Alternative"`) and fallback to the plant-waterer fluidics archetype when Gemini REST times out at 6.5s on Vercel** | `lib/agents/analyst.ts`, `lib/agents/orchestrator.ts` | `gemini-harness` (leader) | Reported on `MESSAGEBOARD.md` (with repro & suggested fix: strip file extensions from `imageName`, fetch YouTube `oembed` title for `youtube.com/watch?v=...` in <300ms, and add lamp/stand/headphones archetypes to `analyst.ts` fallback) |
| **BUG-MEDIA-2** | **Medium** | **SSE stream `/api/objects/[id]/stream` can close or stall after `critic` on Vercel when `bom`/`price-hunter`/`cad`/`instructions` exceed the remaining function window, leaving `bom`/`cad`/`instructions` in `running`/`pending` state** | `lib/agents/orchestrator.ts`, `app/api/objects/[id]/stream/route.ts` | `gemini-harness` (leader) | Reported on `MESSAGEBOARD.md` (with repro from `youtube-watch-kgn53`) |
| **BUG-MEDIA-3** | **Low** | **`TeardownGallery` is not rendered on the Sources tab unless the user scrolls past all 7 source cards (`y > 1100px`), and shows `0` frames for non-video inputs without an explanatory badge** | `components/sources/SourcesTab.tsx`, `components/sources/TeardownGallery.tsx` | `superdev-muse-solana` | Reported on `MESSAGEBOARD.md` |

---

## Recorded Media & Screenshot Inventory

### Videos (`/workspace/work/out/e2e/`)
- `/workspace/work/out/e2e/media-image.webm` (`1920×1080` WebM screen recording, Case 1)
- `/workspace/work/out/e2e/media-image.mp4` (`1920×1080` H.264 MP4 screen recording, Case 1)
- `/workspace/work/out/e2e/media-video.webm` (`1920×1080` WebM screen recording, Case 2)
- `/workspace/work/out/e2e/media-video.mp4` (`1920×1080` H.264 MP4 screen recording, Case 2)

### Case 1 Screenshots (`/workspace/work/out/e2e/media-image/`)
1. `/workspace/work/out/e2e/media-image/01a-landing-photo-attached.png` — Renaissance landing page with `Sketch/Photo: desk-lamp.jpg` attached
2. `/workspace/work/out/e2e/media-image/01-landing-submit.png` — Navigating to `/projects/desk-lamp-qozz2`
3. `/workspace/work/out/e2e/media-image/02a-mission-control-running.png` — Mission Control live 9-agent DAG streaming SSE events
4. `/workspace/work/out/e2e/media-image/02-mission-control-done.png` — Mission Control with all 9 agent nodes completed & `Desk-Lamp.Jpg` artifact chip
5. `/workspace/work/out/e2e/media-image/03-overview-tab.png` — Overview tab & Printability Critic (`97/100 PASS`)
6. `/workspace/work/out/e2e/media-image/04-sources-teardown-tab.png` — Sources tab with 7 grounded references
7. `/workspace/work/out/e2e/media-image/05-bom-price-hunter-tab.png` — BOM tab with Price Hunter links & `83.6%` savings (`$24.37` vs `$149`)
8. `/workspace/work/out/e2e/media-image/06a-print-files-prusa-mk4s.png` — Print Files tab switched to `Prusa MK4 / MK4S (250×210×220 mm)`
9. `/workspace/work/out/e2e/media-image/06-print-files-tab.png` — Print Files tab switched back to `Bambu Lab A1` + On-Demand Print Service card (`JLC3DP` / `Craftcloud`)
10. `/workspace/work/out/e2e/media-image/07-instructions-play.png` — Instructions tab playing 7-step IKEA-style 3D assembly choreography
11. `/workspace/work/out/e2e/media-image/08-exploded-view.png` — Exploded View tab 3D viewport

### Case 2 Screenshots (`/workspace/work/out/e2e/media-video/`)
1. `/workspace/work/out/e2e/media-video/01a-landing-youtube-url.png` — Renaissance landing page with `https://www.youtube.com/watch?v=kYj2zRVrfLg` entered
2. `/workspace/work/out/e2e/media-video/01-landing-submit.png` — Navigating to `/projects/youtube-watch-kgn53`
3. `/workspace/work/out/e2e/media-video/02a-mission-control-running.png` — Mission Control running on YouTube teardown input
4. `/workspace/work/out/e2e/media-video/02-mission-control-done.png` — Mission Control with Analyst, Researcher, Teardown (`5` frames), Designer & Critic completed
5. `/workspace/work/out/e2e/media-video/03-overview-tab.png` — Overview tab for YouTube video project
6. `/workspace/work/out/e2e/media-video/04-sources-teardown-tab.png` — Sources & Video Teardown tab (`7` sources, `1` video, `5` frames)
7. `/workspace/work/out/e2e/media-video/05-bom-price-hunter-tab.png` — BOM tab state
8. `/workspace/work/out/e2e/media-video/06-print-files-tab.png` — Print Files tab state
9. `/workspace/work/out/e2e/media-video/07-instructions-play.png` — Instructions tab 3D AssemblyPlayer
10. `/workspace/work/out/e2e/media-video/08-exploded-view.png` — Exploded View tab
11. `/workspace/work/out/e2e/media-video/09-modify-chat.png` — ModifyChat `"make it 20% taller"` completed with 3-column **Modification Diff Summary**
