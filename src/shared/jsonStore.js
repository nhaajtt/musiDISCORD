import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Kho JSON nhỏ đặt trong thư mục dùng chung (SHARED_DIR). Chỉ một bot (worker) ghi; các bot khác gọi
 * `refresh()` để nạp lại khi file đổi (so theo mtime). Ghi nguyên tử bằng file tạm theo pid.
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
    /** Nạp lại nếu file đã đổi (hoặc lần đầu). Trả về true nếu có nạp. */
    refresh() {
      let mtime = 0;
      try {
        mtime = statSync(file).mtimeMs;
      } catch {
        // chưa có file
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
        console.error(`Không lưu được ${name}:`, error.message);
      }
    },
  };
}
