import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const file = path.join(config.dataDir, "settings.json");

// stay247: { voiceChannelId, textChannelId, radio } khi bật chế độ 24/7
const DEFAULTS = { djRoleId: null, defaultVolume: 100, vcStatus: true, fairQueue: false, stay247: null, contributions: false };

let data = {};
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") console.error(`Không đọc được ${file}, dùng cài đặt mặc định:`, error.message);
}

export function getSettings(guildId) {
  return { ...DEFAULTS, ...data[guildId] };
}

export function allSettings() {
  return Object.keys(data).map((guildId) => [guildId, getSettings(guildId)]);
}

export function updateSettings(guildId, patch) {
  data[guildId] = { ...data[guildId], ...patch };

  // Ghi ra file tạm rồi đổi tên để không bị hỏng file nếu tiến trình bị dừng giữa chừng
  mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);

  return getSettings(guildId);
}
