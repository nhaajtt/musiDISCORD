import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "../config.js";
import { computeFeatures } from "./features.js";

const SAMPLE_RATE = 22050;
const CLIP_SECONDS = 40;
const TIMEOUT_MS = 60_000;

/** Giải mã một đoạn giữa bài về PCM float32 mono bằng ffmpeg (một tiến trình, ưu tiên thấp). */
export function decodeClip(abs, durationMs, { spawnFn = spawn } = {}) {
  const startSec = durationMs && durationMs / 1000 > CLIP_SECONDS + 10 ? Math.floor(durationMs / 2000 - CLIP_SECONDS / 2) : 0;
  const args = ["-v", "error", "-ss", String(startSec), "-t", String(CLIP_SECONDS), "-i", abs, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-threads", "1", "-f", "f32le", "pipe:1"];

  return new Promise((resolve, reject) => {
    const child = spawnFn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });
    const chunks = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg quá thời gian"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (c) => chunks.push(c));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffmpeg thoát với mã ${code}`));
      const buf = Buffer.concat(chunks);
      const aligned = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4));
      resolve(new Float32Array(aligned));
    });
  });
}

/** Phân tích một bài trong thư viện (đường dẫn tương đối). Trả về đặc trưng hoặc null nếu không phân tích được. */
export async function analyzeFile(rel, durationMs, deps = {}) {
  const samples = await decodeClip(path.join(config.musicDir, rel), durationMs, deps);
  return computeFeatures(samples, SAMPLE_RATE);
}
