import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStatsCard, _internals } from "../src/render/statsCard.js";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const size = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const DIMS = { wrapped: [1080, 1350], profile: [1080, 640] };

const full = (kind = "wrapped") => ({
  kind, year: 2026, userName: "Nguyễn Văn Ặ", guildName: "Hội Quán Cú Đêm",
  totalListenMs: 128.4 * 3.6e6, totalPlays: 4821, totalSkips: 312, totalRequests: 977,
  topTracks: Array.from({ length: 5 }, (_, i) => ({ title: "Tiếng Việt: ặ ơ ư ễ ỵ Đ đ " + i, artist: "Sơn Tùng", plays: 200 - i * 30 })),
  topArtists: Array.from({ length: 5 }, (_, i) => ({ name: "Nghệ sĩ " + i, plays: 500 - i * 50 })),
  hourlyPlays: Array.from({ length: 24 }, (_, h) => h * 3),
  busiestHour: 23, streakDays: 12,
  badges: ["Cú đêm", "Tàn nhẫn", "Bậc thầy hàng chờ", "Chuỗi lửa", "Lạ hoắc", "Tai nghe"].map((name) => ({ icon: "🔥", name })),
  generatedAt: Date.UTC(2026, 9, 1),
});

function check(buf, kind) {
  assert.ok(Buffer.isBuffer(buf));
  assert.deepEqual(buf.subarray(0, 8), SIG);
  const { w, h } = size(buf);
  assert.deepEqual([w, h], DIMS[kind]);
}

for (const kind of ["wrapped", "profile"]) {
  for (const theme of ["dark", "light"]) {
    test(`${kind} ${theme}: PNG đúng kích thước`, async () => {
      check(await renderStatsCard(full(kind), { theme }), kind);
    });
  }
}

test("dữ liệu rỗng", async () => {
  for (const kind of ["wrapped", "profile"]) {
    const b = await renderStatsCard({ kind, year: 2026, userName: "", guildName: "", totalListenMs: 0, totalPlays: 0, totalSkips: 0, totalRequests: 0, topTracks: [], topArtists: [], badges: [], streakDays: 0 });
    check(b, kind);
  }
});

test("thiếu trường tùy chọn và đầu vào lạ", async () => {
  check(await renderStatsCard({ kind: "wrapped", userName: "a", guildName: "b" }), "wrapped");
  check(await renderStatsCard({ kind: "profile", userName: "a", hourlyPlays: [1, 2], busiestHour: 99, generatedAt: "không phải ngày" }), "profile");
  check(await renderStatsCard({}), "wrapped");
  check(await renderStatsCard(null), "wrapped");
  check(await renderStatsCard({ kind: "wrapped", totalPlays: -5, totalListenMs: NaN, topTracks: [null, {}, { title: 5 }], badges: [null] }), "wrapped");
});

test("dữ liệu dài tối đa", async () => {
  const long = "Rất dài ".repeat(60);
  const d = full();
  d.userName = long; d.guildName = long;
  d.topTracks = d.topTracks.map((t) => ({ title: long, artist: long, plays: 1e12 }));
  d.topArtists = d.topArtists.map(() => ({ name: long, plays: 987654321 }));
  d.badges = d.badges.map(() => ({ icon: "x", name: long }));
  d.totalListenMs = 9e15; d.totalPlays = 1e15; d.streakDays = 1e9;
  for (const kind of ["wrapped", "profile"]) check(await renderStatsCard({ ...d, kind }), kind);
});

const HOST = [
  "</text><script>alert(1)</script>",
  '<image href="http://evil.example/x.png"/>',
  "&amp; &lt; &#x3c; \"'",
  "🎵🔥👨‍👩‍👧",
  "a​b‏c‮d⁦e\u0000f\u0007",
  "日本語 العربية",
  "x".repeat(500),
];

test("chuỗi độc hại không chèn được SVG", async () => {
  for (const h of HOST) {
    const d = { ...full(), userName: h, guildName: h, topTracks: [{ title: h, artist: h, plays: 3 }], topArtists: [{ name: h, plays: 1 }], badges: [{ name: h }] };
    const { svg } = _internals.build(d, "dark");
    assert.ok(!/<script/i.test(svg), "script");
    const tags = new Set([...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]));
    const okTags = ["svg", "defs", "radialGradient", "stop", "pattern", "path", "line", "rect", "circle", "ellipse", "text", "tspan", "g"];
    for (const t of tags) assert.ok(okTags.includes(t), "thẻ lạ: " + t);
    assert.ok(!/[\u0000-\u0008\u000b-\u001f​-‏‪-‮⁦-⁩]/.test(svg));
    for (const kind of ["wrapped", "profile"]) check(await renderStatsCard({ ...d, kind }), kind);
  }
});

test("làm sạch tên", () => {
  const { clean, trunc } = _internals;
  assert.equal(clean("🎵🎵", "ẩn danh"), "ẩn danh");
  assert.equal(clean("  a \t\n b  "), "a b");
  assert.equal(clean("Cú đêm Đ ặ"), "Cú đêm Đ ặ");
  assert.equal(clean("ệ"), "ệ");
  assert.equal(trunc("abcdef", 4), "abc…");
  assert.equal(trunc("abc", 4), "abc");
});

test("định dạng số kiểu Việt Nam", () => {
  const { fmtInt, fmtTime } = _internals;
  assert.equal(fmtInt(1234567), "1.234.567");
  assert.deepEqual(fmtTime(128.4 * 3.6e6), { value: "128,4", unit: "giờ" });
  assert.deepEqual(fmtTime(1234.56 * 3.6e6), { value: "1.234,6", unit: "giờ" });
  assert.deepEqual(fmtTime(0), { value: "0", unit: "phút" });
});

test("xác định và đủ nhanh", async () => {
  const a = await renderStatsCard(full());
  const b = await renderStatsCard(full());
  assert.ok(a.equals(b));
  const t = performance.now();
  for (let i = 0; i < 3; i++) await renderStatsCard(full());
  const avg = (performance.now() - t) / 3;
  assert.ok(avg < 400, `quá chậm: ${avg}ms`);
});

test("huy hiệu chính thức đều có ký hiệu riêng", () => {
  const names = ["Cú đêm", "Tàn nhẫn", "Bậc thầy hàng chờ", "Fan cứng", "Thính phòng", "Nhà phê bình", "Bậc thầy đố nhạc", "Chuỗi 7 ngày"];
  for (const kind of ["wrapped", "profile"]) {
    for (const n of names) {
      const { svg } = _internals.build({ ...full(kind), badges: [{ name: n }] }, "dark");
      assert.ok(!svg.includes('<text x="0" y="6"'), "rơi về vòng tròn số: " + n);
    }
  }
  const q = _internals.build({ ...full(), badges: [{ name: "Bậc thầy đố nhạc" }] }, "dark").svg;
  const l = _internals.build({ ...full(), badges: [{ name: "Bậc thầy hàng chờ" }] }, "dark").svg;
  const g = (x) => x.slice(x.indexOf('<g fill="none" stroke'), x.indexOf("</g></g>"));
  assert.notEqual(g(q), g(l));
});
