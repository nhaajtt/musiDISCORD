import { noteSkip } from "../recorder.js";
import { moveToFront } from "./fairQueue.js";
import { isDj } from "./guards.js";
import { stopNhaajt } from "./nhaajt.js";

const NEXT_LOOP = { off: "track", track: "queue", queue: "off" };

/** Bỏ qua bài đang phát. Trả về tên bài đã bỏ qua, hoặc null nếu không có bài nào. */
export async function skipTrack(player) {
  const title = player.queue.current?.info.title;
  if (!title) return null;

  if (player.queue.tracks.length === 0) await player.stopPlaying(true, false);
  else await player.skip();
  return title;
}

/** Số người thật đang nghe trong kênh thoại của bot. */
export function listenerCount(player, guild) {
  const channel = guild.channels.cache.get(player.voiceChannelId);
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/**
 * Bỏ qua bài ngay nếu có ít người nghe, người yêu cầu bài hoặc DJ bấm; còn lại cần đa số (>= 50%) bỏ phiếu.
 * Trả về { status: "none" | "skipped" | "voted" | "already", title?, votes?, needed? }.
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

/** Câu trả lời cho kết quả của requestSkip. */
export function describeSkip(result) {
  switch (result.status) {
    case "none":
      return "Không có bài nào đang phát.";
    case "skipped":
      return result.needed
        ? `⏭️ Đủ ${result.votes}/${result.needed} phiếu, đã bỏ qua **${result.title}**`
        : `⏭️ Đã bỏ qua **${result.title}**`;
    case "already":
      return `🗳️ Bạn đã bỏ phiếu rồi (${result.votes}/${result.needed}).`;
    default:
      return `🗳️ Đã ghi nhận phiếu bỏ qua: **${result.votes}/${result.needed}**. Cần thêm người đồng ý.`;
  }
}

/**
 * Đưa bài ở vị trí `index` (tính từ 0) lên đầu hàng chờ. Ít người nghe, DJ hoặc người yêu cầu bài thì làm ngay,
 * còn lại cần đa số (>= 50%) bỏ phiếu. Trả về { status: "none" | "moved" | "voted" | "already", title?, votes?, needed? }.
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

/** Dừng phát, xoá hàng chờ và tắt chế độ /nhaajt. */
export async function stopPlayback(player) {
  stopNhaajt(player);
  await player.stopPlaying(true, false);
}

/** Chuyển vòng chế độ lặp: tắt → bài → hàng chờ → tắt. Trả về chế độ mới. */
export async function cycleLoop(player) {
  const next = NEXT_LOOP[player.repeatMode] ?? "off";
  await player.setRepeatMode(next);
  return next;
}
