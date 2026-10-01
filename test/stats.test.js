import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";
process.env.TIMEZONE = "Asia/Ho_Chi_Minh";

const S = await import("../src/stats.js");
const { awardBadges, earnedBadges } = await import("../src/badges.js");

const G = "guild1";
// 00:30 ngày 02/10/2026 theo giờ Việt Nam
const AT = Date.UTC(2026, 9, 1, 17, 30);
const day = (n) => AT + n * 86_400_000;

function play(over = {}) {
  return S.recordPlay({
    guildId: G,
    requesterId: "alice",
    trackKey: "local:a.mp3",
    title: "A",
    artist: "Nghệ sĩ 1",
    durationMs: 200_000,
    listenedMs: 180_000,
    listenerIds: ["alice", "bob"],
    at: AT,
    ...over,
  });
}

test("ghi lượt phát và tổng hợp theo người nghe", () => {
  play();
  play({ trackKey: "local:b.mp3", title: "B", artist: "Nghệ sĩ 2", listenerIds: ["alice"] });
  const a = S.userStats(G, "alice");
  const b = S.userStats(G, "bob");
  assert.equal(a.totalPlays, 2);
  assert.equal(b.totalPlays, 1);
  assert.equal(a.totalListenMs, 360_000);
  assert.equal(a.totalRequests, 2);
  assert.equal(b.totalRequests, 0);
  assert.equal(a.topTracks.length, 2);
  assert.equal(a.topArtists[0].plays, 1);
});

test("giờ nghe theo múi giờ cấu hình", () => {
  const a = S.userStats(G, "alice");
  assert.equal(a.hourlyPlays[0], 2);
  assert.equal(a.busiestHour, 0);
  assert.equal(a.nightPlays, 2);
});

test("lọc theo năm", () => {
  assert.equal(S.userStats(G, "alice", { year: 2026 }).totalPlays, 2);
  assert.equal(S.userStats(G, "alice", { year: 2025 }).totalPlays, 0);
  assert.equal(S.userStats(G, "alice", { year: 2025 }).busiestHour, null);
});

test("chuỗi ngày nghe liên tiếp", () => {
  for (const n of [1, 2, 3, 5]) play({ at: day(n), listenerIds: ["carol"] });
  assert.equal(S.userStats(G, "carol").streakDays, 3);
});

test("ghi người bỏ qua bài", () => {
  play({ skippedBy: "bob", listenedMs: 5_000 });
  assert.equal(S.userStats(G, "bob").totalSkips, 1);
});

test("đánh giá bật/tắt và tổng hợp điểm", () => {
  assert.equal(S.toggleRating(G, "alice", "local:a.mp3", 1), 1);
  assert.equal(S.toggleRating(G, "bob", "local:a.mp3", 1), 1);
  assert.equal(S.toggleRating(G, "carol", "local:a.mp3", -1), -1);
  assert.deepEqual(S.ratingTotals(G, "local:a.mp3"), { up: 2, down: 1 });
  assert.equal(S.ratingScores(G).get("local:a.mp3"), 1);
  assert.equal(S.toggleRating(G, "alice", "local:a.mp3", 1), 0);
  assert.equal(S.ratingScores(G).get("local:a.mp3"), 0);
  assert.equal(S.toggleRating(G, "alice", "local:a.mp3", -1), -1);
  assert.equal(S.toggleRating(G, "alice", "local:a.mp3", 1), 1);
});

test("yêu thích", () => {
  S.addFavorite("alice", "local:a.mp3", "A", "Nghệ sĩ 1");
  S.addFavorite("alice", "local:a.mp3", "A", "Nghệ sĩ 1");
  assert.equal(S.listFavorites("alice").length, 1);
  assert.equal(S.isFavorite("alice", "local:a.mp3"), true);
  assert.equal(S.removeFavorite("alice", "local:a.mp3"), true);
  assert.equal(S.removeFavorite("alice", "local:a.mp3"), false);
});

test("bảng xếp hạng server", () => {
  const board = S.guildLeaderboard(G);
  assert.equal(board.topListeners[0].userId, "carol");
  assert.ok(board.topListeners.some((r) => r.userId === "alice"));
  assert.equal(board.topTracks[0].key.startsWith("local:"), true);
  assert.equal(board.topRequesters[0].userId, "alice");
});

test("đố nhạc cộng dồn điểm", () => {
  S.addQuizResult(G, "alice", { points: 300, correct: 3, bestStreak: 2 });
  S.addQuizResult(G, "alice", { points: 250, correct: 2, bestStreak: 1 });
  const row = S.quizScore(G, "alice");
  assert.equal(row.points, 550);
  assert.equal(row.games, 2);
  assert.equal(row.best_streak, 2);
  assert.equal(S.quizLeaderboard(G)[0].user_id, "alice");
});

test("huy hiệu: cấp một lần, không cấp lại", () => {
  const first = awardBadges(G, "alice");
  assert.ok(first.some((b) => b.id === "quiz_master"));
  assert.equal(awardBadges(G, "alice").length, 0);
  assert.ok(earnedBadges(G, "alice").some((b) => b.id === "quiz_master"));
  assert.equal(earnedBadges(G, "nobody").length, 0);
});

test("người tắt thống kê không bị ghi lại", () => {
  S.setStatsEnabled("dave", false);
  assert.equal(S.isOptedOut("dave"), true);
  play({ requesterId: "dave", listenerIds: ["dave", "erin"] });
  assert.equal(S.userStats(G, "dave").totalPlays, 0);
  assert.equal(S.userStats(G, "dave").totalRequests, 0);
  assert.equal(S.userStats(G, "erin").totalPlays, 1);
  S.setStatsEnabled("dave", true);
  assert.equal(S.isOptedOut("dave"), false);
});

test("xoá dữ liệu cá nhân giữ lượt phát ẩn danh", () => {
  S.addFavorite("frank", "local:z.mp3", "Z", null);
  S.toggleRating(G, "frank", "local:z.mp3", 1);
  play({ requesterId: "frank", skippedBy: "frank", listenerIds: ["frank", "erin"] });
  const before = S.userStats(G, "erin").totalPlays;
  S.deleteUserData("frank");
  const f = S.userStats(G, "frank");
  assert.equal(f.totalPlays, 0);
  assert.equal(f.totalRequests, 0);
  assert.equal(f.totalSkips, 0);
  assert.equal(S.listFavorites("frank").length, 0);
  assert.equal(S.userStats(G, "erin").totalPlays, before);
});

test("máy chủ khác nhau không lẫn dữ liệu", () => {
  assert.equal(S.userStats("guild2", "alice").totalPlays, 0);
  assert.equal(S.ratingScores("guild2").size, 0);
});
