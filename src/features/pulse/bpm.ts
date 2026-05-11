/**
 * BPM extraction from a green-channel intensity time series.
 *
 * Pipeline:
 *   1. 1-pole high-pass at ~0.5 Hz to remove DC drift / slow shifts.
 *   2. 1-pole low-pass at ~3 Hz to suppress high-frequency noise.
 *   3. Autocorrelation over the lag range corresponding to 30–180 BPM.
 *   4. Peak lag → BPM; peak height / signal energy → confidence.
 *
 * Sample rate is assumed ~30 Hz (samples produced every ~33 ms from a
 * tiny canvas read). Window is ~6 s (≈180 samples). Returns null when
 * the buffer is shorter than the window.
 */

const SAMPLE_HZ = 30;
const WIN_SAMPLES = SAMPLE_HZ * 6; // 6-second buffer
const MIN_BPM = 30;
const MAX_BPM = 180;

export type BpmResult = {
  bpm: number;
  confidence: number;
};

export function appendSample(buf: number[], value: number): void {
  buf.push(value);
  if (buf.length > WIN_SAMPLES) buf.shift();
}

export function bufferReady(buf: number[]): boolean {
  return buf.length >= WIN_SAMPLES;
}

export function estimateBpm(buf: number[]): BpmResult | null {
  if (!bufferReady(buf)) return null;
  const x = buf.slice(-WIN_SAMPLES);
  const filtered = bandpass(x, SAMPLE_HZ, 0.5, 3.0);
  // Autocorrelation
  const minLag = Math.floor((60 * SAMPLE_HZ) / MAX_BPM); // 10 @ 30 Hz, 180 BPM
  const maxLag = Math.ceil((60 * SAMPLE_HZ) / MIN_BPM); // 60 @ 30 Hz, 30 BPM
  let energy = 0;
  for (let i = 0; i < filtered.length; i++) energy += (filtered[i] ?? 0) * (filtered[i] ?? 0);
  if (energy <= 1e-9) return { bpm: 0, confidence: 0 };
  let bestLag = -1;
  let bestPeak = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < filtered.length; lag++) {
    let r = 0;
    for (let i = 0; i + lag < filtered.length; i++) {
      r += (filtered[i] ?? 0) * (filtered[i + lag] ?? 0);
    }
    if (r > bestPeak) {
      bestPeak = r;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return null;
  const bpm = (60 * SAMPLE_HZ) / bestLag;
  const confidence = Math.max(0, Math.min(1, bestPeak / energy));
  return { bpm: Math.round(bpm), confidence };
}

/**
 * Simple 1-pole HP + 1-pole LP bandpass on a 1D time-series.
 * Not a perfect filter but adequate for the 0.5–3 Hz band on a 30 Hz signal.
 */
function bandpass(x: number[], fs: number, fLo: number, fHi: number): number[] {
  // 1-pole HP: y[n] = a * (y[n-1] + x[n] - x[n-1]); a ~= 1 - 2*pi*fLo/fs
  const aHp = Math.exp((-2 * Math.PI * fLo) / fs);
  const aLp = 1 - Math.exp((-2 * Math.PI * fHi) / fs); // simple complement
  const hp: number[] = new Array(x.length).fill(0);
  let prevHp = 0;
  let prevX = x[0] ?? 0;
  for (let n = 0; n < x.length; n++) {
    const xn = x[n] ?? 0;
    const y = aHp * (prevHp + xn - prevX);
    hp[n] = y;
    prevHp = y;
    prevX = xn;
  }
  const out: number[] = new Array(x.length).fill(0);
  let prevLp = 0;
  for (let n = 0; n < hp.length; n++) {
    const y = prevLp + aLp * ((hp[n] ?? 0) - prevLp);
    out[n] = y;
    prevLp = y;
  }
  return out;
}
