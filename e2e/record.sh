#!/usr/bin/env bash
set -euo pipefail

E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$E2E_DIR/.." && pwd)"
cd "$ROOT_DIR"

export BASE_URL="${BASE_URL:-http://localhost:3000}"
export NODE_PATH="${ROOT_DIR}/node_modules:${ROOT_DIR}/video/node_modules:${NODE_PATH:-}"

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

echo "==> [3/3] Converting recording to $OUT_MP4 via ffmpeg ..."
ffmpeg -y -v error \
  -i "$WEBM_FILE" \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#090d16,fps=30" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -preset veryfast \
  -crf 22 \
  -movflags +faststart \
  "$OUT_MP4"

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4" || echo "unknown")"
ls -lh "$OUT_MP4"
echo "==> Done! Screen recording saved to $OUT_MP4 (duration: ${DURATION}s)"
echo "    Step screenshots saved to $SCREENSHOTS_DIR/"
