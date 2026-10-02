import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseLrc, currentLineIndex, lyricsWindow, paginateLyrics } from "../src/lyrics/lrc.js";
import {
  cleanTitleForSearch,
  guessArtistTitle,
  fetchLyricsFromLrclib,
  clearLyricsCache,
} from "../src/lyrics/lrclib.js";

describe("parseLrc", () => {
  test("timestamp forms", () => {
    const p = parseLrc("[00:12.34]a\n[01:02.5]b\n[3:04]c\n[00:05.123]d\n[01:00:01.00]e");
    assert.equal(p.synced, true);
    const m = Object.fromEntries(p.lines.map((l) => [l.text, l.timeMs]));
    assert.deepEqual(m, { a: 12340, b: 62500, c: 184000, d: 5123, e: 3601000 });
    assert.equal(p.lines[0].text, "d"); // already sorted
  });

  test("multiple timestamps on one line", () => {
    const p = parseLrc("[00:12.00][01:30.50]hello");
    assert.deepEqual(p.lines, [
      { timeMs: 12000, text: "hello" },
      { timeMs: 90500, text: "hello" },
    ]);
  });

  test("offset (positive = earlier) clamped to 0", () => {
    const p = parseLrc("[offset:+500]\n[00:00.20]x\n[00:02.00]y");
    assert.equal(p.offsetMs, 500);
    assert.deepEqual(p.lines.map((l) => l.timeMs), [0, 1500]);
    const q = parseLrc("[offset:-300]\n[00:01.00]y");
    assert.equal(q.lines[0].timeMs, 1300);
  });

  test("ID tags go into meta, not lyric lines", () => {
    const p = parseLrc("[ti:Tên]\n[ar:Ca sĩ]\n[al:Album]\n[by:me]\n[length: 03:20]\n[00:01.00]lời");
    assert.deepEqual(p.meta, { ti: "Tên", ar: "Ca sĩ", al: "Album", by: "me", length: "03:20" });
    assert.equal(p.lines.length, 1);
  });

  test("per-word tags are dropped, the words are kept", () => {
    const p = parseLrc("[00:12.00]<00:12.00>Xin <00:12.50>chào  <00:13.00>bạn");
    assert.equal(p.lines[0].text, "Xin chào bạn");
  });

  test("CRLF, CR, BOM, whitespace", () => {
    const p = parseLrc("﻿[00:01.00]  a  \r\n[00:02.00]b\r[00:03.00]c\n");
    assert.deepEqual(p.lines.map((l) => l.text), ["a", "b", "c"]);
  });

  test("empty timestamp lines are kept", () => {
    const p = parseLrc("[00:01.00]a\n[00:05.00]\n[00:09.00]b");
    assert.deepEqual(p.lines[1], { timeMs: 5000, text: "" });
    assert.equal(p.lines.length, 3);
  });

  test("stable sort on equal timestamps", () => {
    const p = parseLrc("[00:01.00]b\n[00:01.00]a\n[00:00.50]z");
    assert.deepEqual(p.lines.map((l) => l.text), ["z", "b", "a"]);
  });

  test("plain text", () => {
    const p = parseLrc("\n\nDòng 1\nDòng 2\n\n\n\n\nDòng 3\n\n");
    assert.equal(p.synced, false);
    assert.ok(p.lines.every((l) => l.timeMs === null));
    assert.deepEqual(p.lines.map((l) => l.text), ["Dòng 1", "Dòng 2", "", "Dòng 3"]);
  });

  test("[Chorus] is not treated as a tag", () => {
    const p = parseLrc("[Chorus]\nla la");
    assert.equal(p.lines[0].text, "[Chorus]");
    assert.equal(p.synced, false);
  });

  test("keeps Vietnamese text", () => {
    const p = parseLrc("[00:01.00]Đừng như thế, em ơi ♪ Ừ");
    assert.equal(p.lines[0].text, "Đừng như thế, em ơi ♪ Ừ");
  });

  test("garbage input does not throw", () => {
    for (const x of [null, undefined, 5, {}, [], "", "\u0000\u0001\u0002", "[", "]", "[[[[", "[00:"]) {
      const p = parseLrc(x);
      assert.ok(Array.isArray(p.lines));
    }
  });

  test("adversarial input runs fast", () => {
    const cases = [
      "[".repeat(1_000_000),
      "[00:01.00]".repeat(100_000),
      "[" + "a".repeat(1_000_000),
      "<00:01>".repeat(150_000),
      ("[00:" + "1".repeat(50)).repeat(10_000),
      " ".repeat(1_000_000) + "x",
      "\n".repeat(1_000_000),
      "[00:01.00]" + " ".repeat(1_000_000) + "x",
      Array.from({ length: 1000 }, (_, i) => String.fromCharCode(i % 256)).join("").repeat(1000),
    ];
    for (const c of cases) {
      const t0 = performance.now();
      parseLrc(c);
      assert.ok(performance.now() - t0 < 1500, "too slow");
    }
  });
});

describe("currentLineIndex", () => {
  const lines = parseLrc("[00:01.00]a\n[00:02.00]b\n[00:04.00]c").lines;
  test("binary search", () => {
    assert.equal(currentLineIndex(lines, 0), -1);
    assert.equal(currentLineIndex(lines, 999), -1);
    assert.equal(currentLineIndex(lines, 1000), 0);
    assert.equal(currentLineIndex(lines, 3999), 1);
    assert.equal(currentLineIndex(lines, 4000), 2);
    assert.equal(currentLineIndex(lines, 1e9), 2);
  });
  test("unsynced / garbage", () => {
    assert.equal(currentLineIndex(parseLrc("a\nb").lines, 5000), -1);
    assert.equal(currentLineIndex([], 5), -1);
    assert.equal(currentLineIndex(null, 5), -1);
    assert.equal(currentLineIndex(lines, NaN), -1);
  });
});

describe("lyricsWindow", () => {
  const lines = parseLrc("[00:01.00]a\n[00:02.00]b\n[00:03.00]c\n[00:04.00]d\n[00:05.00]e").lines;
  test("mid-track", () => {
    const w = lyricsWindow(lines, 2);
    assert.deepEqual(w.map((x) => x.text), ["b", "c", "d", "e"]);
    assert.deepEqual(w.map((x) => x.current), [false, true, false, false]);
  });
  test("start/end boundaries", () => {
    assert.deepEqual(lyricsWindow(lines, 0).map((x) => x.text), ["a", "b", "c"]);
    assert.deepEqual(lyricsWindow(lines, 4).map((x) => x.text), ["d", "e"]);
  });
  test("index -1", () => {
    const w = lyricsWindow(lines, -1);
    assert.deepEqual(w.map((x) => x.text), ["a", "b", "c"]);
    assert.ok(w.every((x) => !x.current));
  });
  test("blank line shows ♪ and is skipped elsewhere", () => {
    const l = parseLrc("[00:01.00]a\n[00:02.00]\n[00:03.00]\n[00:04.00]b").lines;
    assert.equal(lyricsWindow(l, 1).find((x) => x.current).text, "♪");
    assert.deepEqual(lyricsWindow(l, 0).map((x) => x.text), ["a", "b"]);
  });
  test("never exceeds before+1+after", () => {
    assert.equal(lyricsWindow(lines, 2, { before: 0, after: 0 }).length, 1);
    assert.ok(lyricsWindow(lines, 2, { before: 5, after: 5 }).length <= 11);
    assert.deepEqual(lyricsWindow([], 0), []);
  });
});

describe("paginateLyrics", () => {
  test("never exceeds maxChars, breaks between lines", () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({ timeMs: i * 1000, text: `Dòng số ${i} xin chào` }));
    const pages = paginateLyrics(lines, 100);
    assert.ok(pages.length > 1);
    for (const p of pages) assert.ok(p.length <= 100 && p.trim());
    assert.equal(pages.join("\n").split("\n").length, 200);
  });
  test("hard-split overly long lines", () => {
    const pages = paginateLyrics([{ timeMs: null, text: "x".repeat(450) }], 100);
    assert.equal(pages.length, 5);
    assert.ok(pages.every((p) => p.length <= 100));
    assert.equal(pages.join(""), "x".repeat(450));
  });
  test("blank lines kept as paragraph breaks, no empty pages", () => {
    const p = parseLrc("a\n\n\nb\n\n");
    assert.deepEqual(paginateLyrics(p.lines, 100), ["a\n\nb"]);
    assert.deepEqual(paginateLyrics([], 100), []);
    assert.deepEqual(paginateLyrics([{ timeMs: 1, text: "" }], 100), []);
  });
  test("keeps Vietnamese text", () => {
    assert.deepEqual(paginateLyrics([{ timeMs: 0, text: "Ơi người ơi" }]), ["Ơi người ơi"]);
  });
});

describe("cleanTitleForSearch / guessArtistTitle", () => {
  test("clean up titles", () => {
    const c = cleanTitleForSearch;
    assert.equal(c("01 - Shape of You"), "Shape of You");
    assert.equal(c("01. Shape of You"), "Shape of You");
    assert.equal(c("01-Shape of You"), "Shape of You");
    assert.equal(c("Song (Official Video)"), "Song");
    assert.equal(c("Song [Official Audio]"), "Song");
    assert.equal(c("Song (Lyrics) [MV]"), "Song");
    assert.equal(c("Song (Lyric Video)"), "Song");
    assert.equal(c("Song (Visualizer)"), "Song");
    assert.equal(c("Song (Remastered 2011)"), "Song");
    assert.equal(c("Song ft. Someone Else"), "Song");
    assert.equal(c("Song (feat. X)"), "Song");
    assert.equal(c("Song featuring X & Y"), "Song");
    assert.equal(c("Some_Song__Name"), "Some Song Name");
    assert.equal(c("Lạc Trôi (Official MV)"), "Lạc Trôi");
    assert.equal(c("(Official Video)"), "(Official Video)");
    assert.equal(c("1999"), "1999");
    assert.equal(c("  "), "");
    assert.equal(c(null), "");
  });
  test("guess artist - title", () => {
    assert.deepEqual(guessArtistTitle("Ed Sheeran - Shape of You (Official Video)"), {
      artist: "Ed Sheeran",
      title: "Shape of You",
    });
    assert.deepEqual(guessArtistTitle("Sơn Tùng M-TP – Lạc Trôi"), { artist: "Sơn Tùng M-TP", title: "Lạc Trôi" });
    assert.deepEqual(guessArtistTitle("Artist | Title"), { artist: "Artist", title: "Title" });
    assert.deepEqual(guessArtistTitle("01 - Artist - Title"), { artist: "Artist", title: "Title" });
    assert.deepEqual(guessArtistTitle("Just A Title"), { artist: null, title: "Just A Title" });
    assert.deepEqual(guessArtistTitle("M-TP"), { artist: null, title: "M-TP" });
  });
});

// ---- fake fetch ----
function res(status, body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}
function makeFetch(handler) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url: new URL(url), opts });
    return handler(new URL(url), opts);
  };
  f.calls = calls;
  return f;
}
const rec = (o = {}) => ({
  id: 1,
  trackName: "Shape of You",
  artistName: "Ed Sheeran",
  albumName: "÷",
  duration: 234,
  instrumental: false,
  plainLyrics: "plain",
  syncedLyrics: "[00:01.00]synced",
  ...o,
});
const meta = { title: "Shape of You", artist: "Ed Sheeran", durationMs: 234000 };

describe("fetchLyricsFromLrclib", () => {
  beforeEach(() => clearLyricsCache());

  test("success via /api/get", async () => {
    const f = makeFetch(() => res(200, rec()));
    const r = await fetchLyricsFromLrclib({ ...meta, album: "÷" }, { fetchImpl: f });
    assert.equal(r.source, "lrclib");
    assert.equal(r.syncedLyrics, "[00:01.00]synced");
    assert.equal(r.matchedArtist, "Ed Sheeran");
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url.pathname, "/api/get");
    assert.equal(f.calls[0].url.searchParams.get("duration"), "234");
    assert.equal(f.calls[0].url.searchParams.get("album_name"), "÷");
    assert.match(f.calls[0].opts.headers["User-Agent"], /musiDISCORD/);
  });

  test("does not send album/duration when absent", async () => {
    const f = makeFetch(() => res(200, rec()));
    await fetchLyricsFromLrclib({ title: "Shape of You", artist: "Ed Sheeran" }, { fetchImpl: f });
    assert.equal(f.calls[0].url.searchParams.has("album_name"), false);
    assert.equal(f.calls[0].url.searchParams.has("duration"), false);
  });

  test("404 then fallback to /search picking the best result", async () => {
    const f = makeFetch((u) =>
      u.pathname === "/api/get"
        ? res(404, { message: "nf" })
        : res(200, [
            rec({ id: 1, trackName: "Other Song", duration: 234 }),
            rec({ id: 2, duration: 300 }),
            rec({ id: 3, duration: 233, syncedLyrics: null, plainLyrics: "p3" }),
            rec({ id: 4, duration: 235, syncedLyrics: "[00:01.00]good" }),
          ]),
    );
    const r = await fetchLyricsFromLrclib(meta, { fetchImpl: f });
    assert.equal(r.syncedLyrics, "[00:01.00]good");
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].url.pathname, "/api/search");
  });

  test("reject wrong duration", async () => {
    const f = makeFetch((u) => (u.pathname === "/api/get" ? res(404, {}) : res(200, [rec({ duration: 400 })])));
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f }), null);
  });

  test("reject weak matches (wrong track/wrong artist)", async () => {
    const f = makeFetch((u) =>
      u.pathname === "/api/get"
        ? res(404, {})
        : res(200, [rec({ trackName: "Totally Different" }), rec({ artistName: "Someone Else" })]),
    );
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f }), null);
  });

  test("matching strips Vietnamese diacritics", async () => {
    const f = makeFetch((u) =>
      u.pathname === "/api/get" ? res(404, {}) : res(200, [rec({ trackName: "Lac Troi", artistName: "Son Tung M-TP" })]),
    );
    const r = await fetchLyricsFromLrclib({ title: "Lạc Trôi", artist: "Sơn Tùng M-TP" }, { fetchImpl: f });
    assert.ok(r);
  });

  test("title only: go straight to /search", async () => {
    const f = makeFetch(() => res(200, [rec()]));
    const r = await fetchLyricsFromLrclib({ title: "Shape of You" }, { fetchImpl: f });
    assert.ok(r);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url.pathname, "/api/search");
  });

  test("instrumental track", async () => {
    const f = makeFetch(() => res(200, rec({ instrumental: true, plainLyrics: null, syncedLyrics: null })));
    const r = await fetchLyricsFromLrclib(meta, { fetchImpl: f });
    assert.equal(r.instrumental, true);
    assert.equal(r.syncedLyrics, null);
  });

  test("429: null, no retry", async () => {
    const f = makeFetch(() => res(429, "slow down"));
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f }), null);
    assert.equal(f.calls.length, 1);
  });

  test("at most 2 requests per call", async () => {
    const f = makeFetch(() => res(404, {}));
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f }), null);
    assert.equal(f.calls.length, 2);
  });

  test("timeout / abort", async () => {
    const f = makeFetch(
      (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    );
    const t0 = Date.now();
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f, timeoutMs: 50 }), null);
    assert.ok(Date.now() - t0 < 1000);
  });

  test("timeout when fetch ignores the signal", async () => {
    const f = makeFetch(() => new Promise(() => {}));
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: f, timeoutMs: 50 }), null);
  });

  test("broken JSON / network error does not throw", async () => {
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: makeFetch(() => res(200, "{not json")) }), null);
    clearLyricsCache();
    const boom = makeFetch(() => {
      throw new Error("ECONNRESET");
    });
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: boom }), null);
    clearLyricsCache();
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: makeFetch(() => res(500, "x")) }), null);
    clearLyricsCache();
    assert.equal(await fetchLyricsFromLrclib(meta, { fetchImpl: makeFetch(() => null) }), null);
  });

  test("cache: second call makes no network request", async () => {
    const f = makeFetch(() => res(200, rec()));
    await fetchLyricsFromLrclib(meta, { fetchImpl: f });
    await fetchLyricsFromLrclib({ ...meta, title: "  shape OF you " }, { fetchImpl: f });
    assert.equal(f.calls.length, 1);
    clearLyricsCache();
    await fetchLyricsFromLrclib(meta, { fetchImpl: f });
    assert.equal(f.calls.length, 2);
  });

  test("cache negative results (404)", async () => {
    const g = makeFetch(() => res(404, {}));
    await fetchLyricsFromLrclib({ title: "Nope", artist: "Nobody" }, { fetchImpl: g });
    await fetchLyricsFromLrclib({ title: "Nope", artist: "Nobody" }, { fetchImpl: g });
    assert.equal(g.calls.length, 2); // 2 requests from the first call, the second comes from the cache
  });

  test("bad input: no network call or the length is truncated", async () => {
    const f = makeFetch(() => res(200, rec()));
    for (const m of [undefined, null, {}, { title: "" }, { title: "   " }, { title: 5 }, { title: {} }]) {
      assert.equal(await fetchLyricsFromLrclib(m, { fetchImpl: f }), null);
    }
    assert.equal(f.calls.length, 0);
    await fetchLyricsFromLrclib(
      { title: "a&b=c#?" + "x".repeat(1_000_000), artist: "é".repeat(5000), durationMs: "abc" },
      { fetchImpl: f },
    );
    const u = f.calls[0].url;
    assert.ok(u.searchParams.get("track_name").length <= 200);
    assert.ok(u.searchParams.get("artist_name").length <= 200);
    assert.ok(u.searchParams.get("track_name").startsWith("a&b=c#?"));
    assert.equal(u.searchParams.has("duration"), false);
  });

  test("garbage items in search results", async () => {
    const junk = [null, 1, "x", [], {}, { trackName: 5 }];
    const f = makeFetch((u) => (u.pathname === "/api/get" ? res(404, {}) : res(200, [...junk, rec()])));
    assert.ok(await fetchLyricsFromLrclib(meta, { fetchImpl: f }));
  });
});
