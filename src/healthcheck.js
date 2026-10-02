import { readFileSync } from "node:fs";
import { heartbeatFile } from "./heartbeatFile.js";

// Docker calls this file periodically: exits 0 if the bot reported "healthy" within the last 60 seconds
const MAX_AGE_MS = 60_000;

try {
  const age = Date.now() - Number(readFileSync(heartbeatFile, "utf8"));
  process.exit(age < MAX_AGE_MS ? 0 : 1);
} catch {
  process.exit(1);
}
