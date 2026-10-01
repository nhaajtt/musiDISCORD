import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const BEAT_MS = 15_000;
const file = path.join(config.dataDir, ".heartbeat");

function beat(client) {
  // Chỉ báo "khoẻ" khi vừa đăng nhập Discord vừa nối được Lavalink
  const node = client.lavalink.nodeManager.leastUsedNodes()[0];
  if (!client.isReady() || !node?.connected) return;

  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file, String(Date.now()));
}

export function startHeartbeat(client) {
  beat(client);
  setInterval(() => beat(client), BEAT_MS).unref();
}
