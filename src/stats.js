import { db } from "./db.js";
import { localDay, localHour, yearRange } from "./utils/time.js";

const stmt = {
  optedOut: db.prepare("SELECT 1 FROM optout WHERE user_id = ?"),
  insertPlay: db.prepare(
    `INSERT INTO plays (guild_id, requester_id, skipped_by, track_key, title, artist, duration_ms, listened_ms, played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  insertListener: db.prepare("INSERT OR IGNORE INTO listeners (play_id, user_id) VALUES (?, ?)"),

  setOptOut: db.prepare("INSERT OR IGNORE INTO optout (user_id) VALUES (?)"),
  clearOptOut: db.prepare("DELETE FROM optout WHERE user_id = ?"),

  upsertRating: db.prepare(
    `INSERT INTO ratings (guild_id, user_id, track_key, value, rated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, user_id, track_key) DO UPDATE SET value = excluded.value, rated_at = excluded.rated_at`,
  ),
  getRating: db.prepare("SELECT value FROM ratings WHERE guild_id = ? AND user_id = ? AND track_key = ?"),
  deleteRating: db.prepare("DELETE FROM ratings WHERE guild_id = ? AND user_id = ? AND track_key = ?"),
  ratingTotals: db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN value > 0 THEN 1 ELSE 0 END), 0) AS up,
            COALESCE(SUM(CASE WHEN value < 0 THEN 1 ELSE 0 END), 0) AS down
     FROM ratings WHERE guild_id = ? AND track_key = ?`,
  ),
  ratingScores: db.prepare("SELECT track_key, SUM(value) AS score FROM ratings WHERE guild_id = ? GROUP BY track_key"),
  ratingCount: db.prepare("SELECT COUNT(*) AS n FROM ratings WHERE guild_id = ? AND user_id = ?"),

  addFavorite: db.prepare(
    `INSERT INTO favorites (user_id, track_key, title, artist, added_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, track_key) DO NOTHING`,
  ),
  removeFavorite: db.prepare("DELETE FROM favorites WHERE user_id = ? AND track_key = ?"),
  listFavorites: db.prepare("SELECT track_key, title, artist FROM favorites WHERE user_id = ? ORDER BY added_at DESC"),
  isFavorite: db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND track_key = ?"),

  quizUpsert: db.prepare(
    `INSERT INTO quiz_scores (guild_id, user_id, points, games, correct, best_streak) VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET
       points = points + excluded.points, games = games + 1, correct = correct + excluded.correct,
       best_streak = MAX(best_streak, excluded.best_streak)`,
  ),
  quizTop: db.prepare(
    "SELECT user_id, points, games, correct, best_streak FROM quiz_scores WHERE guild_id = ? ORDER BY points DESC LIMIT ?",
  ),
  quizOne: db.prepare("SELECT points, games, correct, best_streak FROM quiz_scores WHERE guild_id = ? AND user_id = ?"),

  getBadges: db.prepare("SELECT badge FROM badges WHERE guild_id = ? AND user_id = ?"),
  addBadge: db.prepare("INSERT OR IGNORE INTO badges (guild_id, user_id, badge, earned_at) VALUES (?, ?, ?, ?)"),
};

export const isOptedOut = (userId) => Boolean(stmt.optedOut.get(userId));

/** Records a play. Users who turned stats off are not recorded (neither listeners nor requesters). */
export function recordPlay({ guildId, requesterId, skippedBy, trackKey, title, artist, durationMs, listenedMs, listenerIds, at = Date.now() }) {
  const keep = (id) => (id && !isOptedOut(id) ? id : null);
  const listeners = [...new Set(listenerIds ?? [])].filter((id) => keep(id));

  const { lastInsertRowid } = stmt.insertPlay.run(
    guildId,
    keep(requesterId),
    keep(skippedBy),
    trackKey,
    title,
    artist ?? null,
    durationMs ?? null,
    Math.max(0, Math.round(listenedMs)),
    at,
  );
  for (const id of listeners) stmt.insertListener.run(lastInsertRowid, id);
  return Number(lastInsertRowid);
}

// ---------- Privacy

export function setStatsEnabled(userId, enabled) {
  if (enabled) stmt.clearOptOut.run(userId);
  else stmt.setOptOut.run(userId);
}

/** Deletes all of a user's data (keeps the plays but anonymized). */
export function deleteUserData(userId) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM listeners WHERE user_id = ?").run(userId);
    db.prepare("UPDATE plays SET requester_id = NULL WHERE requester_id = ?").run(userId);
    db.prepare("UPDATE plays SET skipped_by = NULL WHERE skipped_by = ?").run(userId);
    for (const table of ["ratings", "favorites", "quiz_scores", "badges", "request_votes"]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
    }
    // Personal playlists belong to the user; server playlists stay but forget who created them
    db.prepare("DELETE FROM playlists WHERE scope = 'user' AND owner_id = ?").run(userId);
    db.prepare("UPDATE playlists SET created_by = NULL WHERE created_by = ?").run(userId);
    // Suggestions and contributions are kept but anonymized
    db.prepare("UPDATE song_requests SET created_by = NULL WHERE created_by = ?").run(userId);
    db.prepare("UPDATE contributions SET user_id = NULL WHERE user_id = ?").run(userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// ---------- Ratings

/** Press 👍/👎: pressing the same one again removes the rating. Returns the new value (1, -1 or 0). */
export function toggleRating(guildId, userId, trackKey, value) {
  const current = stmt.getRating.get(guildId, userId, trackKey)?.value;
  if (current === value) {
    stmt.deleteRating.run(guildId, userId, trackKey);
    return 0;
  }
  stmt.upsertRating.run(guildId, userId, trackKey, value, Date.now());
  return value;
}

export function ratingTotals(guildId, trackKey) {
  const row = stmt.ratingTotals.get(guildId, trackKey);
  return { up: Number(row.up), down: Number(row.down) };
}

/** Favorite score of each track in the server (👍 minus 👎), used to adjust probabilities when shuffling. */
export function ratingScores(guildId) {
  return new Map(stmt.ratingScores.all(guildId).map((r) => [r.track_key, Number(r.score)]));
}

// ---------- Favorites

export const addFavorite = (userId, key, title, artist) => stmt.addFavorite.run(userId, key, title, artist ?? null, Date.now());
export const removeFavorite = (userId, key) => Number(stmt.removeFavorite.run(userId, key).changes) > 0;
export const listFavorites = (userId) => stmt.listFavorites.all(userId);
export const isFavorite = (userId, key) => Boolean(stmt.isFavorite.get(userId, key));

// ---------- Music quiz

export function addQuizResult(guildId, userId, { points, correct, bestStreak }) {
  stmt.quizUpsert.run(guildId, userId, points, correct, bestStreak);
}
export const quizLeaderboard = (guildId, limit = 10) => stmt.quizTop.all(guildId, limit);
export const quizScore = (guildId, userId) => stmt.quizOne.get(guildId, userId) ?? { points: 0, games: 0, correct: 0, best_streak: 0 };

// ---------- Stats

function rangeFor(year) {
  return year ? yearRange(year) : [0, Number.MAX_SAFE_INTEGER];
}

function longestStreak(days) {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of sorted) {
    const expected = prev ? new Date(Date.parse(`${prev}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null;
    run = prev && day === expected ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

/** Aggregates one user's stats in a server (optionally limited to a year). */
export function userStats(guildId, userId, { year } = {}) {
  const [from, to] = rangeFor(year);
  const base = [guildId, userId, from, to];

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS plays, COALESCE(SUM(p.listened_ms), 0) AS ms
       FROM plays p JOIN listeners l ON l.play_id = p.id
       WHERE p.guild_id = ? AND l.user_id = ? AND p.played_at >= ? AND p.played_at < ?`,
    )
    .get(...base);

  const count = (column) =>
    Number(
      db
        .prepare(`SELECT COUNT(*) AS n FROM plays WHERE guild_id = ? AND ${column} = ? AND played_at >= ? AND played_at < ?`)
        .get(...base).n,
    );

  const topTracks = db
    .prepare(
      `SELECT p.track_key AS key, p.title AS title, p.artist AS artist, COUNT(*) AS plays
       FROM plays p JOIN listeners l ON l.play_id = p.id
       WHERE p.guild_id = ? AND l.user_id = ? AND p.played_at >= ? AND p.played_at < ?
       GROUP BY p.track_key ORDER BY plays DESC, MAX(p.played_at) DESC LIMIT 5`,
    )
    .all(...base)
    .map((r) => ({ key: r.key, title: r.title, artist: r.artist ?? "", plays: Number(r.plays) }));

  const topArtists = db
    .prepare(
      `SELECT p.artist AS name, COUNT(*) AS plays
       FROM plays p JOIN listeners l ON l.play_id = p.id
       WHERE p.guild_id = ? AND l.user_id = ? AND p.played_at >= ? AND p.played_at < ? AND p.artist IS NOT NULL AND p.artist <> ''
       GROUP BY p.artist ORDER BY plays DESC LIMIT 5`,
    )
    .all(...base)
    .map((r) => ({ name: r.name, plays: Number(r.plays) }));

  const times = db
    .prepare(
      `SELECT p.played_at AS at FROM plays p JOIN listeners l ON l.play_id = p.id
       WHERE p.guild_id = ? AND l.user_id = ? AND p.played_at >= ? AND p.played_at < ?`,
    )
    .all(...base)
    .map((r) => Number(r.at));

  const hourlyPlays = Array(24).fill(0);
  for (const at of times) hourlyPlays[localHour(at)]++;
  const peak = Math.max(...hourlyPlays);

  return {
    totalPlays: Number(totals.plays),
    totalListenMs: Number(totals.ms),
    totalSkips: count("skipped_by"),
    totalRequests: count("requester_id"),
    topTracks,
    topArtists,
    hourlyPlays,
    busiestHour: peak > 0 ? hourlyPlays.indexOf(peak) : null,
    streakDays: longestStreak(times.map(localDay)),
    nightPlays: hourlyPlays.slice(0, 5).reduce((a, b) => a + b, 0),
    maxSameTrack: topTracks[0]?.plays ?? 0,
    ratingsCount: Number(stmt.ratingCount.get(guildId, userId).n),
    quizPoints: quizScore(guildId, userId).points,
  };
}

/** The server's leaderboard. */
export function guildLeaderboard(guildId, limit = 5) {
  const topListeners = db
    .prepare(
      `SELECT l.user_id AS userId, SUM(p.listened_ms) AS ms, COUNT(*) AS plays
       FROM plays p JOIN listeners l ON l.play_id = p.id WHERE p.guild_id = ?
       GROUP BY l.user_id ORDER BY ms DESC LIMIT ?`,
    )
    .all(guildId, limit)
    .map((r) => ({ userId: r.userId, ms: Number(r.ms), plays: Number(r.plays) }));

  const topRequesters = db
    .prepare(
      `SELECT requester_id AS userId, COUNT(*) AS requests FROM plays
       WHERE guild_id = ? AND requester_id IS NOT NULL GROUP BY requester_id ORDER BY requests DESC LIMIT ?`,
    )
    .all(guildId, limit)
    .map((r) => ({ userId: r.userId, requests: Number(r.requests) }));

  const topTracks = db
    .prepare(
      `SELECT track_key AS key, title, artist, COUNT(*) AS plays FROM plays
       WHERE guild_id = ? GROUP BY track_key ORDER BY plays DESC LIMIT ?`,
    )
    .all(guildId, limit)
    .map((r) => ({ key: r.key, title: r.title, artist: r.artist ?? "", plays: Number(r.plays) }));

  const mostLoved = db
    .prepare(
      `SELECT r.track_key AS key, SUM(r.value) AS score,
              (SELECT title FROM plays WHERE track_key = r.track_key ORDER BY played_at DESC LIMIT 1) AS title,
              (SELECT artist FROM plays WHERE track_key = r.track_key ORDER BY played_at DESC LIMIT 1) AS artist
       FROM ratings r WHERE r.guild_id = ? GROUP BY r.track_key HAVING score > 0 ORDER BY score DESC LIMIT ?`,
    )
    .all(guildId, limit)
    .map((r) => ({ key: r.key, score: Number(r.score), title: r.title ?? r.key, artist: r.artist ?? "" }));

  return { topListeners, topRequesters, topTracks, mostLoved };
}

// ---------- Badges

export function getEarnedBadges(guildId, userId) {
  return new Set(stmt.getBadges.all(guildId, userId).map((r) => r.badge));
}

export function saveBadges(guildId, userId, badgeIds) {
  for (const id of badgeIds) stmt.addBadge.run(guildId, userId, id, Date.now());
}
