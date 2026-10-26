# Get Me An Alt — Prioritized UX Audit & Backlog

Audited live against `https://get-me-an-alt.vercel.app` at **Desktop (`1440×900`)** and **Mobile (`390×844`)** using Playwright MCP across the full user journey (`Landing → Instant Demo / URL Submit → Overview → Sources → BOM → Print Files → Instructions → Exploded View`).

---

## P0 — High-Impact Visual, Layout & Workflow Issues (Observed in Screenshots)

- [x] **1. Mobile & Desktop Command Bar Overflow + Project Header Chrome Polish (`app/page.tsx`, `app/projects/[id]/page.tsx`, `components/ui/ModifyChat.tsx`, `app/projects/[id]/CritiquePanel.tsx`)** *(shipped in `81b505c` + `13fbd91`)*
  - **Observed on Mobile (`390×844`) Landing (`landing-mobile.png`):** The `Printer:` `<select>` dropdown in the hero command bar overflows horizontally outside the gold card border and clips off the right edge of the viewport (`Bambu Lab A1 (256×256×256 mm) — D...`).
  - **Observed on Desktop (`1440×900`) Landing (`landing-desktop.png`):** Hero input placeholder (`Paste a product link, YouTube URL, or describe any gadget..`) truncates awkwardly mid-ellipsis (`..`).
  - **Observed on Desktop & Mobile Project Page (`project-overview-desktop.png`, `project-print-desktop.png`, `project-overview-mobile.png`):**
    1. **Print Files tab buries primary content 1,300px below the fold:** Clicking `Print Files` renders the entire expanded 1,300px `CritiquePanel` (which the user *already* saw on the `Overview` tab) above `PrintPanel`, forcing users to scroll a full screen down just to see the build plate, printer selector, and STL/3MF download buttons.
    2. **Overview tab right-column dead space & expanded wall of text:** On `Overview`, `CritiquePanel` defaults to `All Rounds (2)` fully expanded (1,300px tall) in the left column while the right column has 1,200px of empty black void below `DFM & Slicer Notes`, and `CritiquePanel` prints duplicate printer dimensions (`Bambu Lab A1 (256×256×256 mm) (256×256×256 mm)`) and raw `` (`critique.json`) `` backticks.
    3. **Grammar & truncation bugs in Project Header & Modify Bar:** Tab badge says `1 plate(s)` instead of `1 plate` / `2 plates`; mobile project title truncates on a single line (`Self-watering plant system (alt to a $...`) instead of wrapping cleanly (`line-clamp-2`); `ModifyChat` input is squeezed onto the same row as the description & buttons so its placeholder cuts off (`Modify build (e.g., "make reservoir 2x bigger", "use` on desktop, `Modify build (e.g., "n` on mobile).

- [x] **2. Exploded View 3D Callout Z-Index Collision & Mobile Viewport Overlap (`components/three/ExplodedView.tsx`, `app/projects/[id]/page.tsx`)** *(shipped in `ee36f02`)*
  - **Observed on Mobile (`390×844`) (`project-exploded-mobile.png`):** Three.js `<Html>` numbered callout pins (`1`, `3`, `8`, `10`, `12`, `15`) render with a high z-index directly on top of the bottom `EXPLODE FACTOR` HUD card (`EXPLODE FACTO(10)(1) ... (15)45%`), and the floating HUD card obscures the lower half of the 3D assembly on mobile screens.
  - **Fixed (`ee36f02`):** Isolated the Three.js `<Canvas>` inside a `z-0 isolate` stacking context with lowered `<Html zIndexRange={[5, 0]}>` while elevating HUD overlays to `z-20`/`z-30`; docked the `Explode Factor` slider and `Parts` strip cleanly below the canvas on mobile (`390×844`) so the 3D assembly fits unobstructed above the sticky footer; replaced raw `Shape: custom_csg` schema strings in the part inspector with maker metadata + direct STL download links; and wired `initialSelectedPartId` + `instructions` from `app/projects/[id]/page.tsx` so clicking parts in BOM/Sources selects them in Exploded View.

- [x] **3. Interactive Cross-Linking Across Overview, BOM, Print Files & 3D Views (`app/projects/[id]/page.tsx`, `components/bom/BomCards.tsx`)** *(shipped in `a7d3b2e`)*
  - **Observed on `Overview` & `BOM` (`project-overview-desktop.png`, `project-bom-desktop.png`):** The `3D-Printed Parts (9)` and `Off-the-Shelf Hardware (7)` lists on Overview are static text bullets with no click action to jump to `Print Files`, `Exploded View`, or `BOM`. Similarly, `Linked 3D parts` pills on `BomCards.tsx` are non-interactive spans, and tab state is not synced to the URL query (`?tab=...`) for deep-linking/sharing.
  - **Fixed (`a7d3b2e`):** Transformed `3D-Printed Parts` and `Off-the-Shelf Hardware` lists on `Overview` into interactive portals with part code badges (`PRT-01`, `OTS-01`), gram/price badges, and 1-click jumps to `Exploded View` (`?tab=exploded&part=...`) or highlighted `BOM` cards (`?tab=bom&bom=...`); resolved `Inspect in 3D` pills on `BomCards.tsx` to human-readable part numbers and names; synced active tab and selected part/BOM state to URL query parameters with a 1-click `Share` link button in the sticky project header; and fixed `390×844` mobile horizontal card overflow on `BomItemCard`.

- [x] **4. Assembly Instructions Autoplay-on-Mount & Clipped Step Strip (`components/three/AssemblyPlayer.tsx`)** *(shipped in `10ff9c9`)*
  - **Observed on `Instructions` (`project-instructions-desktop.png`, `instructions-mobile.png`):** `AssemblyPlayer` started with `autoPlay = true` and auto-advanced immediately (jumping to `STEP 02`–`04` before the user even saw `STEP 01`), its `660px` fixed height pushed transport controls (`← Prev`, `▶ Play`, `Next →`, `SCRUB`) below the `900px` desktop fold, and on mobile (`390×844`) the floating `PARTS LEGEND` overlay occluded 70% of the 3D assembly figure.
  - **Fixed (`10ff9c9`):** Defaulted `autoPlay = false` so the player opens cleanly at `STEP 01` with a `↺ Step 01` quick-restart button and `←`/`→`/`Space` keyboard shortcuts; sized the desktop viewport (`md:h-[540px]`) so all transport controls and step pills sit above the fold at `1440×900`; docked `PARTS` and `MOTION` below the 3D canvas on mobile (`390×844`) with a stacked `flex-col lg:flex-row` header so the 3D assembly and transport buttons are 100% unobstructed; added left/right scroll buttons (`‹`/`›`) to the step strip; and added an interactive **Complete Step-by-Step Assembly Guide & Workbench Checklist** below the player.

---

## P1 — Feature Completeness, Data Consistency & Affordances

- [x] **5. BOM Interactive "Have It" Checklist, Cost Recalculation, CSV Copy & Filament Math Sync (`components/bom/BomCards.tsx`, `data/demo/plant-waterer/bom.json`)** *(shipped in `a7d3b2e`)*
  - **Observed on `BOM` (`project-bom-desktop.png`):** Summary card displays `FILAMENT $3.55` while the `FIL-01` line item card says `$4.40` (`245 × $0.02 / g`). Users also lack a way to check off parts they already own in their workshop ("Have in workshop" toggle that updates remaining out-of-pocket cost) or export/copy the BOM as CSV/Markdown.
  - **Fixed (`a7d3b2e`):** Reconciled `data/demo/plant-waterer/bom.json` item totals to match the exact `$21.30 OTS + $3.55 Filament = $24.85 DIY` summary; added interactive category filter buttons (`All Items`, `Plumbing`, `Electronics`, `Power`, `Hardware`, `Printed-Filament`); added per-item `Have it / In Workshop` checkboxes (persisted in `localStorage`) that dynamically recalculate remaining Out-of-Pocket cost; and added 1-click `Copy CSV` and `Export .CSV` actions.

- [ ] **6. Sources Tab Video Teardown Player Poster & Zero-Count Filter Cleanup (`components/sources/TeardownGallery.tsx`, `components/sources/SourcesTab.tsx`)**
  - **Observed on `Sources` (`project-sources-desktop.png`):** The embedded YouTube teardown box on the left renders as a blank black rectangle until clicked (`t = 24s (0:24)`) while the actual extracted frame image sits as a tiny 56px thumbnail below it. Additionally, the source filter bar renders four `0`-count filter buttons (`PDFs & Manuals 0`, `Teardowns 0`, `Instructions & Guides 0`, `Products & Parts 0`) where `Teardowns 0` contradicts the `4 frames` Video Teardown gallery right above.

- [ ] **7. Print Files Card Readability & Slicer Metadata Polish (`components/print/PrintPanel.tsx`)**
  - **Observed on `Print Files` (`project-print-desktop.png`):** Section heading displays raw glob syntax `Individual Printable Part Meshes (parts/*.stl)` and part cards expose internal generator strings (`shape: custom_csg · PETG`, `44 tris`) instead of clean maker-facing dimensions, material badges, and print orientation notes.

- [ ] **8. Landing Page Instant Demo Grid Balance & Missing Favicon (`app/page.tsx`, `app/icon.svg` / `app/layout.tsx`)**
  - **Observed on `Landing` (`landing-desktop-full.png` & console logs):** Browser console logs a `404` on `/favicon.ico` on every page load. The Instant Demos section renders 7 cards in a 4-column grid (leaving an empty 8th cell at the bottom right) and flashes `"Checking saved builds for your network..."` before collapsing when 0 custom builds exist.
