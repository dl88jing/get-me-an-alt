# Get Me An Alt — Narrated Presentation Video Pipeline (`video/`)

Ready-to-render **HyperFrames (`v0.8.199`) + Kokoro-82M TTS** presentation video pipeline for **Get Me An Alt** (Gemini 4 Argon SF Hackathon).

Once the live web app screen recording is saved to `video/assets/recording.mp4`, run `./render.sh` to produce the narrated `<= 3:00` (`147s` / `2:27`) 1080p MP4 in `video/out/presentation.mp4`.

---

## 1. Environment & Dependencies

Install the local npm package (`hyperframes`) inside `video/` and the Python `kokoro-onnx` + `soundfile` packages used by `npx hyperframes tts`:

```bash
cd video
npm install
pip install kokoro-onnx soundfile
```

On Linux ARM64 (where Chrome Headless Shell uses system/Playwright Chromium), point `HYPERFRAMES_BROWSER_PATH` at the installed Chromium binary (`render.sh` auto-detects this):

```bash
export HYPERFRAMES_BROWSER_PATH="/home/sandbox/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome"
npx hyperframes doctor
```

---

## 2. How HyperFrames Produces Kokoro TTS Narration

HyperFrames includes a built-in `tts` subcommand (`npx hyperframes tts`) powered by **Kokoro-82M** (`kokoro-onnx` + `soundfile`) with default voice `af_heart` (Heart, `en-US`):

```bash
# List all bundled Kokoro-82M voices (af_heart is the default)
npx hyperframes tts --list

# Synthesize narration from text or a .txt file (outputs WAV + duration JSON)
npx hyperframes tts "Bespoke gadgets are expensive. Get Me An Alt builds them for a fraction of the cost." \
  -v af_heart \
  -o assets/audio/sample.wav \
  --json
```

---

## 3. Verified 5-Second Smoke Test (Kokoro TTS + HyperFrames Render to MP4)

Exact working commands verified to synthesize a Kokoro-narrated line and render a 5-second 1920×1080 MP4 composition:

```bash
cd /workspace/work/gma-video/video
export HYPERFRAMES_BROWSER_PATH="/home/sandbox/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome"

# 1. Create a temporary smoke-test project folder and synthesize Kokoro narration (default voice: af_heart)
mkdir -p /tmp/hf-smoke/assets
npx hyperframes tts "Get Me An Alt turns overpriced gadgets into open-source builds." \
  -o /tmp/hf-smoke/assets/narration.wav

# 2. Write a minimal 5-second HyperFrames HTML composition with GSAP + <audio>
cat << 'EOF' > /tmp/hf-smoke/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #090d16; font-family: "Inter", sans-serif; }
      #root { position: relative; width: 1920px; height: 1080px; }
      .clip { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      h1 { color: #f8fafc; font-size: 84px; font-weight: 800; letter-spacing: -0.03em; }
      p { color: #10b981; font-size: 36px; font-weight: 600; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="smoke" data-start="0" data-duration="5" data-width="1920" data-height="1080" data-fps="30">
      <div id="card" class="clip" data-start="0" data-duration="5" data-track-index="0">
        <div id="card-inner" style="text-align: center;">
          <h1>Get Me An Alt</h1>
          <p>Gemini 4 Argon Managed Agents Pipeline</p>
        </div>
      </div>
      <audio id="vo" src="assets/narration.wav" data-start="0.2" data-duration="3.82" data-track-index="1" data-volume="1"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#card-inner", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0);
      window.__timelines["smoke"] = tl;
    </script>
  </body>
</html>
EOF

# 3. Lint and render the 5-second smoke test to MP4
npx hyperframes lint /tmp/hf-smoke
npx hyperframes render /tmp/hf-smoke --quality draft -o /tmp/hf-smoke/smoke.mp4 < /dev/null

# 4. Verify output duration (5.000000s) and streams (h264 + aac) with ffprobe
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,codec_type,width,height \
  -of default=noprint_wrappers=1 /tmp/hf-smoke/smoke.mp4
```

---

## 4. Full Presentation Composition Structure (`147s` / `2:27`)

- `script.md` — Full 6-scene narration script (~335 words, `2:27` total duration) tailored for judges.
- `index.html` — Root HyperFrames composition (`1920×1080`, `147s`) mounting the 6 scene sub-compositions, the trimmed `assets/recording.mp4` viewports across Scenes 2–5, and the 6 Kokoro TTS audio clips.
- `compositions/scene-1.html` .. `compositions/scene-6.html` — Modular scene compositions styled in a dark `#090d16` aesthetic with `#10b981` emerald accents and bold `Inter` + `JetBrains Mono` typography:
  - **Scene 1 (`0s–18s`):** Title Card & Hook — Bespoke Gadgets Cost $129+ vs. $31 Open-Source Alt.
  - **Scene 2 (`18s–46s`):** Demo — Input & Live 6-Stage Gemini 4 Argon Agent Orchestration Timeline (`recording.mp4` `0s–28s`).
  - **Scene 3 (`46s–70s`):** Demo — Bill of Materials (BOM) with Retailer Buy Links & $98 Instant Savings (`recording.mp4` `28s–50s`).
  - **Scene 4 (`70s–97s`):** Demo — Parametric CAD STLs, Min-Plate Packing (Default: Bambu Lab A1) & Print Service Handoff (`recording.mp4` `50s–77s`).
  - **Scene 5 (`97s–121s`):** Demo — Interactive Three.js Exploded 3D View & IKEA-Style Assembly Player (`recording.mp4` `78s–102s`).
  - **Scene 6 (`121s–147s`):** Architecture & Close — Why Managed Agents & Antigravity CLI Shine (Runtime + Build-time).
- `assets/audio/scene-1.wav` .. `scene-6.wav` — Pre-synthesized Kokoro-82M (`af_heart`) voiceover tracks.
- `assets/recording.mp4` — Screen recording clip (placeholder generated via `ffmpeg`; replace with Playwright/browser screen capture of the deployed app before final render).
- `render.sh` — End-to-end build script that lints, renders `out/presentation.mp4`, verifies duration `<= 180s` with `ffprobe`, and extracts 3 verification PNG frames into `out/frames/`.

---

## 5. Rendering the Final Video

```bash
cd video
./render.sh
```

To replace the placeholder clip with a real screen recording first:

```bash
cp /path/to/captured-demo.mp4 video/assets/recording.mp4
cd video && ./render.sh
```
