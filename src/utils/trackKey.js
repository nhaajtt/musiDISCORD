import { config } from "../config.js";

/** Phần đường dẫn tương đối trong thư mục music của một file local (hoặc null nếu không phải file local). */
export function localRelativePath(info) {
  if (info?.sourceName !== "local") return null;
  const id = info.identifier || info.uri || "";
  const prefix = config.musicDir.endsWith("/") ? config.musicDir : `${config.musicDir}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Khoá ổn định để nhận diện một bài (dùng cho thống kê, đánh giá, yêu thích). */
export function trackKey(track) {
  const info = track.info;
  const rel = localRelativePath(info);
  return rel !== null ? `local:${rel}` : `${info.sourceName}:${info.identifier}`;
}
