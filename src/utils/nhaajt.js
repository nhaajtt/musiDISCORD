import * as library from "../library/index.js";
import { normalizeLocalTrack } from "../library/normalize.js";
import { radioScores } from "../radio.js";
import { ratingScores } from "../stats.js";
import { musicPath } from "./library.js";
import { smartOrder } from "./smartOrder.js";
import { localRelativePath } from "./trackKey.js";

const CONCURRENCY = 8;

const cloneTrack = (track) => ({ ...track, info: { ...track.info } });

/** Loads metadata for files (relative paths in the music folder) via Lavalink, skipping files that fail. */
export async function loadLibrary(player, files, requester) {
  const tracks = new Array(files.length);
  let next = 0;

  async function worker() {
    while (next < files.length) {
      const i = next++;
      const res = await player.search({ query: musicPath(files[i]), source: "local" }, requester).catch(() => null);
      if (res?.loadType === "track" || res?.loadType === "search") tracks[i] = normalizeLocalTrack(res.tracks[0]);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return tracks.filter(Boolean);
}

/**
 * Brings the running library up to date with the music folder: loads files added since the loop started and
 * drops files that were removed. Only for loops over the whole folder (not /vibe, which plays a subset).
 */
export async function syncNhaajtLibrary(player) {
  if (player.getData("nhaajtSync") === false) return;
  const library_ = player.getData("nhaajtTracks");
  if (!library_) return;

  await library.scan();
  const files = new Set(library.all().map((e) => e.file));
  if (!files.size) return;

  const known = new Set(library_.map((t) => localRelativePath(t.info)));
  const added = [...files].filter((f) => !known.has(f));
  const fresh = added.length ? await loadLibrary(player, added, library_[0]?.requester) : [];
  const kept = library_.filter((t) => {
    const rel = localRelativePath(t.info);
    return rel === null || files.has(rel);
  });
  if (fresh.length || kept.length !== library_.length) player.setData("nhaajtTracks", [...kept, ...fresh]);
}

/** Adds a new round to the queue: weighted shuffle by ratings, avoiding an immediate repeat of the current track. */
export async function refillNhaajt(player) {
  await syncNhaajtLibrary(player).catch((error) => console.error("Could not refresh the music library:", error));
  const library = player.getData("nhaajtTracks");
  if (!library?.length) return;

  const scores = player.getData("radio") ? radioScores(player.guildId) : ratingScores(player.guildId);
  const order = smartOrder(library, { scores });
  const current = player.queue.current;
  if (current && order.length > 1 && order[0].info.identifier === current.info.identifier) {
    [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
  }
  await player.queue.add(order.map(cloneTrack));
}

export function stopNhaajt(player) {
  player.setData("nhaajt", false);
  player.setData("radio", false);
}

/**
 * Starts endless random playback of all `files`. Returns the number of tracks loaded.
 * With `radio`, every new round is ordered by what the server likes and the time of day (see src/radio.js).
 */
export async function startNhaajt(player, files, requester, { radio = false, sync = true } = {}) {
  stopNhaajt(player);
  if (player.queue.current || player.queue.tracks.length) await player.stopPlaying(true, false);
  await player.setRepeatMode("off");

  const tracks = await loadLibrary(player, files, requester);
  if (!tracks.length) return 0;

  player.setData("nhaajtTracks", tracks);
  player.setData("nhaajt", true);
  player.setData("radio", radio);
  player.setData("nhaajtSync", sync);
  await refillNhaajt(player);
  await player.play();
  return tracks.length;
}

/** Adds files to the queue (optionally smart-shuffled) and plays if idle. Returns the number of tracks added. */
export async function queueFiles(player, files, requester, { shuffle = false } = {}) {
  let tracks = await loadLibrary(player, files, requester);
  if (!tracks.length) return 0;
  if (shuffle) tracks = smartOrder(tracks, { scores: ratingScores(player.guildId) });
  await player.queue.add(tracks);
  if (!player.playing && !player.paused) await player.play();
  return tracks.length;
}
