import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = mkdtempSync(path.join(os.tmpdir(), "musi-quizmodes-"));
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";
process.env.TIMEZONE = "UTC";
process.env.DATA_DIR = path.join(root, "data");
process.env.MUSIC_DIR = path.join(root, "music");
mkdirSync(process.env.MUSIC_DIR, { recursive: true });

const Q = await import("../src/quiz/engine.js");
const S = await import("../src/stats.js");
const { awardBadges } = await import("../src/badges.js");
const { startQuiz } = await import("../src/quiz/session.js");
const { cancelIdleLeave } = await import("../src/utils/idle.js");

test.after(() => rmSync(root, { recursive: true, force: true }));

const song = { title: "Lạc Trôi", artist: "Sơn Tùng M-TP", year: 2017 };

test("artist mode: the artist is the full answer and the title is partial", () => {
  assert.equal(Q.judgeAnswer("son tung m-tp", song, "artist"), "title");
  assert.equal(Q.judgeAnswer("son tung", song, "artist"), "title");
  assert.equal(Q.judgeAnswer("lac troi", song, "artist"), "artist");
  assert.equal(Q.judgeAnswer("someone else", song, "artist"), "wrong");
});

test("year mode: exact is full, within two years is partial, anything else is wrong", () => {
  assert.equal(Q.judgeAnswer("2017", song, "year"), "title");
  assert.equal(Q.judgeAnswer("I think it was 2016", song, "year"), "artist");
  assert.equal(Q.judgeAnswer("2019", song, "year"), "artist");
  assert.equal(Q.judgeAnswer("2010", song, "year"), "wrong");
  assert.equal(Q.judgeAnswer("recently", song, "year"), "wrong");
  assert.equal(Q.judgeAnswer("12345", song, "year"), "wrong");
  assert.equal(Q.judgeAnswer("2017", { title: "x" }, "year"), "wrong");
});

test("each mode only asks about tracks that have what it needs", () => {
  const entries = [
    { title: "A", artist: "X", year: 1999 },
    { title: "B", artist: null, year: 2005 },
    { title: "C", artist: "Z", year: null },
    { title: "D", artist: "Z", year: 1700 },
    { artist: "Q", year: 2000 },
  ];
  assert.deepEqual(Q.eligibleFor(entries, "title").map((e) => e.title), ["A", "B", "C", "D"]);
  assert.deepEqual(Q.eligibleFor(entries, "artist").map((e) => e.title), ["A", "C", "D"]);
  assert.deepEqual(Q.eligibleFor(entries, "year").map((e) => e.title), ["A", "B"]);
});

test("hints per mode", () => {
  assert.equal(Q.hintFor("year", { year: 1998 }, 1), "the 1990s");
  assert.equal(Q.hintFor("year", { year: 1998 }, 2), "between 1996 and 2000");
  assert.equal(Q.hintFor("artist", { artist: "Sơn Tùng", title: "x" }, 2), "S▫▫  T▫▫▫");
  assert.equal(Q.hintFor("title", { title: "Lạc Trôi", artist: "y" }, 1), "2 words • 7 characters");
});

test("lyric line: long enough, away from the edges, timestamp only for synced lyrics", () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 5000, text: i % 2 ? "short" : `this is a long enough lyric line number ${i}` }));
  const synced = Q.pickLyricLine({ synced: true, lines }, () => 0);
  assert.ok(synced.text.length >= 18);
  assert.ok(Number.isFinite(synced.timeMs));
  assert.ok(synced.timeMs >= 2 * 5000 && synced.timeMs < 18 * 5000);

  assert.equal(Q.pickLyricLine({ synced: false, lines }, () => 0).timeMs, null);
  assert.equal(Q.pickLyricLine({ synced: true, lines: [{ timeMs: 0, text: "tiny" }] }), null);
  assert.equal(Q.pickLyricLine(null), null);
});

test("seasons: monthly leaderboard, all-time totals and the champion badge", () => {
  const G = "gSeason";
  const sep = Date.UTC(2026, 8, 15);
  const oct = Date.UTC(2026, 9, 3);
  S.addQuizResult(G, "alice", { points: 300, correct: 6, bestStreak: 3 }, sep);
  S.addQuizResult(G, "bob", { points: 200, correct: 4, bestStreak: 2 }, sep);
  S.addQuizResult(G, "bob", { points: 400, correct: 8, bestStreak: 5 }, oct);

  assert.deepEqual(S.seasonLeaderboard(G, "2026-09").map((r) => [r.user_id, r.points]), [["alice", 300], ["bob", 200]]);
  assert.deepEqual(S.seasonLeaderboard(G, "2026-10").map((r) => [r.user_id, r.points]), [["bob", 400]]);
  assert.equal(S.quizLeaderboard(G, 5)[0].user_id, "bob"); // 600 all-time
  assert.equal(S.seasonOf(oct), "2026-10");

  // Only finished months count: alice won September, bob's October is still running
  assert.equal(S.seasonWins(G, "alice", oct), 1);
  assert.equal(S.seasonWins(G, "bob", oct), 0);
  assert.equal(S.seasonWins(G, "bob", Date.UTC(2026, 10, 2)), 1);

  assert.ok(S.userStats(G, "alice").seasonWins >= 1);
  assert.ok(awardBadges(G, "alice").some((b) => b.id === "season_champion"));
  assert.ok(!awardBadges(G, "bob").some((b) => b.id === "season_champion"));
});

test("a year-mode game asks only tracks with a year and scores close guesses as partial", async () => {
  const sent = [];
  const channel = { send: async (m) => { sent.push(m); return { edit: async () => {} }; } };
  const members = { filter: () => ({ size: 5 }) };
  const client = {
    user: { id: "bot", username: "musi" },
    guilds: { cache: { get: () => ({ channels: { cache: { get: () => ({ members }) } } }) } },
    channels: { cache: { get: () => channel } },
  };
  const data = {};
  const player = {
    guildId: "gYear", voiceChannelId: "vc", queue: { current: null, tracks: [], add: async function (t) { this.tracks.push(t); } },
    getData: (k) => data[k], setData: (k, v) => { data[k] = v; },
    stopPlaying: async () => { player.queue.current = null; },
    play: async function () { this.queue.current = this.queue.tracks.shift(); },
    search: async ({ query }) => ({ tracks: [{ info: { title: path.basename(query), duration: 200_000, sourceName: "local", identifier: query, uri: query } }] }),
  };
  const entries = [
    { file: "old.mp3", title: "Old", artist: "A", year: 1999, durationMs: 200_000 },
    { file: "noyear.mp3", title: "No year", artist: "A", year: null, durationMs: 200_000 },
    { file: "new.mp3", title: "New", artist: "A", year: 2015, durationMs: 200_000 },
  ];
  const alice = { id: "u1", username: "alice" };

  const session = startQuiz({ client, player, channel, starter: alice, entries, rounds: 5, clipMs: 100, gapMs: 10, graceMs: 300, mode: "year" });
  assert.equal(session.mode, "year");
  assert.equal(session.total, 2); // the track without a year is never asked
  assert.match(session.answerLabel, /year/i);

  for (let i = 0; i < 100 && !player.queue.current; i++) await new Promise((r) => setTimeout(r, 10));
  const asked = entries.find((e) => player.queue.current.info.title === e.file);
  assert.ok(asked.year);
  assert.equal(session.submit(alice, String(asked.year - 1)).status, "artist"); // one year off: partial
  assert.equal(session.submit(alice, String(asked.year)).status, "correct");

  session.abort();
  for (let i = 0; i < 100 && player.getData("quiz"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(player.getData("quiz"), undefined);
  cancelIdleLeave(player); // finishing a game schedules an idle leave that would keep the test process alive
  assert.ok(sent.some((m) => JSON.stringify(m.embeds?.[0]?.data ?? {}).includes("Guess the year")));
});
