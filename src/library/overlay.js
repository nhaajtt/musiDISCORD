import { createHash } from "node:crypto";
import path from "node:path";
import { config } from "../config.js";
import { createJsonStore } from "../shared/jsonStore.js";

/** Thẻ gắn tự động (không sửa file nhạc gốc): { [đường dẫn]: { title, artist, album, year, trackNo, status, source, confidence } } */
export const tags = createJsonStore("tags.json");
/** Đặc trưng âm thanh: { [đường dẫn]: { mtimeMs, size, bpm, energy, brightness, mood } } */
export const features = createJsonStore("features.json");

export const coversDir = () => path.join(config.sharedDir, "covers");

/** Tên file bìa trong thư mục dùng chung, suy ra từ đường dẫn bài. */
export const coverKey = (rel) => createHash("sha1").update(rel).digest("hex").slice(0, 16);

export function refreshOverlay() {
  tags.refresh();
  features.refresh();
}
