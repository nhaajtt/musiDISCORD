// Tính đặc trưng âm thanh bằng JS thuần: năng lượng, độ sáng, nhịp độ (BPM ước lượng), tâm trạng.

const FRAME = 1024;
const HOP = 512;
const MIN_BPM = 70;
const MAX_BPM = 180;

export const MOODS = ["chill", "steady", "upbeat", "hype"];

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** FFT cơ số 2 tại chỗ. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const WINDOW = Float32Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));

export function moodOf(bpm, energy) {
  if (bpm == null) return energy >= 0.6 ? "upbeat" : energy < 0.4 ? "chill" : "steady";
  if (energy >= 0.7 && bpm >= 120) return "hype";
  if (energy >= 0.5 && bpm >= 100) return "upbeat";
  if (energy < 0.4 || bpm < 90) return "chill";
  return "steady";
}

/** Ước lượng BPM từ đường bao onset bằng tự tương quan (chuẩn hoá theo độ dài, nội suy parabol). */
function estimateBpm(onset, frameRate) {
  const n = onset.length;
  if (n < frameRate * 6) return null;

  const mean = onset.reduce((a, b) => a + b, 0) / n;
  // Làm mượt nhẹ để đỉnh tự tương quan rộng hơn một khung, đỡ lệch do làm tròn lag
  const x = onset.map((v, i) => Math.max(0, 0.25 * (onset[i - 1] ?? v) + 0.5 * v + 0.25 * (onset[i + 1] ?? v) - mean));
  if (!x.some((v) => v > 0)) return null;

  const minLag = Math.floor((60 / MAX_BPM) * frameRate);
  const maxLag = Math.min(Math.ceil((60 / MIN_BPM) * frameRate), n - 2);
  const top = Math.min(maxLag * 2 + 2, n - 1);
  const ac = new Float64Array(top + 1);
  for (let lag = minLag - 1; lag <= top; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
    ac[lag] = sum / (n - lag);
  }

  let best = -1;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    // Ưu tiên nhẹ vùng nhịp phổ biến để tránh nhầm sang gấp đôi / một nửa
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const score = (ac[lag] + 0.5 * (ac[lag * 2] ?? 0)) * prior;
    if (score > bestScore && ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      bestScore = score;
      best = lag;
    }
  }
  if (best < 0) return null;

  const a = ac[best - 1];
  const b = ac[best];
  const c = ac[best + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? clamp((0.5 * (a - c)) / denom, -0.5, 0.5) : 0;
  return Math.round(((60 * frameRate) / (best + shift)) * 10) / 10;
}

/**
 * Tính đặc trưng từ mẫu PCM mono. `samples`: Float32Array biên độ -1..1.
 * Trả về { bpm|null, energy 0..1, brightness 0..1, mood } hoặc null nếu quá ngắn/im lặng.
 */
export function computeFeatures(samples, sampleRate = 22050) {
  const frames = Math.floor((samples.length - FRAME) / HOP) + 1;
  if (frames < 8) return null;

  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  const prev = new Float64Array(FRAME / 2);
  const flux = new Float64Array(frames);
  let sumSq = 0;
  let centroidSum = 0;
  let centroidWeight = 0;

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[off + i];
      re[i] = s * WINDOW[i];
      im[i] = 0;
      sumSq += s * s;
    }
    fft(re, im);

    let fl = 0;
    let magSum = 0;
    let weighted = 0;
    for (let k = 1; k < FRAME / 2; k++) {
      const mag = Math.log1p(Math.hypot(re[k], im[k]) / 16);
      const d = mag - prev[k];
      if (d > 0) fl += d;
      prev[k] = mag;
      magSum += mag;
      weighted += mag * k;
    }
    flux[f] = f === 0 ? 0 : fl;
    if (magSum > 0) {
      centroidSum += (weighted / magSum) * (sampleRate / FRAME);
      centroidWeight++;
    }
  }

  const rms = Math.sqrt(sumSq / (frames * FRAME));
  if (rms < 1e-4) return null;
  const rmsDb = 20 * Math.log10(rms);
  const energy = Math.round(clamp((rmsDb + 24) / 20) * 100) / 100;
  const centroid = centroidWeight ? centroidSum / centroidWeight : 0;
  const brightness = Math.round(clamp(centroid / 4000) * 100) / 100;
  const bpm = estimateBpm(Array.from(flux), sampleRate / HOP);

  return { bpm, energy, brightness, loudness: Math.round(rmsDb * 10) / 10, mood: moodOf(bpm, energy) };
}

/** Khoảng cách giữa hai bộ đặc trưng (nhỏ = giống nhau); nhịp độ tính theo cả nửa/gấp đôi. */
export function distance(a, b) {
  const bpmDist =
    a.bpm != null && b.bpm != null ? Math.min(1, Math.min(Math.abs(a.bpm - b.bpm), Math.abs(2 * a.bpm - b.bpm), Math.abs(a.bpm - 2 * b.bpm)) / 60) : 0.4;
  const e = a.energy - b.energy;
  const br = a.brightness - b.brightness;
  return Math.sqrt(bpmDist ** 2 + 1.5 * e ** 2 + 0.7 * br ** 2);
}
