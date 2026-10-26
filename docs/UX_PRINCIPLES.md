# Get Me An Alt — UX Principles & Baseline Audit (ITER1)

This checklist synthesizes world-class product UX standards across **Nielsen's 10 Usability Heuristics**, **Apple HIG & Material Design 3**, **Laws of UX**, **Linear / Stripe / Vercel / Arc patterns**, **WCAG 2.2 AA**, **Empty / Loading / Error States**, and **Microcopy**. Each principle is scored **1–5** against the current application baseline with file/line and screenshot evidence.

## Evidence Screenshots (Before)
- Desktop Landing (`1440×900`): `/workspace/work/shots/ux-1-before-desktop-landing.png`
- Desktop Project (`1440×900`): `/workspace/work/shots/ux-1-before-desktop-project.png`
- Mobile Landing (`390×844`): `/workspace/work/shots/ux-1-before-mobile-landing.png`
- Mobile Project (`390×844`): `/workspace/work/shots/ux-1-before-mobile-project.png`

---

## 1. Nielsen's 10 Usability Heuristics

| # | Heuristic | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **H1** | **Visibility of System Status** | Users always know what stage the 9-agent pipeline is in, elapsed time, and what artifact is being synthesized. | **4 / 5** | `MissionControl.tsx:1278-1302` shows `9/9 Agents Verified`, token count, elapsed time, and live SSE thoughts. However, during a fresh 2–4 min live run (`app/projects/[id]/page.tsx:553`), unpopulated tabs show a generic spinner without stage ETA or progress bar. |
| **H2** | **Match Between System & Real World** | Plain hardware/3D-printing terminology (`DIY`, `BOM`, `Print Files`, `Save 83%`) rather than internal or thematic jargon. | **4 / 5** | `app/page.tsx` and `app/projects/[id]/page.tsx` use clear maker terminology (`3D-Printed Parts`, `Off-the-Shelf Hardware`). A few fallback SVG strings in `TeardownGallery.tsx:80-85` still use Latin labels (`FIGURA I`, `De Mechanica`). |
| **H3** | **User Control & Freedom** | Easy back navigation, reset after modifications, cancel/remove builds, and collapsible drawers. | **4 / 5** | `ModifyChat.tsx:523` provides a 1-click `Reset` to baseline; `RecentBuildsShelf.tsx:227` has `Remove`; `MissionControl.tsx:1306` has `Pause/Resume/Skip`. Print quote modal (`app/projects/[id]/page.tsx:1254`) lacks `Escape` key & backdrop-click close. |
| **H4** | **Consistency & Standards** | Uniform button hierarchy (`.btn-primary-gold` vs `.btn-secondary-surface`), badge treatments, and tab patterns across views. | **4 / 5** | Primary gold CTAs and surface cards are consistent on desktop, but fallback views (`app/projects/[id]/page.tsx:1032-1055`, `1254`) use ad-hoc button styles instead of standard tokens. |
| **H5** | **Error Prevention** | Validate URLs/files before submission, guard against empty prompts, and constrain printer bed sizes automatically. | **4 / 5** | `app/page.tsx:286-318` validates image MIME types on drop and blocks empty submissions; `ModifyChat.tsx:568` disables submit when empty or running. |
| **H6** | **Recognition Rather Than Recall** | Preset gadgets, modification suggestion chips, and visible part/price badges prevent blank-canvas paralysis. | **5 / 5** | `app/page.tsx:556` provides 7 instant preset builds; `ModifyChat.tsx:40-85` provides 5 modification preset chips with affected-agent counts (`6a`, `2a`, `3a`). |
| **H7** | **Flexibility & Efficiency of Use** | Supports URL paste, YouTube link, free-text description, drag-and-drop photo, or 1-click instant preset demos. | **4 / 5** | Omni-input in `app/page.tsx:438-485` supports all 4 input modalities. Missing keyboard shortcut (`⌘K` / `/` to focus input, arrow keys between tabs). |
| **H8** | **Aesthetic & Minimalist Design** | High signal-to-noise ratio; chrome never starves primary content above the fold. | **2 / 5** | **Critical failure on mobile (`390×844`)**: In `ux-1-before-mobile-project.png`, the sticky header (`app/projects/[id]/page.tsx:445-541`) wraps into 4 tab rows + multi-line title/savings (~460px tall + 64px top bar = **524px sticky chrome**, 62% of the 844px screen), pushing 100% of tab content off-screen (`y > 844px`). |
| **H9** | **Help Users Recognize & Recover from Errors** | Clear, actionable error banners with a 1-click retry or fallback path when an API or stream fails. | **3 / 5** | `app/page.tsx:527` and `ModifyChat.tsx:663` show inline error strings, but neither offers a 1-click `Retry` button or fallback demo link when network/API calls fail. |
| **H10** | **Help & Documentation** | Concise, progressive onboarding (`How It Works`) and inline slicer/DFM guidance. | **4 / 5** | `app/page.tsx:610-729` progressively discloses the 7-agent pipeline and interactive 3D preview behind an expandable toggle. |

---

## 2. Apple HIG & Material Design 3 Ergonomics

| # | Principle | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **M1** | **Touch Target Sizing (≥ 44×44px)** | All interactive controls (buttons, tabs, chips, close icons) meet `min-h-[44px]` on mobile/touch. | **3 / 5** | Primary tabs and buttons use `min-h-[44px]`, but `app/page.tsx:474,516` (`min-h-[38px]`), `ModifyChat.tsx:596` (`min-h-[36px]`), `BomCards.tsx:180` (`min-h-[36px]`), and modal close (`app/projects/[id]/page.tsx:1264`) fall below 44px. |
| **M2** | **Mobile Viewport & Overflow Discipline (`390×844`)** | Zero horizontal overflow (`scrollWidth <= clientWidth`); compact sticky bars (`<= 140px`); horizontally scrollable single-row tab bar. | **1 / 5** | **Highest-Impact Issue**: (1) In `ux-1-before-mobile-landing.png`, the printer `<select>` (`app/page.tsx:512-523`) overflows right out of the command card and off the 390px viewport (`Bambu Lab A1 (256×256×256 mm) — D...`), and zero Instant Demo cards appear above the fold. (2) In `ux-1-before-mobile-project.png`, the sticky project header + 6 wrapped tabs + ModifyChat + MissionControl consume **>840px** of vertical height, leaving **0px** of actual project content visible above the fold. |
| **M3** | **Surface & Elevation Hierarchy** | Distinct luminance steps (`--bg-canvas #0c0a08` → `--surface-card #17130e` → `--surface-raised #231d15`) with crisp 1px borders. | **5 / 5** | `app/globals.css:10-20,126-154` establishes a clean 3-tier dark surface system with subtle inner highlights. |
| **M4** | **Typographic Scale & Measure** | Readable base font (`≥ 15px`), line length `50–75ch`, and `tabular-nums` on all prices, dimensions, and timers. | **4 / 5** | `app/globals.css:80,272` sets `15px` body copy and `.tabular-nums`. On mobile landing (`app/page.tsx:408`), `text-4xl` hero headline wraps to 4 tall lines, pushing the form and presets down. |

---

## 3. Laws of UX

| # | Law | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **L1** | **Fitts's Law** | Primary actions (`Build My DIY Alt`, tab switches, `Ask Argon`) are large, high-contrast, and close to the input locus. | **4 / 5** | Desktop command bar (`ux-1-before-desktop-landing.png`) pairs input + gold CTA adjacent. On mobile (`ModifyChat.tsx:550`), the input and button fight for a single 340px row, truncating the input placeholder to 18 characters (`Modify build (e.g., "m`). |
| **L2** | **Hick's Law** | Minimize simultaneous choices; collapse secondary telemetry (`Agent Graph`, `Modify Presets`, `How It Works`) by default. | **4 / 5** | `MissionControl`, `ModifyChat`, and `How It Works` are collapsed by default. However, on mobile project view, `ModifyChat` and `MissionControl` still render 6 stacked header rows/buttons above the active tab content. |
| **L3** | **Jakob's Law** | Familiar e-commerce price comparison (`$149.00 → $24.85 DIY · Save 83%`) and standard horizontal tab bar. | **3 / 5** | Desktop tab bar (`ux-1-before-desktop-project.png`) follows standard segmented control conventions, but mobile wraps tabs into a 4-row grid instead of a single horizontally scrollable strip. |
| **L4** | **Miller's Law (Chunking ≤ 5–7 items)** | Group complex engineering specs into scannable cards (`Printed` vs `Purchased`, `Category Subtotals`, 6 top-level tabs). | **5 / 5** | `app/projects/[id]/page.tsx:625` cleanly splits printed vs. purchased parts; `BomCards.tsx:29` chunks BOM items by category subtotals. |
| **L5** | **Doherty Threshold (< 400ms feedback)** | Immediate visual response on every click, tab switch, preset launch, and filter toggle. | **4 / 5** | Tab switches and preset filters respond instantaneously; initial `/projects/[id]` load shows a full-page spinner (`ux-1-before-desktop-project.png` initial frame) instead of an instant layout skeleton. |
| **L6** | **Aesthetic-Usability Effect** | Cohesive warm gold/obsidian visual craft builds user trust in the generated CAD and BOM outputs. | **5 / 5** | Desktop landing (`ux-1-before-desktop-landing.png`) and project view (`ux-1-before-desktop-project.png`) look polished, cohesive, and authoritative. |

---

## 4. Linear / Stripe / Vercel / Arc Patterns

| # | Pattern | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **P1** | **Command-Bar Input Ergonomics (Linear / Arc)** | Single unified input bar that auto-detects URLs, YouTube links, prompts, and dropped images with clear inline chips. | **4 / 5** | `app/page.tsx:422-530` auto-detects URL vs. prompt vs. dropped image. On mobile, secondary controls (photo upload + printer select) overflow and stack awkwardly. |
| **P2** | **Financial & Telemetry Precision (Stripe)** | Prominent savings delta badge, line-item unit math (`qty × unitPrice`), and live retailer price comparison pills. | **5 / 5** | `BomCards.tsx:135-170` and `ModifyChat.tsx:709-896` display exact before/after price deltas, unit breakdowns, and multi-retailer links. |
| **P3** | **Compact Deployment / Pipeline Status Strip (Vercel)** | Single-line collapsible pipeline bar showing agent status, duration, and token count without pushing content down. | **3 / 5** | Compact on desktop (`1440×900`), but on mobile (`390×844`, `ux-1-before-mobile-project.png`), `MissionControl` and `ModifyChat` stack into 220px of buttons above the tab content. |

---

## 5. WCAG 2.2 AA Accessibility

| # | Criterion | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **A1** | **Color Contrast (1.4.3 / 1.4.11)** | Primary text ≥ 15:1, secondary ≥ 9:1, muted ≥ 4.5:1, UI borders/controls ≥ 3:1. | **5 / 5** | `app/globals.css:22-26` tokens (`#faf4e8` 17.5:1, `#dfd3be` 10.4:1, `#b5a48b` 5.9:1 on `#0c0a08`/`#17130e`) pass WCAG 2.2 AA. |
| **A2** | **Focus Visible & Keyboard Navigation (2.4.7 / 2.1.1)** | High-contrast `:focus-visible` ring on all controls; skip-to-content link; arrow-key tab navigation; modal focus trap. | **3 / 5** | `:focus-visible` ring is defined (`app/globals.css:88`), but `app/layout.tsx` lacks a "Skip to main content" link, `role="tablist"` lacks Left/Right arrow key navigation, and the Print Service modal lacks `role="dialog"` / `Escape` handling. |
| **A3** | **Reduced Motion (2.3.3)** | Respects `prefers-reduced-motion: reduce` across CSS animations and JS replay loops. | **5 / 5** | `app/globals.css:303` and `MissionControl.tsx:704,898` respect `prefers-reduced-motion`. |

---

## 6. Empty, Loading, & Error States + Microcopy

| # | Area | Checklist Criterion | Score (1–5) | Evidence & Audit Findings |
|---|---|---|---|---|
| **S1** | **Empty States** | Empty states explain what belongs there and provide a 1-click action or hide gracefully when irrelevant. | **4 / 5** | `RecentBuildsShelf.tsx:325` hides cleanly when empty on landing; `SourcesTab.tsx` filters have a "Reset filters" empty state, though static photo uploads show 0 teardown frames without a clear badge explaining why. |
| **S2** | **Loading States** | Layout-preserving skeletons rather than layout-shifting full-screen spinners. | **3 / 5** | `app/projects/[id]/page.tsx:331` uses a centered spinner before manifest hydration, causing a full-page layout jump when the sticky header and tabs mount. |
| **S3** | **Microcopy & Plain Language** | Action verbs on CTAs (`Build My DIY Alt`, `Open Build`, `Replay Graph`), ≤ 1 line helper text, consistent terms. | **4 / 5** | Landing and project microcopy are concise and action-oriented; mobile labels on tabs and printer options need tighter responsive phrasing so they never clip or wrap into multi-line buttons. |

---

## Summary Priority Decision for ITER1 Fix
The **single highest-impact UX failure** (scoring **1 / 5** on **M2 Mobile Viewport & Overflow Discipline** and **2 / 5** on **H8 Aesthetic & Minimalist Design**, directly evidenced in `ux-1-before-mobile-landing.png` and `ux-1-before-mobile-project.png`) is the **Mobile `390×844` Landing & Project Page Layout Breakdown**:
1. **Mobile Landing (`390×844`)**: The printer `<select>` overflows horizontally outside the command bar and viewport (`scrollWidth > 390px`), and excessive hero vertical padding/wrapping hides 100% of the "Instant Demos" section below the fold.
2. **Mobile Project Page (`390×844`)**: The sticky header (`top-16`) wraps the 6 tabs into 4 tall rows and stacks title + tagline + multi-row price box into **~460px of sticky header** (plus 64px top nav = **524px sticky chrome**, 62% of the screen), while `ModifyChat` and `MissionControl` stack another ~220px above the tab content—leaving **0% of actual project content visible above the fold** and truncating the `Ask Argon` input to 18 characters.
