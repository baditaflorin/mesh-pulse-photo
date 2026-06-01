import { describe, expect, it } from "vitest";
import { appendSample, bufferReady, estimateBpm } from "../../src/features/pulse/bpm";

/**
 * Unit coverage for the actual "reads your pulse" core: the green-channel
 * BPM extractor (1-pole bandpass → autocorrelation → lag→BPM). This logic
 * is pure and deterministic but never ran outside a live camera before, so
 * a regression in the filter or the lag math would have shipped silently.
 *
 * Strategy: synthesise a green-channel time series that LOOKS like a real
 * fingertip-over-lens reading — a DC offset (the lens is bright) plus a small
 * sinusoidal ripple at a known heart rate — and assert the extractor recovers
 * that rate. The sample rate is 30 Hz and the window is 6 s (180 samples), so
 * the autocorrelation lag is an integer and BPM = 1800 / lag is quantised; we
 * pick rates that land near exact lags and allow ±2 BPM for quantisation.
 */

const SAMPLE_HZ = 30;
const WIN = SAMPLE_HZ * 6; // 180

/** Build a full-window buffer: bright DC + a clean pulse ripple at `bpm`. */
function syntheticPulse(bpm: number, ripple = 6, dc = 180): number[] {
  const freqHz = bpm / 60;
  const buf: number[] = [];
  for (let n = 0; n < WIN; n++) {
    const t = n / SAMPLE_HZ;
    buf.push(dc + ripple * Math.sin(2 * Math.PI * freqHz * t));
  }
  return buf;
}

describe("appendSample / bufferReady", () => {
  it("caps the ring buffer at the 6-second window", () => {
    const buf: number[] = [];
    for (let i = 0; i < WIN + 50; i++) appendSample(buf, i);
    expect(buf.length).toBe(WIN);
    // Oldest samples are dropped: the first retained value is the 51st push.
    expect(buf[0]).toBe(50);
  });

  it("is not ready until the window is full", () => {
    const buf: number[] = [];
    for (let i = 0; i < WIN - 1; i++) appendSample(buf, 100);
    expect(bufferReady(buf)).toBe(false);
    appendSample(buf, 100);
    expect(bufferReady(buf)).toBe(true);
  });
});

describe("estimateBpm", () => {
  it("returns null when the buffer is shorter than the window", () => {
    expect(estimateBpm([1, 2, 3])).toBeNull();
  });

  it("reports zero BPM / zero confidence on a flat (DC-only) signal", () => {
    // A finger that isn't moving = no ripple. The bandpass removes the DC,
    // leaving ~no energy, so the extractor must not hallucinate a heart rate.
    const flat = new Array(WIN).fill(200);
    const res = estimateBpm(flat);
    expect(res).not.toBeNull();
    expect(res!.bpm).toBe(0);
    expect(res!.confidence).toBe(0);
  });

  it("recovers a 60 BPM pulse from a synthetic green-channel ripple", () => {
    const res = estimateBpm(syntheticPulse(60));
    expect(res).not.toBeNull();
    expect(res!.bpm).toBeGreaterThanOrEqual(58);
    expect(res!.bpm).toBeLessThanOrEqual(62);
    // A clean single-tone ripple should be high-confidence.
    expect(res!.confidence).toBeGreaterThan(0.3);
  });

  it("recovers a faster 120 BPM pulse (distinguishes rates, not a constant)", () => {
    const res = estimateBpm(syntheticPulse(120));
    expect(res).not.toBeNull();
    expect(res!.bpm).toBeGreaterThanOrEqual(116);
    expect(res!.bpm).toBeLessThanOrEqual(124);
    expect(res!.confidence).toBeGreaterThan(0.3);
  });

  it("keeps the estimate inside the 30–180 BPM search band", () => {
    // Even fed a frequency outside the plausible band, the lag search clamps
    // the answer to the configured 30–180 BPM range.
    const res = estimateBpm(syntheticPulse(240, 6));
    expect(res).not.toBeNull();
    expect(res!.bpm).toBeGreaterThanOrEqual(30);
    expect(res!.bpm).toBeLessThanOrEqual(180);
  });
});
