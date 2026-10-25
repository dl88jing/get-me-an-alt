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
SHARED_OUT_DIR="/workspace/work/out"
SHARED_REC_V2="$SHARED_OUT_DIR/recording-v2.mp4"

rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR" "$SCREENSHOTS_DIR" "$(dirname "$OUT_MP4")" "$SHARED_OUT_DIR"

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

WEBM_DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$WEBM_FILE" || echo "78.0")"
MARKERS_JSON="$RESULTS_DIR/markers.json"

# Compute dynamic ffmpeg filter_complex from markers.json + WEBM_DUR so each scene aligns to narration:
# - Scene 2 (28s total: 6s landing + 1s fast-forward nav + 21s Mission Control / Critic / Sources)
# - Scene 3 (24s total: BOM & Retailer Links)
# - Scene 4 (27s total: PrintPanel, 22 Printers, Plate Packer & On-Demand Print Service)
# - Scene 5 (24s total: Three.js IKEA AssemblyPlayer & Three.js ExplodedView)
FILTER_COMPLEX="$(node -e '
const fs = require("fs");
const webmDur = Math.max(20, parseFloat(process.argv[1]) || 78.0);
let m = { t0: 0, tNavStart: 8.5, tProjectLoaded: 10.5, tBomStart: 30.0, tPrintStart: 40.0, tThreeStart: 54.0, tEnd: webmDur };
try {
  if (fs.existsSync(process.argv[2])) {
    m = { ...m, ...JSON.parse(fs.readFileSync(process.argv[2], "utf8")) };
  }
} catch {}
const scale = webmDur / Math.max(10, m.tEnd || webmDur);
const t1 = Math.max(2.0, Math.min(webmDur - 15, m.tNavStart * scale));
const t2 = Math.max(t1 + 0.8, Math.min(webmDur - 12, m.tProjectLoaded * scale));
const t3 = Math.max(t2 + 4.0, Math.min(webmDur - 9, m.tBomStart * scale));
const t4 = Math.max(t3 + 3.0, Math.min(webmDur - 6, m.tPrintStart * scale));
const t5 = Math.max(t4 + 3.0, Math.min(webmDur - 3, m.tThreeStart * scale));
const t6 = webmDur;

const p1 = (6.0 / (t1 - 0)).toFixed(4);
const p2 = (1.0 / (t2 - t1)).toFixed(4);
const p3 = (21.0 / (t3 - t2)).toFixed(4);
const p4 = (24.0 / (t4 - t3)).toFixed(4);
const p5 = (27.0 / (t5 - t4)).toFixed(4);
const p6 = (24.0 / (t6 - t5)).toFixed(4);

console.log([
  `[0:v]scale=1920:1080,split=6[v1][v2][v3][v4][v5][v6]`,
  `[v1]trim=0:${t1.toFixed(2)},setpts=${p1}*(PTS-STARTPTS)[a1]`,
  `[v2]trim=${t1.toFixed(2)}:${t2.toFixed(2)},setpts=${p2}*(PTS-STARTPTS)[a2]`,
  `[v3]trim=${t2.toFixed(2)}:${t3.toFixed(2)},setpts=${p3}*(PTS-STARTPTS)[a3]`,
  `[v4]trim=${t3.toFixed(2)}:${t4.toFixed(2)},setpts=${p4}*(PTS-STARTPTS)[b]`,
  `[v5]trim=${t4.toFixed(2)}:${t5.toFixed(2)},setpts=${p5}*(PTS-STARTPTS)[c]`,
  `[v6]trim=${t5.toFixed(2)}:${t6.toFixed(2)},setpts=${p6}*(PTS-STARTPTS)[d]`,
  `[a1][a2][a3][b][c][d]concat=n=6:v=1:a=0,crop=1360:1020:280:0,eq=gamma=1.18:brightness=0.04:contrast=1.10:saturation=1.16,fps=30[outv]`
].join(";"));
' "$WEBM_DUR" "$MARKERS_JSON")"

echo "==> [3/3] Converting recording to $OUT_MP4 and $SHARED_REC_V2 via ffmpeg ..."
echo "    Filter: $FILTER_COMPLEX"
TMP_REC_MP4="/tmp/gma-recording-v2.mp4"
rm -f "$TMP_REC_MP4"
ffmpeg -y -v error \
  -i "$WEBM_FILE" \
  -filter_complex "$FILTER_COMPLEX" \
  -map "[outv]" \
  -an \
  -c:v libx264 \
  -g 30 -keyint_min 30 \
  -pix_fmt yuv420p \
  -preset veryfast \
  -crf 21 \
  -movflags +faststart \
  "$TMP_REC_MP4"

cp -f "$TMP_REC_MP4" "$OUT_MP4"
cp -f "$TMP_REC_MP4" "$SHARED_REC_V2"

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4" || echo "unknown")"
ls -lh "$OUT_MP4" "$SHARED_REC_V2"
echo "==> Done! Screen recording saved to $OUT_MP4 and $SHARED_REC_V2 (duration: ${DURATION}s)"
echo "    Step screenshots saved to $SCREENSHOTS_DIR/"
