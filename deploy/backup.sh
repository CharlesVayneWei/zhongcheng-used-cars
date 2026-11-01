#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/etc/zhongcheng-used-cars.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/zhongcheng}"
UPLOAD_DIR="${UPLOAD_DIR:-/var/lib/zhongcheng/uploads}"

case "$BACKUP_DIR" in
  /var/backups/zhongcheng|/var/backups/zhongcheng/*) ;;
  *) echo "Refusing unsafe BACKUP_DIR: $BACKUP_DIR" >&2; exit 1 ;;
esac

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$BACKUP_DIR/$timestamp"
install -d -m 0700 "$destination"

export PGDATABASE="$DATABASE_URL"
pg_dump --format=custom --no-owner --file="$destination/zhongcheng_db.dump"
tar -C "$UPLOAD_DIR" -czf "$destination/uploads.tar.gz" .
sha256sum "$destination/zhongcheng_db.dump" "$destination/uploads.tar.gz" > "$destination/SHA256SUMS"

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf -- {} +
echo "Backup completed: $destination"
