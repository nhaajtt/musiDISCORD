#!/bin/sh
# Tự cập nhật từ GitHub (chạy trên máy chủ, ví dụ bằng systemd timer):
#   lấy commit mới -> chỉ chấp nhận fast-forward -> dựng lại -> chờ bot "healthy" -> hỏng thì quay về bản cũ.
set -eu
cd "$(dirname "$0")/.."

CONTAINER="${BOT_CONTAINER:-musidiscord-bot}"
WAIT_SECONDS="${UPDATE_WAIT_SECONDS:-180}"

exec 9>"${TMPDIR:-/tmp}/musidiscord-update.lock"
if ! flock -n 9; then
  echo "Đang có lần cập nhật khác chạy, bỏ qua."
  exit 0
fi

notify() {
  url=""
  [ -f .env ] && url=$(grep -E '^ALERT_WEBHOOK_URL=' .env | head -n1 | cut -d= -f2- | tr -d '\r"' || true)
  echo "$1"
  [ -n "$url" ] || return 0
  curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"content\":\"[musiDISCORD] $1\"}" "$url" >/dev/null 2>&1 || true
}

wait_healthy() {
  waited=0
  while [ "$waited" -lt "$WAIT_SECONDS" ]; do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER" 2>/dev/null || echo missing)
    [ "$status" = "healthy" ] && return 0
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Có thay đổi chưa commit trong thư mục, không tự cập nhật."
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
old=$(git rev-parse HEAD)
git fetch --quiet origin "$branch"
new=$(git rev-parse "origin/$branch")

if [ "$old" = "$new" ]; then
  echo "Đã là bản mới nhất ($(git rev-parse --short HEAD))."
  exit 0
fi

git merge --ff-only "origin/$branch"
notify "Đang cập nhật $(git rev-parse --short "$old") -> $(git rev-parse --short "$new")"

docker compose up -d --build
if wait_healthy; then
  notify "Đã cập nhật xong lên $(git rev-parse --short "$new")."
  exit 0
fi

notify "Bản $(git rev-parse --short "$new") không khoẻ sau ${WAIT_SECONDS}s, đang quay về $(git rev-parse --short "$old")."
git reset --hard "$old"
docker compose up -d --build
if wait_healthy; then
  notify "Đã quay về bản cũ, bot chạy bình thường."
else
  notify "Quay về bản cũ nhưng bot vẫn chưa khoẻ, cần kiểm tra thủ công (docker compose logs bot)."
fi
exit 1
