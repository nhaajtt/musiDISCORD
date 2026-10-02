import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseFile } from "music-metadata";
import { config } from "../config.js";
import { buildEntry, search } from "../library/index.js";
import { AUDIO_EXT } from "../utils/library.js";
import { countPendingByUser, countSince, hashTaken, insertContribution, pendingBytes } from "./store.js";

export const LIMITS = {
  pendingPerUser: 3,
  perDay: 5,
  pendingTotalBytes: 500 * 1024 * 1024,
  minSeconds: 10,
  maxSeconds: 20 * 60,
  downloadTimeoutMs: 60_000,
};

const ALLOWED_HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net"]);

export class ContribError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const stagingDir = () => path.join(config.dataDir, "contrib");
export const stagedPath = (id, ext) => path.join(stagingDir(), `${id}${ext}`);

function checkAttachment(attachment) {
  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new ContribError("host", "Invalid file URL.");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new ContribError("host", "Only files attached directly in Discord are accepted.");
  }

  const ext = path.extname(String(attachment.name ?? "")).toLowerCase();
  if (!AUDIO_EXT.has(ext)) {
    throw new ContribError("ext", `Unsupported format. Accepted: ${[...AUDIO_EXT].join(", ")}.`);
  }
  if (!attachment.size || attachment.size <= 0) throw new ContribError("empty", "The file is empty.");
  if (attachment.size > config.contributions.maxBytes) {
    throw new ContribError("too_big", `File too large (max ${Math.round(config.contributions.maxBytes / 1048576)} MB).`);
  }
  return { url, ext };
}

function checkQuotas(userId, now) {
  if (countPendingByUser(userId) >= LIMITS.pendingPerUser) {
    throw new ContribError("quota_pending", `You already have ${LIMITS.pendingPerUser} files awaiting review; wait for the bot owner to handle them first.`);
  }
  if (countSince(userId, now - 86_400_000) >= LIMITS.perDay) {
    throw new ContribError("quota_daily", `You can submit at most ${LIMITS.perDay} files per day.`);
  }
  if (pendingBytes() >= LIMITS.pendingTotalBytes) {
    throw new ContribError("quota_total", "The review queue is full, please try again later.");
  }
}

/** Download the file to `tmp`, enforcing the size limit while downloading and computing SHA-256. */
async function download(url, tmp, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(LIMITS.downloadTimeoutMs) });
  } catch {
    throw new ContribError("download", "Could not download the file from Discord.");
  }
  if (!res.ok || !res.body) throw new ContribError("download", "Could not download the file from Discord.");

  const declared = Number(res.headers.get("content-length"));
  if (declared > config.contributions.maxBytes) throw new ContribError("too_big", "File too large.");

  const hash = createHash("sha256");
  let total = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > config.contributions.maxBytes) return callback(new ContribError("too_big", "File too large."));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(tmp));
  if (total === 0) throw new ContribError("empty", "The file is empty.");
  return { sha256: hash.digest("hex"), size: total };
}

/**
 * Accept a Discord attachment as a contribution: validate it, download it to a temp folder, verify it is real audio and add it to the review queue.
 * Returns { id, title, artist, durationMs, sizeBytes, sha256, similar }.
 */
export async function ingestAttachment({ attachment, userId, guildId, fetchImpl = fetch, now = Date.now() }) {
  const { url, ext } = checkAttachment(attachment);
  checkQuotas(userId, now);

  await mkdir(stagingDir(), { recursive: true });
  const tmp = path.join(stagingDir(), `tmp-${now}-${Math.random().toString(36).slice(2, 10)}${ext}`);

  try {
    const { sha256, size } = await download(url, tmp, fetchImpl);
    if (hashTaken(sha256)) throw new ContribError("duplicate", "This file already exists or is awaiting review.");

    let tags;
    try {
      tags = await parseFile(tmp, { duration: true, skipCovers: true });
    } catch {
      throw new ContribError("not_audio", "The file is not valid audio.");
    }
    const seconds = tags?.format?.duration;
    if (!seconds) throw new ContribError("not_audio", "Could not read the duration; the file may be corrupt.");
    if (seconds < LIMITS.minSeconds) throw new ContribError("too_short", `File too short (minimum ${LIMITS.minSeconds} seconds).`);
    if (seconds > LIMITS.maxSeconds) throw new ContribError("too_long", `File too long (maximum ${LIMITS.maxSeconds / 60} minutes).`);

    const entry = buildEntry(String(attachment.name), tags);
    const similarEntry = search(`${entry.artist ?? ""} ${entry.title}`.trim(), 3).find((e) => e.title.toLowerCase() === entry.title.toLowerCase());

    const id = insertContribution({
      guildId,
      userId,
      originalName: String(attachment.name).slice(0, 200),
      ext,
      sizeBytes: size,
      sha256,
      title: entry.title,
      artist: entry.artist,
      durationMs: Math.round(seconds * 1000),
      at: now,
    });
    await rename(tmp, stagedPath(id, ext));

    return { id, title: entry.title, artist: entry.artist, durationMs: Math.round(seconds * 1000), sizeBytes: size, sha256, similar: similarEntry?.file ?? null };
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
}
