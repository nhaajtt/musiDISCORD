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

export const MODES = {
  title: { label: "Guess the song", answerLabel: "Song title (or artist)" },
  artist: { label: "Guess the artist", answerLabel: "Artist (or song title)" },
  year: { label: "Guess the year", answerLabel: "Release year, e.g. 1998" },
  lyrics: { label: "Guess from the lyrics", answerLabel: "Song title (or artist)" },
};

const YEAR_RE = /\b(19\d\d|20\d\d)\b/;
const YEAR_CLOSE = 2; // within this many years still earns partial points

export const validYear = (year) => Number.isInteger(year) && year >= 1900 && year <= 2100;

/**
 * Judge an answer. Returns "title" for a full answer, "artist" for a partial one (the other half of the pair: the artist
 * when guessing the title, the title when guessing the artist, a year within two years of the real one) or "wrong".
 */
export function judgeAnswer(guess, { title, artist, year }, mode = "title") {
  if (mode === "year") {
    const given = Number(YEAR_RE.exec(String(guess ?? ""))?.[1]);
    if (!validYear(given) || !validYear(year)) return "wrong";
    const diff = Math.abs(given - year);
    return diff === 0 ? "title" : diff <= YEAR_CLOSE ? "artist" : "wrong";
  }

  const g = normalizeText(guess);
  if (!g) return "wrong";
  const t = normalizeText(stripNoise(title)) || normalizeText(title);
  const a = normalizeText(artist ?? "");
  const titleHit = () => matches(g, t);
  const artistHit = () => Boolean(a) && matches(g, a, { subset: true });

  if (mode === "artist") return artistHit() ? "title" : titleHit() ? "artist" : "wrong";
  return titleHit() ? "title" : artistHit() ? "artist" : "wrong";
}

/** Which tracks can be asked in a mode: year needs a release year, artist needs an artist, the rest need a title. */
export function eligibleFor(entries, mode) {
  if (mode === "year") return entries.filter((e) => e.title && validYear(e.year));
  if (mode === "artist") return entries.filter((e) => e.title && e.artist);
  return entries.filter((e) => e.title);
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

/** Tiered hints for a round in any mode. */
export function hintFor(mode, entry, level) {
  if (mode === "year") {
    return level <= 1 ? `the ${Math.floor(entry.year / 10) * 10}s` : `between ${entry.year - 2} and ${entry.year + 2}`;
  }
  return buildHint(mode === "artist" ? entry.artist : entry.title, level);
}

/**
 * Picks a lyric line to show: long enough to be recognizable, away from the very start and end of the song.
 * Returns { text, timeMs } (timeMs is null for lyrics without timestamps) or null if nothing fits.
 */
export function pickLyricLine(parsed, rng = Math.random) {
  const lines = parsed?.lines ?? [];
  const from = Math.floor(lines.length * 0.1);
  const to = Math.ceil(lines.length * 0.9);
  const usable = lines
    .slice(from, to)
    .filter((l) => l.text && l.text.length >= 18 && l.text.length <= 90 && l.text.split(/\s+/).length >= 4);
  if (!usable.length) return null;
  const line = usable[Math.floor(rng() * usable.length)];
  return { text: line.text, timeMs: parsed.synced && Number.isFinite(line.timeMs) ? line.timeMs : null };
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
