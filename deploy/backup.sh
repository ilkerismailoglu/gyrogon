#!/bin/sh
set -eu

BACKUP_DIR="/backups"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
PG_USER="${POSTGRES_USER:-gyrogon}"
PG_DB="${POSTGRES_DB:-gyrogon}"
OUT_FILE="${BACKUP_DIR}/gyrogon_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[gyrogon-backup] Dumping PostgreSQL database ${PG_DB} -> ${OUT_FILE}"
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h postgres -U "$PG_USER" "$PG_DB" | gzip > "$OUT_FILE"

echo "[gyrogon-backup] Pruning backups older than 7 days..."
find "$BACKUP_DIR" -type f -name "gyrogon_*.sql.gz" -mtime +7 -delete

echo "[gyrogon-backup] Done."
