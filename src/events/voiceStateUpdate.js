import { Events } from "discord.js";
import { config } from "../config.js";
import { is247 } from "../utils/idle.js";

const timers = new Map();

export default {
  name: Events.VoiceStateUpdate,
  execute(client, oldState, newState) {
    const guildId = oldState.guild.id;
    const player = client.lavalink.getPlayer(guildId);
    if (!player?.voiceChannelId) return;

    // Only care about changes related to the bot's channel
    if (oldState.channelId !== player.voiceChannelId && newState.channelId !== player.voiceChannelId) return;

    if (is247(guildId, player.voiceChannelId)) return;

    const channel = oldState.guild.channels.cache.get(player.voiceChannelId);
    const humans = channel?.members.filter((m) => !m.user.bot).size ?? 0;

    if (humans > 0) {
      clearTimeout(timers.get(guildId));
      timers.delete(guildId);
      return;
    }

    if (timers.has(guildId)) return;
    timers.set(
      guildId,
      setTimeout(() => {
        timers.delete(guildId);
        const current = client.lavalink.getPlayer(guildId);
        const ch = current && oldState.guild.channels.cache.get(current.voiceChannelId);
        if (current && ch && !is247(guildId, current.voiceChannelId) && ch.members.filter((m) => !m.user.bot).size === 0) current.destroy();
      }, config.idleLeaveMs),
    );
  },
};
