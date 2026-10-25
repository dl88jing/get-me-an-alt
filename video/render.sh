#!/usr/bin/env bash
set -euo pipefail

# Run from the video/ directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f "$SCRIPT_DIR/../e2e/setup-browser.sh" ]]; then
  # shellcheck source=/dev/null
  source "$SCRIPT_DIR/../e2e/setup-browser.sh"
fi

# Auto-detect headless Chromium on Linux ARM64 if HYPERFRAMES_BROWSER_PATH is not set
if [[ -z "${HYPERFRAMES_BROWSER_PATH:-}" ]]; then
  for candidate in \
    "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" \
    "/workspace/work/ms-playwright/chromium-1248/chrome-linux-arm64/chrome" \
    "/workspace/work/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell" \
    "/home/sandbox/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome" \
    "/home/sandbox/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell" \
    "$(command -v chromium-browser 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v google-chrome 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      export HYPERFRAMES_BROWSER_PATH="$candidate"
      break
    fi
  done
fi

mkdir -p "$SCRIPT_DIR/assets/audio"

# Ensure recording.mp4 exists (either captured via ../e2e/record.sh or fallback test source)
if [[ ! -f "$SCRIPT_DIR/assets/recording.mp4" ]]; then
  echo "==> [0/4] Generating placeholder assets/recording.mp4 (run ../e2e/record.sh for live capture)..."
  ffmpeg -y -v error \
    -f lavfi -i "color=c=#0d1f2d:s=1920x1080:r=10:d=110" \
    -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
    "$SCRIPT_DIR/assets/recording.mp4"
fi

# Synthesize Kokoro TTS narration if audio tracks are missing or --tts is passed
if [[ "${1:-}" == "--tts" || ! -f "$SCRIPT_DIR/assets/audio/scene-1.wav" ]]; then
  echo "==> [0/4] Synthesizing Kokoro TTS narration tracks (voice: af_heart)..."
  declare -a SCENE_TEXTS=(
    "Bespoke gadgets are absurdly overpriced. A commercial smart plant auto-waterer retails for a hundred and forty-nine dollars—yet inside, it is twenty-one dollars of standard pumps, sensors, and tubing wrapped in injection-molded plastic. What if any product link, video, or photo could become an open-source DIY build?"
    "Meet Get Me An Alt. Paste a product link, YouTube video, or gadget photo, and our six-stage Gemini 4 Argon agent pipeline runs through the Antigravity CLI, streaming live to Mission Control. First, the Analyst extracts dimensions and mechanisms. Next, the Researcher combines Google Search grounding with our Video Teardown Agent—inspecting disassembly frames to map every internal part, material, and fastener before the Designer splits printed geometry from purchased hardware."
    "Next, the BOM Agent builds a complete bill of materials for every off-the-shelf component—submersible pump, capacitive moisture probe, ESP32 controller, silicone tubing, and brass inserts—complete with real search links across Amazon, Home Depot, Walmart, McMaster-Carr, and AliExpress. Instead of paying a hundred and forty-nine dollars retail, your entire DIY build costs twenty-four eighty-five—saving a hundred and twenty-four dollars, or eighty-three percent."
    "Meanwhile, the CAD Agent generates watertight parametric STL meshes and multi-plate 3MF bundles, bin-packing all seven printed parts onto the fewest possible build plates. It defaults to the Bambu Lab A1 and re-packs live across more than twenty popular printers from Bambu, Prusa, Creality, Elegoo, Anycubic, and Voron. No 3D printer? One click hands off your STL bundle for instant delivered quotes from Craftcloud, JLC3DP, or Xometry."
    "Ready to assemble? Open the Three.js IKEA-style instructions player, where our Instructions Agent choreographs each step in crisp line-art as parts fly along motion vectors with tool callouts. Then switch to the interactive exploded 3D view—drag the explode slider from zero to a hundred percent, orbit the assembly, and click any part to inspect its dimensions and linked BOM item."
    "Get Me An Alt showcases Managed Agents at two levels: at runtime, six Gemini 4 Argon agents collaborate via the Antigravity CLI through typed JSON, teardown, and STL contracts; at build time, coordinated Antigravity agents engineered our CAD packer, Three.js players, teardown pipeline, and video studio in parallel. Stop overpaying for bespoke hardware—Get Me An Alt."
  )
  declare -a SCENE_DURS=(17.365 27.264 23.509 25.728 22.528 24.469)
  for idx in 0 1 2 3 4 5; do
    num=$((idx + 1))
    wav="$SCRIPT_DIR/assets/audio/scene-${num}.wav"
    if ! npx hyperframes tts "${SCENE_TEXTS[$idx]}" -v af_heart -o "$wav" >/dev/null 2>&1; then
      if [[ ! -f "$wav" ]]; then
        ffmpeg -y -v error -f lavfi -i "anullsrc=r=24000:cl=mono" -t "${SCENE_DURS[$idx]}" "$wav"
      fi
    fi
  done
fi

FPS="${FPS:-10}"
QUALITY="${QUALITY:-draft}"
WORKERS="${WORKERS:-2}"
OUT_DIR="$SCRIPT_DIR/out"
OUT_MP4="$OUT_DIR/presentation.mp4"
FRAMES_DIR="$OUT_DIR/frames"

mkdir -p "$OUT_DIR" "$FRAMES_DIR"

echo "==> [1/4] Linting HyperFrames composition..."
npx hyperframes lint .

echo "==> [2/4] Rendering presentation video to $OUT_MP4 (fps=$FPS, quality=$QUALITY, workers=$WORKERS)..."
npx hyperframes render . \
  -f "$FPS" \
  -q "$QUALITY" \
  --no-low-memory-mode \
  -w "$WORKERS" \
  -o "$OUT_MP4" < /dev/null

echo "==> [3/4] Verifying duration <= 180s with ffprobe..."
DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4")"
echo "    Rendered duration: ${DURATION}s"

awk -v d="$DURATION" 'BEGIN {
  if (d <= 0 || d > 180.0) {
    printf("ERROR: Video duration %.2fs exceeds 180s limit (or is invalid)!\n", d) > "/dev/stderr";
    exit 1;
  }
}'
echo "    PASS: ${DURATION}s <= 180s"

echo "==> [4/4] Extracting 3 verification frames to $FRAMES_DIR/*.png..."
ffmpeg -y -v error -ss 5   -i "$OUT_MP4" -frames:v 1 "$FRAMES_DIR/frame-1-hook.png"
ffmpeg -y -v error -ss 30  -i "$OUT_MP4" -frames:v 1 "$FRAMES_DIR/frame-2-demo.png"
ffmpeg -y -v error -ss 130 -i "$OUT_MP4" -frames:v 1 "$FRAMES_DIR/frame-3-close.png"

ls -lh "$OUT_MP4" "$FRAMES_DIR"/*.png
echo "==> Done! Presentation video ready at $OUT_MP4"
