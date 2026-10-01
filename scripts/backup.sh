#!/bin/sh
# Sao lưu data/ (chạy trên máy chủ). Bản nén nằm ở data/backups; nếu đặt BACKUP_RCLONE_REMOTE trong .env
# (ví dụ gdrive:musidiscord) và đã cài rclone thì đẩy lên đó luôn.
set -eu
cd "$(dirname "$0")/.."

docker compose exec -T bot node --disable-warning=ExperimentalWarning scripts/backup.js

remote=""
if [ -f .env ]; then
  remote=$(grep -E '^BACKUP_RCLONE_REMOTE=' .env | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
fi
if [ -n "$remote" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy data/backups "$remote" --include "musidiscord-*.tar.gz"
  echo "Đã đẩy bản sao lưu lên $remote"
fi
