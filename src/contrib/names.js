import { access } from "node:fs/promises";
import path from "node:path";

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// Path characters, control characters, invisible characters and bidi-override characters
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Sanitize a user-supplied file name so it is safe on every operating system (excluding the extension). */
export function sanitizeFileName(raw, { max = 120 } = {}) {
  const trimEdges = (s) => s.replace(/^[.\s]+|[.\s]+$/g, "");

  let name = trimEdges(String(raw ?? "").normalize("NFC").replace(UNSAFE, " ").replace(/\s+/g, " "));
  name = trimEdges([...name].slice(0, max).join(""));
  if (!name) name = "Untitled track";
  if (RESERVED.test(name)) name = `_${name}`;
  return name;
}

/** Is `target` strictly inside the `dir` folder (blocks ../ and absolute paths)? */
export function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** A path that does not yet exist in `dir`: appends " (2)", " (3)"... on name collisions. */
export async function uniquePath(dir, base, ext) {
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(dir, n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("Could not find a free file name.");
}
