# musiDISCORD

A self-hosted Discord music bot built with discord.js and played through Lavalink v4. Its strength is a **private music library**: the bot reads track tags, cover art and lyrics from your `music/` folder and builds features around them (search, albums, music quiz, stats, 24/7 radio...). It can also play from YouTube, SoundCloud and Spotify links.

Website: https://musidiscord.vercel.app (there is also a Vietnamese version of the website). Project devlog (the problems I hit and how I fixed them): [docs/devlog.md](docs/devlog.md).

## Features

- **Smart music library:** reads tags (title, artist, album, genre), guesses from file and folder names when tags are missing, searches without caring about diacritics, plays whole albums or artists, and keeps a separate favorites list per user.
- **`/nhaajt`:** plays the whole library in random order, reshuffles when the round ends and keeps going forever. The shuffle is weighted by the server's 👍/👎 votes and avoids repeating the same artist back to back.
- **"Now Playing" panel (Components V2):** cover art, an accent color taken from the track, an auto-updating progress bar and two rows of buttons (playback controls, 👍 👎 ❤️ 📜).
- **Track title on the voice channel:** writes "Now playing: ..." into the voice channel status automatically.
- **`/radio`:** an endless server radio that learns from the server's 👍/👎, which tracks it plays through and which it skips early, and what it usually plays around the current hour. With `ANALYSIS=on` it also nudges toward a mood that fits the time of day. It survives restarts.
- **Music quiz:** listen to a clip from the library and guess the title, the artist, the release year or a lyric line; answers go through a modal (no message-read permission needed), with hints, a streak counter, a monthly season leaderboard and badges.
- **Search and pick:** `/search` shows up to 10 results as numbered buttons so you can pick one to play.
- **Playlists:** `/playlist` keeps personal playlists (yours, on every server) and shared server playlists, holding local files and online tracks.
- **Audio filters:** `/filter` stacks effects (bass boost, nightcore, vaporwave, 8D, karaoke, tremolo, vibrato, mono) and has separate speed, pitch and 3-band equalizer controls.
- **Fair queue, `/bump` and skip voting** when many people are listening.
- **Stats:** `/mystats`, `/leaderboard`, `/wrapped` (a year-in-review image card drawn like a blueprint, also as a 9:16 story image for Instagram or TikTok) and 10 fun badges.
- **Lyrics:** from a `.lrc` file next to the track, lyrics embedded in the tags, or a LRCLIB lookup, shown karaoke-style with the current line highlighted.
- **Member contributions:** `/contribute` lets people submit their own music files for the bot owner to approve, and `/request` suggests tracks that are not in the library yet and notifies you when they show up. The bot does **not** download music from YouTube or any converter site.
- **Auto-tagging (optional):** tracks without tags are identified by audio fingerprint (AcoustID, MusicBrainz) and filled in with title, artist, album and cover. Tags are stored separately in `data/shared/`, and **your original music files are never modified**.
- **Audio analysis (optional):** estimates tempo, energy and brightness on your own machine to power `/vibe` (mood radio) and `/similar` (tracks like the current one).
- **Multiple bots, status display, Raspberry Pi operations:** run 2 or 3 bots at once, a `/display` page for a 3.5-inch TFT screen, backups, auto-update and Uptime Kuma. See "Running on a Raspberry Pi".
- **24/7:** stays in the channel even when it is empty and after a restart; an optional radio mode plays the library forever.
- **Scaling:** several Lavalink nodes with automatic failover and optional Discord sharding. See "Operations".
- **One-command Raspberry Pi installer:** `scripts/install-pi.sh` sets up Docker, `.env` and the bot in one go. See "Running on a Raspberry Pi".
- **Operations:** queue recovery after a restart, healthcheck, an alert when Lavalink disconnects, and auto-leave when idle (except in 24/7 mode).

## Commands

The bot has 38 slash commands.

| Command | Description |
| --- | --- |
| `/play query [source]` | Play by name or link (track, playlist, album) |
| `/search query [source]` | Show up to 10 results as numbered buttons; pick one to play |
| `/filter effect \| speed \| pitch \| eq \| status \| reset` | Audio filters. `effect` toggles one on or off and effects stack (bass boost, nightcore, vaporwave, 8D, karaoke, tremolo, vibrato, mono); `speed` 0.5-2x with the pitch unchanged; `pitch` 0.5-2x; `eq` sets bass, mid and treble levels from -2 to 10 |
| `/local file` | Play one track from the library (autocomplete by title, artist, album) |
| `/album name [shuffle]`, `/artist name [shuffle]` | Play a whole album or all tracks by an artist |
| `/favorites add \| remove \| list \| play` | Your own favorite tracks |
| `/playlist create \| save \| add \| play [shuffle] \| view \| remove \| delete \| list` | Playlists. `save` stores the current track plus the queue, `add` the current track. Personal playlists are yours on every server; server playlists are shared (editing needs the DJ role if one is set). They hold local files and online tracks, up to 25 playlists per owner and 200 tracks each |
| `/nhaajt` | Play the whole library in random order, looping until `/stop` |
| `/radio` | Endless server radio, ordered by the server's 👍/👎, tracks played through versus skipped early (last 90 days) and what it usually plays around the current hour; with `ANALYSIS=on` it leans toward a mood that fits the time of day (chill at night, steady in the morning, upbeat by day). Survives restarts |
| `/pause`, `/resume`, `/skip`, `/stop`, `/leave` | Basic controls (`/skip` needs a vote when 3 or more people are listening) |
| `/queue`, `/nowplaying` | Show the queue and the current track |
| `/volume`, `/loop`, `/shuffle`, `/remove`, `/seek` | Volume, repeat, shuffle, remove a track, seek |
| `/bump position` | Start a vote to move a track up to play next |
| `/lyrics [live]` | Lyrics of the current track; `live` shows them karaoke-style |
| `/quiz start [mode] \| stop \| top [period]` | Music quiz from the library. `mode`: song (default), artist, release year (exact is full points, within 2 years is partial; needs a year tag) or a lyric line (shows a lyric and plays the clip from there when lyrics are synced). `period`: this month (default), last month, all time. Seasons are calendar months |
| `/mystats`, `/leaderboard`, `/wrapped [year]` | Personal stats, leaderboard, year in review. `/mystats` and `/wrapped` take `format` (card, or story = 9:16, 1080x1920, for Instagram/TikTok stories), `theme` (dark or light) and `private` (only you see it) |
| `/privacy stats \| delete` | Turn off your stats or delete all of your data (including personal playlists) |
| `/247 on [radio] \| off` | 24/7 mode |
| `/contribute submit \| pending \| stats` | Submit your music file for the bot owner to review (off by default) |
| `/request add \| list \| vote \| mine \| remove \| done \| dismiss` | Suggest tracks that are missing, vote, and get notified when they arrive |
| `/vibe mood` | Mood radio: chill, steady, upbeat, hype (needs `ANALYSIS=on`) |
| `/similar [count]` | Queue tracks similar to the current one (needs `ANALYSIS=on`) |
| `/library status \| run \| stop \| review \| forget` | (Bot owner) Auto-tagging and audio analysis |
| `/settings view \| dj-role \| volume \| fair-queue \| vc-status \| contributions` | Administration (needs the Manage Server permission) |
| `/help`, `/stats` | Command guide, bot status |

## Setup

1. Go to https://discord.com/developers/applications, create an application and add a Bot.
2. Copy the **Token** (Bot tab) and the **Application ID**. The bot only uses slash commands, buttons and voice, so it needs no privileged intents.
3. Invite the bot with this link (replace `CLIENT_ID`). The permissions are View Channel, Send Messages, Embed Links, Attach Files, Connect, Speak and Set Voice Channel Status:
   `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot%20applications.commands&permissions=281474979908608`
4. Create a Spotify app at https://developer.spotify.com/dashboard to get a Client ID and Secret (only needed if you want Spotify links).
5. Run `cp .env.example .env` and fill in the values. The required ones are `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `LAVALINK_PASSWORD` and the Spotify keys (the Spotify keys only if you want Spotify links); `.env.example` lists them at the top.

## Music library

Drop music files (`.mp3`, `.flac`, `.wav`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.webm`) into the `music/` folder. No restart is needed; the bot rescans on its own.

- Tags (ID3/Vorbis) are recommended. Files without tags still work: the title comes from the file name, and a name like `Artist - Title` is split into artist and title.
- Organize folders like `music/Artist/Album/01 - Title.mp3` so `/album` and `/artist` work well even without tags.
- Cover art comes from the image embedded in the file or from `cover.jpg` / `folder.jpg` in the folder.
- Lyrics: put `Title.lrc` next to `Title.mp3` (a timestamped LRC file enables karaoke mode).
- You are responsible for the copyright of any music files you put here.

## Member contributions

The `music/` library is shared by every server the bot is in, so the **bot owner** reviews submissions, not individual server admins.

- **Enable:** set `CONTRIBUTIONS=on` in `.env`, restart the bot, then have a server admin run `/settings contributions enabled:true`. The feature is off by default.
- **Submit:** members use `/contribute submit`, attach their file and set `confirm: True` to confirm they own it or are allowed to share it. The bot checks that the file is real audio (up to `CONTRIB_MAX_MB` MB, 10 seconds to 20 minutes), rejects duplicates, and limits each person to 3 pending files and 5 files per day.
- **Review:** the bot owner gets a direct message with Approve / Reject buttons (or uses `/contribute pending`). Approved files move into `music/Contributions/` and show up in `/local`. Files pending for more than 14 days are deleted automatically. The owner is taken from the bot's Discord application, or set `OWNER_IDS`.
- **Requests:** `/request add` takes a track name or a YouTube, Spotify or SoundCloud link. The bot only records it for voting and **never opens or downloads** the link. When a matching file appears in the library (from an approved contribution or because you dropped it into `music/` yourself), everyone who requested or voted for it is notified by direct message.
- The `bot` container may write to `music/` (Lavalink stays read-only); the write path is always forced to stay inside `music/Contributions/`.

## Auto-tagging and analysis

Both are off by default, run in the background one track at a time and pause when the machine is busy (suitable for a Raspberry Pi). They **never modify files in `music/`**: results go to `data/shared/tags.json`, `features.json` and `covers/`.

- **Tagging:** set `AUTOTAG=on` and `ACOUSTID_KEY` (a free key from https://acoustid.org/new-application). For each untagged track, the bot builds a fingerprint with `fpcalc` and asks AcoustID; if that finds nothing, it searches MusicBrainz by file name. A confidence of 85% or higher is applied automatically; anything lower becomes a suggestion for the bot owner to review with `/library review`. Only the fingerprint, the duration (not the music file) and the file name are sent out; see the Privacy page.
- **Analysis:** set `ANALYSIS=on`. ffmpeg decodes the middle 40 seconds of each track, then the bot computes tempo (BPM, only an estimate), energy and brightness and assigns a mood. It takes about 0.2 seconds per track on a PC; the first run on a large library on a Pi can take tens of minutes.
- `/library status` shows progress. Set `LIBRARY_WORKER=off` on secondary bots so only one bot does the background work.

## Running with Docker (VPS)

```bash
docker compose up -d --build
docker compose run --rm bot node src/deploy-commands.js   # register slash commands (run once, and again whenever commands change)
docker compose logs -f
```

On the first run Lavalink downloads its plugins into `lavalink/plugins/`, which takes about a minute. The bot keeps retrying the Lavalink connection while it waits.

## Running locally (bot without Docker)

Run Lavalink on its own through compose (`docker compose up -d lavalink`; this service needs `ports: ["2333:2333"]` added), set `LAVALINK_HOST=localhost` in `.env`, point `MUSIC_DIR` and `DATA_DIR` at real folders, then:

```bash
npm install
npm run deploy-commands
npm start
```

Requires Node.js 22 or newer (it uses the built-in `node:sqlite`, so no extra database is needed).

## Operations

- **Data:** the `data/` folder (mounted outside the container) holds per-server settings, the saved queue, the stats database (`musidiscord.db`), the library cache and `shared/` (tags, audio features, covers). Use `scripts/backup.sh` for a consistent backup (do not copy the `.db` file by hand while the bot is running).
- **Fewer disk writes (Raspberry Pi):** the heartbeat is written to RAM, Lavalink only logs warnings, and Docker logs are size-limited. Set `AUTOSAVE_SECONDS=0` in `.env` to turn off periodic queue saving (the bot still saves when each new track starts and on shutdown). Prefer an SSD/USB drive over an SD card.
- **Queue recovery:** the playback state is saved every 15 seconds and on shutdown; after a restart the bot rejoins the channel and resumes playing if anyone is still listening.
- **24/7:** `/247 on` keeps the bot in the channel; add `radio` to play the library forever, even after a restart.
- **Health checks:** the bot container has a healthcheck (`docker compose ps` shows `healthy`/`unhealthy`). If you set `ALERT_WEBHOOK_URL` (a webhook for a dedicated Discord channel), you get an alert when a Lavalink node goes down.
- **Several Lavalink nodes:** set `LAVALINK_NODES` in `.env` to a comma-separated list of `[id=]host:port[:password[:secure]]`, for example `main=lavalink:2333,backup=lavalink2:2333`, or to a JSON array (use JSON when a password contains `:` or `,`). A node without a password uses `LAVALINK_PASSWORD`. When a node goes down, its players move to another connected node automatically and the owner is alerted through `ALERT_WEBHOOK_URL`; the "Lavalink disconnected" warning only appears when every node is down. Start the second Lavalink with `docker compose --profile ha up -d` (service `lavalink2`, plugins in `lavalink/plugins2`). All nodes must see the same music folder; on separate machines that means shared storage such as NFS.
- **Sharding:** `SHARDS` in `.env`: empty = one shard (enough up to 2,500 servers, Discord's per-shard limit), `auto` = the count Discord recommends, or a number. All shards run inside the one bot process (not separate processes), which is simple but still one Node.js thread. This has not been load-tested against thousands of servers. `/stats` shows the nodes that are up and the shard count.
- **Time zone:** set `TIMEZONE` (default `Asia/Ho_Chi_Minh`) for listening-hour stats and day streaks.
- **Online lyrics:** when a file has no lyrics, the bot sends the title, artist and length to the public LRCLIB service. Set `LYRICS_LOOKUP=off` to disable this.
- **Privacy:** users can turn off their stats with `/privacy stats` and delete their data with `/privacy delete`. The bot does not read message content.

### Capacity and scaling

There are two separate limits, and the numbers below are estimates, not measurements.

- **Discord:** unverified bots are capped at 100 servers. Beyond that the bot needs verification (it uses no privileged intents).
- **Practical:** the real limit is how many servers play music at the same time, which depends on the machine and on Lavalink. On a Raspberry Pi 5 with one node, treat tens of simultaneous servers as a rough expectation; this was not measured. If you run more, raise `_JAVA_OPTIONS=-Xmx512M` for Lavalink. Audio filters and 24/7 mode add CPU load. Beyond one machine, use several Lavalink nodes (above).

## Running on a Raspberry Pi

Both Lavalink and the bot have arm64 builds. Use an SSD over USB instead of an SD card, keep the Pi cooled with a fan, and set `AUTOSAVE_SECONDS=0`.

**One-command installer (Kali or Debian/Raspberry Pi OS):**
```bash
curl -fsSL https://raw.githubusercontent.com/nhaajtt/musiDISCORD/main/scripts/install-pi.sh | sh
# or, from a clone:
sh scripts/install-pi.sh [--tft] [--timers] [--yes] [--dry-run]
```
It installs Docker and git, asks for the bot token and application ID (typed hidden), generates the Lavalink password and the display token, writes `.env` (an existing one is never overwritten), builds and starts the bot, waits until it is healthy and registers the slash commands. Options: `--timers` installs the backup and auto-update timers; `--tft` sets up the 3.5-inch TFT screen (it edits `config.txt` with a backup and needs a reboot); `--yes` runs without prompts and reads `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` and `TIMEZONE` from the environment; `--dry-run` shows what it would do. It is safe to run again.

**Manual install, if you prefer (Kali or Debian/Raspberry Pi OS):**
```bash
sudo apt update && sudo apt install -y docker.io git
docker compose version             # if Compose v2 is missing, install docker-compose-v2 or docker-compose-plugin depending on your release
sudo usermod -aG docker $USER      # log out and back in
git clone https://github.com/nhaajtt/musiDISCORD.git && cd musiDISCORD
cp .env.example .env               # fill in the token, IDs and Lavalink password
docker compose up -d --build
docker compose run --rm bot node src/deploy-commands.js
```
On Kali, remember to change the default password (`passwd`) and enable SSH (`sudo systemctl enable --now ssh`); if Docker has network errors, try `sudo update-alternatives --set iptables /usr/sbin/iptables-legacy`.

**Safe remote access:** install Tailscale, enable the service at boot (on Kali it is `disabled` by default, so it is gone after a reboot if you forget this step), then sign in:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
sudo tailscale up
sudo tailscale set --operator=$USER                              # so `tailscale serve` runs without sudo
tailscale serve --bg --https=443  http://127.0.0.1:8787          # status page
tailscale serve --bg --https=8443 http://127.0.0.1:3001          # Uptime Kuma
```
The first time, `serve` asks you to enable the feature in the Tailscale admin console. The resulting HTTPS address is reachable only from devices on your own Tailscale account.

### Multiple bots at once

Each bot gets its own application and token (Discord Developer Portal), but they share Lavalink and the music folder. Stats, settings and queues are kept separately per bot; tags, audio features and covers are shared and only the main bot writes them.

```bash
cp .env.bot2.example .env.bot2     # fill in its own DISCORD_TOKEN and CLIENT_ID; BOT_NAME is up to you
docker compose --profile multi up -d --build
docker compose run --rm bot2 node src/deploy-commands.js
```
`bot3` works the same way with `.env.bot3`. Only one bot runs by default; each extra bot costs the Pi more RAM and CPU.

### Status display and 3.5-inch TFT

Set `DISPLAY_PORT=8787` and `DISPLAY_TOKEN=<a long random string>` in `.env`, then restart. Docker exposes this port only on the machine running the bot:

- `http://127.0.0.1:8787/display?token=...` is a 480×320 page showing the current track, with ⏯ ⏭ and volume buttons; it also works on a phone or tablet (over Tailscale).
- API: `GET /api/np`, `GET /api/cover`, `POST /api/control` (`toggle`, `skip`, `volume`, `seek`, `loop`; always needs the token). It contains no Discord IDs or requester names, and it is fully hidden during a music quiz. Without a token the page is view-only and cannot control playback.
- **3.5-inch TFT screen (SPI)**, tested on a Pi 5 + Kali with an ILI9486 resistive-touch board (Keyestudio KS0214, from the Waveshare 3.5 (A) family). The vendor's `tft35a` overlay uses the old fbtft driver and **shows nothing on a Pi 5**; use the official overlay with the DRM driver and lower the SPI speed (at 24 MHz the screen stays black):
```
# /boot/firmware/config.txt
dtparam=spi=on
dtoverlay=piscreen,drm,rotate=90,speed=8000000
```
  After a reboot you get `/dev/fb1` (320×480, 32-bit); the program rotates the picture 90 degrees on its own. The touch layer is resistive, so use a **stylus**. The screen redraws only once per second (and immediately on a touch) because an 8 MHz SPI bus can only carry about 1 MB per second. Tap the button column at the bottom of the screen (repeat, volume down, pause, volume up, skip), or the progress bar to seek.
```bash
sudo apt install -y python3-pil python3-evdev python3-numpy
python3 -m venv --system-site-packages pi/.venv && pi/.venv/bin/pip install evdev
cp pi/display.env.example pi/display.env     # fill in DISPLAY_TOKEN; adjust TOUCH_* if the touch is off (TOUCH_DEBUG=1 prints raw coordinates)
# start on boot (appended to your existing crontab, not overwriting it):
(crontab -l 2>/dev/null; echo "@reboot sleep 40 && cd $PWD && setsid sh pi/run-display.sh >> /tmp/display.log 2>&1") | crontab -
```
  To show an avatar on the screen, put an image at `pi/avatar.jpg` (it is already in `.gitignore`, so it will not be pushed to the public repo) and adjust `AVATAR_CROP` in `pi/display.env`.

### Backup, auto-update, monitoring

```bash
sh scripts/backup.sh      # data/backups/musidiscord-*.tar.gz, keeps BACKUP_KEEP copies (default 14)
sh scripts/update.sh      # git pull (fast-forward only), rebuild, wait for healthy, roll back to the old version on failure
docker compose --profile ops up -d uptime-kuma   # http://localhost:3001
```
Set `BACKUP_RCLONE_REMOTE=gdrive:musidiscord` in `.env` (and install and configure rclone) to push backups to the cloud. Run them on a schedule with systemd timers:
```bash
for u in backup update; do
  for ext in service timer; do
    sed "s#__USER__#$USER#g; s#__DIR__#$PWD#g" deploy/pi/musidiscord-$u.$ext | sudo tee /etc/systemd/system/musidiscord-$u.$ext >/dev/null
  done
  sudo systemctl enable --now musidiscord-$u.timer
done
```
**Restore:** stop the bot (`docker compose stop bot`), extract the backup into `data/` (`tar -xzf data/backups/<file> -C data`), then `docker compose start bot`.

## Testing

```bash
npm test
```

## A note on YouTube

YouTube often blocks VPS IP addresses and keeps changing how playback works, so do not depend on it. The most reliable sources are your own music library and SoundCloud. If you still want YouTube, configure `oauth` in `lavalink/application.yml` (under `plugins.youtube`, with the refresh token in `YOUTUBE_REFRESH_TOKEN` in `.env`) using a secondary Google account, or use `pot` (`token` and `visitorData`). See the latest guide at https://github.com/lavalink-devs/youtube-source and always use the latest `youtube-plugin`.

## Website

The `web/` folder is a static landing site (no build step) with privacy and terms pages. Preview it with `python -m http.server` inside `web/`.

## Author

Made by nhaajt: [GitHub](https://github.com/nhaajtt) • [Instagram](https://www.instagram.com/nhaajt_hehee/). For feedback or bug reports, open an issue in this repo.
