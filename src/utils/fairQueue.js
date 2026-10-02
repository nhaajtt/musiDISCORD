/**
 * Interleaves tracks by requester: one track per person in turn, keeping each person's own order.
 * Returns a new array without modifying the original.
 */
export function roundRobin(tracks) {
  const queues = new Map();
  for (const track of tracks) {
    const id = track.requester?.id ?? "?";
    if (!queues.has(id)) queues.set(id, []);
    queues.get(id).push(track);
  }

  const lists = [...queues.values()];
  const out = [];
  for (let round = 0; out.length < tracks.length; round++) {
    for (const list of lists) if (round < list.length) out.push(list[round]);
  }
  return out;
}

/** Applies the fair order to the player's queue. */
export async function applyFairOrder(player) {
  const tracks = player.queue.tracks;
  if (tracks.length < 3) return;
  const ordered = roundRobin(tracks);
  if (ordered.every((t, i) => t === tracks[i])) return;
  await player.queue.splice(0, tracks.length, ...ordered);
}

/** Moves a track to the front of the queue (plays next). Returns false if the index is invalid. */
export async function moveToFront(player, index) {
  const tracks = player.queue.tracks;
  if (index < 0 || index >= tracks.length) return false;
  if (index === 0) return true;
  const [track] = tracks.slice(index, index + 1);
  await player.queue.splice(index, 1);
  await player.queue.splice(0, 0, track);
  return true;
}
