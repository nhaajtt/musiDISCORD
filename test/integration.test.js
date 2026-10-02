import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = mkdtempSync(path.join(os.tmpdir(), "musi-int-"));
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";
process.env.DATA_DIR = path.join(root, "data");
process.env.MUSIC_DIR = path.join(root, "music");
mkdirSync(process.env.MUSIC_DIR, { recursive: true });

const { config } = await import("../src/config.js");
const { MessageFlags } = await import("discord.js");
const NP = await import("../src/ui/nowPlaying.js");
const { controlRows } = await import("../src/ui/rows.js");
const { buildPage } = await import("../src/commands/queue.js");
const { roundRobin, moveToFront } = await import("../src/utils/fairQueue.js");
const R = await import("../src/recorder.js");
const S = await import("../src/stats.js");
const { startQuiz } = await import("../src/quiz/session.js");
const { handleQuizModal } = await import("../src/quiz/handlers.js");
const { is247, scheduleIdleLeave, cancelIdleLeave } = await import("../src/utils/idle.js");
const store = await import("../src/store.js");

test.after(() => rmSync(root, { recursive: true, force: true }));

const fakeTrack = (title, extra = {}) => ({
  encoded: `enc-${title}`,
  info: { title, author: "Nghệ sĩ", album: "Album", duration: 215_000, isStream: false, sourceName: "local", identifier: `${config.musicDir}/${title}.mp3`, uri: `${config.musicDir}/${title}.mp3` },
  requester: { id: "u1", username: "alice" },
  ...extra,
});

const fakeQueue = (current = null, tracks = []) => ({
  current,
  tracks,
  splice: async function (i, n, ...items) { this.tracks.splice(i, n, ...items); },
  add: async function (t) { (Array.isArray(t) ? t : [t]).forEach((x) => this.tracks.push(x)); },
});

function fakePlayer(over = {}) {
  const data = {};
  const p = {
    guildId: "g1", voiceChannelId: "vc1", textChannelId: "tc1", volume: 80, repeatMode: "off", paused: false, playing: true, position: 61_000,
    queue: { current: fakeTrack("Lạc Trôi"), tracks: [fakeTrack("B"), fakeTrack("C")], splice: async function (i, n, ...items) { this.tracks.splice(i, n, ...items); }, add: async function (t) { (Array.isArray(t) ? t : [t]).forEach((x) => this.tracks.push(x)); } },
    getData: (k) => data[k], setData: (k, v) => { data[k] = v; },
    stopCalls: 0, stopPlaying: async () => { p.stopCalls++; p.queue.current = null; },
    play: async function (o) { this.played = o; this.queue.current = this.queue.tracks.shift() ?? this.queue.current; },
    destroy: async () => {}, search: async () => ({ tracks: [fakeTrack("Bài đố")] }),
    ...over,
  };
  return p;
}

test("Now Playing (Components V2): valid, has two button rows, at most 40 components", () => {
  const player = fakePlayer();
  const payload = NP.buildNowPlaying(player, { track: player.queue.current, coverRef: "attachment://cover.jpg" });
  assert.equal(payload.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
  const json = payload.components[0].toJSON();
  assert.equal(json.type, 17);
  assert.equal(typeof json.accent_color, "number");

  const flat = JSON.stringify(json);
  const rows = (json.components ?? []).filter((c) => c.type === 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].components.length, 5);
  assert.equal(rows[1].components.length, 4);
  assert.ok(rows.flatMap((r) => r.components).every((b) => b.custom_id.startsWith("np:")));
  assert.ok(flat.includes("attachment://cover.jpg"));
  assert.ok(flat.includes("Lạc Trôi"));
  assert.ok((flat.match(/"type":/g) ?? []).length <= 40);
});

test("Now Playing: no cover art, paused, live stream, very long title", () => {
  const long = fakeTrack("x".repeat(500));
  const player = fakePlayer({ paused: true, queue: { current: long, tracks: [] } });
  const json = NP.buildNowPlaying(player, { track: long, coverRef: null }).components[0].toJSON();
  assert.ok(JSON.stringify(json).includes("PAUSED"));
  assert.ok(!JSON.stringify(json).includes("x".repeat(200)));

  const live = fakeTrack("Radio");
  live.info.isStream = true;
  assert.ok(JSON.stringify(NP.buildNowPlaying(fakePlayer(), { track: live, coverRef: null }).components[0].toJSON()).includes("LIVE"));
});

test("Now Playing: history card has no buttons", () => {
  const player = fakePlayer();
  const json = NP.buildNowPlaying(player, { track: player.queue.current, coverRef: null, finished: true }).components[0].toJSON();
  assert.ok(!(json.components ?? []).some((c) => c.type === 1));
  assert.ok(JSON.stringify(json).includes("PLAYED"));
});

test("accentFor is stable and stays within the valid color range", () => {
  assert.equal(NP.accentFor("abc"), NP.accentFor("abc"));
  assert.notEqual(NP.accentFor("abc"), NP.accentFor("abd"));
  for (const s of ["", "a", "Lạc Trôi", "😀"]) {
    const c = NP.accentFor(s);
    assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  }
});

test("rating button shows the vote count", () => {
  S.toggleRating("g1", "u1", "local:" + "Lạc Trôi.mp3", 1);
  const player = fakePlayer();
  const [, feedback] = controlRows(player, player.queue.current);
  assert.equal(feedback.toJSON().components[0].label, "1");
});

test("/queue (Components V2): pagination and content limits", () => {
  const tracks = Array.from({ length: 25 }, (_, i) => fakeTrack(`Bài ${i + 1}`));
  const player = fakePlayer({ queue: { current: fakeTrack("Hiện tại"), tracks } });
  const page0 = buildPage(player, 0);
  const json0 = page0.components[0].toJSON();
  const row = json0.components.find((c) => c.type === 1);
  assert.equal(row.components[0].disabled, true);
  assert.equal(row.components[1].disabled, false);
  assert.ok(JSON.stringify(json0).includes("Page 1/3"));
  assert.ok(JSON.stringify(buildPage(player, 2).components[0].toJSON()).includes("Bài 25"));

  const single = buildPage(fakePlayer({ queue: { current: null, tracks: [fakeTrack("Chỉ một")] } }), 0).components[0].toJSON();
  assert.ok(!single.components.some((c) => c.type === 1));
});

test("fair queue: interleaves by requester", () => {
  const mk = (t, id) => ({ info: { title: t }, requester: { id } });
  const input = [mk("a1", "A"), mk("a2", "A"), mk("a3", "A"), mk("b1", "B"), mk("c1", "C"), mk("b2", "B")];
  assert.deepEqual(roundRobin(input).map((t) => t.info.title), ["a1", "b1", "c1", "a2", "b2", "a3"]);
  assert.deepEqual(roundRobin([]), []);
  assert.equal(roundRobin(input).length, input.length);
});

test("move a track to the front of the queue", async () => {
  const player = fakePlayer({ queue: { current: null, tracks: [fakeTrack("A"), fakeTrack("B"), fakeTrack("C")], splice: async function (i, n, ...items) { this.tracks.splice(i, n, ...items); } } });
  assert.equal(await moveToFront(player, 2), true);
  assert.deepEqual(player.queue.tracks.map((t) => t.info.title), ["C", "A", "B"]);
  assert.equal(await moveToFront(player, 9), false);
  assert.equal(await moveToFront(player, 0), true);
});

const fakeClient = (humans = ["u1", "u2"]) => {
  const sent = [];
  const members = { filter: (f) => { const list = humans.map((id) => ({ id, user: { bot: false } })).filter(f); return { size: list.length, keys: () => list.map((m) => m.id).values() }; } };
  return {
    sent,
    user: { id: "bot", username: "musi" },
    guilds: { cache: { get: () => ({ channels: { cache: { get: () => ({ members }) } } }) } },
    channels: { cache: { get: () => ({ send: async (m) => { sent.push(m); return { edit: async () => {} }; } }) } },
  };
};

test("record stats when a track ends: counted when played long enough, an early skip only records the skip", () => {
  const client = fakeClient(["u1", "u2"]);
  const player = fakePlayer();
  R.beginPlay(player, player.queue.current);
  const info = player.getData("playInfo");
  info.startedAt = Date.now() - 100_000;
  R.endPlay(client, player, { reason: "finished" });
  assert.equal(S.userStats("g1", "u1").totalPlays >= 1, true);
  assert.equal(S.userStats("g1", "u2").totalPlays >= 1, true);
  assert.equal(S.userStats("g1", "u1").totalRequests >= 1, true);

  const before = S.userStats("g1", "u2").totalPlays;
  R.beginPlay(player, player.queue.current);
  player.getData("playInfo").startedAt = Date.now() - 3000;
  R.noteSkip(player, "u2");
  R.endPlay(client, player, { reason: "stopped" });
  assert.equal(S.userStats("g1", "u2").totalPlays, before);
  assert.equal(S.userStats("g1", "u2").totalSkips, 1);

  R.endPlay(client, player, { reason: "finished" });
  R.beginPlay(player, player.queue.current);
  R.endPlay(client, player, { reason: "loadFailed" });
});

test("music quiz: full game with scoring, ends early when everyone is correct, saves points", async () => {
  const client = fakeClient(["u1", "u2"]);
  const player = fakePlayer({ queue: fakeQueue(), search: async ({ query }) => ({ tracks: [fakeTrack(path.basename(query, ".mp3"))] }) });
  const channel = client.channels.cache.get();
  const entries = [
    { file: "Lạc Trôi.mp3", title: "Lạc Trôi", artist: "Sơn Tùng", album: "A", durationMs: 215_000 },
    { file: "Em Của Ngày Hôm Qua.mp3", title: "Em Của Ngày Hôm Qua", artist: "Sơn Tùng", album: "A", durationMs: 215_000 },
  ];
  const alice = { id: "u1", username: "alice" };
  const bob = { id: "u2", username: "bob" };

  const session = startQuiz({ client, player, channel, starter: alice, entries, rounds: 2, clipMs: 150, gapMs: 20, graceMs: 400 });
  assert.equal(player.getData("quiz"), session);
  assert.equal(session.total, 2);

  const answerRound = async () => {
    for (let i = 0; i < 100 && player.queue.current === null; i++) await new Promise((r) => setTimeout(r, 10));
    const title = player.queue.current.info.title;
    assert.equal(session.submit(alice, "wrong answer").status, "wrong");
    const a = session.submit(alice, title);
    assert.equal(a.status, "correct");
    assert.ok(a.points >= 40);
    assert.equal(session.submit(alice, title).status, "already");
    return { title, bob: session.submit(bob, title) };
  };

  const r1 = await answerRound();
  assert.equal(r1.bob.status, "correct");
  assert.ok(player.played.endTime > player.played.position, "the clip has an end point");
  assert.ok(player.played.endTime - player.played.position <= 150);

  // round 2: alice gets only the artist, then bob is correct, alice stays silent and loses her streak
  for (let i = 0; i < 200 && !player.getData("quiz")?.hint; i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(session.submit(alice, "son tung").status, "artist");
  assert.equal(session.submit(alice, "son tung").status, "artist-again");

  const hint = session.hint();
  assert.ok(hint && hint.includes("Hint 1"), String(hint));
  assert.ok(session.hint().includes("Hint 2"));
  assert.ok(session.hint().includes("No more hints"));

  for (let i = 0; i < 300 && player.getData("quiz"); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(player.getData("quiz"), undefined, "the game has ended");
  assert.ok(client.sent.some((m) => m.embeds?.[0]?.data?.title?.includes("Music quiz finished")));

  const top = S.quizLeaderboard("g1", 5);
  assert.ok(top.some((r) => r.user_id === "u1" && r.points > 0));
  assert.ok(top.some((r) => r.user_id === "u2" && r.points > 0));
  cancelIdleLeave(player);
});

test("music quiz: stopping midway still cleans up, users with stats off don't get points saved", async () => {
  S.setStatsEnabled("u9", false);
  const client = fakeClient(["u9"]);
  const player = fakePlayer({ guildId: "g2", queue: fakeQueue(), search: async ({ query }) => ({ tracks: [fakeTrack(path.basename(query, ".mp3"))] }) });
  const entries = [{ file: "Một.mp3", title: "Một", artist: "X", album: null, durationMs: 100_000 }, { file: "Hai.mp3", title: "Hai", artist: "X", album: null, durationMs: 100_000 }];
  const session = startQuiz({ client, player, channel: client.channels.cache.get(), starter: { id: "u9", username: "z" }, entries, rounds: 2, clipMs: 5000, gapMs: 20, graceMs: 5000 });
  for (let i = 0; i < 100 && player.queue.current === null; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(session.submit({ id: "u9", username: "z" }, player.queue.current.info.title).status, "correct");
  session.abort();
  for (let i = 0; i < 100 && player.getData("quiz"); i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(player.getData("quiz"), undefined);
  assert.equal(S.quizLeaderboard("g2", 5).length, 0);
  cancelIdleLeave(player);
});

test("answer modal: correct, wrong and outside the game", async () => {
  const replies = [];
  const player = fakePlayer();
  const session = { submit: (u, t) => (t === "correct" ? { status: "correct", points: 80, streak: 2 } : { status: "wrong" }) };
  player.setData("quiz", session);
  const mk = (text) => ({
    guildId: "g1", user: { id: "u1" }, member: { voice: { channelId: "vc1" } },
    client: { lavalink: { getPlayer: () => player } },
    fields: { getTextInputValue: () => text },
    reply: async (p) => replies.push(p),
  });
  await handleQuizModal(mk("correct"));
  await handleQuizModal(mk("wrong"));
  assert.ok(replies[0].embeds[0].data.description.includes("+80"));
  assert.ok(replies[1].embeds[0].data.description.includes("Not quite"));

  player.setData("quiz", undefined);
  await handleQuizModal(mk("correct"));
  assert.ok(replies[2].embeds[0].data.description.includes("ended"));

  const outside = mk("correct");
  player.setData("quiz", session);
  outside.member.voice.channelId = "other";
  await handleQuizModal(outside);
  assert.ok(replies[3].embeds[0].data.description.includes("same voice channel"));
});

test("24/7: recognizes the channel and doesn't schedule leaving", async () => {
  assert.equal(is247("g1", "vc1"), false);
  store.updateSettings("g1", { stay247: { voiceChannelId: "vc1", textChannelId: "tc1", radio: false } });
  assert.equal(is247("g1", "vc1"), true);
  assert.equal(is247("g1", "vc2"), false);

  let destroyed = 0;
  const player = fakePlayer({ queue: { current: null, tracks: [] }, destroy: async () => { destroyed++; } });
  scheduleIdleLeave(player, 20);
  assert.equal(player.getData("idleTimer"), undefined, "with 24/7 on, no leave timer is scheduled");
  store.updateSettings("g1", { stay247: null });
  scheduleIdleLeave(player, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(destroyed, 1, "with 24/7 off, the bot leaves the channel once idle");

  const busy = fakePlayer({ destroy: async () => { destroyed++; } });
  scheduleIdleLeave(busy, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(destroyed, 1, "it doesn't leave while playing");
  cancelIdleLeave(busy);
});
