import { config } from "../config.js";
import { getSettings } from "../store.js";

/** Server có bật 24/7 cho đúng kênh thoại mà player đang ở không? */
export function is247(guildId, voiceChannelId) {
  const stay = getSettings(guildId).stay247;
  return Boolean(stay) && stay.voiceChannelId === voiceChannelId;
}

export function cancelIdleLeave(player) {
  clearTimeout(player.getData("idleTimer"));
  player.setData("idleTimer", undefined);
}

/** Hẹn rời kênh nếu vẫn rảnh sau một lúc (không áp dụng khi bật 24/7). */
export function scheduleIdleLeave(player, ms = config.idleLeaveMs) {
  cancelIdleLeave(player);
  if (is247(player.guildId, player.voiceChannelId)) return;

  const timer = setTimeout(() => {
    player.setData("idleTimer", undefined);
    const busy = player.queue.current || player.queue.tracks.length || player.getData("quiz");
    if (!busy && !is247(player.guildId, player.voiceChannelId)) player.destroy("QueueEmpty").catch(() => {});
  }, ms);
  player.setData("idleTimer", timer);
}
