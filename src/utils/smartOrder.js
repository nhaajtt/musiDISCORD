import { trackKey } from "./trackKey.js";

const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 4;
const SPREAD_WINDOW = 12;

/** Trọng số phát: bài được server thích nhiều thì dễ lên sớm, bài bị chê thì xuống cuối. */
export function weightFor(score) {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, 1 + 0.35 * (score ?? 0)));
}

const artistOf = (track) => (track.info.author ?? "").trim().toLowerCase();

/**
 * Xáo trộn có trọng số (mọi bài đều xuất hiện đúng một lần) rồi giãn các bài cùng nghệ sĩ ra xa nhau nếu được.
 * `scores`: Map(trackKey -> điểm yêu thích). `rng` có thể thay để kiểm thử.
 */
export function smartOrder(tracks, { scores = new Map(), rng = Math.random } = {}) {
  const list = tracks
    .map((track) => {
      const weight = weightFor(scores.get(trackKey(track)));
      // Khoá Efraimidis-Spirakis: bài có trọng số cao có xu hướng lên đầu
      return { track, key: Math.pow(rng() || Number.MIN_VALUE, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.track);

  // Hai bài liền nhau tại vị trí idx có cùng nghệ sĩ (đã biết) không?
  const clash = (idx) => idx > 0 && idx < list.length && artistOf(list[idx]) !== "" && artistOf(list[idx]) === artistOf(list[idx - 1]);

  for (let i = 1; i < list.length; i++) {
    if (!clash(i)) continue;
    // Thử đổi chỗ với các bài phía sau trước, hết cách thì thử với các bài phía trước
    const forward = Array.from({ length: Math.min(SPREAD_WINDOW, list.length - 1 - i) }, (_, k) => i + 1 + k);
    const backward = Array.from({ length: i - 1 }, (_, k) => i - 2 - k);
    for (const j of [...forward, ...backward]) {
      [list[i], list[j]] = [list[j], list[i]];
      if (!clash(i) && !clash(i + 1) && !clash(j) && !clash(j + 1)) break;
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
  return list;
}
