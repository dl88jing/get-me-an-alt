#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="/workspace/work"
PW_CACHE_PERSIST="${WORK_DIR}/ms-playwright"
CHROMELIBS_BASE="${WORK_DIR}/chromelibs"
CHROMELIBS_DEBS="${CHROMELIBS_BASE}/debs"
CHROMELIBS_ROOT="${CHROMELIBS_BASE}/root"

mkdir -p "$PW_CACHE_PERSIST" "$CHROMELIBS_DEBS" "$CHROMELIBS_ROOT"

# 1. Persist / restore Playwright browser cache across sandbox restarts (/home/sandbox gets wiped)
if [[ -d "/home/sandbox/.cache/ms-playwright" ]] && [[ -z "$(ls -A "$PW_CACHE_PERSIST" 2>/dev/null || true)" ]]; then
  cp -rn /home/sandbox/.cache/ms-playwright/. "$PW_CACHE_PERSIST/"
fi

if [[ ! -e "/home/sandbox/.cache/ms-playwright" ]] && [[ -d "$PW_CACHE_PERSIST" ]]; then
  mkdir -p /home/sandbox/.cache
  ln -s "$PW_CACHE_PERSIST" /home/sandbox/.cache/ms-playwright || true
fi

export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$PW_CACHE_PERSIST}"

# 2. Ensure extracted .so files in /workspace/work/chromelibs/root are on LD_LIBRARY_PATH
ARCH_LIB_DIRS=(
  "${CHROMELIBS_ROOT}/usr/lib/aarch64-linux-gnu"
  "${CHROMELIBS_ROOT}/usr/lib/x86_64-linux-gnu"
  "${CHROMELIBS_ROOT}/lib/aarch64-linux-gnu"
  "${CHROMELIBS_ROOT}/lib/x86_64-linux-gnu"
)
for dir in "${ARCH_LIB_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    export LD_LIBRARY_PATH="${dir}:${LD_LIBRARY_PATH:-}"
  fi
done

find_chrome_bin() {
  for candidate in \
    "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" \
    "$PW_CACHE_PERSIST/chromium-1248/chrome-linux-arm64/chrome" \
    "$PW_CACHE_PERSIST/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell" \
    "/home/sandbox/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome" \
    "/home/sandbox/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux-arm64/chrome-headless-shell" \
    "$(find "$PW_CACHE_PERSIST" -type f \( -name "chrome" -o -name "chrome-headless-shell" \) 2>/dev/null | head -n 1 || true)" \
    "$(command -v chromium-browser 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v google-chrome 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

CHROME_BIN="$(find_chrome_bin || true)"
if [[ -z "$CHROME_BIN" ]]; then
  echo "[setup-browser] Installing Playwright Chromium into $PW_CACHE_PERSIST ..."
  npx playwright install chromium chromium-headless-shell
  CHROME_BIN="$(find_chrome_bin || true)"
fi

if [[ -z "$CHROME_BIN" ]]; then
  echo "[setup-browser] ERROR: Could not locate Playwright Chromium binary" >&2
  exit 1
fi

export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROME_BIN"

# 3. Check ldd; if any shared libraries are missing, restore from cached .debs or apt
if ldd "$CHROME_BIN" 2>/dev/null | grep -q "not found"; then
  echo "[setup-browser] Missing shared libraries detected for $CHROME_BIN; restoring..."

  if compgen -G "${CHROMELIBS_DEBS}/*.deb" > /dev/null; then
    for deb in "${CHROMELIBS_DEBS}"/*.deb; do
      dpkg -x "$deb" "$CHROMELIBS_ROOT"
    done
  fi

  if sudo -n true 2>/dev/null; then
    if compgen -G "${CHROMELIBS_DEBS}/*.deb" > /dev/null; then
      sudo -n dpkg -i "${CHROMELIBS_DEBS}"/*.deb >/dev/null 2>&1 || true
    fi
    if ldd "$CHROME_BIN" 2>/dev/null | grep -q "not found"; then
      sudo -n apt-get update -qq
      (
        cd "$CHROMELIBS_DEBS"
        apt-get download libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxdamage1 libatspi2.0-0t64 2>/dev/null || \
          apt-get download libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libatspi2.0-0 2>/dev/null || true
        for deb in *.deb; do
          [[ -f "$deb" ]] && dpkg -x "$deb" "$CHROMELIBS_ROOT"
        done
      )
      sudo -n apt-get install -y --no-install-recommends \
        libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxdamage1 libatspi2.0-0t64 >/dev/null 2>&1 || \
      sudo -n apt-get install -y --no-install-recommends \
        libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libatspi2.0-0 >/dev/null 2>&1 || true
    fi
  fi

  for dir in "${ARCH_LIB_DIRS[@]}"; do
    if [[ -d "$dir" ]]; then
      export LD_LIBRARY_PATH="${dir}:${LD_LIBRARY_PATH:-}"
    fi
  done
fi

if ldd "$CHROME_BIN" 2>/dev/null | grep -q "not found"; then
  echo "[setup-browser] ERROR: Unresolved shared libraries remain:" >&2
  ldd "$CHROME_BIN" | grep "not found" >&2
  exit 1
fi

echo "[setup-browser] Ready: $PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (all shared libs resolved)"
