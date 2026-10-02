import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { cleanMeta, guessFromName } from "./index.js";
import { coverKey, coversDir } from "./overlay.js";

const UA = () => `${config.botName}/1.0 (self-hosted Discord music bot)`;
const MIN_GAP_MS = 1100;
const TEXT_CONFIDENCE_CAP = 0.8; // a filename search isn't reliable enough to apply automatically
const MAX_COVER = 2 * 1024 * 1024;

let lastCall = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Space out calls to external services (MusicBrainz allows at most 1 request/second). */
async function throttle(gap = MIN_GAP_MS) {
  const wait = lastCall + gap - Date.now();
  lastCall = Date.now() + Math.max(wait, 0);
  if (wait > 0) await sleep(wait);
}

export function runFpcalc(abs) {
  return new Promise((resolve, reject) => {
    execFile("fpcalc", ["-json", "-length", "120", abs], { timeout: 30_000, maxBuffer: 1 << 20 }, (error, stdout) => {
      if (error) return reject(error);
      try {
        const out = JSON.parse(stdout);
        if (!out.fingerprint || !out.duration) throw new Error("fpcalc returned no fingerprint");
        resolve({ duration: Math.round(out.duration), fingerprint: out.fingerprint });
      } catch (e) {
        reject(e);
      }
    });
  });
}

/** Pick the best result from an AcoustID response: { title, artist, album, albumId, confidence } or null. */
export function parseAcoustid(json) {
  if (json?.status !== "ok") return null;
  let best = null;
  for (const result of json.results ?? []) {
    const score = Number(result.score);
    if (!Number.isFinite(score)) continue;
    for (const rec of result.recordings ?? []) {
      const title = cleanMeta(rec.title);
      const artist = cleanMeta((rec.artists ?? []).map((a) => a.name).join(", "));
      if (!title || !artist) continue;
      if (!best || score > best.confidence) {
        const rg = rec.releasegroups?.find((g) => g.type === "Album") ?? rec.releasegroups?.[0];
        best = { title, artist, album: cleanMeta(rg?.title), albumId: rg?.id ?? null, confidence: Math.min(score, 1), source: "acoustid" };
      }
    }
  }
  return best;
}

/** Pick a MusicBrainz text-search result; confidence is capped because it only relies on the filename. */
export function parseMusicBrainz(json) {
  const rec = json?.recordings?.[0];
  if (!rec) return null;
  const title = cleanMeta(rec.title);
  const artist = cleanMeta((rec["artist-credit"] ?? []).map((a) => a.name ?? a.artist?.name).filter(Boolean).join(", "));
  if (!title || !artist) return null;
  const release = rec.releases?.[0];
  const score = Math.min(Number(rec.score) / 100 || 0, 1) * TEXT_CONFIDENCE_CAP;
  return { title, artist, album: cleanMeta(release?.title), albumId: release?.["release-group"]?.id ?? null, confidence: score, source: "musicbrainz" };
}

async function getJson(url, init, { fetchFn = fetch, gapMs } = {}) {
  await throttle(gapMs);
  const res = await fetchFn(url, { ...init, headers: { "User-Agent": UA(), Accept: "application/json", ...init?.headers }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function lookupAcoustid({ duration, fingerprint }, deps) {
  const body = new URLSearchParams({ client: config.autotag.acoustidKey, duration: String(duration), fingerprint, meta: "recordings releasegroups", format: "json" });
  return parseAcoustid(await getJson("https://api.acoustid.org/v2/lookup", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }, deps));
}

async function lookupText(rel, deps) {
  const guess = guessFromName(rel.split("/").at(-1).replace(/\.[^.]+$/, ""));
  const clauses = [`recording:"${guess.title.replace(/["\\]/g, " ")}"`];
  if (guess.artist) clauses.push(`artist:"${guess.artist.replace(/["\\]/g, " ")}"`);
  const url = `https://musicbrainz.org/ws/2/recording?fmt=json&limit=3&query=${encodeURIComponent(clauses.join(" AND "))}`;
  return parseMusicBrainz(await getJson(url, {}, deps));
}

/** Download the front cover from Cover Art Archive into SHARED_DIR/covers. Returns true if saved. */
export async function fetchCover(rel, albumId, { fetchFn = fetch, gapMs } = {}) {
  if (!albumId || !/^[0-9a-f-]{36}$/i.test(albumId)) return false;
  try {
    await throttle(gapMs);
    const res = await fetchFn(`https://coverartarchive.org/release-group/${albumId}/front-500`, { headers: { "User-Agent": UA() }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok || !String(res.headers.get("content-type")).includes("jpeg")) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_COVER) return false;
    await mkdir(coversDir(), { recursive: true });
    await writeFile(path.join(coversDir(), `${coverKey(rel)}.jpg`), buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Identify an untagged track. Returns an overlay record (status applied/suggested/none) without writing the file.
 * Order: audio fingerprint (AcoustID), then filename search (MusicBrainz).
 */
export async function identify(rel, deps = {}) {
  const { fingerprintFn = runFpcalc } = deps;
  let candidate = null;

  if (config.autotag.acoustidKey) {
    try {
      candidate = await lookupAcoustid(await fingerprintFn(path.join(config.musicDir, rel)), deps);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("fpcalc (chromaprint) is missing in the container");
    }
  }
  if (!candidate) candidate = await lookupText(rel, deps).catch(() => null);

  const now = Date.now();
  if (!candidate) return { status: "none", checkedAt: now };
  const status = candidate.confidence >= config.autotag.autoApply ? "applied" : "suggested";
  return { ...candidate, status, checkedAt: now };
}
