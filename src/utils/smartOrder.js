import { trackKey } from "./trackKey.js";

const MIN_WEIGHT = 0.25;
const MAX_WEIGHT = 4;
const SPREAD_WINDOW = 12;

/** Play weight: tracks the server likes tend to come up early, disliked ones sink to the end. */
export function weightFor(score) {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, 1 + 0.35 * (score ?? 0)));
}

const artistOf = (track) => (track.info.author ?? "").trim().toLowerCase();

/**
 * Weighted shuffle (every track appears exactly once), then spreads out tracks by the same artist where possible.
 * `scores`: Map(trackKey -> favorite score). `rng` can be replaced for testing.
 */
export function smartOrder(tracks, { scores = new Map(), rng = Math.random } = {}) {
  const list = tracks
    .map((track) => {
      const weight = weightFor(scores.get(trackKey(track)));
      // Efraimidis-Spirakis key: higher-weight tracks tend to come first
      return { track, key: Math.pow(rng() || Number.MIN_VALUE, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.track);

  // Do the two adjacent tracks at idx share a (known) artist?
  const clash = (idx) => idx > 0 && idx < list.length && artistOf(list[idx]) !== "" && artistOf(list[idx]) === artistOf(list[idx - 1]);

  for (let i = 1; i < list.length; i++) {
    if (!clash(i)) continue;
    // Try swapping with later tracks first, then with earlier ones if that fails
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
