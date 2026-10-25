# Coordination board (all agents: read before starting, pull often, append don't rewrite)


Agent chat: see MESSAGEBOARD.md (append-only). Read it every cycle.
Rule: claim a lane here before working on it; only improve others' work, never redo from scratch. Small commits, `git pull --rebase` before every push.

## Lanes
| Lane | Owner | Paths | Status |
|---|---|---|---|
| App shell, landing, project page tabs, API routes, SSE pipeline orchestration, Vercel deploy | leader | app/, lib/agents/ (orchestrator, analyst, researcher, bom) | — |
| CAD agent: parametric printed-part geometry -> STL/3MF, plate packer (min plates), printer catalog + print-service handoff | hark-superdev (via agy + gemini-4-argon) | lib/cad/, lib/printers.ts, components/print/ | in progress |
| three.js Exploded view panel + IKEA-style animated instructions player | hark-superdev (via agy + gemini-4-argon) | components/three/ | in progress |
| Demo-mode sample object (plant auto-waterer) with full artifacts | hark-superdev | data/demo/ | in progress |
| E2E test (Playwright), screen recording, 3-min narrated video (hyperframes + kokoro) | hark-superdev (leader deploys to Vercel first and posts the URL here) | e2e/, video/ | queued |
| Research agent depth: Researcher + sources tab (videos, schematics, PDFs, open designs, thumbnails/embeds), image/video-link input for Analyst | superdev-muse-solana (via agy + gemini-4-argon) | lib/agents/researcher.ts, components/sources/ | in progress: claimed by superdev-muse-solana 12:38 PT, adapting to leader scaffold, not overwriting it |
| Visual polish + aesthetics: landing hero, BOM cards (retailer logos, savings badge), agent timeline animation, motion/typography, responsive, empty/loading states | superdev-muse-dl88jing (via agy + gemini-4-argon) | components/ui/, components/bom/, app/globals.css | open: claim it |

## Shared contracts (don't break; extend)
- Object artifacts live in `data/objects/<slug>-<id>/`: analysis.json, sources.json, design.json, bom.json, parts/*.stl, plates.json, instructions.json.
- design.json parts: `{ id, name, kind: "printed"|"purchased", dims_mm:[x,y,z], shape, params, position:[x,y,z], rotation:[x,y,z], explode:[x,y,z], color, bomRef? }`
- instructions.json: `{ steps: [{ n, title, partIds:[], tools:[], note, motion:{ partId, from:[x,y,z], to:[x,y,z] }[] }] }`

## Log
- 12:25 PT hark-superdev: claimed CAD/plates, three.js viewers, demo data, e2e/video lanes.
- 12:30 PT leader (gemini-harness): owns app shell, routes, SSE orchestrator, analyst/designer/bom/instructions agents, Vercel. Consumes hark's lib/cad + components/three via the contracts above; will not write lib/cad, components/three, data/demo. Assigned muse-solana (research depth) and muse-dl88jing (visual polish) lanes. Every 10 min the leader reviews this board and queues the next improvement.

## Requirement from Dylan (12:35 PT): video teardown agent (part of the research lane)
When the Researcher finds public teardown, repair, disassembly or fix videos (YouTube etc.) for the object:
1. Ask Gemini 4 Argon, with the video URL passed as `file_data` (Gemini accepts YouTube URLs directly), for the timestamps where individual parts are clearly visible.
2. Grab screenshots at those timestamps: locally with yt-dlp + ffmpeg, and on Vercel with Argon's own timestamped descriptions plus the YouTube thumbnail as a fallback. Save them to `data/objects/<id>/frames/<t>.jpg`.
3. Send each frame to Gemini 4 Argon for a detailed per-part analysis covering part name, function, material, estimated dimensions, fasteners and connectors, likely off-the-shelf equivalent (feeds bom.json), and whether to 3D print or buy it (feeds design.json). Write `teardown.json`: `{ videos:[{url,title}], frames:[{video, t, image, parts:[{name, function, material, dims_mm, fasteners, buyOrPrint, offTheShelfQuery, confidence}]}] }`.
4. UI: a "Teardown" section in the Sources tab with a frame gallery. Clicking a frame shows the part callouts, a link to the video at that timestamp, and links into the matching BOM and design parts.
Owner: superdev-muse-solana if claimed by 12:45 PT, otherwise the leader's agy session takes it.
- 12:36 PT hark-superdev: started video/ pipeline prep on branch hark/video (hyperframes + kokoro smoke test, script.md, render.sh with placeholder recording). cad + viewer jobs still running.
- 12:38 PT superdev-muse-solana: CLAIMED video teardown agent spec (before 12:45 PT deadline) and research-depth lane. Will adapt my standalone depth code into the leader's runner/types researcher contract, add teardown.json + Teardown gallery in Sources tab, and push branch superdev-muse-solana next. Leader: please do not take this lane.
- 12:44 PT leader: posted ambitious parallel assignments on MESSAGEBOARD.md (hark: real OpenSCAD CAD + 3MF + shaders; muse-solana: Price Hunter + savings + 3 showcase objects; muse-dl88jing: Mission Control agent graph + premium landing). Leader next: Critic agent, Ask-Argon modify chat, Vercel, README/submission. Code-freeze 4:15 PT.
- 12:45 PT leader (agy): shipped Next.js app shell (`app/layout.tsx`, `app/page.tsx`, `app/projects/[id]/page.tsx` with 6 tabs + dynamic peer component discovery), API routes (`/api/objects`, `/api/objects/[id]`, `/api/objects/[id]/stream`, `/api/objects/[id]/stl/[filename]`), SSE pipeline orchestrator (`lib/agents/orchestrator.ts`), and `analyst.ts`, `researcher.ts`, `designer.ts`, `bom.ts`, `instructions.ts` with automatic `agy` vs Vercel REST + `/tmp` detection. `pnpm build` green.
- 12:48 PT leader: CLAIMED end-to-end demo-flow verification + Vercel production deploy (`vercel --prod`, GEMINI_API_KEY as Vercel env var), then Critic agent (`lib/agents/critic.ts`). agy session launched.
- 12:56 PT hark-superdev (agy): aligned `lib/cad`, `lib/printers.ts`, and `data/demo/plant-waterer` to shared contracts (`design.json` flat `parts[]` with `kind`/`dims_mm`/`bomRef`, `instructions.json` `motion:{partId,from,to}[]`, `parts/*.stl`, `plates.json`, plus dual-schema adapters in `lib/cad/adapters.ts`).
- 12:49 PT superdev-muse-solana: Adapted research-depth into leader's `lib/agents/researcher.ts` (`runResearcherAgent` + `lib/agents/researcher-depth.ts` client-safe helpers `parseInput`, `getEmbedUrl`, `getThumbnail`, honest search fallbacks with `groundingUsed: false`, full 7-kind coverage), built `lib/agents/teardown.ts` (`runTeardownAgent`, `teardown.json` contract, `teardownPartsToBomItems`, `teardownPartsToDesignParts`), and updated `components/sources/{SourcesTab,SourceCard,TeardownGallery}.tsx` for `ResearchData`/`ResearchSource` + interactive teardown frame callouts.
