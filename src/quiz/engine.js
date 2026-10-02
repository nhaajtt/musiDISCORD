import { normalizeText } from "../library/index.js";

const NOISE = /\([^)]*\)|\[[^\]]*\]|\b(feat|ft|featuring)\b.*$/gi;

/** Strip extras like "(Official Video)", "[Lyrics]", "ft. ..." from the title. */
export const stripNoise = (text) => String(text ?? "").replace(NOISE, " ").replace(/\s+/g, " ").trim();

function levenshtein(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length];
}

function matches(guess, target, { subset = false } = {}) {
  if (!target) return false;
  if (guess === target) return true;
  // Multi-word artist: typing a contiguous part of the name is enough ("Sơn Tùng" for "Sơn Tùng M-TP")
  if (subset && guess.length >= 5 && ` ${target} `.includes(` ${guess} `)) return true;
  if (target.length >= 4 && guess.includes(target)) return true;

  const allowed = target.length >= 12 ? 3 : target.length >= 6 ? 2 : target.length >= 4 ? 1 : 0;
  if (allowed && levenshtein(guess, target, allowed) <= allowed) return true;

  // Matches most of the words of a multi-word title
  const words = target.split(" ");
  if (words.length >= 3) {
    const given = guess.split(" ");
    const hit = words.filter((w) => given.includes(w)).length;
    if (hit / words.length >= 0.75 && given.length >= Math.ceil(words.length * 0.6)) return true;
  }
  return false;
}

/** Judge an answer: "title" (correct title), "artist" (artist only) or "wrong". */
export function judgeAnswer(guess, { title, artist }) {
  const g = normalizeText(guess);
  if (!g) return "wrong";
  const t = normalizeText(stripNoise(title)) || normalizeText(title);
  if (matches(g, t)) return "title";
  const a = normalizeText(artist ?? "");
  if (a && matches(g, a, { subset: true })) return "artist";
  return "wrong";
}

/**
 * Points for a correct answer: faster answers earn more, each hint costs 20, and consecutive correct answers earn a bonus.
 * `streak` already includes this answer. `partial` (artist only) earns just 40%.
 */
export function scoreFor({ elapsedMs, windowMs, hints = 0, streak = 1, partial = false }) {
  const speed = Math.max(0.4, 1 - 0.6 * Math.min(1, Math.max(0, elapsedMs) / windowMs));
  let points = Math.max(20, Math.round(100 * speed) - hints * 20);
  points += Math.min(50, Math.max(0, streak - 1) * 10);
  return partial ? Math.round(points * 0.4) : points;
}

/** Tiered hint: 1 = word and character count, 2 = first letter of each word. */
export function buildHint(title, level) {
  const clean = stripNoise(title) || String(title);
  const words = clean.split(/\s+/).filter(Boolean);
  if (level <= 1) return `${words.length} ${words.length === 1 ? "word" : "words"} • ${clean.replace(/\s/g, "").length} characters`;
  return words.map((w) => [...w][0] + "▫".repeat(Math.max(0, [...w].length - 1))).join("  ");
}

/** Pick the snippet start: skip the intro and make sure the snippet ends before the track does. */
export function pickClipStart(durationMs, clipMs, rng = Math.random) {
  if (!durationMs || durationMs <= clipMs + 8000) return 0;
  const min = Math.min(durationMs * 0.12, 20_000);
  const max = durationMs - clipMs - 4000;
  return Math.floor(min + rng() * Math.max(0, max - min));
}

/** Randomly pick up to n distinct tracks. */
export function pickRounds(entries, n, rng = Math.random) {
  const pool = entries.filter((e) => e.title);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
