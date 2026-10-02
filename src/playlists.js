// Saved playlists. "user" playlists belong to one person (any server), "guild" playlists belong to a server.
import { db } from "./db.js";

export const MAX_PLAYLISTS = 25;
export const MAX_TRACKS = 200;
export const MAX_NAME = 40;

export class PlaylistError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const stmt = {
  insert: db.prepare("INSERT INTO playlists (scope, owner_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)"),
  count: db.prepare("SELECT COUNT(*) AS n FROM playlists WHERE scope = ? AND owner_id = ?"),
  byId: db.prepare("SELECT * FROM playlists WHERE id = ?"),
  byName: db.prepare("SELECT * FROM playlists WHERE scope = ? AND owner_id = ? AND name = ?"),
  list: db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist_id = p.id) AS tracks
     FROM playlists p WHERE p.scope = ? AND p.owner_id = ? ORDER BY p.name`,
  ),
  tracks: db.prepare("SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position"),
  trackCount: db.prepare("SELECT COUNT(*) AS n FROM playlist_tracks WHERE playlist_id = ?"),
  maxPos: db.prepare("SELECT COALESCE(MAX(position), 0) AS p FROM playlist_tracks WHERE playlist_id = ?"),
  hasKey: db.prepare("SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_key = ?"),
  addTrack: db.prepare(
    "INSERT INTO playlist_tracks (playlist_id, position, track_key, title, artist, uri, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  removeTrack: db.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND position = ?"),
  shift: db.prepare("UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?"),
  delete: db.prepare("DELETE FROM playlists WHERE id = ?"),
};

/** Runs `fn` in a transaction. */
function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cleanName(name) {
  const clean = String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) throw new PlaylistError("name", "Give the playlist a name.");
  if (clean.length > MAX_NAME) throw new PlaylistError("name", `Playlist names can be at most ${MAX_NAME} characters.`);
  return clean;
}

export function createPlaylist({ scope, ownerId, name, createdBy }) {
  const clean = cleanName(name);
  if (stmt.byName.get(scope, ownerId, clean)) throw new PlaylistError("exists", `A playlist named "${clean}" already exists.`);
  if (stmt.count.get(scope, ownerId).n >= MAX_PLAYLISTS) {
    throw new PlaylistError("limit", `You can have at most ${MAX_PLAYLISTS} playlists here. Delete one first.`);
  }
  const { lastInsertRowid } = stmt.insert.run(scope, ownerId, clean, createdBy ?? null, Date.now());
  return stmt.byId.get(Number(lastInsertRowid));
}

export const getPlaylist = (id) => stmt.byId.get(id) ?? null;
export const findPlaylist = (scope, ownerId, name) => stmt.byName.get(scope, ownerId, String(name).trim()) ?? null;
export const listPlaylists = (scope, ownerId) => stmt.list.all(scope, ownerId);
export const listTracks = (playlistId) => stmt.tracks.all(playlistId);

/**
 * Finds a playlist the person may use: a reference such as "user:12" / "guild:7" (from autocomplete) or a plain name,
 * looked up in their personal playlists first, then the server's.
 */
export function resolvePlaylist(ref, { userId, guildId }) {
  const text = String(ref ?? "").trim();
  const match = /^(user|guild):(\d+)$/.exec(text);
  if (match) {
    const playlist = getPlaylist(Number(match[2]));
    if (!playlist || playlist.scope !== match[1]) return null;
    const owner = playlist.scope === "user" ? userId : guildId;
    return playlist.owner_id === owner ? playlist : null;
  }
  return findPlaylist("user", userId, text) ?? (guildId ? findPlaylist("guild", guildId, text) : null);
}

/**
 * Appends tracks ({ key, title, artist, uri, durationMs }) and skips ones already in the playlist.
 * Returns how many were added and whether the size cap cut the list short.
 */
export function addTracks(playlistId, tracks) {
  return transaction(() => {
    let position = stmt.maxPos.get(playlistId).p;
    let room = MAX_TRACKS - stmt.trackCount.get(playlistId).n;
    let added = 0;
    let duplicates = 0;
    for (const track of tracks) {
      if (stmt.hasKey.get(playlistId, track.key)) {
        duplicates++;
        continue;
      }
      if (room <= 0) return { added, duplicates, full: true };
      stmt.addTrack.run(
        playlistId,
        ++position,
        track.key,
        String(track.title ?? "Unknown").slice(0, 200),
        track.artist ? String(track.artist).slice(0, 200) : null,
        track.uri ?? null,
        Number.isFinite(track.durationMs) ? Math.round(track.durationMs) : null,
      );
      room--;
      added++;
    }
    return { added, duplicates, full: false };
  });
}

/** Removes the track at `position` (1-based) and closes the gap. Returns the removed row or null. */
export function removeTrack(playlistId, position) {
  return transaction(() => {
    const row = stmt.tracks.all(playlistId).find((t) => t.position === position);
    if (!row) return null;
    stmt.removeTrack.run(playlistId, position);
    stmt.shift.run(playlistId, position);
    return row;
  });
}

export const deletePlaylist = (id) => Number(stmt.delete.run(id).changes) > 0;

/** Turns a Lavalink track into the row stored in a playlist. */
export function toStoredTrack(track, key) {
  const { title, author, uri, duration, sourceName } = track.info;
  return { key, title, artist: author, uri: sourceName === "local" ? null : uri, durationMs: duration };
}
