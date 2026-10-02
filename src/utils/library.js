import { readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export const AUDIO_EXT = new Set([".mp3", ".flac", ".wav", ".ogg", ".opus", ".m4a", ".aac", ".webm"]);

/** List of audio files (relative paths, using "/") in the music folder. */
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
