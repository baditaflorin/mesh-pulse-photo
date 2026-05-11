---
status: accepted
date: 2026-05-12
---

# 0002 — Autocorrelation BPM extraction from a green-channel time series

## Context

We want a BPM estimate from a phone camera, in the browser, in real time, without ML. The classic photoplethysmography (PPG) approach works on a phone: with a finger over the lens and the torch on, the volume of blood in the capillaries modulates the amount of light reaching the sensor. The green channel is the most sensitive to this modulation (hemoglobin absorption peak around 540 nm).

The signal is noisy: hand tremor, finger motion, ambient light shifts, the sensor's own AGC, occasional dropped frames. We need to find a periodicity in the 0.5–3 Hz band (30–180 BPM) on a buffer of about 6 seconds (180 samples at 30 Hz).

## Decision

Pipeline:

1. Every ~33 ms, draw a 16×16 center crop of the live video frame to a tiny offscreen canvas, average the green channel, and append the scalar to a ring buffer.
2. When the buffer holds 180 samples (~6 s), filter:
   - **1-pole high-pass at 0.5 Hz** — removes DC and slow drift.
   - **1-pole low-pass at 3 Hz** — suppresses high-frequency noise (camera AGC, hand tremor).
3. **Autocorrelation** over the lag range corresponding to 30–180 BPM (lags of 10 to 60 samples at 30 Hz). For each lag, compute `r(lag) = Σ x[i] · x[i+lag]` and pick the lag with the highest correlation.
4. `BPM = (60 × sampleHz) / bestLag`.
5. **Confidence** = peak height / signal energy. If confidence < 0.3, we display the value dimmed and tell the user to seat the finger more firmly.

## Consequences

- Autocorrelation is faster than an FFT on this buffer size (just a 50-lag inner loop on 180 samples — about 9 000 multiplies, trivial). No FFT library needed.
- Robust to non-perfect periodicity. A heartbeat has variable inter-beat intervals (HRV) and the dominant FFT frequency can drift away from the actual mean rate; autocorrelation finds the most-coherent lag and ignores the rest.
- The confidence score gates the published BPM — peers only see your reading once it stabilises, so the room average isn't polluted by warm-up noise.

## Alternatives considered

- **FFT (Welch, periodogram).** Equivalent accuracy after a bit more code. Requires a windowing decision, zero-padding, and a more complex peak-pick. Rejected — autocorrelation is simpler.
- **Time-domain peak counting.** Cheap, but very sensitive to threshold choice and motion artifacts. Rejected.
- **Frequency-domain CFAR / matched filter.** Overkill for a biofeedback toy.

## Caveats

- The 1-pole filters have soft skirts — significant energy leaks in around 0.3 Hz and 5 Hz. In practice this doesn't cause misclassification because the autocorrelation peak picker only searches the 30–180 BPM lag range.
- Settling time is ~6 s (one full window). The buffer must fill before the first estimate.
- Hand tremor in the 8–12 Hz band is above our LP cutoff but still bleeds in. Encouraging the user to rest their hand on a stable surface helps more than tighter filtering.
