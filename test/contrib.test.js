import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = mkdtempSync(path.join(os.tmpdir(), "musi-contrib-"));
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";
process.env.DATA_DIR = path.join(root, "data");
process.env.MUSIC_DIR = path.join(root, "music");
process.env.CONTRIB_MAX_MB = "1";
process.env.OWNER_IDS = "owner1, owner2";
mkdirSync(process.env.MUSIC_DIR, { recursive: true });

const { config } = await import("../src/config.js");
const L = await import("../src/library/index.js");
const N = await import("../src/contrib/names.js");
const R = await import("../src/contrib/requests.js");
const I = await import("../src/contrib/ingest.js");
const A = await import("../src/contrib/approve.js");
const St = await import("../src/contrib/store.js");
const Notify = await import("../src/contrib/notify.js");
const S = await import("../src/stats.js");

test.after(() => rmSync(root, { recursive: true, force: true }));

/** Tạo file WAV hợp lệ (đơn kênh, 8 kHz, 8 bit) dài `seconds` giây. */
function wav(seconds, tone = 440) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) buf[44 + i] = 128 + Math.round(Math.sin((2 * Math.PI * tone * i) / rate) * 60);
  return buf;
}

const url = (name) => `https://cdn.discordapp.com/attachments/1/2/${encodeURIComponent(name)}`;
const att = (name, size) => ({ url: url(name), name, size });
const okFetch = (buffer, headers = {}) => async () => new Response(buffer, { headers });

// ---------- tên file và đường dẫn
test("làm sạch tên file", () => {
  assert.equal(N.sanitizeFileName("Nghệ sĩ - Tên bài"), "Nghệ sĩ - Tên bài");
  assert.equal(N.sanitizeFileName("../../etc/passwd"), "etc passwd");
  assert.equal(N.sanitizeFileName("a\\b/c:d*e?f\"g<h>i|j"), "a b c d e f g h i j");
  assert.equal(N.sanitizeFileName("con"), "_con");
  assert.equal(N.sanitizeFileName("NUL"), "_NUL");
  assert.equal(N.sanitizeFileName("  ...  "), "Bài không tên");
  assert.equal(N.sanitizeFileName(""), "Bài không tên");
  assert.equal(N.sanitizeFileName(null), "Bài không tên");
  assert.equal(N.sanitizeFileName("a\u0000b‮c​d"), "a b c d");
  assert.ok([...N.sanitizeFileName("x".repeat(500))].length <= 120);
  assert.equal(N.sanitizeFileName(".hidden"), "hidden");
  assert.equal(N.sanitizeFileName("Lạc Trôi."), "Lạc Trôi");
});

test("isInside và uniquePath", async () => {
  const dir = path.join(root, "uniq");
  mkdirSync(dir, { recursive: true });
  assert.equal(N.isInside(dir, path.join(dir, "a.mp3")), true);
  assert.equal(N.isInside(dir, path.join(dir, "..", "a.mp3")), false);
  assert.equal(N.isInside(dir, dir), false);
  assert.equal(N.isInside(dir, path.resolve("/etc/passwd")), false);

  writeFileSync(path.join(dir, "A.mp3"), "x");
  assert.equal(path.basename(await N.uniquePath(dir, "A", ".mp3")), "A (2).mp3");
  writeFileSync(path.join(dir, "A (2).mp3"), "x");
  assert.equal(path.basename(await N.uniquePath(dir, "A", ".mp3")), "A (3).mp3");
});

// ---------- phân tích đề xuất
test("các dạng link YouTube cùng về một khoá", () => {
  const keys = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ].map((u) => R.parseRequest(u)?.key);
  assert.deepEqual(new Set(keys), new Set(["yt:dQw4w9WgXcQ"]));
  assert.equal(R.parseRequest("https://youtu.be/dQw4w9WgXcQ").display, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
});

test("link khác: Spotify, SoundCloud, host lạ và đầu vào xấu", () => {
  assert.equal(R.parseRequest("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x").key, "sp:track:4uLU6hMCjMI75M1A2tKUQC");
  assert.equal(R.parseRequest("https://soundcloud.com/Artist/Song-Name?x=1").key, "sc:/artist/song-name");
  assert.equal(R.parseRequest("https://evil.example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(R.parseRequest("https://youtube.com/watch?v=short"), null);
  assert.equal(R.parseRequest("ftp://x/y"), null);
  assert.equal(R.parseRequest("file:///etc/passwd"), null);
  assert.ok(R.parseRequest("javascript:alert(1)").key.startsWith("q:"), "chỉ coi là chữ thường");
  assert.equal(R.parseRequest(""), null);
  assert.equal(R.parseRequest("a"), null);
  assert.equal(R.parseRequest("x".repeat(500)), null);
  assert.equal(R.parseRequest("http://"), null);
});

test("tên bài chuẩn hoá bỏ dấu và hoa thường", () => {
  assert.equal(R.parseRequest("  Lạc   Trôi  - Sơn Tùng ").key, "q:lac troi son tung");
  assert.equal(R.parseRequest("LAC TROI son tung").key, "q:lac troi son tung");
});

test("hiển thị an toàn: markdown bị vô hiệu, link bọc <>", () => {
  const text = R.displayOf({ key: "q:x", display: "**bold** @everyone [x](http://e.com)" });
  assert.ok(text.includes("\\*\\*bold\\*\\*"));
  assert.equal(R.displayOf({ key: "yt:abcdefghijk", display: "https://www.youtube.com/watch?v=abcdefghijk" }), "<https://www.youtube.com/watch?v=abcdefghijk>");
});

// ---------- danh sách đề xuất
test("thêm đề xuất, bỏ phiếu, trùng và giới hạn", async () => {
  await L.scan();
  const add = (input, user, extra = {}) => R.addRequest({ input, guildId: "g1", channelId: "c1", userId: user, ...extra });

  const first = add("Lạc Trôi Sơn Tùng", "u1");
  assert.equal(first.status, "added");
  assert.equal(first.request.votes, 1);
  assert.equal(add("lac troi son tung", "u2").status, "voted");
  assert.equal(add("lac troi son tung", "u2").status, "already-voted");
  assert.equal(R.voteRequest(first.request.id, "u3").status, "voted");
  assert.equal(R.voteRequest(first.request.id, "u3").status, "already-voted");
  assert.equal(R.voteRequest(9999, "u3").status, "none");
  assert.equal(R.getRequest(first.request.id).votes, 3);
  assert.equal(add("!!", "u1").status, "invalid");

  assert.equal(R.listOpen(5)[0].id, first.request.id, "nhiều phiếu nhất lên đầu");
  assert.equal(R.listMine("u2").length, 1);

  for (let i = 0; i < 5; i++) assert.equal(add(`bai so ${i} abc`, "u9").status, "added");
  assert.equal(add("bai thu sau xyz", "u9").status, "limit");
  assert.equal(R.removeOwn(R.listMine("u9")[0].id, "u1"), false, "không xoá được đề xuất của người khác");
  assert.equal(R.removeOwn(R.listMine("u9")[0].id, "u9"), true);
  assert.equal(add("bai thu sau xyz", "u9").status, "added");
});

test("bài đã có trong thư viện thì không cần đề xuất", async () => {
  writeFileSync(path.join(config.musicDir, "Trịnh Công Sơn - Hạ Trắng.mp3"), "x");
  await L.scan();
  const result = R.addRequest({ input: "ha trang", guildId: "g", channelId: "c", userId: "u5" });
  assert.equal(result.status, "in-library");
  assert.equal(result.entry.title, "Hạ Trắng");
  assert.equal(R.addRequest({ input: "https://youtu.be/dQw4w9WgXcQ", guildId: "g", channelId: "c", userId: "u5" }).status, "added");
});

test("bài mới trong thư viện tự khớp đề xuất và báo đúng người, mỗi người một lần", async () => {
  const sent = [];
  const notify = async (userId, text, channelId) => sent.push({ userId, text, channelId });

  writeFileSync(path.join(config.musicDir, "Sơn Tùng M-TP - Lạc Trôi.mp3"), "x");
  let pairs = [];
  const off = L.onScanned((entries) => (pairs = R.fulfilMatches(entries)));
  await L.scan();
  off();
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].entry.title, "Lạc Trôi");

  await R.notifyFulfilled(notify, pairs);
  assert.deepEqual(sent.map((s) => s.userId).sort(), ["u1", "u2", "u3"]);
  assert.ok(sent.every((s) => s.channelId === "c1" && s.text.includes("/local")));

  // đã đáp ứng thì không khớp lại
  assert.equal(R.fulfilMatches(L.all()).length, 0);
  assert.equal(R.addRequest({ input: "lac troi", guildId: "g", channelId: "c", userId: "u7" }).status, "in-library");
});

test("chủ bot đánh dấu xong hoặc bỏ đề xuất", () => {
  const r = R.addRequest({ input: "bai chu bot xu ly", guildId: "g", channelId: "c", userId: "u8" }).request;
  assert.equal(R.closeRequest(r.id, "dismissed"), true);
  assert.equal(R.closeRequest(r.id, "fulfilled"), false, "đóng rồi thì không đổi nữa");
  assert.equal(R.addRequest({ input: "bai chu bot xu ly", guildId: "g", channelId: "c", userId: "u8" }).status, "dismissed");
});

// ---------- nhận file đóng góp
test("nhận file WAV hợp lệ vào hàng chờ", async () => {
  const buffer = wav(12);
  const result = await I.ingestAttachment({ attachment: att("Ca Sĩ A - Mây Lang Thang.wav", buffer.length), userId: "c1", guildId: "g1", fetchImpl: okFetch(buffer) });
  assert.ok(result.id > 0);
  assert.equal(result.title, "Mây Lang Thang");
  assert.equal(result.artist, "Ca Sĩ A");
  assert.ok(result.durationMs >= 11_000 && result.durationMs <= 13_000);
  assert.equal(result.sha256.length, 64);
  assert.ok(existsSync(I.stagedPath(result.id, ".wav")));
  assert.equal(St.getContribution(result.id).status, "pending");
  assert.equal(readdirSync(I.stagingDir()).filter((f) => f.startsWith("tmp-")).length, 0, "không để lại file tạm");
});

test("từ chối file trùng nội dung", async () => {
  const buffer = wav(12);
  await assert.rejects(
    I.ingestAttachment({ attachment: att("khac-ten.wav", buffer.length), userId: "c2", guildId: "g1", fetchImpl: okFetch(buffer) }),
    (e) => e.code === "duplicate",
  );
  assert.equal(readdirSync(I.stagingDir()).filter((f) => f.startsWith("tmp-")).length, 0);
});

const reject = async (attachment, fetchImpl, code, userId = "c3") =>
  assert.rejects(I.ingestAttachment({ attachment, userId, guildId: "g1", fetchImpl }), (e) => e.code === code, `mong đợi ${code}`);

test("từ chối đầu vào không hợp lệ", async () => {
  const good = wav(12, 523);
  await reject({ url: "https://evil.example.com/x.wav", name: "x.wav", size: 100 }, okFetch(good), "host");
  await reject({ url: "http://cdn.discordapp.com/x.wav", name: "x.wav", size: 100 }, okFetch(good), "host");
  await reject({ url: "https://cdn.discordapp.com.evil.com/x.wav", name: "x.wav", size: 100 }, okFetch(good), "host");
  await reject({ url: "not a url", name: "x.wav", size: 100 }, okFetch(good), "host");
  await reject(att("virus.exe", 100), okFetch(good), "ext");
  await reject(att("noext", 100), okFetch(good), "ext");
  await reject(att("x.wav", 0), okFetch(good), "empty");
  await reject(att("x.wav", 5 * 1024 * 1024), okFetch(good), "too_big");
  await reject(att("x.wav", good.length), async () => { throw new TypeError("redirect"); }, "download");
  await reject(att("x.wav", good.length), async () => new Response("nope", { status: 404 }), "download");
});

test("chặn file nói dối dung lượng và file khổng lồ khi đang tải", async () => {
  const big = Buffer.alloc(1.5 * 1024 * 1024, 7);
  await reject(att("x.wav", 1000), okFetch(big), "too_big");
  await reject(att("x.wav", 1000), okFetch(wav(12), { "content-length": String(50 * 1024 * 1024) }), "too_big");
  assert.equal(readdirSync(I.stagingDir()).filter((f) => f.startsWith("tmp-")).length, 0);
});

test("từ chối file giả mạo âm thanh, quá ngắn, quá dài", async () => {
  const fake = Buffer.from("day khong phai la file am thanh ".repeat(500));
  await reject(att("fake.mp3", fake.length), okFetch(fake), "not_audio");
  const short = wav(3, 600);
  await reject(att("short.wav", short.length), okFetch(short), "too_short");
  assert.equal(readdirSync(I.stagingDir()).filter((f) => f.startsWith("tmp-")).length, 0);
});

test("hạn mức: tối đa 3 file chờ duyệt mỗi người", async () => {
  const user = "quota-user";
  for (let i = 0; i < 3; i++) {
    const b = wav(11, 300 + i * 50);
    await I.ingestAttachment({ attachment: att(`q${i}.wav`, b.length), userId: user, guildId: "g1", fetchImpl: okFetch(b) });
  }
  const b = wav(11, 900);
  await reject(att("q4.wav", b.length), okFetch(b), "quota_pending", user);
});

test("hạn mức theo ngày", async () => {
  const user = "daily-user";
  const day = Date.now() - 3_600_000;
  for (let i = 0; i < 5; i++) {
    const b = wav(11, 1000 + i * 40);
    const r = await I.ingestAttachment({ attachment: att(`d${i}.wav`, b.length), userId: user, guildId: "g1", fetchImpl: okFetch(b), now: day });
    await A.rejectContribution({ id: r.id, ownerId: "owner1", reason: "thử" });
  }
  const b = wav(11, 1500);
  await reject(att("d6.wav", b.length), okFetch(b), "quota_daily", user);
});

// ---------- duyệt và từ chối
test("duyệt: chuyển file vào thư mục đóng góp, quét lại và không ghi ra ngoài", async () => {
  const b = wav(13, 700);
  const r = await I.ingestAttachment({ attachment: att("../../evil/Ca Sĩ B - Tên Bài Hay.wav", b.length), userId: "c9", guildId: "g1", fetchImpl: okFetch(b) });

  let scans = 0;
  const approved = await A.approveContribution({ id: r.id, ownerId: "owner1", scan: async () => { scans++; return L.scan(); } });
  assert.equal(scans, 1);
  assert.equal(approved.row.status, "approved");
  assert.equal(approved.row.reviewed_by, "owner1");
  assert.ok(approved.file.startsWith(`${config.contributions.folder}/`));

  const dest = path.join(config.musicDir, ...approved.file.split("/"));
  assert.ok(N.isInside(path.join(config.musicDir, config.contributions.folder), dest));
  assert.ok(existsSync(dest));
  assert.ok(!existsSync(I.stagedPath(r.id, ".wav")), "file tạm đã được chuyển đi");
  assert.ok(L.get(approved.file), "thư viện đã nhận bài mới");
  assert.ok(!existsSync(path.join(root, "evil")));

  await assert.rejects(A.approveContribution({ id: r.id, ownerId: "owner2", scan: L.scan }), /đã được xử lý/);
});

test("hai lần duyệt cùng lúc chỉ một lần thành công", async () => {
  const b = wav(13, 810);
  const r = await I.ingestAttachment({ attachment: att("Song Race.wav", b.length), userId: "race", guildId: "g1", fetchImpl: okFetch(b) });
  const results = await Promise.allSettled([
    A.approveContribution({ id: r.id, ownerId: "owner1", scan: async () => {} }),
    A.approveContribution({ id: r.id, ownerId: "owner2", scan: async () => {} }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(readdirSync(path.join(config.musicDir, config.contributions.folder)).filter((f) => f.startsWith("Song Race")).length, 1);
});

test("trùng tên file thì thêm hậu tố, không ghi đè", async () => {
  const names = [];
  for (const tone of [1100, 1200]) {
    const b = wav(13, tone);
    const r = await I.ingestAttachment({ attachment: att("Cung Nguoi - Cung Ten.wav", b.length), userId: `dup${tone}`, guildId: "g1", fetchImpl: okFetch(b) });
    names.push((await A.approveContribution({ id: r.id, ownerId: "owner1", scan: async () => {} })).file);
  }
  assert.notEqual(names[0], names[1]);
  assert.ok(names[1].includes("(2)"));
});

test("từ chối: xoá file tạm, lưu lý do, không từ chối hai lần", async () => {
  const b = wav(14, 1300);
  const r = await I.ingestAttachment({ attachment: att("reject-me.wav", b.length), userId: "rej", guildId: "g1", fetchImpl: okFetch(b) });
  const row = await A.rejectContribution({ id: r.id, ownerId: "owner1", reason: "không phù hợp" });
  assert.equal(row.status, "rejected");
  assert.equal(row.reason, "không phù hợp");
  assert.ok(!existsSync(I.stagedPath(r.id, ".wav")));
  await assert.rejects(A.rejectContribution({ id: r.id, ownerId: "owner1" }), /đã được xử lý/);
  await assert.rejects(A.approveContribution({ id: r.id, ownerId: "owner1", scan: async () => {} }), /đã được xử lý/);
  await assert.rejects(A.approveContribution({ id: 99999, ownerId: "owner1" }), /Không có/);
});

test("đóng góp chờ quá 14 ngày tự hết hạn và bị dọn", async () => {
  const old = Date.now() - 15 * 86_400_000;
  const b = wav(14, 1400);
  const r = await I.ingestAttachment({ attachment: att("old.wav", b.length), userId: "old-user", guildId: "g1", fetchImpl: okFetch(b), now: old });
  const expired = await A.expirePending();
  assert.ok(expired.some((x) => x.id === r.id));
  assert.equal(St.getContribution(r.id).status, "expired");
  assert.ok(!existsSync(I.stagedPath(r.id, ".wav")));
  assert.equal((await A.expirePending()).length, 0);
});

// ---------- chủ bot và quyền riêng tư
test("nhận diện chủ bot theo OWNER_IDS", async () => {
  assert.deepEqual(await Notify.getOwnerIds({}), ["owner1", "owner2"]);
  assert.equal(await Notify.isOwner({}, "owner2"), true);
  assert.equal(await Notify.isOwner({}, "someone"), false);
});

test("thông báo: ưu tiên DM, DM lỗi thì nhắn ở kênh và chỉ nhắc đúng người", async () => {
  const log = [];
  const client = {
    users: { send: async (id, payload) => { if (id === "closed") throw new Error("DM đóng"); log.push(["dm", id, payload.content]); } },
    channels: { cache: { get: (c) => ({ send: async (p) => log.push(["ch", c, p.content, p.allowedMentions]) }) } },
  };
  const notify = Notify.createNotifier(client);
  assert.equal(await notify("open", "xin chào", "c1"), true);
  assert.equal(await notify("closed", "xin chào", "c1"), true);
  assert.equal(log[0][0], "dm");
  assert.equal(log[1][0], "ch");
  assert.ok(log[1][2].startsWith("<@closed>"));
  assert.deepEqual(log[1][3], { users: ["closed"] });
  assert.equal(await notify("closed", "x", null), false);
});

test("embed đóng góp thoát ký tự markdown trong dữ liệu người dùng", () => {
  const row = { id: 1, title: "**đậm** @everyone", artist: "_x_", duration_ms: 90_000, size_bytes: 2_000_000, user_id: "u", original_name: "[a](http://e.com).mp3", sha256: "a".repeat(64) };
  const text = JSON.stringify(Notify.contributionEmbed(row, { similar: "`x`" }).toJSON());
  assert.ok(text.includes("\\\\*\\\\*đậm\\\\*\\\\*"));
  assert.ok(!text.includes("[a](http"));
});

test("/privacy delete ẩn danh đề xuất và đóng góp của người dùng", () => {
  const r = R.addRequest({ input: "bai rieng tu cua toi", guildId: "g", channelId: "c", userId: "gone" }).request;
  const b = St.insertContribution({ guildId: "g", userId: "gone", originalName: "z.mp3", ext: ".mp3", sizeBytes: 1, sha256: "f".repeat(64) });
  S.deleteUserData("gone");
  assert.equal(R.getRequest(r.id).created_by, null);
  assert.equal(St.getContribution(b).user_id, null);
  assert.equal(R.listMine("gone").length, 0);
});

test("thống kê đóng góp", () => {
  const c = St.contributionCounts();
  assert.ok(c.approved >= 3 && c.rejected >= 1 && c.expired >= 1);
});

test("làm sạch tên bài đọc từ thẻ: bỏ link ẩn, ký tự đổi chiều, dấu < >", () => {
  const entry = L.buildEntry("x.mp3", { common: { title: "[bấm vào đây](http://evil.com) Bài ‮hay <@123>", artist: "A B", album: "  " } });
  assert.equal(entry.title, "bấm vào đây Bài hay @123");
  assert.equal(entry.artist, "A B");
  assert.equal(L.cleanMeta("Bài (Official) [HD]"), "Bài (Official) [HD]");
  assert.equal(L.cleanMeta("   "), null);
  assert.equal(L.cleanMeta("x".repeat(400)).length, 150);
});

test("safeText thoát link và nhắc tên", async () => {
  const { safeText } = await import("../src/utils/embeds.js");
  const out = safeText("[a](http://e.com) <@123> **b**");
  assert.equal(out, String.raw`\[a\]\(http://e.com\) \<@123\> \*\*b\*\*`);
});
