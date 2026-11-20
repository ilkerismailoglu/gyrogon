#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[gyrogon-mobile] Building workspace (@gyrogon/game-core + @gyrogon/frontend)..."
pnpm --filter @gyrogon/game-core build
pnpm --filter @gyrogon/frontend build

cd "$ROOT_DIR/frontend"

if [ ! -d "ios" ] && [ "${SKIP_IOS:-0}" != "1" ]; then
  echo "[gyrogon-mobile] Initializing iOS Capacitor project..."
  pnpm exec cap add ios || echo "[gyrogon-mobile] Note: Install @capacitor/ios first (pnpm --filter @gyrogon/frontend add @capacitor/ios)"
fi

if [ ! -d "android" ] && [ "${SKIP_ANDROID:-0}" != "1" ]; then
  echo "[gyrogon-mobile] Initializing Android Capacitor project..."
  pnpm exec cap add android || echo "[gyrogon-mobile] Note: Install @capacitor/android first (pnpm --filter @gyrogon/frontend add @capacitor/android)"
fi

echo "[gyrogon-mobile] Syncing Capacitor web bundle..."
pnpm exec cap sync
echo "[gyrogon-mobile] Done. Open Xcode (npx cap open ios) or Android Studio (npx cap open android)."
