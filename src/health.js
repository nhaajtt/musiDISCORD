import { writeFileSync } from "node:fs";
import { heartbeatFile } from "./heartbeatFile.js";

const BEAT_MS = 15_000;

function beat(client) {
  // Chỉ báo "khoẻ" khi vừa đăng nhập Discord vừa nối được Lavalink
  const node = client.lavalink.nodeManager.leastUsedNodes()[0];
  if (!client.isReady() || !node?.connected) return;

  writeFileSync(heartbeatFile, String(Date.now()));
}

export function startHeartbeat(client) {
  beat(client);
  setInterval(() => beat(client), BEAT_MS).unref();
}
