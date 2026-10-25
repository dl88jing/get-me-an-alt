#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$E2E_DIR/.." && pwd)"
cd "$ROOT_DIR"

export BASE_URL="${BASE_URL:-https://get-me-an-alt.vercel.app}"
export NODE_PATH="${ROOT_DIR}/node_modules:${ROOT_DIR}/video/node_modules:${NODE_PATH:-}"
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy || true

# Ensure headless Chromium + shared libraries are installed & persisted in /workspace/work
# shellcheck source=/dev/null
source "$E2E_DIR/setup-browser.sh"

PW_BIN=""
for bin in \
  "$ROOT_DIR/node_modules/.bin/playwright" \
  "$ROOT_DIR/video/node_modules/.bin/playwright" \
  "$(command -v playwright 2>/dev/null || true)"; do
  if [[ -n "$bin" && -x "$bin" ]]; then
    PW_BIN="$bin"
    break
  fi
done

RESULTS_DIR="$E2E_DIR/test-results"
SCREENSHOTS_DIR="$E2E_DIR/screenshots"
OUT_WEBM="$ROOT_DIR/video/recording.webm"
OUT_ASSETS_WEBM="$ROOT_DIR/video/assets/recording.webm"
OUT_MP4="$ROOT_DIR/video/assets/recording.mp4"

rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR" "$SCREENSHOTS_DIR" "$(dirname "$OUT_MP4")"

echo "==> [1/3] Recording Playwright E2E demo walkthrough against BASE_URL=$BASE_URL ..."
if [[ -n "$PW_BIN" ]]; then
  "$PW_BIN" test -c "$E2E_DIR/playwright.config.ts"
else
  npx playwright test -c "$E2E_DIR/playwright.config.ts"
fi

echo "==> [2/3] Locating recorded .webm video in $RESULTS_DIR ..."
WEBM_FILE="$(find "$RESULTS_DIR" -name "*.webm" -type f | head -n 1 || true)"

if [[ -z "$WEBM_FILE" || ! -f "$WEBM_FILE" ]]; then
  echo "ERROR: No .webm recording found under $RESULTS_DIR" >&2
  exit 1
fi
echo "    Found recording: $WEBM_FILE"
cp -f "$WEBM_FILE" "$OUT_WEBM"
cp -f "$WEBM_FILE" "$OUT_ASSETS_WEBM"
echo "    Saved WebM recordings to $OUT_WEBM and $OUT_ASSETS_WEBM"

echo "==> [3/3] Converting recording to $OUT_MP4 via ffmpeg (segmented setpts alignment) ..."
# Speed up initial loading/navigation stretches and align each tab section to its narration window:
# - Seg A1 (0.0s..8.0s -> 6.0s): Landing Hero & Paste Product Link (setpts=0.75)
# - Seg A2 (8.0s..10.8s -> 1.0s): Fast-forward page load to Demo Project (setpts=0.36)
# - Seg A3 (10.8s..31.5s -> 21.0s): Mission Control 6-stage timeline, Overview, Sources (setpts=1.01)
# - Seg B  (31.5s..38.8s -> 24.0s): BOM & Retailer Links tab (setpts=3.28)
# - Seg C  (38.8s..49.0s -> 27.0s): Print Files, Plate Packer & On-Demand Print Quote (setpts=2.65)
# - Seg D  (49.0s..73.7s -> 24.0s): Instructions Step Player & Exploded View Assembly Graph (setpts=0.97)
ffmpeg -y -v error \
  -i "$WEBM_FILE" \
  -filter_complex "\
[0:v]scale=1920:1080,split=6[v1][v2][v3][v4][v5][v6];\
[v1]trim=0:8.0,setpts=0.75*(PTS-STARTPTS)[a1];\
[v2]trim=8.0:10.8,setpts=0.36*(PTS-STARTPTS)[a2];\
[v3]trim=10.8:31.5,setpts=1.01*(PTS-STARTPTS)[a3];\
[v4]trim=31.5:38.8,setpts=3.28*(PTS-STARTPTS)[b];\
[v5]trim=38.8:49.0,setpts=2.65*(PTS-STARTPTS)[c];\
[v6]trim=49.0:73.7,setpts=0.97*(PTS-STARTPTS)[d];\
[a1][a2][a3][b][c][d]concat=n=6:v=1:a=0,crop=1242:1080:339:0,fps=30[outv]" \
  -map "[outv]" \
  -an \
  -c:v libx264 \
  -g 30 -keyint_min 30 \
  -pix_fmt yuv420p \
  -preset veryfast \
  -crf 22 \
  -movflags +faststart \
  "$OUT_MP4"

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4" || echo "unknown")"
ls -lh "$OUT_MP4"
echo "==> Done! Screen recording saved to $OUT_MP4 (duration: ${DURATION}s)"
echo "    Step screenshots saved to $SCREENSHOTS_DIR/"
