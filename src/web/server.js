import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getCover } from "../library/index.js";
import { featuresOf } from "../library/worker.js";
import { accentFor } from "../ui/nowPlaying.js";
import { cycleLoop, skipTrack } from "../utils/actions.js";
import { localRelativePath } from "../utils/trackKey.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, "..", "..", "assets", "fonts");

// Only serve exactly these files (no arbitrary paths)
const STATIC = new Map([
  ["/", { file: path.join(HERE, "static", "display.html"), type: "text/html; charset=utf-8" }],
  ["/display", { file: path.join(HERE, "static", "display.html"), type: "text/html; charset=utf-8" }],
  ["/display.css", { file: path.join(HERE, "static", "display.css"), type: "text/css; charset=utf-8" }],
  ["/display.js", { file: path.join(HERE, "static", "display.js"), type: "text/javascript; charset=utf-8" }],
  ...["BarlowCondensed-Bold.ttf", "BarlowCondensed-SemiBold.ttf", "IBMPlexMono-Regular.ttf", "IBMPlexMono-Bold.ttf"].map((name) => [
    `/assets/fonts/${name}`,
    { file: path.join(FONT_DIR, name), type: "font/ttf", cache: "public, max-age=604800" },
  ]),
]);

const PAGE_CSP = "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'";

const MAX_BODY = 2048;
const COVER_TTL_MS = 10 * 60_000;
const coverCache = new Map();

/** Only accepts real numbers (or non-empty numeric strings); null, undefined and "" are not treated as 0. */
export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") return Number.isFinite(Number(v)) ? Number(v) : null;
  return null;
}

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

/** Picks the player to show: the specified guild, otherwise a server that is playing. */
export function pickPlayer(client, guildId) {
  const players = client.lavalink.players;
  if (guildId) return players.get(guildId) ?? null;
  const all = [...players.values()];
  return all.find((p) => p.queue.current && p.playing) ?? all.find((p) => p.queue.current) ?? null;
}

/**
 * Now-playing state as JSON that is safe to expose on a home network: no Discord IDs, no requester names,
 * and fully hidden during a music quiz (to avoid leaking the answer).
 */
export function nowPlayingState(client, player, botName = config.botName, canControl = false) {
  const base = { bot: botName, playing: false, canControl };
  if (!player) return base;
  if (player.getData("quiz")) return { ...base, hidden: true };
  const track = player.queue.current;
  if (!track) return { ...base, guild: client.guilds?.cache.get(player.guildId)?.name ?? null };

  const info = track.info;
  const rel = localRelativePath(info);
  const f = rel !== null ? featuresOf(rel) : null;
  return {
    bot: botName,
    canControl,
    guildId: player.guildId,
    guild: client.guilds?.cache.get(player.guildId)?.name ?? null,
    playing: Boolean(player.playing) && !player.paused,
    paused: Boolean(player.paused),
    title: info.title,
    artist: info.author ?? null,
    album: info.album ?? null,
    isStream: Boolean(info.isStream),
    position: Math.max(0, Math.round(player.position ?? 0)),
    duration: Number.isFinite(info.duration) ? info.duration : null,
    volume: player.volume,
    queueLength: player.queue.tracks.length,
    next: player.queue.tracks[0]?.info?.title ?? null,
    accent: hex(accentFor(`${info.title}${info.author ?? ""}`)),
    cover: rel !== null || /^https?:\/\//i.test(info.artworkUrl ?? ""),
    repeat: player.repeatMode,
    // Audio features analyzed by the bot itself (may not be analyzed yet)
    bpm: f?.bpm ?? null,
    energy: f?.energy ?? null,
    brightness: f?.brightness ?? null,
    mood: f?.mood ?? null,
  };
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function authorized(req, url, token) {
  if (!token) return true;
  return safeEqual(req.headers["x-token"] ?? url.searchParams.get("token"), token);
}

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function coverFor(rel) {
  const hit = coverCache.get(rel);
  if (hit && Date.now() - hit.at < COVER_TTL_MS) return hit.cover;
  const cover = await getCover(rel);
  if (coverCache.size >= 20) coverCache.delete(coverCache.keys().next().value);
  coverCache.set(rel, { at: Date.now(), cover });
  return cover;
}

/** Handles one HTTP request (kept separate from createServer for testing). */
export async function handle(req, res, client, cfg = config.display) {
  const url = new URL(req.url, "http://localhost");

  const asset = req.method === "GET" ? STATIC.get(url.pathname) : null;
  if (asset) {
    try {
      const body = await readFile(asset.file);
      const isPage = asset.type.startsWith("text/html");
      return send(res, 200, body, asset.type, { "Cache-Control": asset.cache ?? "no-cache", ...(isPage ? { "Content-Security-Policy": PAGE_CSP, "Referrer-Policy": "no-referrer" } : {}) });
    } catch {
      return send(res, 404, { error: "File not found" });
    }
  }
  if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "Page not found" });
  if (!authorized(req, url, cfg.token)) return send(res, 401, { error: "Sai token" });

  const player = pickPlayer(client, url.searchParams.get("guild"));

  if (req.method === "GET" && url.pathname === "/api/np") return send(res, 200, nowPlayingState(client, player, config.botName, Boolean(cfg.token)));

  if (req.method === "GET" && url.pathname === "/api/cover") {
    const track = player?.queue.current;
    const rel = track && !player.getData("quiz") ? localRelativePath(track.info) : null;
    if (rel === null) {
      const art = track?.info.artworkUrl;
      return art && /^https?:\/\//i.test(art) && !player?.getData("quiz") ? send(res, 302, "", "text/plain", { Location: art }) : send(res, 404, { error: "No cover" });
    }
    const cover = await coverFor(rel);
    return cover ? send(res, 200, cover.buffer, cover.mime, { "Cache-Control": "private, max-age=60" }) : send(res, 404, { error: "No cover" });
  }

  if (req.method === "POST" && url.pathname === "/api/control") {
    if (!cfg.token) return send(res, 403, { error: "Control is disabled (set DISPLAY_TOKEN to enable)" });
    if (!player?.queue.current) return send(res, 409, { error: "Nothing is playing" });
    if (player.getData("quiz")) return send(res, 409, { error: "A music quiz is in progress" });
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: "Invalid body" });
    }
    switch (body.action) {
      case "toggle":
        if (player.paused) await player.resume();
        else await player.pause();
        break;
      case "skip":
        await skipTrack(player);
        break;
      case "volume": {
        const raw = toNumber(body.value);
        if (raw === null) return send(res, 400, { error: "Invalid volume" });
        await player.setVolume(Math.min(150, Math.max(0, Math.round(raw))));
        break;
      }
      case "seek": {
        const raw = toNumber(body.value);
        const ms = raw === null ? null : Math.round(raw);
        const dur = player.queue.current.info.duration;
        if (player.queue.current.info.isStream || !Number.isFinite(dur) || ms === null || ms < 0 || ms >= dur) return send(res, 400, { error: "Invalid seek position" });
        await player.seek(ms);
        break;
      }
      case "loop":
        await cycleLoop(player);
        break;
      default:
        return send(res, 400, { error: "Invalid action" });
    }
    return send(res, 200, nowPlayingState(client, player, config.botName, Boolean(cfg.token)));
  }

  return send(res, 404, { error: "Path not found" });
}

/** Starts the status server (DISPLAY_PORT>0). */
export function startDisplayServer(client, cfg = config.display) {
  if (!cfg.port) return null;
  const server = createServer((req, res) => {
    handle(req, res, client, cfg).catch((error) => {
      console.error("Status API error:", error);
      if (!res.headersSent) send(res, 500, { error: "Server error" });
      else res.end();
    });
  });
  server.on("error", (error) => console.error("Could not start the status server:", error.message));
  server.listen(cfg.port, cfg.bind, () => {
    const open = !["127.0.0.1", "localhost", "::1"].includes(cfg.bind);
    console.log(`Now-playing status: http://${cfg.bind}:${cfg.port}/display${cfg.token ? " (token required)" : ""}`);
    // In Docker, docker-compose only exposes the port to the host running the bot (127.0.0.1), so no warning is needed
    if (open && !cfg.token && !existsSync("/.dockerenv")) console.warn("DISPLAY_BIND is exposed externally without DISPLAY_TOKEN: anyone on the network can see what is playing (but cannot control it).");
  });
  server.unref();
  return server;
}
