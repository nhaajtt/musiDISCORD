// Back up the data folder: a consistent sqlite copy (VACUUM INTO) + JSON files + shared tags/covers, compressed as .tar.gz.
// Run inside the container: docker compose exec bot node --disable-warning=ExperimentalWarning scripts/backup.js
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SKIP = new Set(["backups", "kuma", "contrib", "library-cache.json"]);

const pad = (n) => String(n).padStart(2, "0");
export const stamp = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function tar(args, cwd) {
  // Run with relative paths: GNU tar treats "C:\..." as a remote host (only seen when testing on Windows)
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar failed (${code}): ${err.trim()}`))));
  });
}

/** Keep the newest `keep` backups and delete the rest. Returns the list of deleted files. */
export function prune(outDir, keep) {
  const files = readdirSync(outDir)
    .filter((f) => /^musidiscord-\d{8}-\d{6}\.tar\.gz$/.test(f))
    .sort()
    .reverse();
  const old = files.slice(keep);
  for (const f of old) rmSync(path.join(outDir, f), { force: true });
  return old;
}

/** Create a backup. Returns { file, bytes, pruned }. */
export async function runBackup({ dataDir, outDir = path.join(dataDir, "backups"), keep = 14, now = new Date() } = {}) {
  if (!existsSync(dataDir)) throw new Error(`Data folder not found: ${dataDir}`);
  mkdirSync(outDir, { recursive: true });

  const work = path.join(outDir, `.work-${stamp(now)}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    for (const name of readdirSync(dataDir)) {
      if (SKIP.has(name) || name.endsWith(".tmp") || /\.db-(wal|shm|journal)$/.test(name)) continue;
      const src = path.join(dataDir, name);
      const dest = path.join(work, name);
      if (name.endsWith(".db")) {
        // VACUUM INTO gives a consistent copy even while the bot is writing
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
    .then(({ file, bytes, pruned }) => console.log(`Backup created: ${file} (${(bytes / 1024).toFixed(0)} KB), removed ${pruned.length} old backups`))
    .catch((error) => {
      console.error("Backup failed:", error.message);
      process.exit(1);
    });
}
