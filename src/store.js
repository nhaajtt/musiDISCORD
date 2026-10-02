import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const file = path.join(config.dataDir, "settings.json");

// stay247: { voiceChannelId, textChannelId, radio } when 24/7 mode is on
const DEFAULTS = { djRoleId: null, defaultVolume: 100, vcStatus: true, fairQueue: false, stay247: null, contributions: false };

let data = {};
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") console.error(`Could not read ${file}, using default settings:`, error.message);
}

export function getSettings(guildId) {
  return { ...DEFAULTS, ...data[guildId] };
}

export function allSettings() {
  return Object.keys(data).map((guildId) => [guildId, getSettings(guildId)]);
}

export function updateSettings(guildId, patch) {
  data[guildId] = { ...data[guildId], ...patch };

  // Write to a temp file then rename so the file is not corrupted if the process stops midway
  mkdirSync(config.dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);

  return getSettings(guildId);
}
