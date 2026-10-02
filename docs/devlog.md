# musiDISCORD devlog

This is my real log from building musiDISCORD, from picking the tech to getting it running 24/7 on a Raspberry Pi 5 at home. I wrote down the times I got things wrong and how I found the cause, because that is where most of what I learned came from.

_Sep 30 to Oct 2, 2026_

## Sep 30: Choosing the stack and setting up the skeleton

I wanted a self-hosted music bot that does not depend on anyone else's service. I chose **Node.js and discord.js** for the bot, **Lavalink v4** as a dedicated audio server (the bot only gives orders; Lavalink decodes and pushes the audio into the voice channel), and **Docker Compose** to package both.

The first question that stopped me was what to put in `DISCORD_TOKEN`. I thought it was the Public Key. After rereading the Developer Portal I understood: the Token is the bot's password (it must never go to GitHub), while the Application ID is a public identifier used to invite the bot and register commands. From then on `.env` was in `.gitignore` from the very first commit.

One small detail cost me time: "global" slash command registration shows up very slowly, while registering per server with `GUILD_ID` shows up right away. I used the second one while testing.

## Sep 30: YouTube refuses to play

Playing a YouTube link gave `This video requires login`, and then a signature function decoding error.

I tried, one after another:

- updating Lavalink's YouTube plugin to 1.18.2;
- OAuth sign-in with a secondary account to get a refresh token;
- enabling extra fallback clients;
- turning off the VPN and running from my home IP.

The result was hit and miss. YouTube actively blocks this kind of access, and under its terms of service it is not something to build a product on anyway.

> **Decision:** stop trying to win the game against YouTube. Shift the focus to a **private music library** (my own files) plus SoundCloud, and keep YouTube only as an option. First lesson: when a direction depends on something you do not control, changing course early is cheaper than gritting your teeth.

## Sep 30: Local music and the "Unknown title" problem

My music files have no tags, so the `/local` autocomplete was full of "Unknown title" and picking a track was hard.

I wrote a library scanner: it reads tags with `music-metadata`; if they are missing, it guesses the artist and title from the file name (patterns like `01-track-name` or `Artist - Title`) and from the folder; search ignores Vietnamese diacritics; and it caches results by modification time and file size so later scans only read new files.

That led to `/nhaajt`: play the whole folder in random order, reshuffle when the round ends, and never stop until someone presses stop. I used a weighted shuffle (tracks with 👍 come up earlier) and spaced out tracks by the same artist, because a plain random shuffle often puts two songs by the same singer back to back.

## Oct 1: From "it runs" to "it is usable"

The bot played music, but it was not yet something other people could use. My self-assigned list: a DJ role and default volume per server, skip voting when there are many listeners, a fair queue (one turn per person), `/bump`, 24/7 mode, a "Now Playing" card with Components V2, a music quiz, stats and Wrapped, and lyrics that follow the singing.

Where I got stuck:

- **Restarting the bot lost the queue.** I save a snapshot of the queue when a new track starts and when the bot shuts down. The bug I hit: restoring a position beyond the track's length made Lavalink reject it, so I had to clamp the position to the allowed range.
- **Health check.** I write the "still alive" signal to RAM (`/dev/shm`) instead of disk, so that putting it on an SD card later would not wear it out.
- **The Wrapped card.** I draw an SVG and convert it to PNG with `@resvg/resvg-js`; the container has no fonts, so I bundled open-source fonts.

From here on every feature comes with tests (`node:test`). By this point there were 131 tests.

## Oct 1: Data from other people is never harmless

Track titles come from file tags, and a tag can be set by anyone. A title like `[click here](http://…)` or `<@id>` would turn into a fake link or a mention in the bot's message.

While testing I found that discord.js's `escapeMarkdown` does not escape the characters `[ ] ( ) < >`. I wrote `safeText` and `cleanMeta` (which strip control characters, text-direction override characters and markdown-style links) and added a test for each case. Lesson: every string that comes in from outside (file tags, usernames, request text) has to be sanitized before it is displayed.

## Oct 1: An idea I decided not to build

I once came up with letting members submit YouTube links, with the bot using an mp3 converter site to download them into the music library, so the library would grow through its users. It sounded great.

But the more I thought about it, the more three problems showed up: copying copyrighted music and playing it for a whole server is infringement; my repo and website are public, so they could easily be taken down; and technically it is not stable either (those sites have no API, and YouTube blocks them just like the errors on Sep 30).

The alternative I chose:

- `/contribute`: users submit **their own files**, and the bot owner approves each one before it enters the library. Off by default; only accepts URLs from Discord's CDN; limits on size and duration; duplicates blocked by hash; the stored file name is chosen by the bot, never the user's, to avoid paths like `../`.
- `/request`: only records a track name or link in a wishlist and **never opens or downloads** the link. When the track appears in the library, the bot messages the person who requested it.

## Oct 1: Website, Vercel and the first 404

I built the landing website in a technical-drawing style (cyanotype blue paper), pushed the repo to GitHub (public) and deployed it to Vercel.

The page returned `404: NOT_FOUND`. The cause: Vercel builds from the repo root, while the site lives in `web/`. I fixed it with a `vercel.json` at the root that sets the output directory to `web`. Since the repo is public, I also double-checked what must never be committed: `.env`, `data/`, `music/` and the Lavalink plugins.

## Oct 1: Moving to the Raspberry Pi 5, one snag per step

I have a Pi 5 (8 GB, running Kali Linux), so I decided to move the bot there to run 24/7.

- **SSH with keys.** Running `ssh` through a tool with no terminal means I cannot type a password, and it said `Permission denied`. I generated an ed25519 key and copied it to the Pi, but it was still refused. Verbose mode (`-v`) showed the server accepted the key but the client could not sign. The cause: the two quotes `""` I typed when creating the key were taken by Windows as a **real passphrase**. I removed it with `ssh-keygen -p`.
- **Docker permissions.** Docker was installed, but my account was not in the `docker` group, and `sudo` needed a password. I split out the work that needs root (installing packages, adding the group) to run myself, and did the rest over SSH.
- **Lavalink plugin 404.** On the Pi, Lavalink could not download the YouTube plugin because Maven returned 404 for exactly that version (it worked on the PC because it had been downloaded earlier). The plugin is a Java file and runs on any architecture, so I copied the `.jar` straight from the PC. The plugins folder was owned by `root` because Docker had created it, so I had to change the owner through a temporary container.
- **A glued line.** The `.env` file had no trailing newline, so the line I appended stuck to `ANALYSIS=on`, giving `ANALYSIS=onAUTOSAVE_SECONDS=0`. Since then I check `.env` after every edit.

Because the Pi uses an **SD card** (which wears out with heavy writes), I reduced disk writes: the "still alive" signal in RAM, `AUTOSAVE_SECONDS=0`, and rotating Docker logs.

## Oct 2: Putting the Pi to work: tagging, audio analysis, multiple bots

I wanted the Pi to do the things a personal computer could never leave running in the background.

- **Auto-tagging** with audio fingerprints: `fpcalc` creates a fingerprint and asks AcoustID; if that finds nothing, it searches MusicBrainz by file name. Tags are stored **outside** the music files (the originals are never modified). On 10 of my real tracks AcoustID recognized none of them (they were all rips), so only the file name search remained, with a maximum confidence of 80%, below the 85% auto-apply threshold, so everything became a queue waiting for my review. I set the threshold that way on purpose so the machine never overwrites tags with a wrong guess.
- **Audio analysis** for `/vibe` (mood radio) and `/similar`: decode the middle 40 seconds with ffmpeg, then compute energy, brightness and BPM using an FFT and autocorrelation, written in plain JavaScript. I checked it with synthetic beats from 80 to 170 BPM. The first version read 140 BPM as 70 (it locked onto half tempo); smoothing the onset envelope brought the error under 1 BPM. Running on the real library, I saw energy saturate at 1.0 for loud masters, so I measured the library's actual loudness (roughly −18 to −5 dB) and recalibrated the scale.
- **Multiple bots at once.** I added a `multi` profile to Docker Compose. Since two processes sharing one data folder would overwrite each other's files, I split the data per bot and let only one "worker" bot write to the shared folder.
- **Operations.** Backups use `VACUUM INTO` (a consistent copy even while the bot is writing; I verified it by extracting and reading it back). The auto-update script pulls from GitHub and **rolls back** if the bot is not healthy after the update. Uptime Kuma for monitoring. Tailscale for remote access without opening router ports.

## Oct 2: The `/display` status page and the case of the vanishing title

I built a small web page that shows the current track for phones and big screens, with control buttons protected by a token. I redesigned it many times: a spinning disc that pulses to the track's real BPM, the whole page changing color with the track, a ruler at the bottom made of beat ticks, and tapping the ruler to seek.

When I tested with headless Chrome, screenshots always **lacked the track title**. I spent a while suspecting my code until I realized Chrome's "virtual time" mode does not run CSS animations, so the text stayed in the hidden state at the start of its animation. I wrote a script that drives Chrome over DevTools, waits for real time, and only then takes the screenshot. Lesson: when a testing tool gives strange results, check the tool before changing the code.

On the page's security: it only opens on `127.0.0.1` on the machine running the bot; controls need `DISPLAY_TOKEN`; it exposes no Discord IDs or requester names; it hides itself during a music quiz (so it does not give away the answer); and it has a strict CSP (no inline scripts, no external resources). The tests also caught a bug: a `null` value was treated as the number 0, so a seek request could jump a track back to the start; I fixed it so the API only accepts real numbers.

## Oct 2: The 3.5-inch TFT screen: the longest story

I have a 3.5-inch touch TFT screen that plugs straight onto the Pi's GPIO pins. The goal: show the current track right on the Pi.

### 1. White screen

The driver loaded normally and `dmesg` was clean, but the screen was white. I read the device tree to check the control pins: DC is GPIO24 and RESET is GPIO25, handled correctly by the Pi 5's RP1 controller. Filling the framebuffer with solid red was still white.

### 2. Finding the cause

I looked through the documentation: the vendor only supports the Pi 3B and 4B. The `tft35a` overlay the Pi was using is not part of the Raspberry Pi kernel; it is installed by the vendor's script and based on the old `fbtft` driver. The official `piscreen` overlay has an extra `drm` option that uses the modern driver. I switched to `dtoverlay=piscreen,drm,rotate=90`: the screen went from white to black. Black was progress too, because it proved the panel was accepting the initialization commands.

### 3. Proving the data is sent

The screen stayed black when drawing. Instead of guessing, I read the SPI bus byte counter in `sysfs` before and after writing one frame: it rose by exactly 307,222 bytes (480×320×2 bytes plus commands). So the Pi was sending everything, and the fault was elsewhere. The next hypothesis was the SPI speed: the new driver defaults to 24 MHz, while the vendor designed for 16 MHz. I lowered it to 8 MHz and the picture appeared.

### 4. Orientation

I drew a test image with four colored squares in the corners and some text to see how many degrees the screen was rotated. Result: it needed a 90° rotation.

### 5. Touch

My first calibration was wrong: I only captured 3 of the 4 corner taps, so I guessed the order wrong and mixed up the axes. When I tried the buttons, the touch log showed every press landing in the bottom-left corner. Going back over all the data gave the right answer: no axis swap, just an inverted horizontal axis. Only after that did I realize the screen is **resistive touch**, so it needs a stylus; a finger is unreliable.

### 6. Lag

The first version sent the whole frame twice a second (about 614 KB per second, while an 8 MHz bus can only carry about 1 MB). I tried sending only the changed region and it was even choppier. Measuring again, drawing took only 12 ms; the bottleneck was the SPI bus, and the spinning disc demanded too much bandwidth. I changed the design: **no motion on the small screen**, redraw only once per second (the progress bar moves) and immediately on a touch. Traffic dropped to about 307 KB per second. Lesson: hardware decides the design. The same idea is smooth on a phone and not on an SPI screen.

### 7. The look

I iterated many times by feel: a typographic poster, a big clock when idle, a large avatar, and then a magazine cover with a serif typeface. I dropped the border around the photo four times (a colored border, corner marks, a tick-mark ruler, a rectangular frame) until I chose to remove the border entirely and let the image bleed off the edges like a real magazine cover.

## Oct 2: Small bugs that ate time

- `pkill -f` killed my own SSH session, because the string it searched for was also in the command being run. The way around it: run it as a separate command or use the `[p]attern` trick.
- The Tailscale service was `disabled`, so after the Pi rebooted, the control page and Kuma over Tailscale disappeared. I checked `systemctl is-enabled` instead of only `is-active`, then enabled it at boot.
- `git pull` on the Pi was refused because I had copied files over by hand earlier. Since then I always commit first and then sync.
- A portrait photo sitting in the project folder nearly got pushed to the public repo by `git add -A`; I added it to `.gitignore` before committing.
- Many long commands in the Windows shell broke because of quotes and backslashes; I switched to writing scripts to a file and running those.

## Oct 2: Cleanup and rewriting the docs

Finally I cleaned up both machines. On the PC: stopped and removed the project's Docker containers, images and cache (everything had moved to the Pi), and deleted old data after pulling a fresh backup from the Pi (so one copy exists off the SD card). On the Pi: removed temp files and leftover images. I left alone anything that did not belong to this project. After that I split the website into several pages to make it easier to read and wrote this devlog.

## What I learned

- When a direction depends on something you do not control (YouTube), change course early.
- Measure before optimizing: the SPI bus byte counter, draw time, traffic. Guessing wrong costs more time than measuring.
- Break hardware problems into testable hypotheses: which pins, is the data sent, speed, orientation.
- Data from outside must always be sanitized before it is displayed or written to disk.
- Design has to fit inside the limits of the hardware, not the other way around.
- For a feature that could do harm (downloading copyrighted music), weigh the risk and pick the safer option instead of forcing it through.
- Operations matter as much as writing code: backups, self-updating with rollback, monitoring, automatic restarts.
- Write tests for the parts with logic (BPM, path blocking, the API, string sanitizing) and be clear about what has no tests yet.

## Still open

- Have not tried 16 MHz SPI (it might allow bringing motion back to the TFT screen).
- Have not verified that the TFT screen comes back on its own after the Pi reboots: the `@reboot` line in crontab has not been through a real test.
- The TFT's Python code has no automated tests; for now it is checked only with exported images and by running on the device.
- The rollback part of the auto-update script was only just written and checked for the "no new version" case; I have not tried it with a genuinely broken release.
- The multi-bot profile (`multi`) has not been run with a second token.
- The SD card is still the weak point; moving to a USB SSD is recommended for long-term running.
