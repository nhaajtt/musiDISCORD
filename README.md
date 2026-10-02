# musiDISCORD

A self-hosted Discord music bot built with discord.js and played through Lavalink v4. Its strength is a **private music library**: the bot reads track tags, cover art and lyrics from your `music/` folder and builds features around them (search, albums, music quiz, stats, 24/7 radio...). It can also play from YouTube, SoundCloud and Spotify links.

Website: https://musidiscord.vercel.app (there is also a Vietnamese version of the website). Project devlog (the problems I hit and how I fixed them): [docs/devlog.md](docs/devlog.md).

## Features

- **Smart music library:** reads tags (title, artist, album, genre), guesses from file and folder names when tags are missing, searches without caring about diacritics, plays whole albums or artists, and keeps a separate favorites list per user.
- **`/nhaajt`:** plays the whole library in random order, reshuffles when the round ends and keeps going forever. The shuffle is weighted by the server's 👍/👎 votes and avoids repeating the same artist back to back.
- **"Now Playing" panel (Components V2):** cover art, an accent color taken from the track, an auto-updating progress bar and two rows of buttons (playback controls, 👍 👎 ❤️ 📜).
- **Track title on the voice channel:** writes "Now playing: ..." into the voice channel status automatically.
- **Music quiz:** listen to a clip from the library and guess the title; answers go through a modal (no message-read permission needed), with hints, a streak counter and a leaderboard.
- **Search and pick:** `/search` shows up to 10 results as numbered buttons so you can pick one to play.
- **Audio filters:** `/filter` applies effects such as bass boost, nightcore, vaporwave and 8D to the current playback.
- **Fair queue, `/bump` and skip voting** when many people are listening.
- **Stats:** `/mystats`, `/leaderboard`, `/wrapped` (a year-in-review image card drawn like a blueprint) and fun badges.
- **Lyrics:** from a `.lrc` file next to the track, lyrics embedded in the tags, or a LRCLIB lookup, shown karaoke-style with the current line highlighted.
- **Member contributions:** `/contribute` lets people submit their own music files for the bot owner to approve, and `/request` suggests tracks that are not in the library yet and notifies you when they show up. The bot does **not** download music from YouTube or any converter site.
- **Auto-tagging (optional):** tracks without tags are identified by audio fingerprint (AcoustID, MusicBrainz) and filled in with title, artist, album and cover. Tags are stored separately in `data/shared/`, and **your original music files are never modified**.
- **Audio analysis (optional):** estimates tempo, energy and brightness on your own machine to power `/vibe` (mood radio) and `/similar` (tracks like the current one).
- **Multiple bots, status display, Raspberry Pi operations:** run 2 or 3 bots at once, a `/display` page for a 3.5-inch TFT screen, backups, auto-update and Uptime Kuma. See "Running on a Raspberry Pi".
- **24/7:** stays in the channel even when it is empty and after a restart; an optional radio mode plays the library forever.
- **Operations:** queue recovery after a restart, healthcheck, an alert when Lavalink disconnects, and auto-leave when idle (except in 24/7 mode).

## Commands

| Command | Description |
| --- | --- |
| `/play query [source]` | Play by name or link (track, playlist, album) |
| `/search query [source]` | Show up to 10 results as numbered buttons; pick one to play |
| `/filter effect` | Audio effect: bass boost, nightcore, vaporwave, 8D, karaoke, tremolo, vibrato, mono, or off |
| `/local file` | Play one track from the library (autocomplete by title, artist, album) |
| `/album name [shuffle]`, `/artist name [shuffle]` | Play a whole album or all tracks by an artist |
| `/favorites add \| remove \| list \| play` | Your own favorite tracks |
| `/nhaajt` | Play the whole library in random order, looping until `/stop` |
| `/pause`, `/resume`, `/skip`, `/stop`, `/leave` | Basic controls (`/skip` needs a vote when 3 or more people are listening) |
| `/queue`, `/nowplaying` | Show the queue and the current track |
| `/volume`, `/loop`, `/shuffle`, `/remove`, `/seek` | Volume, repeat, shuffle, remove a track, seek |
| `/bump position` | Start a vote to move a track up to play next |
| `/lyrics [live]` | Lyrics of the current track; `live` shows them karaoke-style |
| `/quiz start \| stop \| top` | Music quiz from the library |
| `/mystats`, `/leaderboard`, `/wrapped [year]` | Personal stats, leaderboard, year in review |
| `/privacy stats \| delete` | Turn off your stats or delete all of your data |
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
5. Run `cp .env.example .env` and fill in the values.

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
- **Health checks:** the bot container has a healthcheck (`docker compose ps` shows `healthy`/`unhealthy`). If you set `ALERT_WEBHOOK_URL` (a webhook for a dedicated Discord channel), you get an alert when Lavalink disconnects.
- **Time zone:** set `TIMEZONE` (default `Asia/Ho_Chi_Minh`) for listening-hour stats and day streaks.
- **Online lyrics:** when a file has no lyrics, the bot sends the title, artist and length to the public LRCLIB service. Set `LYRICS_LOOKUP=off` to disable this.
- **Privacy:** users can turn off their stats with `/privacy stats` and delete their data with `/privacy delete`. The bot does not read message content.

## Running on a Raspberry Pi

Both Lavalink and the bot have arm64 builds. Use an SSD over USB instead of an SD card, keep the Pi cooled with a fan, and set `AUTOSAVE_SECONDS=0`.

**Install (Kali or Debian/Raspberry Pi OS):**
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
