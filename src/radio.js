// Server radio: how much a server tends to like each track, learned from its own history.
import { config } from "./config.js";
import { db } from "./db.js";
import { byMood } from "./library/worker.js";
import { ratingScores } from "./stats.js";
import { localHour } from "./utils/time.js";

const HISTORY_DAYS = 90;
const HISTORY_ROWS = 20_000;
const SKIP_FRACTION = 0.3; // a track dropped before this share of its length counts as a skip
const FULL_FRACTION = 0.8; // listened to at least this share counts as played through
const HOUR_WINDOW = 2; // plays within this many hours of the current hour count as "usually played now"

const historyStmt = db.prepare(
  `SELECT track_key, played_at, listened_ms, duration_ms FROM plays
   WHERE guild_id = ? AND played_at >= ? AND track_key LIKE 'local:%'
   ORDER BY played_at DESC LIMIT ?`,
);

/** Gentle default: calm at night, easy in the morning, livelier through the day and evening. */
export function moodForHour(hour) {
  if (hour >= 22 || hour < 6) return "chill";
  if (hour < 11) return "steady";
  return "upbeat";
}

const hourDistance = (a, b) => Math.min(Math.abs(a - b), 24 - Math.abs(a - b));

/**
 * Turns play history into a score per track key (positive = come up sooner, negative = later).
 * `rows`: { track_key, played_at, listened_ms, duration_ms }. `hourOf` maps a timestamp to an hour in the server's time zone.
 */
export function historyScores(rows, { hour, hourOf = localHour }) {
  const per = new Map();
  for (const row of rows) {
    const entry = per.get(row.track_key) ?? { full: 0, skips: 0, nearHour: 0 };
    const duration = row.duration_ms;
    if (duration > 0) {
      const share = row.listened_ms / duration;
      if (share >= FULL_FRACTION) entry.full++;
      else if (share < SKIP_FRACTION) entry.skips++;
    }
    if (hourDistance(hourOf(row.played_at), hour) <= HOUR_WINDOW) entry.nearHour++;
    per.set(row.track_key, entry);
  }

  const scores = new Map();
  for (const [key, { full, skips, nearHour }] of per) {
    scores.set(key, 0.4 * Math.min(full, 5) - 0.8 * Math.min(skips, 4) + 0.5 * Math.min(nearHour, 4));
  }
  return scores;
}

/** Adds the scores of `b` into `a`, key by key. */
function merge(a, b) {
  for (const [key, value] of b) a.set(key, (a.get(key) ?? 0) + value);
  return a;
}

/**
 * Score per track key for the radio of a server right now: the server's 👍/👎, what it plays through or skips,
 * what it usually plays at this time of day, and (when audio analysis is on) a small push toward the hour's mood.
 */
export function radioScores(guildId, { now = Date.now() } = {}) {
  const hour = localHour(now);
  const scores = new Map(ratingScores(guildId));

  const rows = historyStmt.all(guildId, now - HISTORY_DAYS * 86_400_000, HISTORY_ROWS);
  merge(scores, historyScores(rows, { hour }));

  if (config.analysis.enabled) {
    merge(scores, new Map(byMood(moodForHour(hour)).map((entry) => [`local:${entry.file}`, 0.6])));
  }
  return scores;
}
