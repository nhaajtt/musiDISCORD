// Sao lưu thư mục dữ liệu: bản sao nhất quán của sqlite (VACUUM INTO) + file JSON + thẻ/bìa dùng chung, nén .tar.gz.
// Chạy trong container: docker compose exec bot node --disable-warning=ExperimentalWarning scripts/backup.js
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SKIP = new Set(["backups", "kuma", "contrib", "library-cache.json"]);

const pad = (n) => String(n).padStart(2, "0");
export const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function tar(args, cwd) {
  // Chạy với đường dẫn tương đối: GNU tar coi "C:\..." là máy từ xa (chỉ gặp khi thử trên Windows)
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar lỗi (${code}): ${err.trim()}`))));
  });
}

/** Giữ `keep` bản mới nhất, xoá phần còn lại. Trả về danh sách file đã xoá. */
export function prune(outDir, keep) {
  const files = readdirSync(outDir)
    .filter((f) => /^musidiscord-\d{8}-\d{6}\.tar\.gz$/.test(f))
    .sort()
    .reverse();
  const old = files.slice(keep);
  for (const f of old) rmSync(path.join(outDir, f), { force: true });
  return old;
}

/** Tạo một bản sao lưu. Trả về { file, bytes, pruned }. */
export async function runBackup({ dataDir, outDir = path.join(dataDir, "backups"), keep = 14, now = new Date() } = {}) {
  if (!existsSync(dataDir)) throw new Error(`Không thấy thư mục dữ liệu: ${dataDir}`);
  mkdirSync(outDir, { recursive: true });

  const work = path.join(outDir, `.work-${stamp(now)}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    for (const name of readdirSync(dataDir)) {
      if (SKIP.has(name) || name.endsWith(".tmp") || /\.db-(wal|shm|journal)$/.test(name)) continue;
      const src = path.join(dataDir, name);
      const dest = path.join(work, name);
      if (name.endsWith(".db")) {
        // VACUUM INTO cho bản sao nhất quán dù bot đang ghi
        const db = new DatabaseSync(src, { readOnly: true });
        try {
          db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
        } finally {
          db.close();
        }
      } else if (statSync(src).isDirectory()) {
        cpSync(src, dest, { recursive: true, filter: (p) => !p.endsWith(".tmp") });
      } else {
        cpSync(src, dest);
      }
    }

    const name = `musidiscord-${stamp(now)}.tar.gz`;
    const file = path.join(outDir, name);
    await tar(["-czf", name, "-C", path.basename(work), "."], outDir);
    return { file, bytes: statSync(file).size, pruned: prune(outDir, keep) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.env.DATA_DIR || "data";
  const keep = Number(process.env.BACKUP_KEEP) > 0 ? Number(process.env.BACKUP_KEEP) : 14;
  runBackup({ dataDir, keep })
    .then(({ file, bytes, pruned }) => console.log(`Đã sao lưu: ${file} (${(bytes / 1024).toFixed(0)} KB), xoá ${pruned.length} bản cũ`))
    .catch((error) => {
      console.error("Sao lưu lỗi:", error.message);
      process.exit(1);
    });
}
