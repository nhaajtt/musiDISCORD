import { config } from "./config.js";
import * as library from "./library/index.js";
import { allSettings } from "./store.js";
import { startNhaajt } from "./utils/nhaajt.js";

/** Rejoins voice channels with 24/7 enabled (after the bot starts) and starts the radio if requested. */
export async function ensure247(client) {
  for (const [guildId, settings] of allSettings()) {
    const stay = settings.stay247;
    if (!stay) continue;

    try {
      const channel = client.guilds.cache.get(guildId)?.channels.cache.get(stay.voiceChannelId);
      if (!channel?.isVoiceBased()) continue;

      const player =
        client.lavalink.getPlayer(guildId) ??
        client.lavalink.createPlayer({
          guildId,
          voiceChannelId: stay.voiceChannelId,
          textChannelId: stay.textChannelId,
          selfDeaf: config.selfDeaf,
          selfMute: false,
          volume: settings.defaultVolume,
        });
      if (!player.connected) await player.connect();

      const idle = !player.queue.current && player.queue.tracks.length === 0;
      if (stay.radio && idle) {
        const files = library.all().map((e) => e.file);
        const requester = { id: client.user.id, username: "Radio 24/7" };
        if (files.length) await startNhaajt(player, files, requester);
      }
    } catch (error) {
      console.error(`Could not rejoin the 24/7 channel of server ${guildId}:`, error);
    }
  }
}
