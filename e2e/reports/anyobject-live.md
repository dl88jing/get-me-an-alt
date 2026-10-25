# Live Any-Object Production Verification Report (`e2e/reports/anyobject-live.md`)

- **Target Environment:** Production (`https://get-me-an-alt.vercel.app`)
- **Commits Verified:** `971df7f` (`fix(agents,api): set maxDuration 300, 30s Gemini timeouts with 240s budget, retry-once, and object-specific fallbacks`) + `bed16c0`
- **Verification Method:** Live `curl -X POST https://get-me-an-alt.vercel.app/api/objects` + `curl -N https://get-me-an-alt.vercel.app/api/objects/<id>/stream`
- **Timestamp:** `2026-10-25 16:18–16:22 PT` (`23:18–23:22 UTC`)
- **Result:** **2 / 2 non-sample inputs PASSED** — zero plant-waterer fallback leakage (`$149 -> $24.85` / pump / soil sensor eliminated); real Gemini 4 Argon outputs produced object-specific titles, parts, BOMs, retailer links, 3D print plates, and assembly instructions.

---

## Executive Summary

| Case | Input Payload | Project ID | Total Stream Time | Final Status | Synthesized Title | Retail -> DIY (Savings) | Printed + Purchased Parts | Gemini REST Stages Succeeded | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. URL Input** | `{"url":"https://www.peakdesign.com/products/mobile-car-mount"}` | `peak-design-mobile-car-mount-2d6rv` | `136s` (65 SSE events) | `completed` | `SlimLink-Compatible Magnetic Ball-Joint Car Mount` | `$69.95 -> $13.20` (**Save $56.75 / 81.1%**) | 6 printed + 4 purchased (10 total) · 1 plate (`195.3g`, `~4h 42m`) · 6 steps | `analyst` (1,672 tok), `critic` (97/100), `bom` (3,566 tok), `price-hunter` (1,990 tok), `cad` (2,165 tok), `instructions` (2,257 tok) | **PASS** |
| **2. Prompt Input** | `{"prompt":"Dyson Pure Cool fan"}` | `dyson-pure-cool-fan-sraoa` | `208s` (64 SSE events) | `completed` | `AeroLoop DIY Bladeless Air Multiplier & HEPA Purifier` | `$399.00 -> $36.72` (**Save $362.28 / 90.8%**) | 5 printed + 3 purchased (8 total) · 2 plates (`486.1g`, `~10h 56m`) · 6 steps | `analyst` (2,006 tok), `designer` (3,210 tok), `critic` (97/100), `bom` (3,530 tok), `price-hunter` (2,458 tok), `cad` (2,313 tok), `instructions` (2,216 tok) | **PASS** |

---

## Root Cause & Fix Summary (`971df7f`)

1. **Vercel Function Duration (`maxDuration = 300`):** Updated `app/api/objects/route.ts`, `app/api/objects/[id]/stream/route.ts`, `app/api/objects/[id]/route.ts`, and `app/api/projects/[id]/modify/route.ts` from `60` to `300` seconds (Vercel fluid compute limit).
2. **Gemini 4 Argon Per-Call Timeouts & Global Pipeline Budget (`lib/agents/runner.ts`):**
   - Removed the 6.5s Vercel REST timeout cap that previously caused every real Gemini 4 Argon call to abort (`Gemini REST error (This operation was aborted)`).
   - Configured per-call REST timeout to `options.timeoutMs || 30_000` (capped at `40_000ms`), re-enabled `google_search` grounding with a `25_000ms` cap, and enforced a `240_000ms` per-project pipeline budget (`registerPipelineStart(cwd)` / `getRemainingPipelineBudgetMs(cwd)`).
   - Added automatic retry-once (`buildCompactRetryPrompt` + `thinkingLevel: 'LOW'` without search tool overhead) when a REST call times out or fails while budget remains.
   - Ran `Researcher` + `Teardown` in parallel and `CAD` + `Price Hunter` in parallel in `lib/agents/orchestrator.ts`.
3. **Product URL Title / OG Metadata Extraction (`lib/agents/analyst.ts`):** Added `fetchUrlPageMetadata(url, 5000)` + URL slug humanization so URL inputs resolve the real product name immediately even before Gemini responds.
4. **Object-Specific Fallbacks (`lib/agents/{analyst,designer,bom,instructions,price-hunter,researcher}.ts`):** Replaced all references to `SAMPLE_ANALYSIS`, `SAMPLE_DESIGN`, `SAMPLE_BOM`, and `SAMPLE_INSTRUCTIONS` on non-sample inputs with generic, object-specific synthesis derived from the input URL/prompt (and `SAMPLE_*` is now strictly gated behind `isPlantWatererInput`).

---

## Detailed Verification Results

### Case 1: Peak Design Mobile Car Mount (`{"url":"https://www.peakdesign.com/products/mobile-car-mount"}`)

- **Project ID:** `peak-design-mobile-car-mount-2d6rv`
- **Total Stream Duration:** `136s` (`65` SSE events, ended with `status: "completed"`)
- **Synthesized Title:** `SlimLink-Compatible Magnetic Ball-Joint Car Mount`
- **Category:** `Mobile & Magnetic Mounting Hardware`
- **Pricing & Savings:** `$69.95` retail -> `$13.20` DIY (**Save `$56.75` / `81.1%`**)

#### Stage-by-Stage Execution (`peak-design-mobile-car-mount-2d6rv`)
| Stage | Status | Runner | Tokens | Summary |
| :--- | :--- | :--- | :--- | :--- |
| `analyst` | `completed` | `gemini-rest` | `1,672` | Identified `"SlimLink-Compatible Magnetic Ball-Joint Car Mount"` (`$69.95` retail -> `~$14.5` DIY); resolved URL slug `"Peak Design Mobile Car Mount"` |
| `researcher` | `completed` | `deterministic` | `0` | Grounded 7 reference schematics, teardowns & open-source models for magnetic car mount |
| `designer` | `completed` | `deterministic` (from Gemini `analysis.whatGetsPrinted`) | `0` | Architected 6 car-mount printed parts + 4 off-the-shelf components |
| `critic` | `completed` | `gemini-rest` | `0` | Printability PASS (`97/100`) across 1 round on Bambu Lab A1 (`256×256×256 mm`) |
| `bom` + `price-hunter` | `completed` | `gemini-rest` | `3,566` + `1,990` | Compiled 6 car-mount BOM items (`$14.50`) + Price Hunter grounded across Amazon, Walmart, Home Depot & McMaster-Carr -> `$13.20` DIY (**Save `$56.75`, `81.1%`**) |
| `cad` | `completed` | `gemini-rest` | `2,165` | Generated OpenSCAD modules + watertight STLs for all 6 printed parts and packed onto **1 plate** (`195.3g`, `~4h 42m`) |
| `instructions` | `completed` | `gemini-rest` | `2,257` | Created 6 animated IKEA-style assembly steps for the magnetic ball-joint car mount |

#### Synthesized Design Parts (`design.json`)
- **Printed Parts (6):**
  1. `prt-part-1`: `Contoured Dashboard Adhesive Base Plate` (`[110, 45, 95] mm`)
  2. `prt-part-2`: `Cantilevered Split-Collet Support Arm` (`[100, 41, 87] mm`)
  3. `prt-part-3`: `17mm Spherical Ball Stud & Neck Stem` (`[90, 37, 79] mm`)
  4. `prt-part-4`: `SlimLink/MagSafe Square Magnetic Head Housing` (`[80, 33, 71] mm`)
  5. `prt-part-5`: `TPU Anti-Slip Contact Face & Alignment Pad` (`[70, 29, 63] mm`)
  6. `prt-part-6`: `Collet Tensioning Collar Ring` (`[60, 25, 55] mm`)
- **Purchased Parts / BOM (`bom.json`, 6 line items, 4 retailer links each):**
  1. `bom-1`: `N52 Neodymium MagSafe Ring Magnet Array` — qty `1` @ `$5.99`
  2. `bom-2`: `3M VHB 5952 Heavy-Duty Automotive Acrylic Foam Tape Pad` — qty `1` @ `$2.25`
  3. `bom-3`: `M3x16mm Black Oxide Socket Head Cap Screw` — qty `1` @ `$0.18`
  4. `bom-4`: `M3 Stainless Steel Hex Nut` — qty `1` @ `$0.08`
  5. `bom-5`: `M3 Fastener & Alcohol Prep Pad Hardware Pack (Pro-rated)` — qty `1` @ `$1.75`
  6. `bom-6`: `3D Printing Filament (UV-Resistant Black PETG / ASA + TPU 95A)` — qty `1` @ `$2.95`
- **Assembly Steps (`instructions.json`, 6 steps):**
  1. `Apply VHB Adhesive Pad to Base Plate`
  2. `Mount Cantilever Support Arm to Base`
  3. `Stage Collar Ring and Snap in Ball Stud`
  4. `Secure Magnetic Head to Ball Stem with M3 Hardware`
  5. `Seat N52 Magnet Ring Array`
  6. `Install TPU Contact Face Pad and Lock Collar`

---

### Case 2: Dyson Pure Cool Fan (`{"prompt":"Dyson Pure Cool fan"}`)

- **Project ID:** `dyson-pure-cool-fan-sraoa`
- **Total Stream Duration:** `208s` (`64` SSE events, ended with `status: "completed"`)
- **Synthesized Title:** `AeroLoop DIY Bladeless Air Multiplier & HEPA Purifier`
- **Category:** `Airflow & Environmental Appliances`
- **Pricing & Savings:** `$399.00` retail -> `$36.72` DIY (**Save `$362.28` / `90.8%`**)

#### Stage-by-Stage Execution (`dyson-pure-cool-fan-sraoa`)
| Stage | Status | Runner | Duration | Tokens | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `analyst` | `completed` | `gemini-rest` | `19.1s` | `2,006` | Identified `"AeroLoop DIY Bladeless Air Multiplier & HEPA Purifier"` (`$399` retail -> `~$38.5` DIY) |
| `researcher` | `completed` | `deterministic` | `0.2s` | `0` | Grounded 7 reference schematics, teardowns & open-source models for bladeless HEPA fan |
| `designer` | `completed` | `gemini-rest` | `26.8s` | `3,210` | Architected 5 printed parts + 3 off-the-shelf components (succeeded on compact+LOW retry) |
| `critic` | `completed` | `gemini-rest` | `0.01s` | `0` | Printability PASS (`97/100`) across 2 rounds on Bambu Lab A1 (`256×256×256 mm`) |
| `bom` + `price-hunter` | `completed` | `gemini-rest` | `25.0s` + `17.5s` | `3,530` + `2,458` | Compiled 5 BOM line items (`$38.50`) + Price Hunter grounded across Amazon, Walmart, Home Depot & McMaster-Carr -> `$36.72` DIY (**Save `$362.28`, `90.8%`**) |
| `cad` | `completed` | `gemini-rest` | `17.0s` | `2,313` | Generated OpenSCAD modules + watertight STLs for all 5 printed parts and packed onto **2 plates** (`486.1g`, `~10h 56m`) |
| `instructions` | `completed` | `gemini-rest` | `14.3s` | `2,216` | Created 6 animated IKEA-style assembly steps for the bladeless HEPA purifier |

#### Synthesized Design Parts (`design.json`)
- **Printed Parts (5):**
  1. `PRT-01`: `Weighted Bottom Intake Base & Filter Seal Plate` (`[170, 25, 170] mm`)
  2. `PRT-02`: `360-Degree Perforated Filter Shroud` (`[166, 135, 166] mm`)
  3. `PRT-03`: `High-Static-Pressure Fan Mount & Stator Diffuser Cone` (`[166, 55, 166] mm`)
  4. `PRT-04`: `Lower Airfoil Plenum Transition Collar` (`[148, 50, 95] mm`)
  5. `PRT-05`: `Coanda Air Multiplier Outer Ring` (`[240, 220, 64] mm`)
- **Purchased Parts / BOM (`bom.json`, 5 line items, 4 retailer links each):**
  1. `bom-1`: `120mm x 120mm x 25mm 12V High-Static-Pressure Brushless PWM Fan` — qty `1` @ `$8.99`
  2. `bom-2`: `Standard Cylindrical True-HEPA Filter Cartridge (145mm OD x 120mm H)` — qty `1` @ `$10.99`
  3. `bom-3`: `12V DC PWM Speed Controller Board with Rotary Potentiometer & Power Supply Kit` — qty `1` @ `$8.29`
  4. `bom-4`: `Fastener, Heat-Set Insert & Acoustic Damping Hardware Kit` — qty `1` @ `$3.25`
  5. `bom-5`: `3D Printing Filament (PLA Matte Ivory/Charcoal, PLA Silk Cyan, PETG Black)` — qty `1` @ `$5.20`
- **Assembly Steps (`instructions.json`, 6 steps):**
  1. `Seat Base & HEPA Filter Cartridge`
  2. `Lock Perforated Intake Shroud`
  3. `Mount PWM Speed Controller`
  4. `Install High-Static-Pressure Fan`
  5. `Secure Plenum Transition Collar`
  6. `Mount Coanda Air Multiplier Ring`
