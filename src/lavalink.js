import { LavalinkManager } from "lavalink-client";
import { alertOwner } from "./alerts.js";
import { config } from "./config.js";
import * as library from "./library/index.js";
import { normalizeLocalTrack } from "./library/normalize.js";
import { stopLive } from "./lyrics/live.js";
import { restoreQueues, saveAll } from "./persistence.js";
import { beginPlay, endPlay } from "./recorder.js";
import { ensure247 } from "./stay247.js";
import { finalizeNowPlaying, sendNowPlaying } from "./ui/nowPlaying.js";
import { cancelIdleLeave, is247, scheduleIdleLeave } from "./utils/idle.js";
import { refillNhaajt } from "./utils/nhaajt.js";
import { announceTrack, clearVoiceStatus } from "./utils/vcStatus.js";

export function createLavalink(client) {
  const manager = new LavalinkManager({
    nodes: [
      {
        id: "main",
        host: config.lavalink.host,
        port: config.lavalink.port,
        authorization: config.lavalink.password,
        secure: false,
        retryAmount: 10,
        retryDelay: 5000,
      },
    ],
    sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: { id: config.clientId, username: config.botName },
    playerOptions: {
      defaultSearchPlatform: "ytsearch",
      volumeDecrementer: 1,
      onDisconnect: { autoReconnect: true, destroyPlayer: false },
    },
  });

  const send = async (player, payload) => {
    const channel = client.channels.cache.get(player.textChannelId);
    await channel?.send(payload).catch(() => {});
  };

  const broadcast = (content) => {
    for (const player of manager.players.values()) send(player, { content });
  };

  let firstConnect = true;
  let wasDown = false;

  manager.nodeManager.on("connect", (node) => {
    console.log(`Lavalink node "${node.id}" connected`);

    if (firstConnect) {
      firstConnect = false;
      // Work to do once Lavalink is up: scan the library, restore queues, rejoin 24/7 channels
      (async () => {
        await library.scan();
        await restoreQueues(client);
        await ensure247(client);
      })().catch((error) => console.error("Post-connect initialization failed:", error));
    } else if (wasDown) {
      broadcast("✅ Reconnected to the music server.");
      alertOwner("lavalink-up", "✅ Lavalink reconnected.");
    }
    wasDown = false;
  });

  manager.nodeManager.on("error", (node, error) => console.error(`Lavalink node "${node.id}" error:`, error.message));

  manager.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`Lavalink node "${node.id}" disconnected:`, reason?.reason ?? reason);
    if (wasDown) return;
    wasDown = true;
    broadcast("⚠️ Lost connection to the music server, playback may be interrupted. The bot is trying to reconnect.");
    alertOwner("lavalink-down", `⚠️ Lavalink disconnected: ${reason?.reason ?? reason ?? "unknown reason"}`);
  });

  manager.on("trackStart", async (player, track) => {
    if (!track) return;
    normalizeLocalTrack(track);
    player.setData("skipVotes", undefined);
    cancelIdleLeave(player);
    stopLive(player);

    // Music quiz: don't show the track name, don't record stats
    if (player.getData("quiz")) return;

    beginPlay(player, track);
    saveAll(manager);
    announceTrack(client, player, track);

    // /nhaajt mode: keep the queue from ever running dry by loading a new round when the last track starts
    if (player.getData("nhaajt") && player.queue.tracks.length === 0) {
      refillNhaajt(player).catch((error) => console.error("Could not load a new round of music:", error));
    }

    await sendNowPlaying(client, player, track);
  });

  manager.on("trackEnd", (player, track, payload) => endPlay(client, player, payload));

  manager.on("trackError", (player, track, payload) => {
    console.error("Playback error:", track?.info?.title, payload?.exception?.message);
    if (player.getData("quiz")) return;
    send(player, { content: `❌ Could not play **${track?.info?.title ?? "this track"}**, skipping.` });
  });

  manager.on("trackStuck", (player, track) => {
    if (player.getData("quiz")) return;
    send(player, { content: `⚠️ **${track?.info?.title ?? "This track"}** got stuck, skipping.` });
  });

  manager.on("playerDestroy", (player, reason) => {
    player.getData("quiz")?.abort?.();
    stopLive(player);
    cancelIdleLeave(player);
    finalizeNowPlaying(player);
    clearVoiceStatus(client, player);
    // On shutdown keep the data for restoring; for other reasons (/leave, queue ended...) remove it from the saved state
    if (reason !== "Shutdown") {
      endPlay(client, player, { reason: "stopped" });
      saveAll(manager, { exclude: player.guildId });
    }
  });

  manager.on("queueEnd", (player) => {
    if (player.getData("quiz")) return;
    stopLive(player);
    finalizeNowPlaying(player);
    clearVoiceStatus(client, player);

    if (is247(player.guildId, player.voiceChannelId)) {
      send(player, { content: "✅ The queue has ended. The bot is staying in the channel because 24/7 mode is on." });
    } else {
      scheduleIdleLeave(player);
      send(player, { content: "✅ The queue has ended. The bot will leave the channel if no new track is added." });
    }
  });

  return manager;
}
