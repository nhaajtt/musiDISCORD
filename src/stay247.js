import * as library from "./library/index.js";
import { allSettings } from "./store.js";
import { startNhaajt } from "./utils/nhaajt.js";

/** Vào lại các kênh thoại đã bật 24/7 (sau khi bot khởi động) và bật radio nếu được yêu cầu. */
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
          selfDeaf: true,
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
      console.error(`Không vào lại được kênh 24/7 của server ${guildId}:`, error);
    }
  }
}
