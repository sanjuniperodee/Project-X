#!/usr/bin/env bash
# Daily dump of the Project X databases on the server (cron of srv, see deploy/README.md). Photos live in S3.
# Keeps 14 days in ~/px/backups; restore: gunzip -c <file> | psql -h 127.0.0.1 -U px -d <db>
set -euo pipefail
ROOT=$HOME/px
DEST=$ROOT/backups
mkdir -p "$DEST"
PGPASSWORD=$(grep '^POSTGRES_PASSWORD=' "$ROOT/.env" | cut -d= -f2-)
export PGPASSWORD
STAMP=$(date +%Y%m%d-%H%M)
for db in px_projects px_payments px_sales; do
  pg_dump -h 127.0.0.1 -U px --no-owner "$db" | gzip -9 > "$DEST/$db-$STAMP.sql.gz.part"
  mv "$DEST/$db-$STAMP.sql.gz.part" "$DEST/$db-$STAMP.sql.gz"
done
find "$DEST" -name '*.sql.gz' -mtime +14 -delete
echo "$(date -Is) backup ok: $(ls "$DEST" | wc -l) files"
