import { db } from "../db.js";

const q = {
  insert: db.prepare(
    `INSERT INTO contributions (guild_id, user_id, original_name, ext, size_bytes, sha256, title, artist, duration_ms, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ),
  get: db.prepare("SELECT * FROM contributions WHERE id = ?"),
  pending: db.prepare("SELECT * FROM contributions WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?"),
  pendingByUser: db.prepare("SELECT COUNT(*) AS n FROM contributions WHERE user_id = ? AND status = 'pending'"),
  sinceByUser: db.prepare("SELECT COUNT(*) AS n FROM contributions WHERE user_id = ? AND created_at >= ?"),
  pendingBytes: db.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS n FROM contributions WHERE status = 'pending'"),
  hashTaken: db.prepare("SELECT id, status FROM contributions WHERE sha256 = ? AND status IN ('pending', 'approving', 'approved') LIMIT 1"),
  claim: db.prepare("UPDATE contributions SET status = 'approving' WHERE id = ? AND status = 'pending'"),
  approved: db.prepare("UPDATE contributions SET status = 'approved', reviewed_by = ?, reviewed_at = ?, final_path = ? WHERE id = ?"),
  revert: db.prepare("UPDATE contributions SET status = 'pending' WHERE id = ? AND status = 'approving'"),
  rejected: db.prepare("UPDATE contributions SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reason = ? WHERE id = ? AND status = 'pending'"),
  stale: db.prepare("SELECT * FROM contributions WHERE status = 'pending' AND created_at < ?"),
  expire: db.prepare("UPDATE contributions SET status = 'expired', reviewed_at = ? WHERE id = ? AND status = 'pending'"),
  counts: db.prepare("SELECT status, COUNT(*) AS n FROM contributions GROUP BY status"),
};

export function insertContribution(c) {
  const result = q.insert.run(c.guildId ?? null, c.userId ?? null, c.originalName, c.ext, c.sizeBytes, c.sha256, c.title ?? null, c.artist ?? null, c.durationMs ?? null, c.at ?? Date.now());
  return Number(result.lastInsertRowid);
}

export const getContribution = (id) => q.get.get(id) ?? null;
export const listPending = (limit = 10) => q.pending.all(limit);
export const countPendingByUser = (userId) => Number(q.pendingByUser.get(userId).n);
export const countSince = (userId, since) => Number(q.sinceByUser.get(userId, since).n);
export const pendingBytes = () => Number(q.pendingBytes.get().n);
export const hashTaken = (sha256) => q.hashTaken.get(sha256) ?? null;

/** Giành quyền xử lý một đóng góp đang chờ (tránh hai lần duyệt cùng lúc). Trả về true nếu giành được. */
export const claimPending = (id) => Number(q.claim.run(id).changes) === 1;
export const markApproved = (id, ownerId, finalPath) => q.approved.run(ownerId, Date.now(), finalPath, id);
export const revertToPending = (id) => q.revert.run(id);
export const markRejected = (id, ownerId, reason) => Number(q.rejected.run(ownerId, Date.now(), reason ?? null, id).changes) === 1;

/** Chuyển các đóng góp chờ quá lâu sang "expired" và trả về chúng để dọn file tạm. */
export function expireStale(cutoff) {
  const rows = q.stale.all(cutoff);
  for (const row of rows) q.expire.run(Date.now(), row.id);
  return rows;
}

export function contributionCounts() {
  return Object.fromEntries(q.counts.all().map((r) => [r.status, Number(r.n)]));
}
