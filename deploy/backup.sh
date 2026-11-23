#!/bin/sh
set -eu

BACKUP_DIR="/backups"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
PG_USER="${POSTGRES_USER:-gyrogon}"
PG_DB="${POSTGRES_DB:-gyrogon}"
OUT_FILE="${BACKUP_DIR}/gyrogon_${TIMESTAMP}.sql.gz"
TMP_SQL="${BACKUP_DIR}/.gyrogon_${TIMESTAMP}.sql"
TMP_GZ="${OUT_FILE}.tmp"

mkdir -p "$BACKUP_DIR"

echo "[gyrogon-backup] Dumping PostgreSQL database ${PG_DB} -> ${OUT_FILE}"
rm -f "$TMP_SQL" "$TMP_GZ"
if ! PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h postgres -U "$PG_USER" "$PG_DB" > "$TMP_SQL"; then
  rm -f "$TMP_SQL" "$TMP_GZ"
  echo "[gyrogon-backup] pg_dump failed!" >&2
  exit 1
fi

if [ ! -s "$TMP_SQL" ]; then
  rm -f "$TMP_SQL" "$TMP_GZ"
  echo "[gyrogon-backup] Empty dump produced!" >&2
  exit 1
fi

gzip -c "$TMP_SQL" > "$TMP_GZ"
rm -f "$TMP_SQL"
if [ ! -s "$TMP_GZ" ]; then
  rm -f "$TMP_GZ"
  echo "[gyrogon-backup] gzip failed or empty output!" >&2
  exit 1
fi
mv "$TMP_GZ" "$OUT_FILE"

echo "[gyrogon-backup] Pruning backups older than 7 days..."
find "$BACKUP_DIR" -type f -name "gyrogon_*.sql.gz" -mtime +7 -delete

echo "[gyrogon-backup] Done."
