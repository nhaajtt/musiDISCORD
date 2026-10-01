import assert from "node:assert/strict";
import test from "node:test";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "y";
process.env.DB_PATH = ":memory:";

const Q = await import("../src/quiz/engine.js");

const song = { title: "Lạc Trôi (Official Music Video)", artist: "Sơn Tùng M-TP" };

test("chấm đúng tên bài, bỏ qua dấu, hoa thường và phần phụ", () => {
  assert.equal(Q.judgeAnswer("lac troi", song), "title");
  assert.equal(Q.judgeAnswer("  LẠC   TRÔI ", song), "title");
  assert.equal(Q.judgeAnswer("Lạc Trôi official music video", song), "title");
});

test("chấm gần đúng cho phép sai chính tả nhẹ", () => {
  assert.equal(Q.judgeAnswer("lac troy", song), "title");
  assert.equal(Q.judgeAnswer("lc troi", song), "title");
  assert.equal(Q.judgeAnswer("chay ngay di", song), "wrong");
});

test("chỉ đúng nghệ sĩ thì trả về artist", () => {
  assert.equal(Q.judgeAnswer("son tung m-tp", song), "artist");
  assert.equal(Q.judgeAnswer("son tung", song), "artist");
});

test("trả lời sai hoặc rỗng", () => {
  assert.equal(Q.judgeAnswer("", song), "wrong");
  assert.equal(Q.judgeAnswer("!!!", song), "wrong");
  assert.equal(Q.judgeAnswer("xyz abc", song), "wrong");
});

test("tên bài ngắn phải đúng hẳn, không đoán mò", () => {
  const s = { title: "Em", artist: "Ai Đó" };
  assert.equal(Q.judgeAnswer("em", s), "title");
  assert.equal(Q.judgeAnswer("an", s), "wrong");
  assert.equal(Q.judgeAnswer("e", s), "wrong");
});

test("tên bài nhiều chữ: đủ phần lớn các từ là đúng", () => {
  const s = { title: "Đừng làm trái tim anh đau", artist: "Sơn Tùng" };
  assert.equal(Q.judgeAnswer("dung lam trai tim anh dau", s), "title");
  assert.equal(Q.judgeAnswer("dung lam trai tim anh", s), "title");
  assert.equal(Q.judgeAnswer("trai tim", s), "wrong");
});

test("tính điểm: nhanh hơn thì nhiều hơn, gợi ý trừ điểm, chuỗi được thưởng", () => {
  const fast = Q.scoreFor({ elapsedMs: 0, windowMs: 25_000 });
  const slow = Q.scoreFor({ elapsedMs: 25_000, windowMs: 25_000 });
  assert.equal(fast, 100);
  assert.equal(slow, 40);
  assert.equal(Q.scoreFor({ elapsedMs: 0, windowMs: 25_000, hints: 2 }), 60);
  assert.equal(Q.scoreFor({ elapsedMs: 0, windowMs: 25_000, streak: 4 }), 130);
  assert.equal(Q.scoreFor({ elapsedMs: 0, windowMs: 25_000, streak: 99 }), 150);
  assert.equal(Q.scoreFor({ elapsedMs: 0, windowMs: 25_000, partial: true }), 40);
  assert.ok(Q.scoreFor({ elapsedMs: 0, windowMs: 25_000, hints: 99 }) >= 20);
  assert.ok(Q.scoreFor({ elapsedMs: 999_999, windowMs: 25_000 }) >= 40);
});

test("gợi ý theo cấp", () => {
  assert.equal(Q.buildHint("Lạc Trôi (Official)", 1), "2 từ • 7 ký tự");
  assert.equal(Q.buildHint("Lạc Trôi", 2), "L▫▫  T▫▫▫");
});

test("chọn điểm bắt đầu đoạn trích luôn hợp lệ", () => {
  for (let i = 0; i < 500; i++) {
    const duration = 25_000 + Math.floor(Math.random() * 400_000);
    const start = Q.pickClipStart(duration, 20_000);
    assert.ok(start >= 0 && start + 20_000 < duration, `${start} / ${duration}`);
  }
  assert.equal(Q.pickClipStart(15_000, 20_000), 0);
  assert.equal(Q.pickClipStart(null, 20_000), 0);
});

test("chọn vòng chơi: không trùng, đúng số lượng", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ title: `t${i}`, file: `f${i}` }));
  const picked = Q.pickRounds(entries, 8);
  assert.equal(picked.length, 8);
  assert.equal(new Set(picked.map((e) => e.file)).size, 8);
  assert.equal(Q.pickRounds(entries, 100).length, 30);
  assert.equal(Q.pickRounds([], 5).length, 0);
});
