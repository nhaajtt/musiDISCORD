import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const AUDIO_EXT = new Set([".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac", ".webm"]);

/** Danh sách file âm thanh (đường dẫn tương đối, dùng dấu "/") trong thư mục music. */
export async function listAudioFiles() {
  try {
    const entries = await readdir(config.musicDir, { recursive: true });
    return entries
      .filter((name) => AUDIO_EXT.has(path.extname(name).toLowerCase()))
      .map((name) => name.split(path.sep).join("/"));
  } catch {
    return [];
  }
}

export function musicPath(file) {
  return path.posix.join(config.musicDir, file);
}
