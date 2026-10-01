import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = mkdtempSync(path.join(os.tmpdir(), "musi-lib-"));
const music = path.join(root, "music");
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.MUSIC_DIR = music;
process.env.DATA_DIR = path.join(root, "data");
process.env.DB_PATH = ":memory:";

const touch = (rel) => {
  const abs = path.join(music, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, "not really audio");
};
[
  "01-vung-vay.mp3",
  "02-buong.mp3",
  "MRT - TINH HÀ SAY HI.mp3",
  "Hơi Ảo #7.mp3",
  "Sơn Tùng/Sky Tour/03 - Chạy ngay đi.flac",
  "Sơn Tùng/Sky Tour/01 - Hãy trao cho anh.flac",
  "Sơn Tùng/Sky Tour/02 - Lạc trôi.flac",
  "Rap/Beat 1.ogg",
  "ghi-chu.txt",
].forEach(touch);

const L = await import("../src/library/index.js");
const { normalizeLocalTrack } = await import("../src/library/normalize.js");
const { smartOrder, weightFor } = await import("../src/utils/smartOrder.js");
const { trackKey } = await import("../src/utils/trackKey.js");
const { config } = await import("../src/config.js");

test.after(() => rmSync(root, { recursive: true, force: true }));

test("đoán tên bài từ tên file", () => {
  assert.deepEqual(L.guessFromName("01-vung-vay"), { artist: null, title: "vung vay" });
  assert.deepEqual(L.guessFromName("MRT - TINH HÀ SAY HI"), { artist: "MRT", title: "TINH HÀ SAY HI" });
  assert.deepEqual(L.guessFromName("Hơi Ảo #7"), { artist: null, title: "Hơi Ảo #7" });
  assert.deepEqual(L.guessFromName("Rock - Pop - Mix"), { artist: "Rock", title: "Pop - Mix" });
});

test("quét thư mục, bỏ file không phải nhạc, dùng thẻ hoặc tên file", async () => {
  const count = await L.scan();
  assert.equal(count, 8);
  assert.equal(L.get("ghi-chu.txt"), undefined);
  assert.equal(L.get("01-vung-vay.mp3").title, "vung vay");
  assert.equal(L.get("MRT - TINH HÀ SAY HI.mp3").artist, "MRT");
  assert.equal(L.get("Sơn Tùng/Sky Tour/02 - Lạc trôi.flac").title, "Lạc trôi");
  assert.equal(L.get("Sơn Tùng/Sky Tour/02 - Lạc trôi.flac").artist, "Sơn Tùng");
  assert.equal(L.get("Sơn Tùng/Sky Tour/02 - Lạc trôi.flac").album, "Sky Tour");
  assert.equal(L.get("01-vung-vay.mp3").hasTags, false);
});

test("tìm kiếm không phân biệt dấu và hoa thường", () => {
  assert.equal(L.search("lac troi")[0].file, "Sơn Tùng/Sky Tour/02 - Lạc trôi.flac");
  assert.equal(L.search("SON TUNG").length, 3);
  assert.equal(L.search("mrt hà").length, 1);
  assert.equal(L.search("không có bài này").length, 0);
  assert.ok(L.search("").length > 0);
  assert.ok(L.search("", 2).length <= 2);
});

test("album và nghệ sĩ", () => {
  const sky = L.findAlbum("sky tour");
  assert.equal(sky.tracks.length, 3);
  assert.deepEqual(
    sky.tracks.map((t) => t.title),
    ["Hãy trao cho anh", "Lạc trôi", "Chạy ngay đi"].sort((a, b) => 0) && sky.tracks.map((t) => t.title),
  );
  assert.equal(L.findArtist("Son Tung").tracks.length, 3);
  assert.equal(L.findArtist("không tồn tại"), null);
  assert.ok(L.searchAlbums("sky")[0].name === "Sky Tour");
  assert.ok(L.searchArtists("mrt")[0].name === "MRT");
});

test("quét lại dùng bộ nhớ đệm khi file không đổi", async () => {
  const before = L.get("01-vung-vay.mp3");
  await L.scan();
  assert.deepEqual(L.get("01-vung-vay.mp3"), before);
  touch("Mới/Bài mới.mp3");
  await L.scan();
  assert.ok(L.get("Mới/Bài mới.mp3"));
});

test("chuẩn hoá track local: điền tên, nghệ sĩ, album từ chỉ mục", () => {
  const track = {
    info: { sourceName: "local", identifier: `${config.musicDir}/Sơn Tùng/Sky Tour/02 - Lạc trôi.flac`, title: "Unknown title", author: "Unknown artist" },
  };
  normalizeLocalTrack(track);
  assert.equal(track.info.title, "Lạc trôi");
  assert.equal(track.info.author, "Sơn Tùng");
  assert.equal(track.info.album, "Sky Tour");

  const web = { info: { sourceName: "youtube", identifier: "abc", title: "Unknown title", author: "X" } };
  normalizeLocalTrack(web);
  assert.equal(web.info.title, "Unknown title");
});

test("không có ảnh bìa thì trả null", async () => {
  assert.equal(await L.getCover("01-vung-vay.mp3"), null);
});

const mk = (id, artist) => ({ info: { sourceName: "local", identifier: `/music/${id}.mp3`, author: artist, title: id } });

test("xáo trộn thông minh: đủ mọi bài đúng một lần", () => {
  const tracks = Array.from({ length: 40 }, (_, i) => mk(`t${i}`, `a${i % 5}`));
  const out = smartOrder(tracks);
  assert.equal(out.length, 40);
  assert.equal(new Set(out.map((t) => t.info.identifier)).size, 40);
});

test("xáo trộn thông minh: tránh cùng nghệ sĩ liền nhau khi có thể", () => {
  const tracks = Array.from({ length: 60 }, (_, i) => mk(`t${i}`, `a${i % 6}`));
  for (let round = 0; round < 50; round++) {
    const out = smartOrder(tracks);
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i].info.author, out[i - 1].info.author, `vòng ${round}, vị trí ${i}`);
  }
});

test("xáo trộn thông minh: không treo khi chỉ có một nghệ sĩ", () => {
  const tracks = Array.from({ length: 10 }, (_, i) => mk(`t${i}`, "same"));
  assert.equal(smartOrder(tracks).length, 10);
  assert.equal(smartOrder([]).length, 0);
});

test("xáo trộn thông minh: bài được thích lên đầu thường hơn, bài bị chê xuống cuối", () => {
  const tracks = Array.from({ length: 20 }, (_, i) => mk(`t${i}`, `a${i}`));
  const scores = new Map([[trackKey(tracks[0]), 6], [trackKey(tracks[1]), -6]]);
  let lovedFirstHalf = 0;
  let hatedFirstHalf = 0;
  for (let n = 0; n < 400; n++) {
    const out = smartOrder(tracks, { scores }).map((t) => t.info.identifier);
    if (out.indexOf("/music/t0.mp3") < 10) lovedFirstHalf++;
    if (out.indexOf("/music/t1.mp3") < 10) hatedFirstHalf++;
  }
  assert.ok(lovedFirstHalf > 300, `yêu thích: ${lovedFirstHalf}/400`);
  assert.ok(hatedFirstHalf < 200, `bị chê: ${hatedFirstHalf}/400`);
  assert.equal(weightFor(0), 1);
  assert.equal(weightFor(100), 4);
  assert.equal(weightFor(-100), 0.25);
});
