import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { createJsonStore } from "../shared/jsonStore.js";

/** Auto-assigned tags (source music files are not modified): { [path]: { title, artist, album, year, trackNo, status, source, confidence } } */
export const tags = createJsonStore("tags.json");
/** Audio features: { [path]: { mtimeMs, size, bpm, energy, brightness, mood } } */
export const features = createJsonStore("features.json");

export const coversDir = () => path.join(config.sharedDir, "covers");

/** Cover filename in the shared folder, derived from the track path. */
export const coverKey = (rel) => createHash("sha1").update(rel).digest("hex").slice(0, 16);

export function refreshOverlay() {
  tags.refresh();
  features.refresh();
}
