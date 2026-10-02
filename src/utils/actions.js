import { noteSkip } from "../recorder.js";
import { moveToFront } from "./fairQueue.js";
import { isDj } from "./guards.js";
import { stopNhaajt } from "./nhaajt.js";

const NEXT_LOOP = { off: "track", track: "queue", queue: "off" };

/** Skips the current track. Returns the skipped track's title, or null if nothing was playing. */
export async function skipTrack(player) {
  const title = player.queue.current?.info.title;
  if (!title) return null;

  if (player.queue.tracks.length === 0) await player.stopPlaying(true, false);
  else await player.skip();
  return title;
}

/** Number of real listeners in the bot's voice channel. */
export function listenerCount(player, guild) {
  const channel = guild.channels.cache.get(player.voiceChannelId);
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/**
 * Skips immediately if there are few listeners or the requester or a DJ asks; otherwise needs a majority (>= 50%) vote.
 * Returns { status: "none" | "skipped" | "voted" | "already", title?, votes?, needed? }.
 */
export async function requestSkip(player, member) {
  const track = player.queue.current;
  if (!track) return { status: "none" };

  const listeners = listenerCount(player, member.guild);
  const direct = listeners <= 2 || track.requester?.id === member.id || isDj(member, member.guild.id);
  if (direct) {
    noteSkip(player, member.id);
    return { status: "skipped", title: await skipTrack(player) };
  }

  const votes = player.getData("skipVotes") ?? new Set();
  const needed = Math.ceil(listeners / 2);
  if (votes.has(member.id)) return { status: "already", votes: votes.size, needed };

  votes.add(member.id);
  player.setData("skipVotes", votes);
  if (votes.size >= needed) {
    noteSkip(player, member.id);
    return { status: "skipped", title: await skipTrack(player), votes: votes.size, needed };
  }
  return { status: "voted", votes: votes.size, needed };
}

/** Reply text for a requestSkip result. */
export function describeSkip(result) {
  switch (result.status) {
    case "none":
      return "Nothing is playing.";
    case "skipped":
      return result.needed
        ? `⏭️ Got ${result.votes}/${result.needed} votes, skipped **${result.title}**`
        : `⏭️ Skipped **${result.title}**`;
    case "already":
      return `🗳️ You already voted (${result.votes}/${result.needed}).`;
    default:
      return `🗳️ Skip vote recorded: **${result.votes}/${result.needed}**. More votes needed.`;
  }
}

/**
 * Moves the track at `index` (0-based) to the front of the queue. Done immediately if there are few listeners or a DJ or the requester asks,
 * otherwise needs a majority (>= 50%) vote. Returns { status: "none" | "moved" | "voted" | "already", title?, votes?, needed? }.
 */
export async function requestBump(player, member, index) {
  const track = player.queue.tracks[index];
  if (!track) return { status: "none" };

  const listeners = listenerCount(player, member.guild);
  const direct = listeners <= 2 || track.requester?.id === member.id || isDj(member, member.guild.id);
  if (direct) {
    await moveToFront(player, index);
    return { status: "moved", title: track.info.title };
  }

  const all = player.getData("bumpVotes") ?? new WeakMap();
  player.setData("bumpVotes", all);
  const votes = all.get(track) ?? new Set();
  const needed = Math.ceil(listeners / 2);
  if (votes.has(member.id)) return { status: "already", votes: votes.size, needed, title: track.info.title };

  votes.add(member.id);
  all.set(track, votes);
  if (votes.size >= needed) {
    await moveToFront(player, player.queue.tracks.indexOf(track));
    return { status: "moved", title: track.info.title, votes: votes.size, needed };
  }
  return { status: "voted", votes: votes.size, needed, title: track.info.title };
}

/** Stops playback, clears the queue and turns off /nhaajt mode. */
export async function stopPlayback(player) {
  stopNhaajt(player);
  await player.stopPlaying(true, false);
}

/** Cycles the loop mode: off → track → queue → off. Returns the new mode. */
export async function cycleLoop(player) {
  const next = NEXT_LOOP[player.repeatMode] ?? "off";
  await player.setRepeatMode(next);
  return next;
}
