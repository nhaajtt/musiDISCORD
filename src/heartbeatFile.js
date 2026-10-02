import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Heartbeat is written to RAM (/dev/shm) to avoid wearing out the SD card / SSD
export const heartbeatFile =
  process.env.HEARTBEAT_FILE ||
  (existsSync("/dev/shm") ? "/dev/shm/musidiscord.heartbeat" : path.join(os.tmpdir(), "musidiscord.heartbeat"));
