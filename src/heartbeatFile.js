import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Nhịp tim ghi vào RAM (/dev/shm) để không làm mòn thẻ nhớ / SSD
export const heartbeatFile =
  process.env.HEARTBEAT_FILE ||
  (existsSync("/dev/shm") ? "/dev/shm/musidiscord.heartbeat" : path.join(os.tmpdir(), "musidiscord.heartbeat"));
