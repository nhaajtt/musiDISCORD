import { LavalinkManager } from "lavalink-client";
import { alertOwner } from "./alerts.js";
import { config } from "./config.js";
import { failoverTargets } from "./infra.js";
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
    nodes: config.lavalink.nodes.map((node) => ({
      id: node.id,
      host: node.host,
      port: node.port,
      authorization: node.password,
      secure: node.secure,
      retryAmount: 10,
      retryDelay: 5000,
    })),
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
      broadcast("✅ Reconnected to the music server. Sorry, I just stepped out.");
      alertOwner("lavalink-up", "✅ Lavalink reconnected.");
    }
    wasDown = false;
  });

  manager.nodeManager.on("error", (node, error) => console.error(`Lavalink node "${node.id}" error:`, error.message));

  /** Moves the players of a node that just went down to the other nodes. Returns how many players could not be moved. */
  async function failOver(node) {
    const players = [...manager.players.values()].filter((p) => p.node?.id === node.id);
    let stranded = 0;
    for (const player of players) {
      const [target] = failoverTargets([...manager.nodeManager.nodes.values()], node);
      if (!target) {
        stranded++;
        continue;
      }
      try {
        await player.changeNode(target.id);
        console.log(`Moved the player of guild ${player.guildId} from node "${node.id}" to "${target.id}".`);
      } catch (error) {
        stranded++;
        console.error(`Could not move the player of guild ${player.guildId} off node "${node.id}":`, error.message);
      }
    }
    return stranded;
  }

  manager.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`Lavalink node "${node.id}" disconnected:`, reason?.reason ?? reason);

    // Other nodes still up: move this node's players over and carry on without bothering anyone
    const othersUp = [...manager.nodeManager.nodes.values()].some((n) => n.id !== node.id && n.connected);
    if (othersUp) {
      failOver(node).then((stranded) => {
        alertOwner(`lavalink-failover-${node.id}`, `⚠️ Lavalink node "${node.id}" went down; its players were moved to another node${stranded ? ` (${stranded} could not be moved)` : ""}.`);
      });
      return;
    }

    if (wasDown) return;
    wasDown = true;
    broadcast("⚠️ Lost connection to the music server, so playback may stutter. I'm trying to reconnect.");
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
    send(player, { content: `❌ Could not play **${track?.info?.title ?? "this track"}**, skipping. It wasn't feeling it.` });
  });

  manager.on("trackStuck", (player, track) => {
    if (player.getData("quiz")) return;
    send(player, { content: `⚠️ **${track?.info?.title ?? "This track"}** got stuck, skipping. Rude of it.` });
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
      send(player, { content: "✅ The queue has ended. I'm staying because 24/7 mode is on. Awkward silence incoming." });
    } else {
      scheduleIdleLeave(player);
      send(player, { content: "✅ The queue has ended. Add a track soon or I'll leave, I can take a hint." });
    }
  });

  return manager;
}
