import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";

const { historyScores, moodForHour, radioScores } = await import("../src/radio.js");
const S = await import("../src/stats.js");

const hourOf = (ms) => Math.floor(ms / 3_600_000) % 24;
const at = (hour) => hour * 3_600_000;
const row = (key, hour, share, duration = 200_000) => ({ track_key: key, played_at: at(hour), listened_ms: duration * share, duration_ms: duration });

test("played-through tracks score up and skipped tracks score down", () => {
  const rows = [row("local:good", 12, 1), row("local:good", 12, 0.95), row("local:bad", 12, 0.05), row("local:bad", 12, 0.1)];
  const scores = historyScores(rows, { hour: 3, hourOf });
  assert.ok(scores.get("local:good") > 0);
  assert.ok(scores.get("local:bad") < 0);
});

test("tracks usually played around now get a boost, including across midnight", () => {
  const rows = [row("local:night", 23, 0.5), row("local:night", 1, 0.5), row("local:noon", 12, 0.5)];
  const scores = historyScores(rows, { hour: 0, hourOf });
  assert.ok(scores.get("local:night") > scores.get("local:noon"));
});

test("one track's influence is capped so a single favorite cannot take over", () => {
  const rows = Array.from({ length: 100 }, () => row("local:x", 12, 1));
  assert.ok(historyScores(rows, { hour: 12, hourOf }).get("local:x") <= 0.4 * 5 + 0.5 * 4 + 1e-9);
});

test("mood follows the time of day", () => {
  assert.equal(moodForHour(2), "chill");
  assert.equal(moodForHour(23), "chill");
  assert.equal(moodForHour(8), "steady");
  assert.equal(moodForHour(15), "upbeat");
});

test("radioScores combines ratings and history for one server only", () => {
  const now = Date.now();
  const play = (guildId, trackKey, listenedMs) =>
    S.recordPlay({ guildId, requesterId: "u", trackKey, title: trackKey, durationMs: 200_000, listenedMs, listenerIds: [], at: now - 3_600_000 });
  play("g1", "local:loved.mp3", 200_000);
  play("g1", "local:dropped.mp3", 5_000);
  play("g2", "local:other.mp3", 200_000);
  S.toggleRating("g1", "u", "local:loved.mp3", 1);

  const scores = radioScores("g1", { now });
  assert.ok(scores.get("local:loved.mp3") > scores.get("local:dropped.mp3"));
  assert.equal(scores.has("local:other.mp3"), false);
});
