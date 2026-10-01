import { readFileSync } from "node:fs";
import { heartbeatFile } from "./heartbeatFile.js";

// Docker gọi file này định kỳ: thoát 0 nếu bot vừa báo "khoẻ" trong vòng 60 giây
const MAX_AGE_MS = 60_000;

try {
  const age = Date.now() - Number(readFileSync(heartbeatFile, "utf8"));
  process.exit(age < MAX_AGE_MS ? 0 : 1);
} catch {
  process.exit(1);
}
