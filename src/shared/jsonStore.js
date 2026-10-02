import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Small JSON store in the shared folder (SHARED_DIR). Only one bot (the worker) writes; other bots call
 * `refresh()` to reload when the file changes (compared by mtime). Writes atomically via a per-pid temp file.
 */
export function createJsonStore(name, dir = config.sharedDir) {
  const file = path.join(dir, name);
  let data = {};
  let stamp = -1;

  const read = () => {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    } catch {
      data = {};
    }
  };

  return {
    file,
    /** Reloads if the file changed (or on first call). Returns true if it reloaded. */
    refresh() {
      let mtime = 0;
      try {
        mtime = statSync(file).mtimeMs;
      } catch {
        // file does not exist yet
      }
      if (mtime === stamp) return false;
      stamp = mtime;
      read();
      return true;
    },
    get: (key) => data[key],
    has: (key) => Object.hasOwn(data, key),
    keys: () => Object.keys(data),
    entries: () => Object.entries(data),
    size: () => Object.keys(data).length,
    set(key, value) {
      data[key] = value;
    },
    delete(key) {
      delete data[key];
    },
    save() {
      try {
        mkdirSync(dir, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, JSON.stringify(data));
        renameSync(tmp, file);
        stamp = statSync(file).mtimeMs;
      } catch (error) {
        console.error(`Could not save ${name}:`, error.message);
      }
    },
  };
}
