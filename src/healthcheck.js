import { readFileSync } from "node:fs";
import path from "node:path";

// Docker gọi file này định kỳ: thoát 0 nếu bot vừa báo "khoẻ" trong vòng 60 giây
const file = path.join(process.env.DATA_DIR || "data", ".heartbeat");
const MAX_AGE_MS = 60_000;

try {
  const age = Date.now() - Number(readFileSync(file, "utf8"));
  process.exit(age < MAX_AGE_MS ? 0 : 1);
} catch {
  process.exit(1);
}
