import { normalizeLocalTrack } from "../library/normalize.js";
import { ratingScores } from "../stats.js";
import { musicPath } from "./library.js";
import { smartOrder } from "./smartOrder.js";

const CONCURRENCY = 6;

/** Resolves one stored playlist row to a playable Lavalink track, or null if it can't be found any more. */
async function resolveRow(player, row, requester) {
  const query = row.track_key.startsWith("local:")
    ? { query: musicPath(row.track_key.slice("local:".length)), source: "local" }
    : row.uri
      ? { query: row.uri }
      : null;
  if (!query) return null;

  const res = await player.search(query, requester).catch(() => null);
  if (res?.loadType === "track" || res?.loadType === "search") return normalizeLocalTrack(res.tracks[0]);
  return null;
}

/** Loads the tracks of a playlist in order. Returns { tracks, missing } (rows that could not be loaded). */
export async function loadPlaylistTracks(player, rows, requester) {
  const loaded = new Array(rows.length);
  let next = 0;

  async function worker() {
    while (next < rows.length) {
      const i = next++;
      loaded[i] = await resolveRow(player, rows[i], requester);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return {
    tracks: loaded.filter(Boolean),
    missing: rows.filter((_, i) => !loaded[i]),
  };
}

/** Queues a playlist (optionally smart-shuffled) and starts playing if idle. */
export async function queuePlaylist(player, rows, requester, { shuffle = false } = {}) {
  const { tracks, missing } = await loadPlaylistTracks(player, rows, requester);
  if (!tracks.length) return { added: 0, missing: missing.length };

  const ordered = shuffle ? smartOrder(tracks, { scores: ratingScores(player.guildId) }) : tracks;
  await player.queue.add(ordered);
  if (!player.playing && !player.paused) await player.play();
  return { added: ordered.length, missing: missing.length };
}
