import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseFile } from "music-metadata";
import { config } from "../config.js";
import { db } from "../db.js";
import { get as libraryGet } from "../library/index.js";
import { localRelativePath, trackKey } from "../utils/trackKey.js";
import { parseLrc } from "./lrc.js";
import { fetchLyricsFromLrclib, guessArtistTitle } from "./lrclib.js";

const NEGATIVE_TTL_MS = 7 * 86_400_000;
const MAX_LRC_BYTES = 1_000_000;
const TIMESTAMP_MS = 2;

const stmt = {
  get: db.prepare("SELECT synced, plain, fetched_at FROM lyrics_cache WHERE track_key = ?"),
  put: db.prepare(
    `INSERT INTO lyrics_cache (track_key, synced, plain, fetched_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (track_key) DO UPDATE SET synced = excluded.synced, plain = excluded.plain, fetched_at = excluded.fetched_at`,
  ),
};

const hasLines = (parsed) => Boolean(parsed?.lines?.some((l) => l.text));

async function fromSidecar(rel) {
  const base = path.join(config.musicDir, rel).replace(/\.[^.]+$/, "");
  for (const ext of [".lrc", ".LRC"]) {
    try {
      const buffer = await readFile(`${base}${ext}`);
      if (buffer.length <= MAX_LRC_BYTES) return parseLrc(buffer.toString("utf8"));
    } catch {
      // no lyrics file alongside
    }
  }
  return null;
}

async function fromTags(rel) {
  try {
    const meta = await parseFile(path.join(config.musicDir, rel), { duration: false, skipCovers: true });
    const tag = meta.common.lyrics?.[0];
    if (!tag) return null;
    if (tag.syncText?.length && tag.timeStampFormat === TIMESTAMP_MS) {
      const lines = tag.syncText
        .filter((l) => typeof l.timestamp === "number")
        .map((l) => ({ timeMs: l.timestamp, text: String(l.text ?? "").trim() }))
        .sort((a, b) => a.timeMs - b.timeMs);
      if (lines.length) return { synced: true, offsetMs: 0, meta: {}, lines };
    }
    return tag.text ? parseLrc(tag.text) : null;
  } catch {
    return null;
  }
}

function searchTerms(track, rel) {
  const info = track.info;
  const entry = rel ? libraryGet(rel) : null;
  if (entry?.hasTags) return { title: entry.title, artist: entry.artist, album: entry.album };
  if (rel) {
    const guess = guessArtistTitle(path.posix.basename(rel).replace(/\.[^.]+$/, ""));
    return { title: guess.title, artist: guess.artist, album: entry?.album ?? null };
  }
  return { title: info.title, artist: info.author, album: info.album ?? null };
}

async function fromOnline(track, rel, key) {
  const cached = stmt.get.get(key);
  if (cached) {
    const hit = cached.synced || cached.plain;
    if (hit) return parseLrc(cached.synced || cached.plain);
    if (Date.now() - Number(cached.fetched_at) < NEGATIVE_TTL_MS) return null;
  }

  const found = await fetchLyricsFromLrclib({ ...searchTerms(track, rel), durationMs: track.info.duration });
  stmt.put.run(key, found?.syncedLyrics ?? null, found?.plainLyrics ?? null, Date.now());
  const text = found?.syncedLyrics || found?.plainLyrics;
  return text ? parseLrc(text) : null;
}

/**
 * Get song lyrics in this order: .lrc file next to the track, lyrics embedded in tags, cache / LRCLIB.
 * Returns { parsed, source } or null if there are no lyrics.
 */
export async function getLyrics(track) {
  const rel = localRelativePath(track.info);
  const key = trackKey(track);

  if (rel !== null) {
    const sidecar = await fromSidecar(rel);
    if (hasLines(sidecar)) return { parsed: sidecar, source: "file .lrc" };
    const tags = await fromTags(rel);
    if (hasLines(tags)) return { parsed: tags, source: "file tags" };
  }

  if (config.lyricsLookup) {
    const online = await fromOnline(track, rel, key);
    if (hasLines(online)) return { parsed: online, source: "LRCLIB" };
  }
  return null;
}
