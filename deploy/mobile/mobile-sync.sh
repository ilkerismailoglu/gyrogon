#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[hexacore-mobile] Building workspace (@hexacore/game-core + @hexacore/frontend)..."
pnpm --filter @hexacore/game-core build
pnpm --filter @hexacore/frontend build

cd "$ROOT_DIR/frontend"

if [ ! -d "ios" ] && [ "${SKIP_IOS:-0}" != "1" ]; then
  echo "[hexacore-mobile] Initializing iOS Capacitor project..."
  pnpm exec cap add ios || echo "[hexacore-mobile] Note: Install @capacitor/ios first (pnpm --filter @hexacore/frontend add @capacitor/ios)"
fi

if [ ! -d "android" ] && [ "${SKIP_ANDROID:-0}" != "1" ]; then
  echo "[hexacore-mobile] Initializing Android Capacitor project..."
  pnpm exec cap add android || echo "[hexacore-mobile] Note: Install @capacitor/android first (pnpm --filter @hexacore/frontend add @capacitor/android)"
fi

echo "[hexacore-mobile] Syncing Capacitor web bundle..."
pnpm exec cap sync
echo "[hexacore-mobile] Done. Open Xcode (npx cap open ios) or Android Studio (npx cap open android)."
