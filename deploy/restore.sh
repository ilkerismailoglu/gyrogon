#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: ./deploy/restore.sh backups/gyrogon_YYYYMMDD_HHMMSS.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "[gyrogon-restore] File not found: $BACKUP_FILE"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
# shellcheck source=/dev/null
source .env.production
set +a

echo "[gyrogon-restore] Restoring ${BACKUP_FILE} into gyrogon_postgres..."
gunzip -c "$BACKUP_FILE" | docker exec -i gyrogon_postgres psql -U "${POSTGRES_USER:-gyrogon}" -d "${POSTGRES_DB:-gyrogon}"
echo "[gyrogon-restore] Restore finished successfully."
