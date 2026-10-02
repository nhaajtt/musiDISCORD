import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeFile } from "../analysis/analyzer.js";
import { distance } from "../analysis/features.js";
import { config } from "../config.js";
import { all, onScanned, scan } from "./index.js";
import { features, refreshOverlay, tags } from "./overlay.js";
import { fetchCover, identify } from "./tagger.js";

const RETRY_NONE_MS = 30 * 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = { running: false, phase: null, current: null, tagged: 0, analyzed: 0, error: null };
let stopRequested = false;
let rerun = false;

export const workerState = () => ({ ...state });

/** Wait while the machine is busy (a Raspberry Pi playing music and doing background work). */
async function waitIdle() {
  const limit = os.cpus().length * 0.9;
  for (let i = 0; i < 20 && os.loadavg()[0] > limit && !stopRequested; i++) await sleep(15_000);
}

export function untaggedTargets(entries = all(), now = Date.now()) {
  return entries.filter((e) => {
    if (e.hasTags) return false;
    const rec = tags.get(e.file);
    return !rec || (rec.status === "none" && now - (rec.checkedAt ?? 0) > RETRY_NONE_MS);
  });
}

async function tagPass() {
  const todo = untaggedTargets();
  state.phase = "tag";
  let applied = 0;
  for (const [i, entry] of todo.entries()) {
    if (stopRequested) break;
    await waitIdle();
    state.current = entry.file;
    try {
      const rec = await identify(entry.file);
      tags.set(entry.file, rec);
      if (rec.status === "applied") {
        applied++;
        state.tagged++;
        await fetchCover(entry.file, rec.albumId);
      }
    } catch (error) {
      state.error = error.message;
      console.error("Tagging failed:", error.message);
      if (/fpcalc/.test(error.message)) break;
    }
    if (i % 5 === 4) tags.save();
  }
  tags.save();
  return applied;
}

const fresh = (f, info) => f && f.mtimeMs === info.mtimeMs && f.size === info.size;

async function analysisPass() {
  state.phase = "analyze";
  for (const entry of all()) {
    if (stopRequested) break;
    let info;
    try {
      info = await stat(path.join(config.musicDir, entry.file));
    } catch {
      continue;
    }
    if (fresh(features.get(entry.file), info)) continue;

    await waitIdle();
    state.current = entry.file;
    const stamp = { mtimeMs: info.mtimeMs, size: info.size };
    try {
      const result = await analyzeFile(entry.file, entry.durationMs);
      features.set(entry.file, result ? { ...stamp, ...result } : { ...stamp, failed: true });
      state.analyzed++;
    } catch (error) {
      if (error.code === "ENOENT") {
        state.error = "ffmpeg is missing in the container";
        break;
      }
      features.set(entry.file, { ...stamp, failed: true });
    }
    if (state.analyzed % 10 === 0) features.save();
    await sleep(150);
  }
  features.save();
}

async function cycle() {
  if (state.running) {
    rerun = true;
    return;
  }
  state.running = true;
  state.error = null;
  stopRequested = false;
  try {
    refreshOverlay();
    let applied = 0;
    if (config.autotag.enabled) applied = await tagPass();
    if (config.analysis.enabled) await analysisPass();
    if (applied > 0) await scan();
  } catch (error) {
    state.error = error.message;
    console.error("Library background task failed:", error);
  } finally {
    state.running = false;
    state.phase = null;
    state.current = null;
    if (rerun && !stopRequested) {
      rerun = false;
      setTimeout(() => cycle(), 5_000).unref();
    }
  }
}

/** Runs in the background after each library scan (only on the bot with LIBRARY_WORKER enabled). */
export function startWorker() {
  if (!config.libraryWorker || (!config.autotag.enabled && !config.analysis.enabled)) return;
  onScanned(() => {
    cycle();
  });
}

export const runNow = () => cycle();
export const stopWorker = () => {
  stopRequested = true;
};

/** Valid features of a track (analyzed successfully) or null. */
export function featuresOf(rel) {
  const f = features.get(rel);
  return f && !f.failed ? f : null;
}

export function progress() {
  const entries = all();
  const analyzed = entries.filter((e) => featuresOf(e.file)).length;
  const records = tags.entries();
  return {
    total: entries.length,
    untagged: entries.filter((e) => !e.hasTags).length,
    applied: records.filter(([, r]) => r.status === "applied").length,
    suggested: records.filter(([, r]) => r.status === "suggested").length,
    analyzed,
  };
}

export const suggestions = () => tags.entries().filter(([, r]) => r.status === "suggested");

/** Approve (applied) or reject (rejected) a suggestion, then rescan so the library updates. */
export async function reviewSuggestion(rel, accept) {
  const rec = tags.get(rel);
  if (!rec || rec.status !== "suggested") return false;
  tags.set(rel, { ...rec, status: accept ? "applied" : "rejected", reviewedAt: Date.now() });
  tags.save();
  if (accept) await fetchCover(rel, rec.albumId);
  await scan();
  return true;
}

export async function forgetTag(rel) {
  if (!tags.has(rel)) return false;
  tags.delete(rel);
  tags.save();
  await scan();
  return true;
}

/** Tracks closest to `rel` by audio features (excluding itself and unanalyzed tracks). */
export function similarTo(rel, limit = 10, entries = all()) {
  const base = featuresOf(rel);
  if (!base) return [];
  return entries
    .filter((e) => e.file !== rel && featuresOf(e.file))
    .map((e) => ({ e, d: distance(base, featuresOf(e.file)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.e);
}

export const byMood = (mood, entries = all()) => entries.filter((e) => featuresOf(e.file)?.mood === mood);
