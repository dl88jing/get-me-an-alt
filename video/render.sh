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
    -f lavfi -i "color=c=#14100b:s=1920x1080:r=10:d=50" \
    -c:v libx264 -pix_fmt yuv420p -preset ultrafast -crf 28 \
    "$SCRIPT_DIR/assets/recording.mp4"
fi

# Synthesize Kokoro TTS narration if audio tracks are missing or --tts is passed
if [[ "${1:-}" == "--tts" || ! -f "$SCRIPT_DIR/assets/audio/scene-1.wav" ]]; then
  echo "==> [0/4] Synthesizing Kokoro TTS narration tracks (voice: af_heart)..."
  declare -a SCENE_TEXTS=(
    "Bespoke gadgets are wildly overpriced. Paste any link, photo, or video—or pick a showcase build."
    "In Mission Control, a team of Gemini 4 Argon managed agents researches, designs, critiques, prices, and generates printable CAD."
    "A hundred-and-forty-nine-dollar smart waterer costs just twenty-four eighty-five—saving eighty-three percent—with live retailer links, packed 3MF plates, or print-service delivery."
    "Step through the animated IKEA-style 3D assembly player, or orbit and scrub the interactive exploded 3D view."
    "Need changes? Ask Argon to make it twenty percent taller, and it selectively re-runs only the affected agents."
    "Print it, assemble it, modify it by chat. Get Me An Alt—live at get-me-an-alt dot vercel dot app."
  )
  declare -a SCENE_DURS=(6.400 9.323 11.605 7.552 6.955 6.272)
  for idx in 0 1 2 3 4 5; do
    num=$((idx + 1))
    wav="$SCRIPT_DIR/assets/audio/scene-${num}.wav"
    if ! env -u HTTPS_PROXY -u HTTP_PROXY npx hyperframes tts "${SCENE_TEXTS[$idx]}" -v af_heart -o "$wav" >/dev/null 2>&1; then
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
OUT_V3_MP4="$OUT_DIR/get-me-an-alt-v3-60s.mp4"
SHARED_V3_MP4="/workspace/work/out/get-me-an-alt-v3-60s.mp4"
FRAMES_DIR="$OUT_DIR/frames"
SHARED_SHOTS_DIR="/workspace/work/shots"

mkdir -p "$OUT_DIR" "$FRAMES_DIR" "/workspace/work/out" "$SHARED_SHOTS_DIR"

echo "==> [1/4] Linting HyperFrames composition..."
npx hyperframes lint .

echo "==> [2/4] Rendering 60s presentation video to $SHARED_V3_MP4 (fps=$FPS, quality=$QUALITY, workers=$WORKERS)..."
TMP_RENDER_MP4="/tmp/gma-presentation-v3-60s.mp4"
rm -f "$TMP_RENDER_MP4"
npx hyperframes render . \
  -f "$FPS" \
  -q "$QUALITY" \
  --no-low-memory-mode \
  -w "$WORKERS" \
  -o "$TMP_RENDER_MP4" < /dev/null

cp -f "$TMP_RENDER_MP4" "$OUT_MP4"
cp -f "$TMP_RENDER_MP4" "$OUT_V3_MP4"
cp -f "$TMP_RENDER_MP4" "$SHARED_V3_MP4"

echo "==> [3/4] Verifying duration <= 60.0s (target 55-60s) with ffprobe..."
DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SHARED_V3_MP4")"
echo "    Rendered duration: ${DURATION}s"

awk -v d="$DURATION" 'BEGIN {
  if (d <= 0 || d > 60.0) {
    printf("ERROR: Video duration %.2fs exceeds 60.0s hard limit (or is invalid)!\n", d) > "/dev/stderr";
    exit 1;
  }
}'
echo "    PASS: ${DURATION}s <= 60.0s"

echo "==> [4/4] Extracting 4 verification frames to $SHARED_SHOTS_DIR/v3-*.png..."
ffmpeg -y -v error -ss 12 -i "$SHARED_V3_MP4" -frames:v 1 "$SHARED_SHOTS_DIR/v3-1-mission-control.png"
ffmpeg -y -v error -ss 25 -i "$SHARED_V3_MP4" -frames:v 1 "$SHARED_SHOTS_DIR/v3-2-bom-print.png"
ffmpeg -y -v error -ss 36 -i "$SHARED_V3_MP4" -frames:v 1 "$SHARED_SHOTS_DIR/v3-3-three-exploded.png"
ffmpeg -y -v error -ss 46 -i "$SHARED_V3_MP4" -frames:v 1 "$SHARED_SHOTS_DIR/v3-4-ask-argon-modify.png"

cp -f "$SHARED_SHOTS_DIR/v3-1-mission-control.png" "$FRAMES_DIR/frame-1-mission-control.png"
cp -f "$SHARED_SHOTS_DIR/v3-2-bom-print.png"       "$FRAMES_DIR/frame-2-bom-savings.png"
cp -f "$SHARED_SHOTS_DIR/v3-3-three-exploded.png"  "$FRAMES_DIR/frame-3-print-panel.png"
cp -f "$SHARED_SHOTS_DIR/v3-4-ask-argon-modify.png" "$FRAMES_DIR/frame-4-exploded-3d.png"

ls -lh "$SHARED_V3_MP4" "$SHARED_SHOTS_DIR"/v3-*.png
echo "==> Done! Presentation video v3 (60s) ready at $SHARED_V3_MP4"
