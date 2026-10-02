#!/bin/sh
# One-command installer for a Raspberry Pi (Raspberry Pi OS, Debian, Kali) or any Debian-based Linux box.
#
#   curl -fsSL https://raw.githubusercontent.com/nhaajtt/musiDISCORD/main/scripts/install-pi.sh | sh
#   sh scripts/install-pi.sh [--tft] [--timers] [--yes] [--dry-run]
#
# It installs Docker and git, fetches the project, writes .env (asking for your bot token and application ID),
# starts the bot with Lavalink, registers the slash commands and optionally sets up the 3.5" TFT screen and the
# daily backup / auto-update timers. It never overwrites an existing .env and is safe to run again.
#
# Flags:   --tft       set up the SPI TFT screen (edits /boot/firmware/config.txt, needs a reboot)
#          --timers    install the daily backup and auto-update systemd timers
#          --yes       don't ask questions (reads DISCORD_TOKEN, CLIENT_ID, GUILD_ID, TIMEZONE from the environment)
#          --dry-run   print what would be done without changing anything
set -eu

REPO_URL="${REPO_URL:-https://github.com/nhaajtt/musiDISCORD.git}"
TARGET_DIR="${TARGET_DIR:-$HOME/musiDISCORD}"
WANT_TFT=ask
WANT_TIMERS=ask
ASSUME_YES=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --tft) WANT_TFT=yes ;;
    --timers) WANT_TIMERS=yes ;;
    --yes|-y) ASSUME_YES=1; [ "$WANT_TFT" = ask ] && WANT_TFT=no; [ "$WANT_TIMERS" = ask ] && WANT_TIMERS=yes ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}

# Questions come from the terminal even when the script itself is piped into sh
if [ -t 0 ]; then TTY=/dev/stdin; elif [ -r /dev/tty ]; then TTY=/dev/tty; else TTY=""; fi

ask() { # ask "Question" default -> sets REPLY
  if [ "$ASSUME_YES" = 1 ] || [ -z "$TTY" ]; then REPLY="$2"; return; fi
  printf '%s ' "$1" >&2
  read -r REPLY < "$TTY" || REPLY=""
  [ -n "$REPLY" ] || REPLY="$2"
}

ask_secret() { # like ask, but nothing is echoed
  if [ "$ASSUME_YES" = 1 ] || [ -z "$TTY" ]; then REPLY="$2"; return; fi
  printf '%s ' "$1" >&2
  stty -echo < "$TTY" 2>/dev/null || true
  read -r REPLY < "$TTY" || REPLY=""
  stty echo < "$TTY" 2>/dev/null || true
  printf '\n' >&2
  [ -n "$REPLY" ] || REPLY="$2"
}

yes_no() { # yes_no "Question [y/N]" default(y|n) -> returns 0 for yes
  ask "$1" "$2"
  case "$REPLY" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
  else od -An -N16 -tx1 /dev/urandom | tr -d ' \n'; fi
}

# ---------------------------------------------------------------- checks

USER="${USER:-$(id -un)}"

# Dry runs skip these checks so the script can be previewed on any machine
if [ "$DRY_RUN" = 0 ]; then
[ "$(uname -s)" = Linux ] || { echo "This installer is for Linux (a Raspberry Pi or similar)." >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || { echo "Run this as your normal user, not root (it uses sudo when needed)." >&2; exit 1; }
command -v sudo >/dev/null 2>&1 || { echo "sudo is required." >&2; exit 1; }
command -v apt-get >/dev/null 2>&1 || { echo "This installer needs apt (Debian, Raspberry Pi OS, Ubuntu, Kali)." >&2; exit 1; }
fi

case "$(uname -m)" in
  aarch64|arm64|x86_64|amd64) ;;
  *) echo "Warning: unusual CPU ($(uname -m)); the Docker images are published for arm64 and amd64." >&2 ;;
esac

# ---------------------------------------------------------------- packages

say "Installing Docker, git and curl"
NEED=""
command -v docker >/dev/null 2>&1 || NEED="$NEED docker.io"
command -v git >/dev/null 2>&1 || NEED="$NEED git"
command -v curl >/dev/null 2>&1 || NEED="$NEED curl"
if [ -n "$NEED" ]; then
  run sudo apt-get update
  # shellcheck disable=SC2086
  run sudo apt-get install -y $NEED
fi

if ! docker compose version >/dev/null 2>&1 && ! sudo docker compose version >/dev/null 2>&1; then
  # The package name depends on the distribution release
  run sudo apt-get install -y docker-compose-v2 \
    || run sudo apt-get install -y docker-compose-plugin \
    || { echo "Could not install Docker Compose v2. Install it by hand and run this again." >&2; exit 1; }
fi

run sudo systemctl enable --now docker

# If the user is not in the docker group yet (fresh install), use sudo for this run
DOCKER="docker"
if [ "$DRY_RUN" = 0 ] && ! docker info >/dev/null 2>&1; then DOCKER="sudo docker"; fi
if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  run sudo usermod -aG docker "$USER"
  echo "Added $USER to the docker group (takes effect the next time you log in)."
fi

# ---------------------------------------------------------------- project files

if [ -f docker-compose.yml ] && [ -d src ]; then
  TARGET_DIR="$(pwd)"
elif [ -d "$TARGET_DIR/.git" ]; then
  say "Updating $TARGET_DIR"
  run git -C "$TARGET_DIR" pull --ff-only
else
  say "Downloading the project to $TARGET_DIR"
  run git clone "$REPO_URL" "$TARGET_DIR"
fi
if [ "$DRY_RUN" = 0 ]; then cd "$TARGET_DIR"; fi
mkdir -p music data 2>/dev/null || true

# ---------------------------------------------------------------- .env

set_env() { # set_env KEY VALUE: replace the KEY= line of .env, or append it
  [ "$DRY_RUN" = 1 ] && { printf '[dry-run] set %s in .env\n' "$1"; return; }
  grep -v "^$1=" .env > .env.tmp || true
  printf '%s=%s\n' "$1" "$2" >> .env.tmp
  mv .env.tmp .env
}

if [ -f .env ] && grep -Eq '^DISCORD_TOKEN=.+' .env; then
  say "Keeping the existing .env"
else
  say "Configuring the bot"
  echo "Create an application at https://discord.com/developers/applications, add a Bot, then copy:"
  echo "  - the bot Token (Bot tab > Reset Token)"
  echo "  - the Application ID (General Information tab)"
  TOKEN="${DISCORD_TOKEN:-}"
  CLIENT="${CLIENT_ID:-}"
  while [ -z "$TOKEN" ]; do
    ask_secret "Bot token (hidden):" ""
    TOKEN="$REPLY"
    [ -n "$TOKEN" ] || { [ -n "$TTY" ] && [ "$ASSUME_YES" = 0 ] || { echo "DISCORD_TOKEN is required." >&2; exit 1; }; }
  done
  while [ -z "$CLIENT" ]; do
    ask "Application ID:" ""
    CLIENT="$REPLY"
    [ -n "$CLIENT" ] || { [ -n "$TTY" ] && [ "$ASSUME_YES" = 0 ] || { echo "CLIENT_ID is required." >&2; exit 1; }; }
  done
  ask "Server ID for instant slash commands (blank = all servers, can take up to an hour to appear):" "${GUILD_ID:-}"
  GUILD="$REPLY"
  ask "Time zone [Asia/Ho_Chi_Minh]:" "${TIMEZONE:-Asia/Ho_Chi_Minh}"
  ZONE="$REPLY"

  if [ "$DRY_RUN" = 0 ] && [ ! -f .env ]; then cp .env.example .env; fi
  set_env DISCORD_TOKEN "$TOKEN"
  set_env CLIENT_ID "$CLIENT"
  set_env GUILD_ID "$GUILD"
  set_env TIMEZONE "$ZONE"
  set_env LAVALINK_PASSWORD "$(random_hex)"
  set_env AUTOSAVE_SECONDS 0
  set_env DISPLAY_PORT 8787
  set_env DISPLAY_TOKEN "$(random_hex)"
  [ "$DRY_RUN" = 1 ] || chmod 600 .env
fi

# ---------------------------------------------------------------- start

say "Building and starting the bot (the first build takes a few minutes)"
run $DOCKER compose up -d --build

say "Waiting for the bot to become healthy"
if [ "$DRY_RUN" = 0 ]; then
  waited=0
  while [ "$waited" -lt 240 ]; do
    status=$($DOCKER inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' musidiscord-bot 2>/dev/null || echo missing)
    [ "$status" = healthy ] && break
    sleep 5
    waited=$((waited + 5))
  done
  [ "$status" = healthy ] || echo "The bot is not healthy yet. Check:  $DOCKER compose logs --tail 50"
fi

say "Registering the slash commands"
run $DOCKER compose run --rm bot node src/deploy-commands.js

# ---------------------------------------------------------------- timers

if [ "$WANT_TIMERS" = ask ]; then
  if yes_no "Install daily backups and automatic updates? [Y/n]" y; then WANT_TIMERS=yes; else WANT_TIMERS=no; fi
fi
if [ "$WANT_TIMERS" = yes ]; then
  say "Installing the backup and auto-update timers"
  for unit in backup update; do
    for ext in service timer; do
      src="deploy/pi/musidiscord-$unit.$ext"
      if [ "$DRY_RUN" = 1 ]; then
        printf '[dry-run] install %s as /etc/systemd/system/musidiscord-%s.%s\n' "$src" "$unit" "$ext"
      else
        sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" "$src" | sudo tee "/etc/systemd/system/musidiscord-$unit.$ext" >/dev/null
      fi
    done
    run sudo systemctl daemon-reload
    run sudo systemctl enable --now "musidiscord-$unit.timer"
  done
fi

# ---------------------------------------------------------------- TFT screen

if [ "$WANT_TFT" = ask ]; then
  if yes_no "Do you have the 3.5-inch SPI TFT screen connected? [y/N]" n; then WANT_TFT=yes; else WANT_TFT=no; fi
fi
REBOOT_NEEDED=0
if [ "$WANT_TFT" = yes ]; then
  say "Setting up the TFT screen"
  CONFIG=/boot/firmware/config.txt
  [ -f "$CONFIG" ] || CONFIG=/boot/config.txt
  if [ "$DRY_RUN" = 0 ] && ! grep -q '^dtoverlay=piscreen' "$CONFIG" 2>/dev/null; then
    sudo cp "$CONFIG" "$CONFIG.musidiscord.bak"
    printf '\n# musiDISCORD TFT screen\ndtparam=spi=on\ndtoverlay=piscreen,drm,rotate=90,speed=8000000\n' | sudo tee -a "$CONFIG" >/dev/null
    REBOOT_NEEDED=1
    echo "Added the screen overlay to $CONFIG (backup: $CONFIG.musidiscord.bak)."
  elif [ "$DRY_RUN" = 1 ]; then
    printf '[dry-run] add dtoverlay=piscreen,drm,rotate=90,speed=8000000 to %s\n' "$CONFIG"
  fi
  run sudo apt-get install -y python3-pil python3-evdev python3-numpy python3-venv
  run python3 -m venv --system-site-packages pi/.venv
  if [ "$DRY_RUN" = 0 ]; then
    [ -f pi/display.env ] || cp pi/display.env.example pi/display.env
    token=$(grep -E '^DISPLAY_TOKEN=' .env | head -n1 | cut -d= -f2-)
    grep -v '^DISPLAY_TOKEN=' pi/display.env > pi/display.env.tmp || true
    printf 'DISPLAY_TOKEN=%s\n' "$token" >> pi/display.env.tmp
    mv pi/display.env.tmp pi/display.env
    sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" deploy/pi/musidiscord-display.service | sudo tee /etc/systemd/system/musidiscord-display.service >/dev/null
  else
    echo "[dry-run] write pi/display.env and install the musidiscord-display service"
  fi
  run sudo systemctl daemon-reload
  run sudo systemctl enable --now musidiscord-display.service
fi

# ---------------------------------------------------------------- done

CLIENT_FOR_LINK="${CLIENT:-}"
[ -n "$CLIENT_FOR_LINK" ] || CLIENT_FOR_LINK=$(grep -E '^CLIENT_ID=' .env 2>/dev/null | head -n1 | cut -d= -f2- || true)

say "Done"
echo "Put music files in:  $TARGET_DIR/music   (the bot rescans on its own)"
if [ -n "$CLIENT_FOR_LINK" ]; then
  echo "Invite the bot:      https://discord.com/oauth2/authorize?client_id=$CLIENT_FOR_LINK&scope=bot%20applications.commands&permissions=281474979908608"
fi
echo "Logs:                $DOCKER compose logs -f"
[ "$REBOOT_NEEDED" = 1 ] && echo "Reboot the Pi now to activate the TFT screen:  sudo reboot"
exit 0
