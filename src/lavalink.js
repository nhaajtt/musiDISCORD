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
    client: { id: config.clientId, username: "musiDISCORD" },
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
    console.log(`Lavalink node "${node.id}" đã kết nối`);

    if (firstConnect) {
      firstConnect = false;
      // Việc cần làm khi vừa có Lavalink: quét thư viện, khôi phục hàng chờ, vào lại kênh 24/7
      (async () => {
        await library.scan();
        await restoreQueues(client);
        await ensure247(client);
      })().catch((error) => console.error("Khởi tạo sau khi nối Lavalink lỗi:", error));
    } else if (wasDown) {
      broadcast("✅ Đã kết nối lại với máy chủ nhạc.");
      alertOwner("lavalink-up", "✅ Lavalink đã kết nối lại.");
    }
    wasDown = false;
  });

  manager.nodeManager.on("error", (node, error) => console.error(`Lavalink node "${node.id}" lỗi:`, error.message));

  manager.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`Lavalink node "${node.id}" ngắt kết nối:`, reason?.reason ?? reason);
    if (wasDown) return;
    wasDown = true;
    broadcast("⚠️ Mất kết nối với máy chủ nhạc, nhạc có thể bị gián đoạn. Bot đang thử kết nối lại.");
    alertOwner("lavalink-down", `⚠️ Lavalink mất kết nối: ${reason?.reason ?? reason ?? "không rõ lý do"}`);
  });

  manager.on("trackStart", async (player, track) => {
    if (!track) return;
    normalizeLocalTrack(track);
    player.setData("skipVotes", undefined);
    cancelIdleLeave(player);
    stopLive(player);

    // Đố nhạc: không hiện tên bài, không ghi thống kê
    if (player.getData("quiz")) return;

    beginPlay(player, track);
    saveAll(manager);
    announceTrack(client, player, track);

    // Chế độ /nhaajt: giữ hàng chờ không bao giờ cạn bằng cách nạp vòng mới khi bắt đầu bài cuối
    if (player.getData("nhaajt") && player.queue.tracks.length === 0) {
      refillNhaajt(player).catch((error) => console.error("Không nạp được vòng nhạc mới:", error));
    }

    await sendNowPlaying(client, player, track);
  });

  manager.on("trackEnd", (player, track, payload) => endPlay(client, player, payload));

  manager.on("trackError", (player, track, payload) => {
    console.error("Lỗi phát bài:", track?.info?.title, payload?.exception?.message);
    if (player.getData("quiz")) return;
    send(player, { content: `❌ Không phát được **${track?.info?.title ?? "bài này"}**, đang bỏ qua.` });
  });

  manager.on("trackStuck", (player, track) => {
    if (player.getData("quiz")) return;
    send(player, { content: `⚠️ Bài **${track?.info?.title ?? "này"}** bị đứng, đang bỏ qua.` });
  });

  manager.on("playerDestroy", (player, reason) => {
    player.getData("quiz")?.abort?.();
    stopLive(player);
    cancelIdleLeave(player);
    finalizeNowPlaying(player);
    clearVoiceStatus(client, player);
    // Tắt bot thì giữ lại dữ liệu để khôi phục; các lý do khác (/leave, hết hàng chờ...) thì xoá khỏi bản lưu
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
      send(player, { content: "✅ Đã hết hàng chờ. Bot ở lại kênh vì đang bật chế độ 24/7." });
    } else {
      scheduleIdleLeave(player);
      send(player, { content: "✅ Đã hết hàng chờ. Bot sẽ rời kênh nếu không có bài mới." });
    }
  });

  return manager;
}
