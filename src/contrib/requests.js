import { db } from "../db.js";
import { normalizeText, search } from "../library/index.js";
import { safeText } from "../utils/embeds.js";

export const MAX_TEXT = 200;
export const MAX_OPEN_PER_USER = 5;

const YOUTUBE_ID = /^[\w-]{11}$/;

const stmt = {
  byKey: db.prepare("SELECT * FROM song_requests WHERE key = ?"),
  byId: db.prepare("SELECT * FROM song_requests WHERE id = ?"),
  insert: db.prepare("INSERT INTO song_requests (key, display, guild_id, channel_id, created_by, created_at, status) VALUES (?, ?, ?, ?, ?, ?, 'open')"),
  vote: db.prepare("INSERT OR IGNORE INTO request_votes (request_id, user_id) VALUES (?, ?)"),
  hasVoted: db.prepare("SELECT 1 FROM request_votes WHERE request_id = ? AND user_id = ?"),
  voteCount: db.prepare("SELECT COUNT(*) AS n FROM request_votes WHERE request_id = ?"),
  voters: db.prepare("SELECT user_id FROM request_votes WHERE request_id = ?"),
  openByUser: db.prepare("SELECT COUNT(*) AS n FROM song_requests WHERE created_by = ? AND status = 'open'"),
  remove: db.prepare("DELETE FROM song_requests WHERE id = ? AND created_by = ? AND status = 'open'"),
  setStatus: db.prepare("UPDATE song_requests SET status = ?, fulfilled_file = ? WHERE id = ? AND status = 'open'"),
  open: db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes
     FROM song_requests r WHERE r.status = 'open' ORDER BY votes DESC, r.created_at ASC LIMIT ?`,
  ),
  mine: db.prepare(
    `SELECT r.*, (SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes
     FROM song_requests r JOIN request_votes mv ON mv.request_id = r.id AND mv.user_id = ?
     WHERE r.status = 'open' ORDER BY r.created_at DESC LIMIT 25`,
  ),
  openTextual: db.prepare("SELECT * FROM song_requests WHERE status = 'open' AND key LIKE 'q:%'"),
};

/**
 * Phân tích nội dung đề xuất thành { key, display, isLink }. Chỉ nhận tên bài hoặc link YouTube/Spotify/SoundCloud,
 * và KHÔNG bao giờ truy cập link (chỉ rút ra mã bài để nhận diện trùng). Trả về null nếu không hợp lệ.
 */
export function parseRequest(input) {
  const text = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_TEXT) return null;

  // Các scheme khác (ftp://, file://...) không phải tên bài
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return null;

  if (/^https?:\/\//i.test(text)) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");

    if (host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com") {
      const id =
        host === "youtu.be"
          ? url.pathname.slice(1).split("/")[0]
          : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1];
      return id && YOUTUBE_ID.test(id) ? { key: `yt:${id}`, display: `https://www.youtube.com/watch?v=${id}`, isLink: true } : null;
    }
    if (host === "open.spotify.com") {
      const m = url.pathname.match(/\/(track|album|playlist)\/([A-Za-z0-9]{10,30})/);
      return m ? { key: `sp:${m[1]}:${m[2]}`, display: `https://open.spotify.com/${m[1]}/${m[2]}`, isLink: true } : null;
    }
    if (host === "soundcloud.com") {
      const path = url.pathname.replace(/\/+$/, "").toLowerCase();
      return /^\/[\w.-]+\/[\w.-]+/.test(path) ? { key: `sc:${path}`, display: `https://soundcloud.com${path}`, isLink: true } : null;
    }
    return null;
  }

  const norm = normalizeText(text);
  return norm.length >= 2 ? { key: `q:${norm}`, display: text, isLink: false } : null;
}

/** Hiển thị an toàn trong tin nhắn Discord (link bọc <> để không bung xem trước, chữ thường thì bỏ định dạng markdown). */
export function displayOf(request) {
  return request.key.startsWith("q:") ? safeText(request.display, 120) : `<${request.display}>`;
}

const withVotes = (row) => (row ? { ...row, votes: Number(stmt.voteCount.get(row.id).n) } : null);

/**
 * Thêm một đề xuất. Trả về { status, request?, entry? } với status:
 * "added" | "voted" | "already-voted" | "in-library" | "fulfilled" | "dismissed" | "invalid" | "limit".
 */
export function addRequest({ input, guildId, channelId, userId, now = Date.now() }) {
  const parsed = parseRequest(input);
  if (!parsed) return { status: "invalid" };

  if (!parsed.isLink) {
    const tokens = parsed.key.slice(2).split(" ");
    const hit = search(parsed.display, 10).find((e) => tokens.every((t) => e.searchText.includes(t)));
    if (hit) return { status: "in-library", entry: hit };
  }

  const existing = stmt.byKey.get(parsed.key);
  if (existing) {
    if (existing.status === "fulfilled") return { status: "fulfilled", request: withVotes(existing) };
    if (existing.status === "dismissed") return { status: "dismissed", request: withVotes(existing) };
    if (stmt.hasVoted.get(existing.id, userId)) return { status: "already-voted", request: withVotes(existing) };
    stmt.vote.run(existing.id, userId);
    return { status: "voted", request: withVotes(existing) };
  }

  if (Number(stmt.openByUser.get(userId).n) >= MAX_OPEN_PER_USER) return { status: "limit" };

  const { lastInsertRowid } = stmt.insert.run(parsed.key, parsed.display, guildId ?? null, channelId ?? null, userId, now);
  stmt.vote.run(lastInsertRowid, userId);
  return { status: "added", request: withVotes(stmt.byId.get(lastInsertRowid)) };
}

/** Bỏ phiếu cho một đề xuất đang mở theo id. */
export function voteRequest(id, userId) {
  const request = stmt.byId.get(id);
  if (!request || request.status !== "open") return { status: "none" };
  if (stmt.hasVoted.get(id, userId)) return { status: "already-voted", request: withVotes(request) };
  stmt.vote.run(id, userId);
  return { status: "voted", request: withVotes(request) };
}

export const listOpen = (limit = 10) => stmt.open.all(limit).map((r) => ({ ...r, votes: Number(r.votes) }));
export const listMine = (userId) => stmt.mine.all(userId).map((r) => ({ ...r, votes: Number(r.votes) }));
export const removeOwn = (id, userId) => Number(stmt.remove.run(id, userId).changes) > 0;
export const getRequest = (id) => withVotes(stmt.byId.get(id));

export function closeRequest(id, status, file = null) {
  return Number(stmt.setStatus.run(status, file, id).changes) > 0;
}

/** Những người cần được báo khi đề xuất được đáp ứng: người tạo và mọi người đã bỏ phiếu. */
export function peopleOf(request) {
  const ids = new Set(stmt.voters.all(request.id).map((r) => r.user_id));
  if (request.created_by) ids.add(request.created_by);
  return [...ids];
}

/** So khớp các bài trong thư viện với đề xuất bằng tên đang mở. Đánh dấu đã đáp ứng và trả về [{ request, entry }]. */
export function fulfilMatches(entries) {
  const fulfilled = [];
  for (const request of stmt.openTextual.all()) {
    const tokens = request.key.slice(2).split(" ");
    const entry = entries.find((e) => tokens.every((t) => e.searchText.includes(t)));
    if (entry && closeRequest(request.id, "fulfilled", entry.file)) fulfilled.push({ request, entry });
  }
  return fulfilled;
}

/** Nhắn cho từng người liên quan khi đề xuất đã có trong thư viện. `notify(userId, text, channelId)`. */
export async function notifyFulfilled(notify, pairs) {
  for (const { request, entry } of pairs) {
    const text = `🎉 Bài bạn đề xuất (**${safeText(request.display, 80)}**) đã có trong thư viện: **${safeText(entry.title, 120)}**. Dùng \`/local\` để nghe.`;
    for (const userId of peopleOf(request)) await notify(userId, text, request.channel_id);
  }
}
