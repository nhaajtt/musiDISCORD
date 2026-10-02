import { config } from "../config.js";

/** Relative path within the music folder of a local file (or null if not a local file). */
export function localRelativePath(info) {
  if (info?.sourceName !== "local") return null;
  const id = info.identifier || info.uri || "";
  const prefix = config.musicDir.endsWith("/") ? config.musicDir : `${config.musicDir}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Stable key identifying a track (used for stats, ratings, favorites). */
export function trackKey(track) {
  const info = track.info;
  const rel = localRelativePath(info);
  return rel !== null ? `local:${rel}` : `${info.sourceName}:${info.identifier}`;
}
