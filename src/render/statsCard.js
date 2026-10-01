// Thẻ thống kê (Wrapped / hồ sơ) kiểu bản vẽ cyanotype, xuất PNG qua resvg.
import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const FONT_FILES = [
  "IBMPlexMono-Regular.ttf",
  "IBMPlexMono-Bold.ttf",
  "BarlowCondensed-SemiBold.ttf",
  "BarlowCondensed-Bold.ttf",
].map((f) => path.join(FONT_DIR, f));

const M = "IBM Plex Mono";
const C = "Barlow Condensed";
const MONO_ADV = 0.6; // độ rộng ký tự / cỡ chữ của Plex Mono
const COND_ADV = 0.54; // ước lượng thận trọng cho Barlow Condensed

const PAL = {
  dark: {
    bg0: "#0f4f82", bg1: "#082c4d", ink: "#d4f0ff", text: "#ecf8ff", dim: "#92c6e8",
    grid: "#a6dcff", shade: "#031a30", accent: "#ff5b2e", minor: 0.07, major: 0.15,
  },
  light: {
    bg0: "#eef6f9", bg1: "#c4dcea", ink: "#0b3a63", text: "#082c4d", dim: "#3d6d94",
    grid: "#0b3a63", shade: "#0b3a63", accent: "#d8361b", minor: 0.08, major: 0.17,
  },
};

// ---------- tiện ích văn bản ----------

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const r2 = (n) => Math.round(n * 100) / 100;

function allowed(c) {
  return (
    (c >= 0x21 && c <= 0x7e) ||
    (c >= 0xa1 && c <= 0x17f && c !== 0xad) ||
    c === 0x1a0 || c === 0x1a1 || c === 0x1af || c === 0x1b0 ||
    (c >= 0x1ea0 && c <= 0x1ef9) ||
    c === 0x2013 || c === 0x2014 || c === 0x2018 || c === 0x2019 ||
    c === 0x201c || c === 0x201d || c === 0x2022 || c === 0x2026
  );
}

// Chỉ giữ ký tự font vẽ được; khoảng trắng gộp lại; rỗng thì dùng placeholder
function clean(s, placeholder = "") {
  const t = (typeof s === "string" ? s : s == null ? "" : String(s)).normalize("NFC");
  let out = "";
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (allowed(c)) out += ch;
    else if (c === 0x20 || c === 0xa0 || c === 9 || c === 10 || c === 13 || (c >= 0x2000 && c <= 0x200a)) out += " ";
  }
  out = out.replace(/ +/g, " ").trim();
  return out || placeholder;
}

function trunc(s, max) {
  const a = Array.from(s);
  max = Math.max(1, Math.floor(max));
  if (a.length <= max) return s;
  return a.slice(0, max - 1).join("").trimEnd() + "…";
}

const mw = (s, size, ls = 0) => Array.from(s).length * (size * MONO_ADV + ls);
const maxChars = (width, size, ls = 0) => Math.max(1, Math.floor(width / (size * MONO_ADV + ls)));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e15) : 0;
}

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtInt = (n) => group(String(Math.round(num(n))));

function fmtTime(ms) {
  const h = num(ms) / 3.6e6;
  if (h < 1) return { value: group(String(Math.round(h * 60))), unit: "phút" };
  const [i, d] = h.toFixed(1).split(".");
  return { value: group(i) + "," + d, unit: "giờ" };
}

function hashOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

function fmtDate(v) {
  let d = v == null ? new Date() : new Date(v);
  if (Number.isNaN(d.getTime())) d = new Date();
  const L = new Date(d.getTime() + 7 * 3.6e6); // giờ Việt Nam
  const p = (n) => String(n).padStart(2, "0");
  return `${p(L.getUTCDate())}.${p(L.getUTCMonth() + 1)}.${L.getUTCFullYear()}`;
}

// ---------- phần tử SVG cơ bản ----------

function text(x, y, s, o = {}) {
  const { size = 16, w = 400, f = M, fill, anchor = "start", ls = 0, op = 1 } = o;
  const a = [`x="${r2(x)}" y="${r2(y)}"`, `font-family="${f}"`, `font-size="${r2(size)}"`, `font-weight="${w}"`];
  if (fill) a.push(`fill="${fill}"`);
  if (anchor !== "start") a.push(`text-anchor="${anchor}"`);
  if (ls) a.push(`letter-spacing="${ls}"`);
  if (op !== 1) a.push(`fill-opacity="${op}"`);
  return `<text ${a.join(" ")}>${esc(s)}</text>`;
}

const line = (x1, y1, x2, y2, stroke, sw = 1, extra = "") =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;

const rect = (x, y, w, h, o = "") => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" ${o}/>`;
const circle = (x, y, rad, o = "") => `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rad)}" ${o}/>`;

function arrowTip(x, y, d, color) {
  return `<path d="M${r2(x)} ${r2(y)}L${r2(x - 7 * d)} ${r2(y - 2.6)}L${r2(x - 7 * d)} ${r2(y + 2.6)}Z" fill="${color}"/>`;
}

// Đường kích thước ngang có mũi tên, nhãn ở giữa (chừa khoảng hở)
function dimH(x1, x2, y, label, p, o = {}) {
  const { size = 14, tick = 6 } = o;
  let s = line(x1, y - tick, x1, y + tick, p.ink, 1, 'stroke-opacity="0.8"') +
    line(x2, y - tick, x2, y + tick, p.ink, 1, 'stroke-opacity="0.8"');
  const op = 'stroke-opacity="0.8"';
  if (label) {
    const half = mw(label, size, 1) / 2 + 10;
    const mid = (x1 + x2) / 2;
    if (x2 - x1 > half * 2 + 30) {
      s += line(x1 + 6, y, mid - half, y, p.ink, 1, op) + line(mid + half, y, x2 - 6, y, p.ink, 1, op);
      s += text(mid, y + size * 0.36, label, { size, w: 700, fill: p.ink, anchor: "middle", ls: 1 });
    } else s += line(x1 + 6, y, x2 - 6, y, p.ink, 1, op);
  } else s += line(x1 + 6, y, x2 - 6, y, p.ink, 1, op);
  return s + arrowTip(x1, y, -1, p.ink).replace("<path", '<path fill-opacity="0.9"') + arrowTip(x2, y, 1, p.ink);
}

// ---------- ký hiệu huy hiệu (vẽ trong ô -12..12) ----------

const strip = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

const GLYPHS = {
  moon: '<path d="M5 -9A10 10 0 1 0 9 6A8 8 0 0 1 5 -9Z"/><path d="M8 -8l1 2.4l2.4 1l-2.4 1l-1 2.4l-1 -2.4l-2.4 -1l2.4 -1Z" stroke-width="1.2"/>',
  bolt: '<path d="M3 -11L-7 2H-1L-3 11L7 -2H1Z"/>',
  queue: '<path d="M-3 -7H10M-3 0H10M-3 7H10"/><circle cx="-8" cy="-7" r="1.3"/><circle cx="-8" cy="0" r="1.3"/><circle cx="-8" cy="7" r="1.3"/>',
  flame: '<path d="M1 -11C2 -5 8 -3 8 3A7.5 7.5 0 0 1 -7 3C-7 -1 -4 -3 -3 -7C-1 -5 0 -4 1 -11Z"/><path d="M0 11C-3 11 -3 6 0 3C3 6 3 11 0 11Z" stroke-width="1.2"/>',
  sun: '<circle cx="0" cy="0" r="4.5"/><path d="M0 -11V-7M0 7V11M-11 0H-7M7 0H11M-8 -8l3 3M5 5l3 3M8 -8l-3 3M-5 5l-3 3"/>',
  phones: '<path d="M-9 4V0A9 9 0 0 1 9 0V4"/><rect x="-11" y="2" width="5" height="8" rx="1.5"/><rect x="6" y="2" width="5" height="8" rx="1.5"/>',
  note: '<path d="M-3 8V-9L9 -6V6"/><ellipse cx="-6" cy="8" rx="3.5" ry="2.6"/><ellipse cx="6" cy="6" rx="3.5" ry="2.6"/>',
  crown: '<path d="M-10 7L-11 -6L-5 0L0 -9L5 0L11 -6L10 7Z"/><path d="M-10 10H10"/>',
  star: '<path d="M0 -11L3.2 -3.6L11 -3L5 2.3L7 10L0 6L-7 10L-5 2.3L-11 -3L-3.2 -3.6Z"/>',
  clock: '<circle cx="0" cy="0" r="10"/><path d="M0 -6V0L5 3"/>',
  heart: '<path d="M0 9C-12 0 -10 -9 -4.5 -9C-2 -9 0 -7 0 -5C0 -7 2 -9 4.5 -9C10 -9 12 0 0 9Z"/>',
  quiz: '<path d="M-5 -5A5 5 0 1 1 3 -1C0 1 0 3 0 5"/><circle cx="0" cy="9.5" r="1.2"/>',
  skip: '<path d="M-10 -8L0 0L-10 8Z"/><path d="M0 -8L10 0L0 8Z"/>',
};

const GLYPH_KEYS = [
  ["quiz", ["do nhac", "quiz", "dap an"]],
  ["heart", ["fan cung", "fan", "yeu thich"]],
  ["phones", ["thinh phong"]],
  ["star", ["phe binh"]],
  ["queue", ["hang cho", "queue", "bac thay", "yeu cau", "request"]],
  ["moon", ["cu dem", "dem", "night", "khuya"]],
  ["bolt", ["tan nhan", "nhan", "bolt"]],
  ["skip", ["bo qua", "skip"]],
  ["flame", ["chuoi", "streak", "lua"]],
  ["sun", ["som", "dawn", "sang"]],
  ["phones", ["tai nghe", "nghe nhieu", "ham", "marathon", "headphone", "listener"]],
  ["crown", ["vua", "king", "chua", "top 1"]],
  ["clock", ["gio", "time", "hour"]],
  ["note", ["nhac", "track", "bai", "music"]],
  ["star", ["sao", "star", "dau tien", "first"]],
];

function badgeGlyph(name, index, p) {
  const n = strip(name);
  for (const [k, words] of GLYPH_KEYS) if (words.some((w) => n.includes(w))) return glyphG(GLYPHS[k], p);
  return `<text x="0" y="6" font-family="${M}" font-size="17" font-weight="700" fill="${p.ink}" text-anchor="middle">${index + 1}</text>`;
}

const glyphG = (inner, p) =>
  `<g fill="none" stroke="${p.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;

function badgeSymbol(x, y, rad, name, index, p) {
  const sc = rad / 17;
  return (
    circle(x, y, rad, `fill="${p.ink}" fill-opacity="0.08" stroke="${p.ink}" stroke-width="1.6"`) +
    circle(x, y, rad - 3.5, `fill="none" stroke="${p.ink}" stroke-width="0.7" stroke-opacity="0.6"`) +
    `<g transform="translate(${r2(x)} ${r2(y)}) scale(${r2(sc * 0.85)})">${badgeGlyph(name, index, p)}</g>`
  );
}

// ---------- nền, khung, vạch gấp ----------

function backdrop(W, H, p, cols, rows, folds) {
  const out = [];
  out.push(
    `<defs>
<radialGradient id="bg" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="${p.bg0}"/><stop offset="1" stop-color="${p.bg1}"/></radialGradient>
<radialGradient id="vg" cx="50%" cy="50%" r="72%"><stop offset="0.62" stop-color="${p.shade}" stop-opacity="0"/><stop offset="1" stop-color="${p.shade}" stop-opacity="0.38"/></radialGradient>
<pattern id="gMinor" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="${p.grid}" stroke-opacity="${p.minor}" stroke-width="1"/></pattern>
<pattern id="gMajor" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="${p.grid}" stroke-opacity="${p.major}" stroke-width="1.4"/></pattern>
<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${p.ink}" stroke-width="2.4"/></pattern>
</defs>`,
    rect(0, 0, W, H, 'fill="url(#bg)"'),
    rect(18, 18, W - 36, H - 36, 'fill="url(#gMinor)"'),
    rect(18, 18, W - 36, H - 36, 'fill="url(#gMajor)"'),
    rect(0, 0, W, H, 'fill="url(#vg)"'),
  );

  // vạch gấp
  for (const f of folds) {
    if (f.h !== undefined) {
      out.push(rect(54, f.h - 1, W - 108, 3, `fill="${p.shade}" fill-opacity="0.12"`));
      out.push(line(54, f.h + 2, W - 54, f.h + 2, p.ink, 1, 'stroke-opacity="0.12"'));
      for (const x of [18, W - 18]) out.push(`<path d="M${x} ${f.h - 7}L${x + (x < 40 ? 11 : -11)} ${f.h}L${x} ${f.h + 7}Z" fill="${p.ink}" fill-opacity="0.5"/>`);
    } else {
      out.push(rect(f.v - 1, 54, 3, H - 108, `fill="${p.shade}" fill-opacity="0.12"`));
      out.push(line(f.v + 2, 54, f.v + 2, H - 54, p.ink, 1, 'stroke-opacity="0.12"'));
      for (const y of [18, H - 18]) out.push(`<path d="M${f.v - 7} ${y}L${f.v} ${y + (y < 40 ? 11 : -11)}L${f.v + 7} ${y}Z" fill="${p.ink}" fill-opacity="0.5"/>`);
    }
  }

  // khung đôi + dải chia vùng
  out.push(
    `<path fill-rule="evenodd" d="M18 18H${W - 18}V${H - 18}H18Z M54 54V${H - 54}H${W - 54}V54Z" fill="${p.shade}" fill-opacity="0.16"/>`,
    rect(18, 18, W - 36, H - 36, `fill="none" stroke="${p.ink}" stroke-width="1.4"`),
    rect(54, 54, W - 108, H - 108, `fill="none" stroke="${p.ink}" stroke-width="2.6"`),
  );
  const iw = W - 108, ih = H - 108;
  for (let i = 1; i < cols; i++) {
    const x = 54 + (iw * i) / cols;
    out.push(line(x, 18, x, 54, p.ink, 1, 'stroke-opacity="0.8"'), line(x, H - 54, x, H - 18, p.ink, 1, 'stroke-opacity="0.8"'));
  }
  for (let i = 1; i < rows; i++) {
    const y = 54 + (ih * i) / rows;
    out.push(line(18, y, 54, y, p.ink, 1, 'stroke-opacity="0.8"'), line(W - 54, y, W - 18, y, p.ink, 1, 'stroke-opacity="0.8"'));
  }
  for (let i = 0; i < cols; i++) {
    const x = 54 + (iw * (i + 0.5)) / cols;
    const t = { size: 14, w: 700, fill: p.dim, anchor: "middle" };
    out.push(text(x, 41, String(i + 1), t), text(x, H - 31, String(i + 1), t));
  }
  for (let i = 0; i < rows; i++) {
    const y = 54 + (ih * (i + 0.5)) / rows + 5;
    const t = { size: 14, w: 700, fill: p.dim, anchor: "middle" };
    const L = String.fromCharCode(65 + i);
    out.push(text(36, y, L, t), text(W - 36, y, L, t));
  }
  // dấu căn giữa + dấu đăng ký ở bốn góc
  out.push(
    line(W / 2, 4, W / 2, 18, p.ink, 2), line(W / 2, H - 18, W / 2, H - 4, p.ink, 2),
    line(4, H / 2, 18, H / 2, p.ink, 2), line(W - 18, H / 2, W - 4, H / 2, p.ink, 2),
  );
  for (const [x, y] of [[36, 36], [W - 36, 36], [36, H - 36], [W - 36, H - 36]]) {
    out.push(
      circle(x, y, 8, `fill="none" stroke="${p.ink}" stroke-width="1.3"`),
      circle(x, y, 2, `fill="${p.ink}"`),
      line(x - 13, y, x + 13, y, p.ink, 1.1),
      line(x, y - 13, x, y + 13, p.ink, 1.1),
    );
  }
  return out.join("");
}

function stamp(cx, cy, w, h, rot, l1, l2, p) {
  const c = p.accent;
  return (
    `<g transform="translate(${cx} ${cy}) rotate(${rot})" opacity="0.93">` +
    rect(-w / 2, -h / 2, w, h, `rx="9" fill="none" stroke="${c}" stroke-width="5"`) +
    rect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, `rx="4" fill="none" stroke="${c}" stroke-width="1.8"`) +
    text(0, -h * 0.02, l1, { size: h * 0.46, w: 700, f: C, fill: c, anchor: "middle", ls: 4 }) +
    text(0, h * 0.3, l2, { size: Math.max(15, h * 0.17), w: 700, fill: c, anchor: "middle", ls: 5 }) +
    `</g>`
  );
}

function sectionHead(x, y, w, n, label, p) {
  const tw = mw(label, 16, 2.5);
  return (
    circle(x + 12, y - 6, 12, `fill="none" stroke="${p.ink}" stroke-width="1.6"`) +
    text(x + 12, y - 0.5, String(n), { size: 15, w: 700, fill: p.ink, anchor: "middle" }) +
    text(x + 34, y, label, { size: 16, w: 700, fill: p.text, ls: 2.5 }) +
    line(x + 34 + tw + 12, y - 5, x + w, y - 5, p.ink, 1, 'stroke-opacity="0.6" stroke-dasharray="7 4"')
  );
}

// ---------- các khối dữ liệu ----------

function trackRows(o, tracks, p) {
  const { x, right, y0, pitch, n, barMax, tSize } = o;
  const out = [];
  const items = tracks.slice(0, n);
  if (!items.length) {
    out.push(
      rect(x, y0 + 4, right - x, Math.min(n, 3) * pitch - 14, `fill="none" stroke="${p.dim}" stroke-width="1.4" stroke-dasharray="9 6" stroke-opacity="0.8"`),
      text((x + right) / 2, y0 + (Math.min(n, 3) * pitch) / 2 - 2, "CHƯA CÓ BÀI NÀO TRONG BẢN VẼ", { size: 18, w: 700, fill: p.dim, anchor: "middle", ls: 2 }),
    );
    return out.join("");
  }
  const top = Math.max(1, ...items.map((t) => t.plays));
  const tx = x + 56;
  items.forEach((t, i) => {
    const yt = y0 + i * pitch;
    out.push(text(x, yt + 31, String(i + 1).padStart(2, "0"), { size: 32, w: 700, f: C, fill: p.ink }));
    const artist = trunc(t.artist, 18);
    const aw = mw(artist, 16);
    out.push(text(right, yt + 17, artist, { size: 16, fill: p.dim, anchor: "end" }));
    out.push(text(tx, yt + 17, trunc(t.title, maxChars(right - tx - aw - 24, tSize)), { size: tSize, w: 700, fill: p.text }));
    const len = t.plays > 0 ? Math.max(8, (t.plays / top) * barMax) : 0;
    const by = yt + 25;
    if (len) {
      out.push(
        rect(tx, by, len, 12, `fill="${p.ink}" fill-opacity="0.14"`),
        rect(tx, by, len, 12, `fill="url(#hatch)" fill-opacity="0.75"`),
        rect(tx, by, len, 12, `fill="none" stroke="${p.ink}" stroke-width="1.4"`),
      );
    } else out.push(line(tx, by + 6, tx + 24, by + 6, p.dim, 1.4, 'stroke-dasharray="4 3"'));
    const dy = by + 21;
    const label = `${fmtInt(t.plays)} lượt`;
    const lw = mw(label, 15, 0.5);
    const end = tx + Math.max(len, 24);
    out.push(dimH(tx, end, dy, "", p, { tick: 4 }));
    out.push(text(Math.min(end + 14, right - lw), by + 11, label, { size: 15, w: 700, fill: p.ink, ls: 0.5 }));
  });
  return out.join("");
}

function artistLegend(x, right, y0, pitch, artists, n, p) {
  const out = [];
  const items = artists.slice(0, n);
  if (!items.length) {
    return rect(x, y0 - 22, right - x, Math.min(n, 4) * pitch, `fill="none" stroke="${p.dim}" stroke-width="1.4" stroke-dasharray="9 6" stroke-opacity="0.8"`) +
      text((x + right) / 2, y0 + (Math.min(n, 4) * pitch) / 2 - 22, "CHƯA CÓ NGHỆ SĨ", { size: 18, w: 700, fill: p.dim, anchor: "middle", ls: 2 });
  }
  items.forEach((a, i) => {
    const yc = y0 + i * pitch;
    const cnt = fmtInt(a.plays);
    const cw = mw(cnt, 19);
    const nx = x + 38;
    const name = trunc(a.name, maxChars(right - nx - cw - 56, 21));
    const nameEnd = nx + mw(name, 21);
    out.push(
      circle(x + 13, yc, 13, `fill="${p.ink}" fill-opacity="0.08" stroke="${p.ink}" stroke-width="1.5"`),
      text(x + 13, yc + 5.5, String(i + 1), { size: 15, w: 700, fill: p.ink, anchor: "middle" }),
      text(nx, yc + 7, name, { size: 21, w: 700, fill: p.text }),
      line(nameEnd + 10, yc + 3, right - cw - 12, yc + 3, p.ink, 1.3, 'stroke-dasharray="1.5 5" stroke-linecap="round" stroke-opacity="0.85"'),
      text(right, yc + 7, cnt, { size: 19, w: 700, fill: p.ink, anchor: "end" }),
    );
  });
  return out.join("");
}

function dial(cx, cy, rmin, rmax, hours, busiest, p, lblR) {
  const out = [];
  const pt = (rad, a) => {
    const t = (a * Math.PI) / 180;
    return `${r2(cx + rad * Math.sin(t))} ${r2(cy - rad * Math.cos(t))}`;
  };
  const mx = hours ? Math.max(1, ...hours) : 1;
  out.push(
    circle(cx, cy, rmax + 4, `fill="${p.shade}" fill-opacity="0.12" stroke="${p.ink}" stroke-width="1" stroke-opacity="0.7"`),
    circle(cx, cy, (rmin + rmax) / 2, `fill="none" stroke="${p.ink}" stroke-width="0.9" stroke-opacity="0.45" stroke-dasharray="3 4"`),
  );
  for (let h = 0; h < 24; h++) {
    const a0 = h * 15 + 2, a1 = h * 15 + 13;
    const v = hours ? hours[h] / mx : 0;
    const r1 = rmin + 3 + v * (rmax - rmin - 3);
    const d = `M${pt(rmin, a0)}L${pt(r1, a0)}A${r2(r1)} ${r2(r1)} 0 0 1 ${pt(r1, a1)}L${pt(rmin, a1)}A${rmin} ${rmin} 0 0 0 ${pt(rmin, a0)}Z`;
    const hot = busiest === h && hours && hours[h] > 0;
    out.push(`<path d="${d}" fill="${hot ? p.accent : p.ink}" fill-opacity="${hot ? 0.95 : 0.2 + v * 0.7}" stroke="${hot ? p.accent : p.ink}" stroke-width="1"/>`);
  }
  out.push(circle(cx, cy, rmin, `fill="none" stroke="${p.ink}" stroke-width="1.6"`));
  for (const a of [0, 90, 180, 270]) out.push(`<path d="M${pt(rmin - 6, a)}L${pt(rmax + 10, a)}" stroke="${p.ink}" stroke-width="1" stroke-opacity="0.7"/>`);
  out.push(text(cx, cy + 4, "24H", { size: rmin * 0.7, w: 700, f: C, fill: p.ink, anchor: "middle", ls: 1 }));
  for (const [h, a] of [["00", 0], ["06", 90], ["12", 180], ["18", 270]]) {
    const t = (a * Math.PI) / 180;
    out.push(text(cx + lblR * Math.sin(t), cy - lblR * Math.cos(t) + 5, h, { size: 14, w: 700, fill: p.dim, anchor: "middle" }));
  }
  return out.join("");
}

function titleBlock(x, y, w, h, kind, dateStr, p) {
  const out = [];
  const st = `fill="none" stroke="${p.ink}"`;
  const lab = (lx, ly, s) => text(lx, ly, s, { size: 12, w: 700, fill: p.dim, ls: 1.5 });
  out.push(rect(x, y, w, h, `${st} stroke-width="2.4"`), rect(x + 4, y + 4, w - 8, h - 8, `${st} stroke-width="0.8" stroke-opacity="0.7"`));
  const r1 = kind === "wrapped" ? 64 : 36;
  const rh = (h - r1) / 2;
  const sheetTxt = kind === "wrapped" ? "01/01" : "02/02";
  out.push(line(x, y + r1, x + w, y + r1, p.ink, 1.6));
  // logo đĩa than
  const lx = x + w - r1 / 2 - 4, ly = y + r1 / 2;
  out.push(circle(lx, ly, r1 * 0.36, `${st} stroke-width="1.6"`), circle(lx, ly, r1 * 0.22, `${st} stroke-width="1" stroke-opacity="0.8"`), circle(lx, ly, 3, `fill="${p.ink}"`));
  out.push(kind === "wrapped" ? lab(x + 12, y + 18, "PROJECT") : "", text(x + 12, y + r1 - 9, "musiDISCORD", { size: kind === "wrapped" ? 36 : 21, w: 700, f: C, fill: p.text, ls: 1 }));
  const val = (vx, vy, s, sz = 19) => text(vx, vy, s, { size: sz, w: 700, fill: p.text });
  if (kind === "wrapped") {
    const cw = [140, 140, w - 280];
    let cx = x;
    const row1 = [["SHEET", sheetTxt], ["SCALE", "1:1"], ["REV", "A"]];
    out.push(line(x, y + r1 + rh, x + w, y + r1 + rh, p.ink, 1.2));
    row1.forEach(([l, v], i) => {
      if (i) out.push(line(cx, y + r1, cx, y + r1 + rh, p.ink, 1.2));
      out.push(lab(cx + 12, y + r1 + 18, l), val(cx + 12, y + r1 + rh - 9, v));
      cx += cw[i];
    });
    out.push(line(x + 190, y + r1 + rh, x + 190, y + h, p.ink, 1.2));
    out.push(lab(x + 12, y + r1 + rh + 18, "DRAWN"), val(x + 12, y + h - 9, "nhaajt"));
    out.push(lab(x + 202, y + r1 + rh + 18, "DATE"), val(x + 202, y + h - 9, dateStr));
  } else {
    const cols = [["SHEET", sheetTxt, 78], ["DRAWN", "nhaajt", 88], ["DATE", dateStr, w - 78 - 88 - 56], ["REV", "A", 56]];
    let cx = x;
    out.push(line(x, y + r1 + 0, x + w, y + r1, p.ink, 1.6));
    const rr = h - r1;
    cols.forEach(([l, v, cw], i) => {
      if (i) out.push(line(cx, y + r1, cx, y + h, p.ink, 1.2));
      out.push(lab(cx + 8, y + r1 + 15, l), val(cx + 8, y + h - 9, v, 16));
      cx += cw;
    });
    void rr;
  }
  return out.join("");
}

// ---------- bố cục ----------

function normalize(data) {
  const d = data && typeof data === "object" ? data : {};
  const hrs = Array.isArray(d.hourlyPlays) && d.hourlyPlays.length >= 24 ? d.hourlyPlays.slice(0, 24).map(num) : null;
  const bh = Number.isInteger(d.busiestHour) && d.busiestHour >= 0 && d.busiestHour < 24 ? d.busiestHour : null;
  const yr = Math.round(num(d.year)) || new Date().getUTCFullYear();
  return {
    kind: d.kind === "profile" ? "profile" : "wrapped",
    year: yr,
    userName: clean(d.userName, "Người nghe ẩn danh"),
    guildName: clean(d.guildName, "Máy chủ ẩn danh"),
    totalListenMs: num(d.totalListenMs),
    totalPlays: num(d.totalPlays),
    totalSkips: num(d.totalSkips),
    totalRequests: num(d.totalRequests),
    topTracks: (Array.isArray(d.topTracks) ? d.topTracks : []).slice(0, 5).map((t) => ({
      title: clean(t && t.title, "Không rõ tên bài"),
      artist: clean(t && t.artist, "Không rõ"),
      plays: num(t && t.plays),
    })),
    topArtists: (Array.isArray(d.topArtists) ? d.topArtists : []).slice(0, 5).map((a) => ({
      name: clean(a && a.name, "Không rõ"),
      plays: num(a && a.plays),
    })),
    hours: hrs,
    busiest: bh === null && hrs && Math.max(...hrs) > 0 ? hrs.indexOf(Math.max(...hrs)) : bh,
    streak: Math.round(num(d.streakDays)),
    badges: (Array.isArray(d.badges) ? d.badges : []).slice(0, 6).map((b) => ({ name: clean(b && b.name, "Huy hiệu") })),
    date: fmtDate(d.generatedAt),
  };
}

// số lớn cùng đơn vị nhỏ, tự co để không tràn ô
function bigValue(x, y, value, unit, maxW, size, p, anchor = "start") {
  const uw = unit ? mw(unit, size * 0.26) + 10 : 0;
  const s = Math.min(size, (maxW - uw) / (Array.from(value).length * COND_ADV));
  const usz = Math.max(14, Math.min(26, size * 0.26));
  const tspan = unit ? `<tspan font-family="${M}" font-size="${r2(usz)}" font-weight="400" dx="8">${esc(unit)}</tspan>` : "";
  return `<text x="${r2(x)}" y="${r2(y)}" font-family="${C}" font-size="${r2(s)}" font-weight="700" fill="${p.text}"${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}>${esc(value)}${tspan}</text>`;
}

function kpis(d, x0, x1, yLabel, yVal, size, firstWide, p) {
  const t = fmtTime(d.totalListenMs);
  const cells = [
    ["GIỜ NGHE", t.value, t.unit],
    ["LƯỢT PHÁT", fmtInt(d.totalPlays), ""],
    ["BỎ QUA", fmtInt(d.totalSkips), ""],
    ["YÊU CẦU", fmtInt(d.totalRequests), ""],
  ];
  const total = x1 - x0;
  const w0 = firstWide ? total * 0.36 : total / 4;
  const wr = (total - w0) / 3;
  const out = [];
  let x = x0;
  cells.forEach(([l, v, u], i) => {
    const w = i === 0 ? w0 : wr;
    if (i) out.push(line(x, yLabel - 20, x, yVal + 18, p.ink, 1.2, 'stroke-opacity="0.6" stroke-dasharray="6 4"'));
    const pad = i ? 18 : 0;
    out.push(text(x + pad, yLabel, l, { size: 15, w: 700, fill: p.dim, ls: 2.5 }));
    out.push(bigValue(x + pad, yVal, v, u, w - pad - 14, i === 0 ? size * 1.2 : size, p));
    x += w;
  });
  return out.join("");
}

function wrapped(d, p) {
  const W = 1080, H = 1350;
  const out = [backdrop(W, H, p, 8, 10, [{ h: 450 }, { h: 900 }])];
  const rot = -(5 + (hashOf(d.userName + d.year) % 5));
  const nameMax = maxChars(640, 38);
  out.push(
    text(74, 92, "BẢN VẼ KỸ THUẬT  ·  HỒ SƠ NGHE NHẠC", { size: 15, w: 700, fill: p.dim, ls: 3 }),
    text(70, 232, "WRAPPED", { size: 176, w: 700, f: C, fill: p.text, ls: 2 }),
    text(74, 286, trunc(d.userName, nameMax), { size: 38, w: 700, fill: p.text }),
    text(74, 318, trunc("MÁY CHỦ · " + d.guildName, maxChars(640, 20)), { size: 20, fill: p.dim }),
    stamp(858, 176, 280, 112, rot, "ĐÃ NGHE", String(d.year), p),
    dimH(74, 1006, 346, `TỔNG QUAN NĂM ${d.year}`, p),
    kpis(d, 74, 1006, 392, 468, 84, true, p),
  );
  out.push(
    sectionHead(74, 536, 932, 1, "HÌNH 1  ·  TOP BÀI HÁT (MẶT ĐỨNG)", p),
    trackRows({ x: 74, right: 1006, y0: 556, pitch: 56, n: 5, barMax: 690, tSize: 22 }, d.topTracks, p),
  );
  out.push(
    sectionHead(74, 874, 470, 2, "HÌNH 2  ·  TOP NGHỆ SĨ", p),
    artistLegend(74, 544, 916, 44, d.topArtists, 5, p),
    sectionHead(580, 874, 426, 3, "HÌNH 3  ·  NHỊP 24 GIỜ", p),
    dial(872, 1006, 40, 94, d.hours, d.busiest, p, 114),
  );
  const hr = d.busiest === null ? "--:--" : String(d.busiest).padStart(2, "0") + ":00";
  out.push(
    text(590, 924, "GIỜ CAO ĐIỂM", { size: 14, w: 700, fill: p.dim, ls: 2 }),
    bigValue(588, 984, hr, "", 150, 58, p),
    text(590, 1040, "CHUỖI DÀI NHẤT", { size: 14, w: 700, fill: p.dim, ls: 2 }),
    bigValue(588, 1100, fmtInt(d.streak), d.streak === 1 ? "ngày" : "ngày", 150, 58, p),
    line(590, 1002, 700, 1002, p.ink, 1, 'stroke-opacity="0.5" stroke-dasharray="3 4"'),
  );
  // huy hiệu
  out.push(sectionHead(74, 1166, 520, 4, "HUY HIỆU  ·  KÝ HIỆU", p));
  if (!d.badges.length) out.push(text(74, 1228, "CHƯA CÓ HUY HIỆU", { size: 16, w: 700, fill: p.dim, ls: 2 }));
  d.badges.forEach((b, i) => {
    const bx = 74 + (i % 2) * 262, by = 1204 + Math.floor(i / 2) * 36;
    out.push(badgeSymbol(bx + 16, by, 15, b.name, i, p), text(bx + 42, by + 6, trunc(b.name, maxChars(214, 17)), { size: 17, w: 700, fill: p.text }));
  });
  out.push(titleBlock(606, 1146, 420, 150, "wrapped", d.date, p));
  return { W, H, body: out.join("") };
}

function profile(d, p) {
  const W = 1080, H = 640;
  const out = [backdrop(W, H, p, 8, 4, [{ v: 540 }])];
  const rot = -(5 + (hashOf(d.userName + d.year) % 5));
  out.push(
    text(74, 82, "BẢN VẼ KỸ THUẬT  ·  HỒ SƠ NGƯỜI NGHE", { size: 15, w: 700, fill: p.dim, ls: 3 }),
    text(72, 166, "HỒ SƠ NGHE NHẠC", { size: 84, w: 700, f: C, fill: p.text, ls: 2 }),
    text(74, 204, trunc(d.userName, maxChars(640, 30)), { size: 30, w: 700, fill: p.text }),
    text(74, 230, trunc("MÁY CHỦ · " + d.guildName, maxChars(640, 18)), { size: 18, fill: p.dim }),
    stamp(880, 140, 250, 96, rot, "ĐÃ NGHE", String(d.year), p),
    dimH(74, 1006, 256, "TỔNG QUAN", p),
    kpis(d, 74, 1006, 296, 352, 62, false, p),
  );
  out.push(
    sectionHead(74, 400, 440, 1, "HÌNH 1  ·  TOP BÀI HÁT", p),
    trackRows({ x: 74, right: 512, y0: 416, pitch: 50, n: 3, barMax: 250, tSize: 19 }, d.topTracks, p),
    sectionHead(560, 400, 446, 2, "HÌNH 2  ·  NHỊP 24 GIỜ", p),
    dial(622, 494, 26, 54, d.hours, d.busiest, p, 70),
  );
  const hr = d.busiest === null ? "--:--" : String(d.busiest).padStart(2, "0") + ":00";
  out.push(
    text(724, 424, "CAO ĐIỂM", { size: 13, w: 700, fill: p.dim, ls: 2 }),
    bigValue(724, 462, hr, "", 130, 40, p),
    text(868, 424, "CHUỖI NGÀY", { size: 13, w: 700, fill: p.dim, ls: 2 }),
    bigValue(868, 462, fmtInt(d.streak), "", 130, 40, p),
  );
  d.badges.slice(0, 6).forEach((b, i) => out.push(badgeSymbol(740 + i * 44, 486, 14, b.name, i, p)));
  if (!d.badges.length) out.push(text(724, 491, "CHƯA CÓ HUY HIỆU", { size: 14, w: 700, fill: p.dim, ls: 2 }));
  out.push(titleBlock(690, 508, 336, 78, "profile", d.date, p));
  return { W, H, body: out.join("") };
}

function build(data, theme) {
  const d = normalize(data);
  const p = PAL[theme === "light" ? "light" : "dark"];
  const { W, H, body } = d.kind === "profile" ? profile(d, p) : wrapped(d, p);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return { svg, W };
}

export async function renderStatsCard(data, options = {}) {
  const { svg, W } = build(data, options && options.theme);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: M,
      monospaceFamily: M,
    },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}

// chỉ dùng cho kiểm thử
export const _internals = { clean, trunc, build, fmtInt, fmtTime };
