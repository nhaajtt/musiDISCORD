import path from "node:path";
import { config } from "../config.js";
import { localRelativePath } from "../utils/trackKey.js";
import { get } from "./index.js";

const UNKNOWN_TITLE = /^unknown title$/i;
const UNKNOWN_ARTIST = /^unknown artist$/i;

/**
 * Fill in title, artist and album for a local file from the library index (tags or filename).
 * Edits in place and returns the same track; non-local tracks are left unchanged.
 */
export function normalizeLocalTrack(track) {
  const info = track?.info;
  if (!info || info.sourceName !== "local") return track;

  const rel = localRelativePath(info);
  const entry = rel ? get(rel) : null;

  if (!info.title || UNKNOWN_TITLE.test(info.title)) {
    const source = info.identifier || info.uri || "";
    info.title = entry?.title ?? (path.posix.basename(source, path.posix.extname(source)) || "Music file");
  }
  if (!info.author || UNKNOWN_ARTIST.test(info.author)) {
    const source = info.identifier || info.uri || "";
    const folder = path.posix.basename(path.posix.dirname(source));
    const fallback = folder && folder !== path.posix.basename(config.musicDir) ? folder : "Music folder";
    info.author = entry?.artist ?? fallback;
  }
  info.album ??= entry?.album ?? null;
  return track;
}
