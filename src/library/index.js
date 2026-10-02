import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFile, selectCover } from "music-metadata";
import { config } from "../config.js";
import { listAudioFiles } from "../utils/library.js";
import { coverKey, coversDir, refreshOverlay, tags } from "./overlay.js";

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

/** Normalize for matching: strip diacritics, lowercase, drop extra characters. */
export function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Control, invisible and bidi-override characters
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Sanitize text read from file tags (user-supplied): drop invisible characters, [text](url) links and < >
 * (so messages can't build links or mentions), collapse whitespace, cap the length.
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

/** Guess artist and title from the filename ("01-song-name", "Artist - Title"). */
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

/**
 * Overlay auto-assigned tags on a library entry (only when approved/applied). Leaves the source file untouched;
 * runs after loading from the cache, so edits to tags.json take effect on the next scan.
 */
export function applyOverlay(entry, overlay) {
  if (!overlay || overlay.status !== "applied") return entry;
  const title = clean(overlay.title) ?? entry.title;
  const artist = clean(overlay.artist) ?? entry.artist;
  const album = clean(overlay.album) ?? entry.album;
  const parts = entry.file.split("/");
  const name = parts.at(-1).replace(/\.[^.]+$/, "");
  return {
    ...entry,
    title,
    artist,
    album,
    year: overlay.year ?? entry.year,
    trackNo: overlay.trackNo ?? entry.trackNo,
    hasTags: true,
    tagged: true,
    searchText: normalizeText([title, artist, album, entry.genre, name, parts.slice(0, -1).join(" ")].join(" ")),
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
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(cache));
    await rename(tmp, CACHE_FILE);
  } catch (error) {
    console.error("Could not save the library cache:", error.message);
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
  refreshOverlay();

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
      nextEntries.set(rel, applyOverlay(cached.entry, tags.get(rel)));
      return;
    }
    changed = true;
    const entry = buildEntry(rel, await readTags(path.join(config.musicDir, rel)));
    nextCache[rel] = { mtimeMs: info.mtimeMs, size: info.size, entry };
    nextEntries.set(rel, applyOverlay(entry, tags.get(rel)));
  });

  entries = nextEntries;
  covers.clear();
  if (changed) await saveCache(nextCache);
  for (const listener of scanListeners) {
    try {
      listener(all());
    } catch (error) {
      console.error("Post-scan library handler failed:", error);
    }
  }
  return entries.size;
}

/** Register a callback invoked (with the full track list) after each completed scan. Returns an unsubscribe function. */
export function onScanned(listener) {
  scanListeners.add(listener);
  return () => scanListeners.delete(listener);
}

/** Rescan the music folder (re-reads tags only for new or changed files). */
export function scan() {
  scanning ??= doScan().finally(() => {
    scanning = null;
    lastScan = Date.now();
  });
  return scanning;
}

/** Scan in the background if the data is stale, without waiting for the result. */
export function refreshIfStale() {
  if (!scanning && Date.now() - lastScan > STALE_MS) scan().catch((error) => console.error("Library scan failed:", error));
}

export const all = () => [...entries.values()];
export const get = (rel) => entries.get(rel);
export const size = () => entries.size;

const byTitle = (a, b) => a.title.localeCompare(b.title, "vi");

/** Search tracks by title, artist, album, genre. Every keyword must match. */
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

/** Get an album/artist by exact name (ignoring diacritics and case). */
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
    // no image in the folder
  }
  return null;
}

/** Auto-downloaded cover (Cover Art Archive), stored outside the music folder in SHARED_DIR/covers. */
async function sharedCover(rel) {
  try {
    const buffer = await readFile(path.join(coversDir(), `${coverKey(rel)}.jpg`));
    return buffer.length <= MAX_COVER_BYTES ? { buffer, mime: "image/jpeg" } : null;
  } catch {
    return null;
  }
}

/** Cover art: the image embedded in the file, otherwise a cover/folder image in the directory. */
export async function getCover(rel) {
  if (covers.has(rel)) return covers.get(rel);

  let result = null;
  try {
    const meta = await parseFile(path.join(config.musicDir, rel), { duration: false, skipCovers: false });
    const pic = selectCover(meta.common.picture);
    if (pic && pic.data.length <= MAX_COVER_BYTES) result = { buffer: Buffer.from(pic.data), mime: pic.format };
  } catch {
    // ignore, try the image in the folder
  }
  result ??= await folderCover(rel);
  result ??= await sharedCover(rel);

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

/** Value used in Discord autocomplete (100-character limit): the path, or an alias if too long. */
export function choiceValue(entry) {
  return entry.file.length <= MAX_CHOICE ? entry.file : aliasOf(entry.file);
}

/** Find a track from an autocomplete value (path or alias); if nothing matches, treat it as a search keyword. */
export function resolve(value) {
  if (entries.has(value)) return entries.get(value);
  if (value.startsWith("~")) return all().find((e) => aliasOf(e.file) === value) ?? null;
  return search(value, 1)[0] ?? null;
}
