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
SHARED_REC_V3_FULL="$SHARED_OUT_DIR/recording-v3-full.mp4"

rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR" "$SCREENSHOTS_DIR" "$(dirname "$OUT_MP4")" "$SHARED_OUT_DIR"

echo "==> [1/4] Recording Playwright E2E demo walkthrough against BASE_URL=$BASE_URL ..."
if [[ -n "$PW_BIN" ]]; then
  "$PW_BIN" test -c "$E2E_DIR/playwright.config.ts" "$E2E_DIR/demo.spec.ts"
else
  npx playwright test -c "$E2E_DIR/playwright.config.ts" "$E2E_DIR/demo.spec.ts"
fi

echo "==> [2/4] Locating recorded .webm video in $RESULTS_DIR ..."
WEBM_FILE="$(find "$RESULTS_DIR" -name "*.webm" -type f | head -n 1 || true)"

if [[ -z "$WEBM_FILE" || ! -f "$WEBM_FILE" ]]; then
  echo "ERROR: No .webm recording found under $RESULTS_DIR" >&2
  exit 1
fi
echo "    Found recording: $WEBM_FILE"
cp -f "$WEBM_FILE" "$OUT_WEBM"
cp -f "$WEBM_FILE" "$OUT_ASSETS_WEBM"

echo "==> [3/4] Saving raw full-flow 1920x1080 H.264 recording to $SHARED_REC_V3_FULL ..."
TMP_FULL_MP4="/tmp/gma-recording-v3-full.mp4"
rm -f "$TMP_FULL_MP4"
ffmpeg -y -v error \
  -i "$WEBM_FILE" \
  -vf "scale=1920:1080,fps=30" \
  -an \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -preset veryfast \
  -crf 21 \
  -movflags +faststart \
  "$TMP_FULL_MP4"
cp -f "$TMP_FULL_MP4" "$SHARED_REC_V3_FULL"

WEBM_DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$WEBM_FILE" || echo "80.0")"
MARKERS_JSON="$RESULTS_DIR/markers.json"

# Compute dynamic ffmpeg filter_complex from markers.json + WEBM_DUR so each segment aligns to the 60s (58s) video:
# - Scene 1 (0s - 8s   |  8.0s): Renaissance Landing + Paste URL + Presets
# - Scene 2 (8s - 19s  | 11.0s): Mission Control 9-Agent DAG (~3-4x speed) + Critic + Teardown
# - Scene 3 (19s - 32s | 13.0s): BOM & 83% Savings + PrintPanel 3MF Plates & Print Service
# - Scene 4 (32s - 41s |  9.0s): Three.js IKEA AssemblyPlayer & Interactive ExplodedView
# - Scene 5 (41s - 50s |  9.0s): Ask Argon to Modify ("make it 20% taller") -> Diff Summary
FILTER_COMPLEX="$(node -e '
const fs = require("fs");
const webmDur = Math.max(25, parseFloat(process.argv[1]) || 80.0);
let m = { t0: 0, tMissionStart: 10.0, tBomStart: 32.0, tThreeStart: 50.0, tModifyStart: 64.0, tEnd: webmDur };
try {
  if (fs.existsSync(process.argv[2])) {
    m = { ...m, ...JSON.parse(fs.readFileSync(process.argv[2], "utf8")) };
  }
} catch {}
const scale = webmDur / Math.max(15, m.tEnd || webmDur);
const t1 = Math.max(3.0, Math.min(webmDur - 20, m.tMissionStart * scale));
const t2 = Math.max(t1 + 4.0, Math.min(webmDur - 15, m.tBomStart * scale));
const t3 = Math.max(t2 + 4.0, Math.min(webmDur - 10, m.tThreeStart * scale));
const t4 = Math.max(t3 + 4.0, Math.min(webmDur - 4, m.tModifyStart * scale));
const t5 = webmDur;

const p1 = (8.0 / (t1 - 0)).toFixed(4);
const p2 = (11.0 / (t2 - t1)).toFixed(4);
const p3 = (13.0 / (t3 - t2)).toFixed(4);
const p4 = (9.0 / (t4 - t3)).toFixed(4);
const p5 = (9.0 / (t5 - t4)).toFixed(4);

console.log([
  `[0:v]scale=1920:1080,split=5[v1][v2][v3][v4][v5]`,
  `[v1]trim=0:${t1.toFixed(2)},setpts=${p1}*(PTS-STARTPTS)[s1]`,
  `[v2]trim=${t1.toFixed(2)}:${t2.toFixed(2)},setpts=${p2}*(PTS-STARTPTS)[s2]`,
  `[v3]trim=${t2.toFixed(2)}:${t3.toFixed(2)},setpts=${p3}*(PTS-STARTPTS)[s3]`,
  `[v4]trim=${t3.toFixed(2)}:${t4.toFixed(2)},setpts=${p4}*(PTS-STARTPTS)[s4]`,
  `[v5]trim=${t4.toFixed(2)}:${t5.toFixed(2)},setpts=${p5}*(PTS-STARTPTS)[s5]`,
  `[s1][s2][s3][s4][s5]concat=n=5:v=1:a=0,crop=1440:968:240:0,eq=gamma=1.14:brightness=0.03:contrast=1.08:saturation=1.12,fps=30[outv]`
].join(";"));
' "$WEBM_DUR" "$MARKERS_JSON")"

echo "==> [4/4] Converting speed-edited 50.0s recording to $OUT_MP4 via ffmpeg ..."
echo "    Filter: $FILTER_COMPLEX"
TMP_REC_MP4="/tmp/gma-recording-v3-50s.mp4"
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

FULL_DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SHARED_REC_V3_FULL" || echo "unknown")"
EDIT_DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT_MP4" || echo "unknown")"
ls -lh "$OUT_MP4" "$SHARED_REC_V3_FULL"
echo "==> Done! Raw full-flow recording: $SHARED_REC_V3_FULL (${FULL_DUR}s), edited 50s clip: $OUT_MP4 (${EDIT_DUR}s)"
