import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { getCover } from "../library/index.js";
import { accentFor } from "../ui/nowPlaying.js";
import { skipTrack } from "../utils/actions.js";
import { localRelativePath } from "../utils/trackKey.js";
import { displayHtml } from "./page.js";

const MAX_BODY = 2048;
const COVER_TTL_MS = 10 * 60_000;
const coverCache = new Map();

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

/** Chọn player cần hiển thị: guild chỉ định, nếu không thì server đang có bài phát. */
export function pickPlayer(client, guildId) {
  const players = client.lavalink.players;
  if (guildId) return players.get(guildId) ?? null;
  const all = [...players.values()];
  return all.find((p) => p.queue.current && p.playing) ?? all.find((p) => p.queue.current) ?? null;
}

/**
 * Trạng thái đang phát dạng JSON an toàn để công khai trong mạng nhà: không có ID Discord, không có tên người yêu cầu,
 * và ẩn hoàn toàn khi đang đố nhạc (kẻo lộ đáp án).
 */
export function nowPlayingState(client, player, botName = config.botName) {
  const base = { bot: botName, playing: false };
  if (!player) return base;
  if (player.getData("quiz")) return { ...base, hidden: true };
  const track = player.queue.current;
  if (!track) return { ...base, guild: client.guilds?.cache.get(player.guildId)?.name ?? null };

  const info = track.info;
  const rel = localRelativePath(info);
  return {
    bot: botName,
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
    accent: hex(accentFor(`${info.title}${info.author ?? ""}`)),
    cover: rel !== null || /^https?:\/\//i.test(info.artworkUrl ?? ""),
    repeat: player.repeatMode,
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
    if (size > MAX_BODY) throw new Error("Nội dung quá lớn");
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

/** Xử lý một yêu cầu HTTP (tách riêng khỏi createServer để kiểm thử). */
export async function handle(req, res, client, cfg = config.display) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/" || url.pathname === "/display") {
    return send(res, 200, displayHtml(), "text/html; charset=utf-8", { "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'" });
  }
  if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "Không có trang này" });
  if (!authorized(req, url, cfg.token)) return send(res, 401, { error: "Sai token" });

  const player = pickPlayer(client, url.searchParams.get("guild"));

  if (req.method === "GET" && url.pathname === "/api/np") return send(res, 200, nowPlayingState(client, player));

  if (req.method === "GET" && url.pathname === "/api/cover") {
    const track = player?.queue.current;
    const rel = track && !player.getData("quiz") ? localRelativePath(track.info) : null;
    if (rel === null) {
      const art = track?.info.artworkUrl;
      return art && /^https?:\/\//i.test(art) && !player?.getData("quiz") ? send(res, 302, "", "text/plain", { Location: art }) : send(res, 404, { error: "Không có bìa" });
    }
    const cover = await coverFor(rel);
    return cover ? send(res, 200, cover.buffer, cover.mime, { "Cache-Control": "private, max-age=60" }) : send(res, 404, { error: "Không có bìa" });
  }

  if (req.method === "POST" && url.pathname === "/api/control") {
    if (!cfg.token) return send(res, 403, { error: "Điều khiển bị tắt (đặt DISPLAY_TOKEN để bật)" });
    if (!player?.queue.current) return send(res, 409, { error: "Không có bài đang phát" });
    if (player.getData("quiz")) return send(res, 409, { error: "Đang đố nhạc" });
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: "Nội dung không hợp lệ" });
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
        const v = Math.round(Number(body.value));
        if (!Number.isFinite(v)) return send(res, 400, { error: "Âm lượng không hợp lệ" });
        await player.setVolume(Math.min(150, Math.max(0, v)));
        break;
      }
      default:
        return send(res, 400, { error: "Hành động không hợp lệ" });
    }
    return send(res, 200, nowPlayingState(client, player));
  }

  return send(res, 404, { error: "Không có đường dẫn này" });
}

/** Bật máy chủ trạng thái (DISPLAY_PORT>0). */
export function startDisplayServer(client, cfg = config.display) {
  if (!cfg.port) return null;
  const server = createServer((req, res) => {
    handle(req, res, client, cfg).catch((error) => {
      console.error("API trạng thái lỗi:", error);
      if (!res.headersSent) send(res, 500, { error: "Lỗi máy chủ" });
      else res.end();
    });
  });
  server.on("error", (error) => console.error("Không mở được máy chủ trạng thái:", error.message));
  server.listen(cfg.port, cfg.bind, () => {
    const open = !["127.0.0.1", "localhost", "::1"].includes(cfg.bind);
    console.log(`Trạng thái đang phát: http://${cfg.bind}:${cfg.port}/display${cfg.token ? " (cần token)" : ""}`);
    // Trong Docker, cổng chỉ được mở ra máy chạy bot (127.0.0.1) bởi docker-compose nên không cần cảnh báo
    if (open && !cfg.token && !existsSync("/.dockerenv")) console.warn("DISPLAY_BIND mở ra ngoài mà chưa có DISPLAY_TOKEN: ai trong mạng cũng xem được bài đang phát (không điều khiển được).");
  });
  server.unref();
  return server;
}
