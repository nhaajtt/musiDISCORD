// Lấy lời bài hát từ lrclib.net (không cần API key)

const MAX_FIELD = 200;
const MAX_BODY = 2_000_000;
const CACHE_MAX = 200;
const TTL_HIT = 6 * 60 * 60 * 1000;
const TTL_MISS = 30 * 60 * 1000;
const TTL_ERROR = 60 * 1000;

const cache = new Map();

export function clearLyricsCache() {
  cache.clear();
}

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return undefined;
  if (e.exp < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  cache.delete(key);
  cache.set(key, e); // đẩy lên cuối (LRU)
  return e.val;
}

function cacheSet(key, val, ttl) {
  cache.delete(key);
  cache.set(key, { val, exp: Date.now() + ttl });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// ---------- chuẩn hoá tên bài ----------

const NOISE_RE =
  /\b(official|video|audio|lyrics?|lyric|mv|m\/v|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|explicit|clip|karaoke|feat|ft|featuring|prod|có lời|lời bài hát|lời|chính thức)\b/i;
const BRACKET_RE = /[(\[【][^()\[\]【】]{0,80}[)\]】]/g;
const TRACKNO_RE = /^\s*\d{1,3}\s*(?:[-.)]|\s-)\s*(?=\D)/;

function squash(s) {
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanTitleForSearch(raw) {
  const original = squash(String(raw ?? "").slice(0, 2000));
  if (!original) return "";
  let s = original.replace(TRACKNO_RE, "");
  s = s.replace(BRACKET_RE, (m) => (NOISE_RE.test(m) ? " " : m));
  s = s.replace(/\s+[-–|]\s*(?:official\s.*|lyrics?(?:\svideo)?|lyric\svideo|audio|mv|m\/v|video)\s*$/i, "");
  s = s.replace(/\s+(?:ft|feat|featuring)\b\.?\s.*$/i, "");
  s = squash(s).replace(/^[-–|\s]+|[-–|\s]+$/g, "");
  return (s || original).slice(0, MAX_FIELD);
}

export function guessArtistTitle(name) {
  const base = squash(String(name ?? "").slice(0, 2000)).replace(TRACKNO_RE, "");
  const m = /\s+[-–—|]\s+/.exec(base);
  if (m) {
    const artist = base.slice(0, m.index).trim();
    const rest = base.slice(m.index + m[0].length).trim();
    if (artist && rest) {
      return { artist: artist.slice(0, MAX_FIELD), title: cleanTitleForSearch(rest) };
    }
  }
  return { artist: null, title: cleanTitleForSearch(base) };
}

// ---------- so khớp ----------

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  const jac = inter / union;
  const small = sa.size <= sb.size ? sa : sb;
  const sub = inter === small.size ? 0.85 : 0;
  return Math.max(jac, sub);
}

function str(v) {
  return typeof v === "string" && v.trim() ? v : null;
}

function hasContent(c) {
  return c && typeof c === "object" && (str(c.syncedLyrics) || str(c.plainLyrics) || c.instrumental === true);
}

function toResult(c) {
  return {
    syncedLyrics: str(c.syncedLyrics),
    plainLyrics: str(c.plainLyrics),
    instrumental: c.instrumental === true,
    source: "lrclib",
    matchedTitle: String(c.trackName ?? c.name ?? ""),
    matchedArtist: String(c.artistName ?? ""),
  };
}

function pickBest(list, { title, artist, durationSec }) {
  const nt = norm(title);
  const na = norm(artist);
  const scored = [];
  for (const c of list.slice(0, 50)) {
    if (!hasContent(c)) continue;
    const tSim = similarity(nt, norm(c.trackName ?? c.name));
    if (tSim < 0.6) continue;
    let aSim = 0;
    if (na) {
      aSim = similarity(na, norm(c.artistName));
      if (aSim < 0.5) continue;
    }
    let diff = null;
    if (durationSec != null && Number.isFinite(c.duration)) diff = Math.abs(c.duration - durationSec);
    if (diff != null && diff > 8) continue;
    const score = tSim * 3 + aSim * 2 + (str(c.syncedLyrics) ? 1 : 0) - (diff != null ? diff * 0.01 : 0);
    scored.push({ c, score, near: diff != null && diff <= 3 });
  }
  if (!scored.length) return null;
  const near = scored.filter((x) => x.near);
  const pool = durationSec != null && near.length ? near : scored;
  pool.sort((x, y) => y.score - x.score);
  return pool[0].c;
}

// ---------- mạng ----------

async function httpJson(url, { fetchImpl, signal, userAgent, aborted }) {
  const res = await Promise.race([
    fetchImpl(url, { signal, headers: { "User-Agent": userAgent, Accept: "application/json" } }),
    aborted,
  ]);
  if (!res || typeof res.status !== "number") throw new Error("bad response");
  if (res.status === 404) return { status: 404, data: null };
  if (res.status < 200 || res.status >= 300) return { status: res.status, data: null };
  const body = typeof res.text === "function" ? await Promise.race([res.text(), aborted]) : null;
  if (typeof body !== "string" || body.length > MAX_BODY) throw new Error("bad body");
  return { status: res.status, data: JSON.parse(body) };
}

export async function fetchLyricsFromLrclib(
  input,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 6000,
    userAgent = "musiDISCORD (self-hosted Discord music bot)",
    baseUrl = "https://lrclib.net",
  } = {},
) {
  try {
    const { title, artist, album, durationMs } = input && typeof input === "object" ? input : {};
    const clip = (v) => (typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "");
    const t = clip(title);
    if (!t) return null;
    const a = clip(artist);
    const al = clip(album);
    const dMs = Number(durationMs);
    const durationSec = Number.isFinite(dMs) && dMs > 0 ? dMs / 1000 : null;
    if (typeof fetchImpl !== "function") return null;

    const key = `${norm(t)}|${norm(a)}|${durationSec == null ? "" : Math.round(durationSec / 5)}`;
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;

    const ctl = new AbortController();
    let timer;
    const aborted = new Promise((_, rej) => {
      timer = setTimeout(() => {
        ctl.abort();
        rej(new Error("timeout"));
      }, Math.max(1, timeoutMs));
    });
    aborted.catch(() => {});
    const ctx = { fetchImpl, signal: ctl.signal, userAgent, aborted };
    const base = String(baseUrl).replace(/\/+$/, "");

    let result = null;
    let failed = false;
    try {
      if (a) {
        const p = new URLSearchParams({ track_name: t, artist_name: a });
        if (al) p.set("album_name", al);
        if (durationSec != null) p.set("duration", String(Math.round(durationSec)));
        const r = await httpJson(`${base}/api/get?${p}`, ctx);
        if (r.status === 200 && hasContent(r.data)) {
          result = toResult(r.data);
        } else if (r.status !== 404 && r.status !== 200) {
          failed = true; // 429, 5xx...: không thử tiếp
        }
      }
      if (!result && !failed) {
        const p = new URLSearchParams({ track_name: t });
        if (a) p.set("artist_name", a);
        const r = await httpJson(`${base}/api/search?${p}`, ctx);
        if (r.status === 200 && Array.isArray(r.data)) {
          const best = pickBest(r.data, { title: t, artist: a, durationSec });
          if (best) result = toResult(best);
        } else if (r.status !== 404) {
          failed = true;
        }
      }
    } catch {
      failed = true;
    } finally {
      clearTimeout(timer);
    }

    cacheSet(key, result, result ? TTL_HIT : failed ? TTL_ERROR : TTL_MISS);
    return result;
  } catch {
    return null;
  }
}
