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
    throw new ContribError("host", "Đường dẫn file không hợp lệ.");
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new ContribError("host", "Chỉ nhận file đính kèm trực tiếp từ Discord.");
  }

  const ext = path.extname(String(attachment.name ?? "")).toLowerCase();
  if (!AUDIO_EXT.has(ext)) {
    throw new ContribError("ext", `Định dạng không được hỗ trợ. Chỉ nhận: ${[...AUDIO_EXT].join(", ")}.`);
  }
  if (!attachment.size || attachment.size <= 0) throw new ContribError("empty", "File rỗng.");
  if (attachment.size > config.contributions.maxBytes) {
    throw new ContribError("too_big", `File quá lớn (tối đa ${Math.round(config.contributions.maxBytes / 1048576)} MB).`);
  }
  return { url, ext };
}

function checkQuotas(userId, now) {
  if (countPendingByUser(userId) >= LIMITS.pendingPerUser) {
    throw new ContribError("quota_pending", `Bạn đang có ${LIMITS.pendingPerUser} file chờ duyệt, hãy đợi chủ bot xử lý trước.`);
  }
  if (countSince(userId, now - 86_400_000) >= LIMITS.perDay) {
    throw new ContribError("quota_daily", `Mỗi ngày chỉ gửi tối đa ${LIMITS.perDay} file.`);
  }
  if (pendingBytes() >= LIMITS.pendingTotalBytes) {
    throw new ContribError("quota_total", "Hàng chờ duyệt đang đầy, hãy thử lại sau.");
  }
}

/** Tải file về `tmp`, giới hạn dung lượng khi đang tải và tính SHA-256. */
async function download(url, tmp, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(LIMITS.downloadTimeoutMs) });
  } catch {
    throw new ContribError("download", "Không tải được file từ Discord.");
  }
  if (!res.ok || !res.body) throw new ContribError("download", "Không tải được file từ Discord.");

  const declared = Number(res.headers.get("content-length"));
  if (declared > config.contributions.maxBytes) throw new ContribError("too_big", "File quá lớn.");

  const hash = createHash("sha256");
  let total = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > config.contributions.maxBytes) return callback(new ContribError("too_big", "File quá lớn."));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(tmp));
  if (total === 0) throw new ContribError("empty", "File rỗng.");
  return { sha256: hash.digest("hex"), size: total };
}

/**
 * Nhận một file đính kèm Discord làm đóng góp: kiểm tra, tải về thư mục tạm, xác minh là audio thật và ghi vào hàng chờ duyệt.
 * Trả về { id, title, artist, durationMs, sizeBytes, sha256, similar }.
 */
export async function ingestAttachment({ attachment, userId, guildId, fetchImpl = fetch, now = Date.now() }) {
  const { url, ext } = checkAttachment(attachment);
  checkQuotas(userId, now);

  await mkdir(stagingDir(), { recursive: true });
  const tmp = path.join(stagingDir(), `tmp-${now}-${Math.random().toString(36).slice(2, 10)}${ext}`);

  try {
    const { sha256, size } = await download(url, tmp, fetchImpl);
    if (hashTaken(sha256)) throw new ContribError("duplicate", "File này đã có hoặc đang chờ duyệt.");

    let tags;
    try {
      tags = await parseFile(tmp, { duration: true, skipCovers: true });
    } catch {
      throw new ContribError("not_audio", "File không phải âm thanh hợp lệ.");
    }
    const seconds = tags?.format?.duration;
    if (!seconds) throw new ContribError("not_audio", "Không đọc được thời lượng, có thể file hỏng.");
    if (seconds < LIMITS.minSeconds) throw new ContribError("too_short", `File quá ngắn (tối thiểu ${LIMITS.minSeconds} giây).`);
    if (seconds > LIMITS.maxSeconds) throw new ContribError("too_long", `File quá dài (tối đa ${LIMITS.maxSeconds / 60} phút).`);

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
