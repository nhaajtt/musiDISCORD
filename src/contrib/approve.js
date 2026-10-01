import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import * as library from "../library/index.js";
import { isInside, sanitizeFileName, uniquePath } from "./names.js";
import { stagedPath } from "./ingest.js";
import { claimPending, expireStale, getContribution, markApproved, markRejected, revertToPending } from "./store.js";

const EXPIRE_AFTER_MS = 14 * 86_400_000;

/** Đổi chỗ file, nếu khác ổ đĩa thì sao chép rồi xoá bản cũ. */
async function moveFile(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await copyFile(from, to);
    await rm(from, { force: true });
  }
}

/**
 * Chủ bot duyệt một đóng góp: chuyển file vào music/<thư mục đóng góp>/ rồi quét lại thư viện.
 * Trả về { row, file } (file là đường dẫn tương đối trong music/).
 */
export async function approveContribution({ id, ownerId, scan = library.scan }) {
  const row = getContribution(id);
  if (!row) throw new Error("Không có đóng góp này.");
  if (!claimPending(id)) throw new Error("Đóng góp này đã được xử lý rồi.");

  try {
    const destDir = path.join(config.musicDir, config.contributions.folder);
    await mkdir(destDir, { recursive: true });

    const base = sanitizeFileName(`${row.artist ? `${row.artist} - ` : ""}${row.title ?? row.original_name}`);
    const dest = await uniquePath(destDir, base, row.ext);
    if (!isInside(destDir, dest)) throw new Error("Đường dẫn đích không hợp lệ.");

    await moveFile(stagedPath(id, row.ext), dest);

    const file = path.posix.join(config.contributions.folder, path.basename(dest));
    markApproved(id, ownerId, file);
    await scan().catch((error) => console.error("Quét thư viện sau khi duyệt lỗi:", error));
    return { row: getContribution(id), file };
  } catch (error) {
    revertToPending(id);
    throw error;
  }
}

/** Chủ bot từ chối một đóng góp: xoá file tạm và ghi lý do. */
export async function rejectContribution({ id, ownerId, reason }) {
  const row = getContribution(id);
  if (!row) throw new Error("Không có đóng góp này.");
  if (!markRejected(id, ownerId, reason)) throw new Error("Đóng góp này đã được xử lý rồi.");
  await rm(stagedPath(id, row.ext), { force: true }).catch(() => {});
  return getContribution(id);
}

/** Dọn các đóng góp chờ duyệt quá 14 ngày. Trả về các dòng đã hết hạn. */
export async function expirePending(now = Date.now()) {
  const rows = expireStale(now - EXPIRE_AFTER_MS);
  for (const row of rows) await rm(stagedPath(row.id, row.ext), { force: true }).catch(() => {});
  return rows;
}
