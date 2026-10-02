import { config } from "../config.js";
import { getSettings } from "../store.js";

/** Does the server have 24/7 enabled for the voice channel the player is in? */
export function is247(guildId, voiceChannelId) {
  const stay = getSettings(guildId).stay247;
  return Boolean(stay) && stay.voiceChannelId === voiceChannelId;
}

export function cancelIdleLeave(player) {
  clearTimeout(player.getData("idleTimer"));
  player.setData("idleTimer", undefined);
}

/** Schedules leaving the channel if still idle after a while (not applied when 24/7 is on). */
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
