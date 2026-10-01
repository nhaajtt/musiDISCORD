import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = mkdtempSync(path.join(os.tmpdir(), "musi-pi-"));
const music = path.join(root, "music");
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.MUSIC_DIR = music;
process.env.DATA_DIR = path.join(root, "data");
process.env.SHARED_DIR = path.join(root, "shared");
process.env.DB_PATH = ":memory:";
process.env.BOT_NAME = "Bot Hai";
process.env.AUTOTAG = "on";
process.env.ACOUSTID_KEY = "key123";
process.env.ANALYSIS = "on";

["Không thẻ 1.mp3", "Không thẻ 2.mp3", "Nghệ sĩ/Album/01 - Bài ba.mp3"].forEach((rel) => {
  const abs = path.join(music, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, "not really audio");
});

const { config } = await import("../src/config.js");
const L = await import("../src/library/index.js");
const overlay = await import("../src/library/overlay.js");
const tagger = await import("../src/library/tagger.js");
const worker = await import("../src/library/worker.js");
const { computeFeatures, distance, moodOf } = await import("../src/analysis/features.js");
const { createJsonStore } = await import("../src/shared/jsonStore.js");
const { handle, nowPlayingState, pickPlayer } = await import("../src/web/server.js");

test.after(() => rmSync(root, { recursive: true, force: true }));

function clicks(bpm, secs = 40, amp = 0.8, sr = 22050) {
  const out = new Float32Array(secs * sr);
  const period = (60 / bpm) * sr;
  for (let t = 0; t < out.length; t += period) {
    const s = Math.round(t);
    for (let i = 0; i < 1500 && s + i < out.length; i++) out[s + i] += amp * Math.sin((2 * Math.PI * 1000 * i) / sr) * Math.exp(-i / 300);
  }
  return out;
}

// ---------- cấu hình nhiều bot ----------

test("cấu hình: tên bot, thư mục chung, công tắc tính năng", () => {
  assert.equal(config.botName, "Bot Hai");
  assert.equal(config.sharedDir, process.env.SHARED_DIR);
  assert.equal(config.libraryWorker, true);
  assert.equal(config.autotag.enabled, true);
  assert.equal(config.analysis.enabled, true);
  assert.equal(config.display.port, 0);
  assert.equal(config.display.bind, "127.0.0.1");
});

test("kho JSON chung: ghi nguyên tử, nạp lại khi file đổi, không đụng nhau giữa hai kho", async () => {
  const dir = path.join(root, "store");
  const a = createJsonStore("x.json", dir);
  const b = createJsonStore("x.json", dir);
  a.refresh();
  a.set("k", { v: 1 });
  a.save();
  assert.equal(b.refresh(), true);
  assert.deepEqual(b.get("k"), { v: 1 });
  assert.equal(b.refresh(), false, "không đổi thì không nạp lại");

  await new Promise((r) => setTimeout(r, 20));
  a.set("k", { v: 2 });
  a.save();
  assert.equal(b.refresh(), true);
  assert.equal(b.get("k").v, 2);
  assert.equal(existsSync(path.join(dir, "x.json")), true);
  assert.deepEqual(JSON.parse(readFileSync(path.join(dir, "x.json"), "utf8")), { k: { v: 2 } });
});

test("kho JSON hỏng thì coi như rỗng", () => {
  const dir = path.join(root, "bad");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "t.json"), "{hỏng");
  const s = createJsonStore("t.json", dir);
  s.refresh();
  assert.equal(s.size(), 0);
});

// ---------- gắn thẻ ----------

test("AcoustID: chọn kết quả điểm cao nhất, làm sạch chữ, bỏ kết quả thiếu tên", () => {
  const json = {
    status: "ok",
    results: [
      { score: 0.4, recordings: [{ title: "Sai", artists: [{ name: "X" }] }] },
      {
        score: 0.93,
        recordings: [
          { title: "[click](http://evil)<@1>Lạc trôi", artists: [{ name: "Sơn Tùng" }, { name: "Khách" }], releasegroups: [{ id: "a".repeat(8) + "-1111-2222-3333-" + "b".repeat(12), title: "Sky Tour", type: "Album" }] },
          { title: "", artists: [{ name: "Y" }] },
        ],
      },
    ],
  };
  const r = tagger.parseAcoustid(json);
  assert.equal(r.title, "click@1Lạc trôi");
  assert.equal(r.artist, "Sơn Tùng, Khách");
  assert.equal(r.album, "Sky Tour");
  assert.equal(r.confidence, 0.93);
  assert.equal(tagger.parseAcoustid({ status: "error" }), null);
  assert.equal(tagger.parseAcoustid({ status: "ok", results: [] }), null);
});

test("MusicBrainz theo chữ: độ tin cậy bị chặn dưới ngưỡng tự áp dụng", () => {
  const r = tagger.parseMusicBrainz({ recordings: [{ score: 100, title: "Buông", "artist-credit": [{ name: "Đen" }], releases: [{ title: "Album", "release-group": { id: "id" } }] }] });
  assert.equal(r.title, "Buông");
  assert.ok(r.confidence <= 0.8 && r.confidence < config.autotag.autoApply);
  assert.equal(tagger.parseMusicBrainz({ recordings: [] }), null);
});

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

test("identify: dấu vân tin cậy cao thì tự áp dụng, thấp thì chỉ gợi ý, không ra thì none", async () => {
  const fingerprintFn = async () => ({ duration: 200, fingerprint: "AQAA" });
  const calls = [];
  const mk = (score) => async (url, init) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return okJson({ status: "ok", results: [{ score, recordings: [{ title: "Bài", artists: [{ name: "Ai đó" }] }] }] });
  };

  const high = await tagger.identify("a.mp3", { fingerprintFn, fetchFn: mk(0.95), gapMs: 0 });
  assert.equal(high.status, "applied");
  assert.equal(high.source, "acoustid");
  assert.match(calls[0].body, /fingerprint=AQAA/);
  assert.match(calls[0].body, /client=key123/);

  const low = await tagger.identify("a.mp3", { fingerprintFn, fetchFn: mk(0.5), gapMs: 0 });
  assert.equal(low.status, "suggested");

  const none = await tagger.identify("zzz.mp3", { fingerprintFn: async () => { throw new Error("hỏng"); }, fetchFn: async () => okJson({ recordings: [] }), gapMs: 0 });
  assert.equal(none.status, "none");
});

test("identify: dịch vụ lỗi HTTP không làm sập, trả none", async () => {
  const res = await tagger.identify("a.mp3", { fingerprintFn: async () => ({ duration: 1, fingerprint: "x" }), fetchFn: async () => ({ ok: false, status: 503 }), gapMs: 0 });
  assert.equal(res.status, "none");
});

test("fetchCover: chỉ nhận JPEG nhỏ và id hợp lệ", async () => {
  const id = "a".repeat(8) + "-1111-2222-3333-" + "b".repeat(12);
  const mk = (type, size) => async () => ({ ok: true, headers: { get: () => type }, arrayBuffer: async () => new Uint8Array(size).buffer });
  assert.equal(await tagger.fetchCover("x.mp3", "../etc", { fetchFn: mk("image/jpeg", 10), gapMs: 0 }), false);
  assert.equal(await tagger.fetchCover("x.mp3", id, { fetchFn: mk("text/html", 10), gapMs: 0 }), false);
  assert.equal(await tagger.fetchCover("x.mp3", id, { fetchFn: mk("image/jpeg", 3 * 1024 * 1024), gapMs: 0 }), false);
  assert.equal(await tagger.fetchCover("x.mp3", id, { fetchFn: mk("image/jpeg", 100), gapMs: 0 }), true);
  assert.equal(existsSync(path.join(overlay.coversDir(), `${overlay.coverKey("x.mp3")}.jpg`)), true);
});

test("lớp phủ thẻ: chỉ áp dụng khi status applied, không sửa mục gốc, cập nhật searchText", () => {
  const base = L.buildEntry("Không thẻ 1.mp3", null);
  assert.equal(base.hasTags, false);
  assert.equal(L.applyOverlay(base, { status: "suggested", title: "A" }), base);
  assert.equal(L.applyOverlay(base, undefined), base);

  const tagged = L.applyOverlay(base, { status: "applied", title: "Lạc trôi", artist: "Sơn Tùng", album: "Sky" });
  assert.equal(tagged.title, "Lạc trôi");
  assert.equal(tagged.hasTags, true);
  assert.ok(tagged.searchText.includes("lac troi"));
  assert.ok(tagged.searchText.includes("khong the"), "vẫn tìm được theo tên file cũ");
  assert.equal(base.title, "Không thẻ 1", "mục gốc không đổi");
});

test("quét thư viện nạp lớp phủ từ tags.json (kể cả khi lấy từ bộ nhớ đệm)", async () => {
  await L.scan();
  assert.equal(L.get("Không thẻ 1.mp3").hasTags, false);

  overlay.tags.refresh();
  overlay.tags.set("Không thẻ 1.mp3", { status: "applied", title: "Tên mới", artist: "Nghệ sĩ mới", album: "Album mới" });
  overlay.tags.save();
  await L.scan();
  assert.equal(L.get("Không thẻ 1.mp3").title, "Tên mới");
  assert.equal(L.search("album moi").length, 1);

  // file nhạc gốc không bị đụng
  assert.equal(readFileSync(path.join(music, "Không thẻ 1.mp3"), "utf8"), "not really audio");
});

test("chọn bài cần gắn thẻ: bỏ bài đã có thẻ/đã thử, thử lại 'none' sau 30 ngày", async () => {
  await L.scan();
  // "Không thẻ 1" đã có lớp phủ; hai bài còn lại thiếu thẻ
  assert.equal(worker.untaggedTargets().length, 2);
  overlay.tags.set("Không thẻ 2.mp3", { status: "none", checkedAt: Date.now() });
  overlay.tags.set("Nghệ sĩ/Album/01 - Bài ba.mp3", { status: "none", checkedAt: Date.now() });
  assert.equal(worker.untaggedTargets().length, 0);
  assert.equal(worker.untaggedTargets(L.all(), Date.now() + 31 * 86_400_000).length, 2);
  overlay.tags.delete("Không thẻ 2.mp3");
  assert.deepEqual(worker.untaggedTargets().map((e) => e.file), ["Không thẻ 2.mp3"]);
  overlay.tags.delete("Nghệ sĩ/Album/01 - Bài ba.mp3");
});

test("duyệt gợi ý: áp dụng thì thư viện đổi, loại thì giữ nguyên", async () => {
  overlay.tags.set("Không thẻ 2.mp3", { status: "suggested", title: "Gợi ý hay", artist: "Ai đó", confidence: 0.6, source: "musicbrainz" });
  assert.equal(worker.suggestions().length, 1);
  assert.equal(await worker.reviewSuggestion("Không thẻ 2.mp3", false), true);
  assert.equal(L.get("Không thẻ 2.mp3").hasTags, false);
  assert.equal(await worker.reviewSuggestion("Không thẻ 2.mp3", true), false, "đã xử lý rồi");

  overlay.tags.set("Không thẻ 2.mp3", { status: "suggested", title: "Gợi ý hay", artist: "Ai đó" });
  assert.equal(await worker.reviewSuggestion("Không thẻ 2.mp3", true), true);
  assert.equal(L.get("Không thẻ 2.mp3").title, "Gợi ý hay");
  assert.equal(await worker.forgetTag("Không thẻ 2.mp3"), true);
  assert.equal(L.get("Không thẻ 2.mp3").hasTags, false);
});

// ---------- phân tích âm thanh ----------

test("BPM ước lượng đúng trong ±3 với nhịp gõ tổng hợp", () => {
  for (const bpm of [80, 100, 120, 128, 140, 170]) {
    const r = computeFeatures(clicks(bpm));
    assert.ok(Math.abs(r.bpm - bpm) <= 3, `${bpm} BPM -> ${r.bpm}`);
  }
});

test("năng lượng tăng theo độ lớn; im lặng và quá ngắn trả null", () => {
  const loud = computeFeatures(clicks(120, 40, 0.9));
  const quiet = computeFeatures(clicks(120, 40, 0.02));
  assert.ok(loud.energy > quiet.energy);
  assert.ok(loud.energy >= 0 && loud.energy <= 1 && loud.brightness >= 0 && loud.brightness <= 1);
  assert.equal(computeFeatures(new Float32Array(22050 * 40)), null);
  assert.equal(computeFeatures(new Float32Array(1000)), null);
});

test("tâm trạng theo nhịp độ và năng lượng", () => {
  assert.equal(moodOf(130, 0.8), "hype");
  assert.equal(moodOf(110, 0.55), "upbeat");
  assert.equal(moodOf(70, 0.6), "chill");
  assert.equal(moodOf(100, 0.3), "chill");
  assert.equal(moodOf(100, 0.45), "steady");
  assert.equal(moodOf(null, 0.8), "upbeat");
});

test("khoảng cách giống nhau: tự thân = 0, nhịp gấp đôi gần hơn nhịp lệch, thiếu BPM vẫn tính được", () => {
  const a = { bpm: 70, energy: 0.5, brightness: 0.3 };
  assert.equal(distance(a, a), 0);
  assert.ok(distance(a, { ...a, bpm: 140 }) < distance(a, { ...a, bpm: 105 }));
  assert.ok(Number.isFinite(distance(a, { bpm: null, energy: 0.5, brightness: 0.3 })));
});

test("/similar và /vibe: gần nhất theo đặc trưng, bỏ bài chưa phân tích hay phân tích lỗi", async () => {
  await L.scan();
  const stamp = { mtimeMs: 1, size: 1 };
  features_set("Không thẻ 1.mp3", { bpm: 120, energy: 0.8, brightness: 0.5, mood: "hype" });
  features_set("Không thẻ 2.mp3", { bpm: 122, energy: 0.78, brightness: 0.5, mood: "hype" });
  features_set("Nghệ sĩ/Album/01 - Bài ba.mp3", { bpm: 70, energy: 0.2, brightness: 0.2, mood: "chill" });
  function features_set(rel, f) {
    overlay.features.set(rel, { ...stamp, ...f });
  }
  assert.equal(worker.similarTo("Không thẻ 1.mp3", 5)[0].file, "Không thẻ 2.mp3");
  assert.deepEqual(worker.byMood("chill").map((e) => e.file), ["Nghệ sĩ/Album/01 - Bài ba.mp3"]);

  overlay.features.set("Không thẻ 2.mp3", { ...stamp, failed: true });
  assert.equal(worker.featuresOf("Không thẻ 2.mp3"), null);
  assert.equal(worker.similarTo("Không thẻ 1.mp3", 5).some((e) => e.file === "Không thẻ 2.mp3"), false);
  assert.deepEqual(worker.similarTo("không-có.mp3"), []);
});

// ---------- API trạng thái ----------

function fakePlayer(overrides = {}) {
  const data = { ...overrides.data };
  const calls = [];
  const player = {
    guildId: "g1",
    playing: true,
    paused: false,
    position: 61_500,
    volume: 80,
    repeatMode: "off",
    queue: {
      current: { info: { title: "Bài **thử**", author: "Ai đó", album: "Al", duration: 200_000, isStream: false, sourceName: "local", identifier: `${config.musicDir}/Nghệ sĩ/Album/01 - Bài ba.mp3` }, requester: { id: "999", username: "bí mật" } },
      tracks: [{}, {}],
    },
    getData: (k) => data[k],
    pause: async () => { calls.push("pause"); player.paused = true; },
    resume: async () => { calls.push("resume"); player.paused = false; },
    setVolume: async (v) => { calls.push(["vol", v]); player.volume = v; },
    stopPlaying: async () => calls.push("stop"),
    skip: async () => calls.push("skip"),
    calls,
    ...overrides.player,
  };
  return player;
}
const fakeClient = (...players) => ({ guilds: { cache: new Map([["g1", { name: "Chamy's" }]]) }, lavalink: { players: new Map(players.map((p) => [p.guildId, p])) } });

function fakeRes() {
  return { status: 0, headers: {}, body: "", writeHead(s, h) { this.status = s; this.headers = h; }, end(b) { this.body = b ?? ""; } };
}
const fakeReq = (url, method = "GET", body = null, headers = {}) => ({ url, method, headers, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); } });

test("trạng thái đang phát không lộ ID hay tên người yêu cầu", () => {
  const state = nowPlayingState(fakeClient(fakePlayer()), fakePlayer());
  assert.equal(state.title, "Bài **thử**");
  assert.equal(state.guild, "Chamy's");
  assert.equal(state.bot, "Bot Hai");
  assert.equal(state.queueLength, 2);
  assert.match(state.accent, /^#[0-9a-f]{6}$/);
  const text = JSON.stringify(state);
  assert.ok(!text.includes("999") && !text.includes("bí mật"));
});

test("trạng thái: ẩn khi đố nhạc, rỗng khi không có player hay bài", () => {
  const quiz = fakePlayer({ data: { quiz: true } });
  assert.deepEqual(nowPlayingState(fakeClient(quiz), quiz), { bot: "Bot Hai", playing: false, canControl: false, hidden: true });
  assert.deepEqual(nowPlayingState(fakeClient(), null), { bot: "Bot Hai", playing: false, canControl: false });
  const empty = fakePlayer();
  empty.queue.current = null;
  assert.equal(nowPlayingState(fakeClient(empty), empty).playing, false);
});

test("chọn player: ưu tiên server đang phát", () => {
  const idle = { ...fakePlayer(), guildId: "g0", playing: false };
  const busy = fakePlayer();
  assert.equal(pickPlayer(fakeClient(idle, busy), null).guildId, "g1");
  assert.equal(pickPlayer(fakeClient(idle, busy), "g0").guildId, "g0");
  assert.equal(pickPlayer(fakeClient(idle, busy), "none"), null);
});

test("HTTP: trang /display, /api/np, 404, và điều khiển bị tắt khi không có token", async () => {
  const client = fakeClient(fakePlayer());
  const cfg = { token: null };

  let res = fakeRes();
  await handle(fakeReq("/display"), res, client, cfg);
  assert.equal(res.status, 200);
  assert.match(String(res.body), /<!doctype html>/);
  assert.match(res.headers["Content-Security-Policy"], /default-src 'none'/);
  assert.match(res.headers["Content-Security-Policy"], /script-src 'self'/);
  assert.doesNotMatch(res.headers["Content-Security-Policy"], /unsafe-inline/);

  res = fakeRes();
  await handle(fakeReq("/api/np"), res, client, cfg);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).title, "Bài **thử**");

  res = fakeRes();
  await handle(fakeReq("/nope"), res, client, cfg);
  assert.equal(res.status, 404);

  res = fakeRes();
  await handle(fakeReq("/api/control", "POST", { action: "skip" }), res, client, cfg);
  assert.equal(res.status, 403);
});

test("HTTP: có token thì mọi /api cần token đúng, điều khiển hoạt động và kiểm tra đầu vào", async () => {
  const player = fakePlayer();
  const client = fakeClient(player);
  const cfg = { token: "s3cret" };

  let res = fakeRes();
  await handle(fakeReq("/api/np"), res, client, cfg);
  assert.equal(res.status, 401);

  res = fakeRes();
  await handle(fakeReq("/api/np", "GET", null, { "x-token": "sai" }), res, client, cfg);
  assert.equal(res.status, 401);

  res = fakeRes();
  await handle(fakeReq("/api/np?token=s3cret"), res, client, cfg);
  assert.equal(res.status, 200);

  const control = async (body) => {
    const r = fakeRes();
    await handle(fakeReq("/api/control", "POST", body, { "x-token": "s3cret" }), r, client, cfg);
    return r;
  };
  assert.equal((await control({ action: "toggle" })).status, 200);
  assert.equal(player.paused, true);
  assert.equal((await control({ action: "toggle" })).status, 200);
  assert.equal(player.paused, false);
  assert.equal((await control({ action: "volume", value: 500 })).status, 200);
  assert.equal(player.volume, 150, "âm lượng bị chặn ở 150");
  assert.equal((await control({ action: "volume", value: "abc" })).status, 400);
  for (const bad of [null, "", "  ", undefined, {}, [], true]) assert.equal((await control({ action: "volume", value: bad })).status, 400, `âm lượng ${JSON.stringify(bad)}`);
  assert.equal((await control({ action: "rm -rf" })).status, 400);
  assert.equal((await control({ action: "skip" })).status, 200);
  assert.ok(player.calls.includes("skip"));
});

test("HTTP: không điều khiển được khi đang đố nhạc hoặc không có bài", async () => {
  const cfg = { token: "t" };
  const quiz = fakePlayer({ data: { quiz: true } });
  let res = fakeRes();
  await handle(fakeReq("/api/control", "POST", { action: "skip" }, { "x-token": "t" }), res, fakeClient(quiz), cfg);
  assert.equal(res.status, 409);

  res = fakeRes();
  await handle(fakeReq("/api/control", "POST", { action: "skip" }, { "x-token": "t" }), res, fakeClient(), cfg);
  assert.equal(res.status, 409);
});

test("HTTP: /api/cover không lộ bìa khi đố nhạc", async () => {
  const quiz = fakePlayer({ data: { quiz: true } });
  const res = fakeRes();
  await handle(fakeReq("/api/cover"), res, fakeClient(quiz), { token: null });
  assert.equal(res.status, 404);
});

// ---------- sao lưu ----------

test("sao lưu: VACUUM INTO đọc lại được, bỏ backups/cache/contrib, giữ đúng số bản", async () => {
  const { spawnSync } = await import("node:child_process");
  const { DatabaseSync } = await import("node:sqlite");
  const { runBackup, prune } = await import("../scripts/backup.js");

  const dataDir = path.join(root, "bk-data");
  mkdirSync(path.join(dataDir, "shared", "covers"), { recursive: true });
  mkdirSync(path.join(dataDir, "contrib"), { recursive: true });
  mkdirSync(path.join(dataDir, "kuma"), { recursive: true });
  writeFileSync(path.join(dataDir, "settings.json"), '{"a":1}');
  writeFileSync(path.join(dataDir, "library-cache.json"), "{}");
  writeFileSync(path.join(dataDir, "shared", "tags.json"), '{"x":{}}');
  writeFileSync(path.join(dataDir, "shared", "covers", "c.jpg"), "jpg");
  writeFileSync(path.join(dataDir, "contrib", "1.mp3"), "staged");
  writeFileSync(path.join(dataDir, "kuma", "k.db"), "kuma");
  const db = new DatabaseSync(path.join(dataDir, "musidiscord.db"));
  db.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('xin chào')");
  db.close();

  const t0 = Date.now();
  let last;
  for (let i = 0; i < 4; i++) last = await runBackup({ dataDir, keep: 3, now: new Date(t0 + i * 2000) });
  assert.equal(last.pruned.length, 1, "lần thứ 4 xoá bản cũ nhất");

  const files = (await import("node:fs")).readdirSync(path.join(dataDir, "backups")).filter((f) => f.endsWith(".tar.gz"));
  assert.equal(files.length, 3);
  assert.equal((await import("node:fs")).readdirSync(path.join(dataDir, "backups")).some((f) => f.startsWith(".work-")), false, "thư mục tạm đã dọn");

  const out = path.join(root, "bk-restore");
  mkdirSync(out, { recursive: true });
  const backups = path.join(dataDir, "backups");
  const ex = spawnSync("tar", ["-xzf", files.sort().at(-1), "-C", path.relative(backups, out).replaceAll("\\", "/")], { cwd: backups });
  assert.equal(ex.status, 0, String(ex.stderr));
  assert.equal(readFileSync(path.join(out, "settings.json"), "utf8"), '{"a":1}');
  assert.equal(readFileSync(path.join(out, "shared", "tags.json"), "utf8"), '{"x":{}}');
  assert.equal(existsSync(path.join(out, "library-cache.json")), false);
  assert.equal(existsSync(path.join(out, "contrib")), false);
  assert.equal(existsSync(path.join(out, "kuma")), false);
  assert.equal(existsSync(path.join(out, "backups")), false);
  const restored = new DatabaseSync(path.join(out, "musidiscord.db"), { readOnly: true });
  assert.equal(restored.prepare("SELECT v FROM t").get().v, "xin chào");
  restored.close();
  assert.deepEqual(prune(path.join(dataDir, "backups"), 3), []);
});

// ---------- giao diện /display ----------

test("giao diện: phục vụ css, js, font đúng loại; không cho đường dẫn tự do hay thoát thư mục", async () => {
  const client = fakeClient(fakePlayer());
  const get = async (p) => {
    const r = fakeRes();
    await handle(fakeReq(p), r, client, { token: "t" });
    return r;
  };
  let r = await get("/display.css");
  assert.equal(r.status, 200);
  assert.match(r.headers["Content-Type"], /text\/css/);
  r = await get("/display.js");
  assert.equal(r.status, 200);
  assert.match(r.headers["Content-Type"], /javascript/);
  r = await get("/assets/fonts/BarlowCondensed-Bold.ttf");
  assert.equal(r.status, 200);
  assert.equal(r.headers["Content-Type"], "font/ttf");
  for (const bad of ["/assets/fonts/../../.env", "/assets/fonts/OFL-BarlowCondensed.txt", "/src/config.js", "/display.html", "/assets/fonts/"]) {
    assert.equal((await get(bad)).status, 404, bad);
  }
  // trang tĩnh không cần token, dữ liệu thì cần
  assert.equal((await get("/api/np")).status, 401);
});

test("giao diện: HTML không nhúng script hay style trực tiếp (hợp CSP) và không gọi tài nguyên ngoài", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../src/web/static/display.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/web/static/display.css", import.meta.url), "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\sstyle=/i);
  assert.doesNotMatch(html + css, /https?:\/\/(?!www\.w3\.org)/i);
  assert.doesNotMatch(css, /@import/);
});

test("trạng thái có BPM, năng lượng, tâm trạng từ phân tích và cờ điều khiển", () => {
  const rel = "Nghệ sĩ/Album/01 - Bài ba.mp3";
  overlay.features.set(rel, { mtimeMs: 1, size: 1, bpm: 120.5, energy: 0.7, brightness: 0.4, mood: "hype" });
  const s = nowPlayingState(fakeClient(fakePlayer()), fakePlayer(), "B", true);
  assert.equal(s.bpm, 120.5);
  assert.equal(s.energy, 0.7);
  assert.equal(s.mood, "hype");
  assert.equal(s.canControl, true);
  assert.equal(nowPlayingState(fakeClient(fakePlayer()), fakePlayer()).canControl, false);

  overlay.features.set(rel, { mtimeMs: 1, size: 1, failed: true });
  assert.equal(nowPlayingState(fakeClient(fakePlayer()), fakePlayer()).bpm, null, "phân tích lỗi thì không có BPM");
  overlay.features.delete(rel);
});

test("điều khiển: tua kiểm tra giới hạn, lặp đổi vòng, báo lại trạng thái có canControl", async () => {
  const player = fakePlayer({ player: { seek: async function (ms) { this.calls.push(["seek", ms]); }, setRepeatMode: async function (m) { this.repeatMode = m; } } });
  player.seek = player.seek.bind(player);
  player.setRepeatMode = player.setRepeatMode.bind(player);
  const client = fakeClient(player);
  const cfg = { token: "k" };
  const control = async (body) => {
    const r = fakeRes();
    await handle(fakeReq("/api/control", "POST", body, { "x-token": "k" }), r, client, cfg);
    return r;
  };

  let r = await control({ action: "seek", value: 90_000 });
  assert.equal(r.status, 200);
  assert.deepEqual(player.calls.at(-1), ["seek", 90_000]);
  assert.equal(JSON.parse(r.body).canControl, true);
  for (const bad of [-1, 200_000, 999_999, "abc", null]) assert.equal((await control({ action: "seek", value: bad })).status, 400, String(bad));

  assert.equal((await control({ action: "loop" })).status, 200);
  assert.equal(player.repeatMode, "track");
  assert.equal((await control({ action: "loop" })).status, 200);
  assert.equal(player.repeatMode, "queue");
  assert.equal((await control({ action: "loop" })).status, 200);
  assert.equal(player.repeatMode, "off");

  player.queue.current.info.isStream = true;
  assert.equal((await control({ action: "seek", value: 1000 })).status, 400, "không tua được luồng trực tiếp");
});
