#!/bin/sh
# Self-update from GitHub (run on the host, e.g. from a systemd timer):
#   fetch new commits -> accept fast-forward only -> rebuild -> wait for the bot to be "healthy" -> roll back to the old version on failure.
set -eu
cd "$(dirname "$0")/.."

CONTAINER="${BOT_CONTAINER:-musidiscord-bot}"
WAIT_SECONDS="${UPDATE_WAIT_SECONDS:-180}"

exec 9>"${TMPDIR:-/tmp}/musidiscord-update.lock"
if ! flock -n 9; then
  echo "Another update is already running, skipping."
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
  echo "There are uncommitted changes in the working directory, not updating."
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
old=$(git rev-parse HEAD)
git fetch --quiet origin "$branch"
new=$(git rev-parse "origin/$branch")

if [ "$old" = "$new" ]; then
  echo "Already up to date ($(git rev-parse --short HEAD))."
  exit 0
fi

git merge --ff-only "origin/$branch"
notify "Updating $(git rev-parse --short "$old") -> $(git rev-parse --short "$new")"

docker compose up -d --build
if wait_healthy; then
  notify "Update complete: now on $(git rev-parse --short "$new")."
  exit 0
fi

notify "Version $(git rev-parse --short "$new") is unhealthy after ${WAIT_SECONDS}s, rolling back to $(git rev-parse --short "$old")."
git reset --hard "$old"
docker compose up -d --build
if wait_healthy; then
  notify "Rolled back to the old version, the bot is running normally."
else
  notify "Rolled back, but the bot is still unhealthy; manual check needed (docker compose logs bot)."
fi
exit 1
