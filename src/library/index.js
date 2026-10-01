import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFile, selectCover } from "music-metadata";
import { config } from "../config.js";
import { listAudioFiles } from "../utils/library.js";

const CACHE_FILE = path.join(config.dataDir, "library-cache.json");
const READ_CONCURRENCY = 8;
const STALE_MS = 30_000;
const MAX_COVER_BYTES = 4 * 1024 * 1024;
const COVER_NAMES = ["cover", "folder", "front", "album"];
const COVER_EXT = [".jpg", ".jpeg", ".png", ".webp"];

const scanListeners = new Set();
let entries = new Map();
let lastScan = 0;
let scanning = null;
const covers = new Map();

/** Chuẩn hoá để so khớp: bỏ dấu, chữ thường, bỏ ký tự thừa. */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Ký tự điều khiển, ẩn và đổi chiều chữ
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Làm sạch chữ đọc từ thẻ file (do người dùng đặt): bỏ ký tự ẩn, bỏ link dạng [chữ](url) và dấu < >
 * (tránh dựng link hoặc nhắc tên trong tin nhắn), gọn khoảng trắng, giới hạn độ dài.
 */
export function cleanMeta(value) {
  const text = String(value ?? "")
    .replace(HIDDEN, " ")
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return text || null;
}

const clean = (value) => (typeof value === "string" ? cleanMeta(value) : null);

/** Đoán nghệ sĩ và tên bài từ tên file ("01-ten-bai", "Nghệ sĩ - Tên bài"). */
export function guessFromName(name) {
  let base = name.replace(/^\s*\d{1,3}\s*[-._)]\s*/, "").trim() || name.trim();
  if (!/\s/.test(base)) base = base.replace(/[-_]+/g, " ").trim() || base;

  const parts = base.split(/\s+[-–—|]\s+/);
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts.slice(1).join(" - ").trim();
    if (artist && title) return { artist, title };
  }
  return { artist: null, title: base };
}

export function buildEntry(rel, tags) {
  const parts = rel.split("/");
  const folders = parts.slice(0, -1);
  const name = parts.at(-1).replace(/\.[^.]+$/, "");
  const guess = guessFromName(name);
  const common = tags?.common ?? {};

  const title = clean(common.title) ?? guess.title;
  const artist = clean(common.artist) ?? clean(common.albumartist) ?? guess.artist ?? (folders.length >= 2 ? folders[0] : null);
  const album = clean(common.album) ?? (folders.length ? folders.at(-1) : null);
  const genre = clean(common.genre?.[0]);

  return {
    file: rel,
    title,
    artist,
    album,
    genre,
    year: common.year ?? null,
    trackNo: common.track?.no ?? null,
    durationMs: tags?.format?.duration ? Math.round(tags.format.duration * 1000) : null,
    hasTags: Boolean(clean(common.title)),
    searchText: normalizeText([title, artist, album, genre, name, folders.join(" ")].join(" ")),
  };
}

async function readTags(abs) {
  try {
    return await parseFile(abs, { duration: true, skipCovers: true });
  } catch {
    return null;
  }
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  try {
    await mkdir(config.dataDir, { recursive: true });
    const tmp = `${CACHE_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(cache));
    await rename(tmp, CACHE_FILE);
  } catch (error) {
    console.error("Không lưu được bộ nhớ đệm thư viện:", error.message);
  }
}

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

async function doScan() {
  const files = await listAudioFiles();
  const cache = await loadCache();
  const nextEntries = new Map();
  const nextCache = {};
  let changed = Object.keys(cache).length !== files.length;

  await pool(files, READ_CONCURRENCY, async (rel) => {
    let info;
    try {
      info = await stat(path.join(config.musicDir, rel));
    } catch {
      return;
    }
    const cached = cache[rel];
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      nextCache[rel] = cached;
      nextEntries.set(rel, cached.entry);
      return;
    }
    changed = true;
    const entry = buildEntry(rel, await readTags(path.join(config.musicDir, rel)));
    nextCache[rel] = { mtimeMs: info.mtimeMs, size: info.size, entry };
    nextEntries.set(rel, entry);
  });

  entries = nextEntries;
  covers.clear();
  if (changed) await saveCache(nextCache);
  for (const listener of scanListeners) {
    try {
      listener(all());
    } catch (error) {
      console.error("Xử lý sau khi quét thư viện lỗi:", error);
    }
  }
  return entries.size;
}

/** Đăng ký hàm được gọi (với toàn bộ danh sách bài) sau mỗi lần quét xong. Trả về hàm huỷ đăng ký. */
export function onScanned(listener) {
  scanListeners.add(listener);
  return () => scanListeners.delete(listener);
}

/** Quét lại thư mục music (chỉ đọc lại thẻ của file mới hoặc đã đổi). */
export function scan() {
  scanning ??= doScan().finally(() => {
    scanning = null;
    lastScan = Date.now();
  });
  return scanning;
}

/** Quét nền nếu dữ liệu đã cũ, không chờ kết quả. */
export function refreshIfStale() {
  if (!scanning && Date.now() - lastScan > STALE_MS) scan().catch((error) => console.error("Quét thư viện lỗi:", error));
}

export const all = () => [...entries.values()];
export const get = (rel) => entries.get(rel);
export const size = () => entries.size;

const byTitle = (a, b) => a.title.localeCompare(b.title, "vi");

/** Tìm bài theo tên, nghệ sĩ, album, thể loại. Mọi từ khoá đều phải khớp. */
export function search(query, limit = 25) {
  const q = normalizeText(query);
  const list = all();
  if (!q) return list.sort(byTitle).slice(0, limit);

  const tokens = q.split(" ");
  return list
    .filter((e) => tokens.every((t) => e.searchText.includes(t)))
    .map((e) => {
      const title = normalizeText(e.title);
      const artist = normalizeText(e.artist);
      let score = 0;
      if (title.startsWith(q)) score += 30;
      else if (title.includes(q)) score += 20;
      if (artist.includes(q)) score += 10;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || byTitle(a.e, b.e))
    .slice(0, limit)
    .map((x) => x.e);
}

const byAlbumOrder = (a, b) => (a.trackNo ?? 9999) - (b.trackNo ?? 9999) || a.file.localeCompare(b.file, "vi");

function group(keyOf, nameOf) {
  const groups = new Map();
  for (const e of entries.values()) {
    const name = nameOf(e);
    if (!name) continue;
    const key = normalizeText(name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, name, tracks: [] });
    groups.get(key).tracks.push(e);
  }
  return [...groups.values()];
}

export function albums() {
  return group(null, (e) => e.album).map((a) => ({ ...a, tracks: a.tracks.sort(byAlbumOrder) }));
}

export function artists() {
  return group(null, (e) => e.artist);
}

function searchGroups(list, query, limit) {
  const q = normalizeText(query);
  const filtered = q ? list.filter((g) => q.split(" ").every((t) => g.key.includes(t))) : list;
  return filtered.sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name, "vi")).slice(0, limit);
}

export const searchAlbums = (query, limit = 25) => searchGroups(albums(), query, limit);
export const searchArtists = (query, limit = 25) => searchGroups(artists(), query, limit);

/** Lấy album/nghệ sĩ theo đúng tên (không phân biệt dấu và hoa thường). */
export const findAlbum = (name) => albums().find((a) => a.key === normalizeText(name)) ?? null;
export const findArtist = (name) => artists().find((a) => a.key === normalizeText(name)) ?? null;

async function folderCover(rel) {
  const dir = path.join(config.musicDir, path.dirname(rel));
  try {
    const names = await readdir(dir);
    for (const base of COVER_NAMES) {
      for (const ext of COVER_EXT) {
        const hit = names.find((n) => n.toLowerCase() === `${base}${ext}`);
        if (!hit) continue;
        const buffer = await readFile(path.join(dir, hit));
        if (buffer.length <= MAX_COVER_BYTES) return { buffer, mime: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg" };
      }
    }
  } catch {
    // không có ảnh trong thư mục
  }
  return null;
}

/** Ảnh bìa: ảnh nhúng trong file, nếu không có thì ảnh cover/folder trong thư mục. */
export async function getCover(rel) {
  if (covers.has(rel)) return covers.get(rel);

  let result = null;
  try {
    const meta = await parseFile(path.join(config.musicDir, rel), { duration: false, skipCovers: false });
    const pic = selectCover(meta.common.picture);
    if (pic && pic.data.length <= MAX_COVER_BYTES) result = { buffer: Buffer.from(pic.data), mime: pic.format };
  } catch {
    // bỏ qua, thử ảnh trong thư mục
  }
  result ??= await folderCover(rel);

  if (covers.size >= 40) covers.delete(covers.keys().next().value);
  covers.set(rel, result);
  return result;
}

const MAX_CHOICE = 95;

function aliasOf(rel) {
  let hash = 2166136261;
  for (const ch of rel) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619) >>> 0;
  return `~${hash.toString(36)}`;
}

/** Giá trị dùng trong ô gợi ý của Discord (giới hạn 100 ký tự): đường dẫn, hoặc bí danh nếu quá dài. */
export function choiceValue(entry) {
  return entry.file.length <= MAX_CHOICE ? entry.file : aliasOf(entry.file);
}

/** Tìm bài từ giá trị gợi ý (đường dẫn hoặc bí danh), nếu không khớp thì coi như từ khoá tìm kiếm. */
export function resolve(value) {
  if (entries.has(value)) return entries.get(value);
  if (value.startsWith("~")) return all().find((e) => aliasOf(e.file) === value) ?? null;
  return search(value, 1)[0] ?? null;
}
