# World-Class Product UX Playbook

A concise, actionable engineering & design checklist synthesizing foundational usability heuristics, cognitive psychology laws, modern craft standards (Linear, Stripe, Apple, Things), accessibility (WCAG 2.2), and Core Web Vitals for **Get Me An Alt**.

---

## 1. Nielsen's 10 Usability Heuristics
Source: [Nielsen Norman Group — 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/)

- [ ] **1. Visibility of System Status:** Always show immediate, truthful feedback (<400ms) for active agent stages, 3D mesh loading, file downloads, clipboard copies, and form submissions.
- [ ] **2. Match Between System & Real World:** Speak the maker's language (build plates, filament grams, retail BOM, print time) — never leak raw internal filenames (`parts/*.stl`, `critique.json`), code identifiers (`custom_csg`), or template bugs (`1 plate(s)`, duplicate dimensions) into user-facing UI.
- [ ] **3. User Control & Freedom:** Provide clear exit ramps, reset controls (`Reset View`), manual overrides for auto-playing animations, and non-destructive ways to filter or customize builds.
- [ ] **4. Consistency & Standards:** Enforce a single cohesive gilded black/gold Renaissance palette (`ink`, `vellum`, `gold`, `amber`, `verdigris`, `oxblood`) across every tab, badge, modal, and 3D viewport — zero off-theme Tailwind colors and zero banned wording.
- [ ] **5. Error Prevention:** Validate URLs/uploads inline, disable invalid actions with clear explanations, and guard responsive containers against horizontal overflow (`min-w-0`, `truncate`, responsive flex wrapping).
- [ ] **6. Recognition Rather Than Recall:** Keep key build economics (Retail vs. DIY cost, savings %, printer bed size) visible in persistent chrome; allow clicking any part reference in Overview or BOM to jump directly to its 3D view or STL file.
- [ ] **7. Flexibility & Efficiency of Use:** Support both one-click Instant Demo exploration for novices and keyboard shortcuts (`←`/`→` step scrubbing, `Space` play/pause, one-click BOM CSV export, bulk STL/3MF download) for power users.
- [ ] **8. Aesthetic & Minimalist Design:** Keep primary task content above the fold on every tab. Avoid repeating large secondary audit panels above primary tab workflows or leaving dead multi-column whitespace.
- [ ] **9. Help Users Recognize, Diagnose & Recover from Errors:** When an external fetch, stream window, or 3D asset fails, explain what happened plainly and offer a one-click retry or deterministic fallback.
- [ ] **10. Help & Documentation:** Embed contextual micro-guidance (orbit/zoom hints, slicer settings, tool badges) directly adjacent to the interactive canvas.

---

## 2. Laws of UX & Cognitive Ergonomics
Source: [Laws of UX — Jon Yablonski](https://lawsofux.com/)

- [ ] **Doherty Threshold (<400ms):** Every click, tab switch, filter toggle, and slider scrub must respond visually in under 400ms (`https://lawsofux.com/doherty-threshold/`).
- [ ] **Fitts's Law:** Primary CTAs, mobile tab buttons, 3D playback controls, and callout pins must have generous hit areas (minimum `44×44px` on touch, `24×24px` minimum per WCAG 2.2 AA) (`https://lawsofux.com/fittss-law/`).
- [ ] **Hick's Law & Choice Overload:** Group complex telemetry (9-agent DAG, multi-round DFM critique, 16-part lists) into progressive-disclosure summaries first, with expandable detail on demand (`https://lawsofux.com/hicks-law/`, `https://lawsofux.com/choice-overload/`).
- [ ] **Chunking & Law of Common Region:** Group related metrics into scannable cards of 3–5 data points with clear visual boundaries (`1px` gilded hairlines) (`https://lawsofux.com/chunking/`, `https://lawsofux.com/law-of-common-region/`).
- [ ] **Aesthetic-Usability Effect:** High-craft typography, aligned tabular numerals (`tabular-nums`), and zero text/badge collisions directly increase perceived reliability (`https://lawsofux.com/aesthetic-usability-effect/`).

---

## 3. Craft & Interaction Polish (Linear / Stripe / Apple HIG / Things)
Sources: [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) · [Material Design 3](https://m3.material.io/) · [Linear Method & Craft](https://linear.app/) · [Stripe Design](https://stripe.com/)

- [ ] **Above-the-Fold Clarity per Tab:** Clicking a tab (`Overview`, `Sources`, `BOM`, `Print Files`, `Instructions`, `Exploded View`) must immediately present that tab's primary interactive artifact above the fold — never bury the main view below 1,000px of repeated panels.
- [ ] **Cross-Linked Interactive Affordances:** Every part chip (`PRT-01`, `OTS-01`, `PUMP-5V`) across Overview, Sources, BOM, Print Files, and 3D views should act as an interactive portal (hover highlight + click to inspect or switch tab).
- [ ] **Intentional Motion & Autoplay Restraint:** Step-by-step instructional players should start at **Step 1** (or offer a clear restart/play state) rather than silently advancing to Step 4 in the background before the user even sees the canvas.
- [ ] **Z-Index & Viewport Discipline:** 3D HTML overlays (`@react-three/drei` `<Html>`) must never bleed on top of HUD cards, modals, or sticky navigation bars.
- [ ] **Zero Truncation Bugs on Desktop & Mobile:** Placeholders, headings, and select dropdowns must fit their containers cleanly at both `1440×900` desktop and `390×844` mobile viewports.

---

## 4. Accessibility (WCAG 2.2 AA)
Source: [W3C Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)

- [ ] **Contrast Minimum (1.4.3 & 1.4.11):** Body text ≥ 4.5:1, large display text and UI components ≥ 3:1 against dark obsidian/vellum backgrounds.
- [ ] **Focus Visible & Not Obscured (2.4.7 & 2.4.11):** Keyboard focus rings must be clearly visible in gilded gold (`focus-visible:ring`) and never hidden behind sticky headers or 3D overlays.
- [ ] **Target Size Minimum (2.5.8):** Interactive controls have at least `24×24 CSS px` target size (`44×44 CSS px` recommended on mobile).
- [ ] **Semantic Landmarks & ARIA:** Proper `tablist`/`tab`/`tabpanel` roles, `aria-selected`, `aria-expanded` on collapsible sections, and `prefers-reduced-motion` support.

---

## 5. Onboarding, Empty, Loading, Error & Action States
Sources: [NN/g Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) · [Apple HIG — Loading & Feedback](https://developer.apple.com/design/human-interface-guidelines/loading)

- [ ] **Onboarding / Zero-Friction Entry:** One-click sample presets + instant URL/photo drop in the hero command bar.
- [ ] **Empty Filter States:** Hide or disable 0-count filter pills (or explain why a category has 0 items) rather than cluttering filter bars with dead 0-item tabs.
- [ ] **Skeleton & Streaming States:** Smooth gilded shimmer skeletons and live SSE agent progress without layout shift.
- [ ] **Actionable Utilities:** Users building a project need practical tools: "I already own this" BOM cost checkboxes, CSV/Markdown BOM export, and one-click shareable deep links to specific tabs (`?tab=bom`, `?tab=print`).

---

## 6. Performance & Core Web Vitals
Source: [Google web.dev — Core Web Vitals](https://web.dev/articles/vitals)

- [ ] **LCP (< 2.5s):** Prioritize hero text and lightweight WebP/SVG assets; lazy-load heavy Three.js/WebGL canvases until their tab or viewport is active.
- [ ] **CLS (< 0.1):** Reserve explicit heights for 3D viewports, video teardown players, and async "Recent Builds" sections so page layout never jumps after hydration.
- [ ] **INP (< 200ms):** Keep tab transitions, BOM filtering, and plate re-packing responsive without blocking the main thread.
- [ ] **Zero Broken Assets:** Ensure `favicon.ico` / app icon, STL routes, and frame thumbnails return HTTP 200 with zero console 404 errors.
