import { normalizeLocalTrack } from "../library/normalize.js";
import { ratingScores } from "../stats.js";
import { musicPath } from "./library.js";
import { smartOrder } from "./smartOrder.js";

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

/** Adds a new round to the queue: weighted shuffle by ratings, avoiding an immediate repeat of the current track. */
export async function refillNhaajt(player) {
  const library = player.getData("nhaajtTracks");
  if (!library?.length) return;

  const order = smartOrder(library, { scores: ratingScores(player.guildId) });
  const current = player.queue.current;
  if (current && order.length > 1 && order[0].info.identifier === current.info.identifier) {
    [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
  }
  await player.queue.add(order.map(cloneTrack));
}

export function stopNhaajt(player) {
  player.setData("nhaajt", false);
}

/** Starts endless random playback of all `files`. Returns the number of tracks loaded. */
export async function startNhaajt(player, files, requester) {
  stopNhaajt(player);
  if (player.queue.current || player.queue.tracks.length) await player.stopPlaying(true, false);
  await player.setRepeatMode("off");

  const tracks = await loadLibrary(player, files, requester);
  if (!tracks.length) return 0;

  player.setData("nhaajtTracks", tracks);
  player.setData("nhaajt", true);
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
