#!/usr/bin/env bash
# Nightly backup of the production database and the uploads volume.
# Install on the server:  cp docker/backup.sh /usr/local/bin/larea-backup && chmod +x /usr/local/bin/larea-backup
# Cron (root):            0 3 * * * /usr/local/bin/larea-backup >> /var/log/larea-backup.log 2>&1
set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/larea/backend}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/larea}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE=(docker compose -f "$STACK_DIR/docker-compose.prod.yml" --env-file "$STACK_DIR/.env.production")
PROJECT="$(grep -E '^name:' "$STACK_DIR/docker-compose.prod.yml" | awk '{print $2}')"
STAMP="$(date +%F-%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$STACK_DIR"

# Database: custom format so pg_restore can restore single tables.
"${COMPOSE[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER:-larea}" -Fc "${POSTGRES_DB:-larea}" > "$BACKUP_DIR/db-$STAMP.dump.tmp"
mv "$BACKUP_DIR/db-$STAMP.dump.tmp" "$BACKUP_DIR/db-$STAMP.dump"

# Uploads: tar the named volume through a throwaway container (the API keeps running).
docker run --rm -v "${PROJECT}_uploads:/data:ro" -v "$BACKUP_DIR:/backup" alpine:3 \
  tar -czf "/backup/uploads-$STAMP.tar.gz.tmp" -C /data public
mv "$BACKUP_DIR/uploads-$STAMP.tar.gz.tmp" "$BACKUP_DIR/uploads-$STAMP.tar.gz"

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $(du -h "$BACKUP_DIR/db-$STAMP.dump" | cut -f1) db, $(du -h "$BACKUP_DIR/uploads-$STAMP.tar.gz" | cut -f1) uploads"
