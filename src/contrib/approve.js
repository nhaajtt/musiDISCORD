import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import * as library from "../library/index.js";
import { isInside, sanitizeFileName, uniquePath } from "./names.js";
import { stagedPath } from "./ingest.js";
import { claimPending, expireStale, getContribution, markApproved, markRejected, revertToPending } from "./store.js";

const EXPIRE_AFTER_MS = 14 * 86_400_000;

/** Move a file; if it is on a different drive, copy it and delete the original. */
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
 * Bot owner approves a contribution: move the file into music/<contributions folder>/ and rescan the library.
 * Returns { row, file } (file is the relative path inside music/).
 */
export async function approveContribution({ id, ownerId, scan = library.scan }) {
  const row = getContribution(id);
  if (!row) throw new Error("No such contribution.");
  if (!claimPending(id)) throw new Error("This contribution has already been handled.");

  try {
    const destDir = path.join(config.musicDir, config.contributions.folder);
    await mkdir(destDir, { recursive: true });

    const base = sanitizeFileName(`${row.artist ? `${row.artist} - ` : ""}${row.title ?? row.original_name}`);
    const dest = await uniquePath(destDir, base, row.ext);
    if (!isInside(destDir, dest)) throw new Error("Invalid destination path.");

    await moveFile(stagedPath(id, row.ext), dest);

    const file = path.posix.join(config.contributions.folder, path.basename(dest));
    markApproved(id, ownerId, file);
    await scan().catch((error) => console.error("Library scan after approval failed:", error));
    return { row: getContribution(id), file };
  } catch (error) {
    revertToPending(id);
    throw error;
  }
}

/** Bot owner rejects a contribution: delete the temp file and record the reason. */
export async function rejectContribution({ id, ownerId, reason }) {
  const row = getContribution(id);
  if (!row) throw new Error("No such contribution.");
  if (!markRejected(id, ownerId, reason)) throw new Error("This contribution has already been handled.");
  await rm(stagedPath(id, row.ext), { force: true }).catch(() => {});
  return getContribution(id);
}

/** Clean up contributions pending for more than 14 days. Returns the expired rows. */
export async function expirePending(now = Date.now()) {
  const rows = expireStale(now - EXPIRE_AFTER_MS);
  for (const row of rows) await rm(stagedPath(row.id, row.ext), { force: true }).catch(() => {});
  return rows;
}
