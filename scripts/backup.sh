#!/bin/sh
# Back up data/ (run on the host). The archive goes to data/backups; if BACKUP_RCLONE_REMOTE is set in .env
# (e.g. gdrive:musidiscord) and rclone is installed, it is also uploaded there.
set -eu
cd "$(dirname "$0")/.."

docker compose exec -T bot node --disable-warning=ExperimentalWarning scripts/backup.js

remote=""
if [ -f .env ]; then
  remote=$(grep -E '^BACKUP_RCLONE_REMOTE=' .env | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
fi
if [ -n "$remote" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy data/backups "$remote" --include "musidiscord-*.tar.gz"
  echo "Backup uploaded to $remote"
fi
