import { access } from "node:fs/promises";
import path from "node:path";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// Ký tự đường dẫn, ký tự điều khiển, ký tự ẩn và ký tự đổi chiều chữ
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Làm sạch tên file do người dùng cung cấp để dùng an toàn trên mọi hệ điều hành (không gồm phần mở rộng). */
export function sanitizeFileName(raw, { max = 120 } = {}) {
  const trimEdges = (s) => s.replace(/^[.\s]+|[.\s]+$/g, "");

  let name = trimEdges(String(raw ?? "").normalize("NFC").replace(UNSAFE, " ").replace(/\s+/g, " "));
  name = trimEdges([...name].slice(0, max).join(""));
  if (!name) name = "Bài không tên";
  if (RESERVED.test(name)) name = `_${name}`;
  return name;
}

/** `target` có nằm hẳn bên trong thư mục `dir` không (chặn ../ và đường dẫn tuyệt đối)? */
export function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Đường dẫn chưa tồn tại trong `dir`: thêm hậu tố " (2)", " (3)"... khi trùng tên. */
export async function uniquePath(dir, base, ext) {
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(dir, n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("Không tìm được tên file trống.");
}
