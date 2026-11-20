#!/bin/sh
set -eu

BACKUP_DIR="/backups"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
PG_USER="${POSTGRES_USER:-hexacore}"
PG_DB="${POSTGRES_DB:-hexacore}"
OUT_FILE="${BACKUP_DIR}/hexacore_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[hexacore-backup] Dumping PostgreSQL database ${PG_DB} -> ${OUT_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h postgres -U "$PG_USER" "$PG_DB" | gzip > "$OUT_FILE"

echo "[hexacore-backup] Pruning backups older than 7 days..."
find "$BACKUP_DIR" -type f -name "hexacore_*.sql.gz" -mtime +7 -delete

echo "[hexacore-backup] Done."
