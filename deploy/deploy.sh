#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env.production" ]; then
  echo "[hexacore-deploy] ERROR: .env.production not found. Copy .env.production.example to .env.production first."
  exit 1
fi

set -a
# shellcheck source=/dev/null
source .env.production
set +a

echo "[hexacore-deploy] 1/5 Pulling latest code..."
if [ -d ".git" ]; then
  git pull --ff-only || true
fi

echo "[hexacore-deploy] 2/5 Building production Docker images..."
docker compose -f docker-compose.prod.yml --env-file .env.production build

echo "[hexacore-deploy] 3/5 Starting database and Redis..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis

echo "[hexacore-deploy] 4/5 Running Drizzle migrations and idempotent seed..."
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend node dist/db/migrate.js
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm backend node dist/db/seed.js

echo "[hexacore-deploy] 5/5 Rolling out backend, frontend, nginx, and backup services..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --remove-orphans

sleep 3
echo "[hexacore-deploy] Verifying health endpoint..."
curl -fsS http://127.0.0.1/api/health && echo ""
echo "[hexacore-deploy] Deployment complete!"
