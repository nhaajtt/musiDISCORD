// Parse song lyrics in LRC / plain text format (pure functions, no I/O)

const MAX_INPUT = 2_000_000;
const MAX_LINES = 50_000;
const MAX_LINE_LEN = 4000;
const MAX_TAGS_PER_LINE = 20;

const TIME_RE = /^(?:(\d{1,3}):)?(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const META_RE = /^(ti|ar|al|au|by|length|offset|re|ve|la|tool|id):(.*)$/i;
const WORD_TAG_RE = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function toMs(m) {
  const h = m[1] ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const frac = m[4] ? Number(m[4].padEnd(3, "0").slice(0, 3)) : 0;
  return ((h * 60 + min) * 60 + sec) * 1000 + frac;
}

function cleanText(s) {
  return s.replace(WORD_TAG_RE, "").replace(CTRL_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function parseLrc(input) {
  const result = { synced: false, offsetMs: 0, meta: {}, lines: [] };
  if (typeof input !== "string" || !input) return result;
  let text = input.length > MAX_INPUT ? input.slice(0, MAX_INPUT) : input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rawLines = text.split(/\r\n|\r|\n/, MAX_LINES);
  const timed = [];
  const plain = [];
  let sawTime = false;

  for (let raw of rawLines) {
    if (raw.length > MAX_LINE_LEN) raw = raw.slice(0, MAX_LINE_LEN);
    const line = raw.trim();
    const times = [];
    let pos = 0;
    let metaOnly = false;
    let tags = 0;
    while (pos < line.length && line[pos] === "[" && tags < MAX_TAGS_PER_LINE) {
      const end = line.indexOf("]", pos);
      if (end === -1) break;
      const inner = line.slice(pos + 1, end);
      if (inner.length > 40) break;
      const tm = inner.length <= 14 ? TIME_RE.exec(inner) : null;
      if (tm) {
        times.push(toMs(tm));
      } else {
        const mm = META_RE.exec(inner);
        if (!mm) break;
        const key = mm[1].toLowerCase();
        const val = mm[2].trim();
        if (key === "offset") {
          const n = Number(val.replace(/^\+/, ""));
          if (Number.isFinite(n)) result.offsetMs = Math.round(n);
        } else if (["ti", "ar", "al", "by", "length"].includes(key)) {
          result.meta[key] = val;
        }
        metaOnly = true;
      }
      tags++;
      pos = end + 1;
      if (!tm) {
        // meta tag: drop the whole line
        break;
      }
    }
    if (metaOnly && times.length === 0) continue;
    if (times.length > 0) {
      sawTime = true;
      const body = cleanText(line.slice(pos));
      for (const t of times) timed.push({ timeMs: t, text: body });
    } else {
      plain.push(cleanText(line));
    }
  }

  if (sawTime) {
    const off = result.offsetMs;
    for (const l of timed) l.timeMs = Math.max(0, l.timeMs - off);
    timed.sort((a, b) => a.timeMs - b.timeMs);
    result.synced = true;
    result.lines = timed;
    return result;
  }

  // plain text: merge consecutive blank lines, trim leading/trailing blanks
  const out = [];
  let blanks = 0;
  const flush = () => {
    if (blanks > 0) {
      const n = blanks > 2 ? 1 : blanks;
      for (let i = 0; i < n; i++) out.push({ timeMs: null, text: "" });
      blanks = 0;
    }
  };
  for (const t of plain) {
    if (t === "") {
      if (out.length > 0) blanks++;
    } else {
      flush();
      out.push({ timeMs: null, text: t });
    }
  }
  result.lines = out;
  return result;
}

export function lineCount(parsed) {
  return parsed && Array.isArray(parsed.lines) ? parsed.lines.length : 0;
}

export function currentLineIndex(lines, positionMs) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  if (typeof lines[0]?.timeMs !== "number") return -1;
  if (typeof positionMs !== "number" || !Number.isFinite(positionMs)) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = lines[mid].timeMs;
    if (typeof t === "number" && t <= positionMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function lyricsWindow(lines, index, { before = 1, after = 2 } = {}) {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  const b = Math.max(0, Math.floor(Number(before)) || 0);
  const a = Math.max(0, Math.floor(Number(after)) || 0);
  const isBlank = (i) => !lines[i] || !String(lines[i].text ?? "").trim();

  if (!Number.isInteger(index) || index < 0) {
    const out = [];
    for (let i = 0; i < lines.length && out.length < a + 1; i++) {
      if (!isBlank(i)) out.push({ text: String(lines[i].text), current: false });
    }
    return out;
  }
  const cur = Math.min(index, lines.length - 1);
  const prev = [];
  for (let i = cur - 1; i >= 0 && prev.length < b; i--) {
    if (!isBlank(i)) prev.unshift({ text: String(lines[i].text), current: false });
  }
  const next = [];
  for (let i = cur + 1; i < lines.length && next.length < a; i++) {
    if (!isBlank(i)) next.push({ text: String(lines[i].text), current: false });
  }
  const currentText = isBlank(cur) ? "♪" : String(lines[cur].text);
  return [...prev, { text: currentText, current: true }, ...next];
}

export function paginateLyrics(lines, maxChars = 1800) {
  const limit = Math.max(10, Math.floor(Number(maxChars)) || 1800);
  if (!Array.isArray(lines)) return [];

  // prepare lines: strip timestamps, split overly long lines, merge consecutive blank lines
  const items = [];
  let lastBlank = true;
  for (const l of lines) {
    const t = String(l?.text ?? "").replace(/\s+$/, "");
    if (t === "") {
      if (!lastBlank) items.push("");
      lastBlank = true;
      continue;
    }
    lastBlank = false;
    let rest = t;
    while (rest.length > limit) {
      let cut = rest.lastIndexOf(" ", limit);
      if (cut < limit / 2) cut = limit;
      items.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    items.push(rest);
  }
  while (items.length && items[items.length - 1] === "") items.pop();

  const pages = [];
  let cur = [];
  let len = 0;
  const push = () => {
    while (cur.length && cur[cur.length - 1] === "") cur.pop();
    const s = cur.join("\n");
    if (s.trim()) pages.push(s);
    cur = [];
    len = 0;
  };
  for (const it of items) {
    if (cur.length === 0 && it === "") continue;
    const add = it.length + (cur.length ? 1 : 0);
    if (len + add > limit) {
      push();
      if (it === "") continue;
    }
    len += it.length + (cur.length ? 1 : 0);
    cur.push(it);
  }
  push();
  return pages;
}
