# Pulse Photo

[![Live](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh--pulse--photo-FF8AA0?style=flat-square)](https://baditaflorin.github.io/mesh-pulse-photo/)
[![Version](https://img.shields.io/github/package-json/v/baditaflorin/mesh-pulse-photo?style=flat-square&color=a06870)](https://github.com/baditaflorin/mesh-pulse-photo/blob/main/package.json)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-2a0a16?style=flat-square)](docs/adr/0001-deployment-mode.md)

> A private, peer-to-peer pulse reading for live rooms. Your camera estimates a BPM locally; every connected phone moves with the room average.

**Live:** https://baditaflorin.github.io/mesh-pulse-photo/

Place your fingertip lightly over your phone's rear camera and torch. The phone reads the green channel of the camera frame to estimate your BPM. Every phone publishes its BPM into the mesh. All phones glow together at the room's **average BPM**, synced via mesh-time.

The first screen keeps the camera off until you choose **Allow camera & start pulse**. Camera frames and pixel samples remain on the device; peers receive only a scalar BPM (or `null`).

## Experience

| Launch                                   | Two-peer room                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| [Launch screenshot](docs/screenshot.png) | [Live two-peer preview](docs/preview.png) · [15-second demo](docs/demo.gif) |

**No rear camera or torch?** On desktop, or on iOS Safari where there is no torch API, the camera reading may not work. A **manual BPM entry** lets you type your pulse in by hand; it publishes into the exact same mesh channel the camera path uses, so the room average and the group glow behave identically either way.

## How it works

- Each phone joins a shared Yjs document over y-webrtc.
- The rear camera is opened with `getUserMedia({ video: { facingMode: 'environment' } })`. Torch is turned on via `track.applyConstraints({ advanced: [{ torch: true }] })` where supported (Android Chrome). On iOS Safari there is no torch API — see [ADR 0003](docs/adr/0003-ios-torch-caveat.md).
- A 16×16 center crop is drawn to an offscreen canvas every ~33 ms; the green-channel mean is appended to a 6-second ring buffer.
- A 1-pole HP (0.5 Hz) + LP (3 Hz) bandpasses the signal; autocorrelation finds the dominant period in the 30–180 BPM lag range. Confidence = autocorrelation peak / signal energy. See [ADR 0002](docs/adr/0002-autocorrelation-bpm.md).
- Each phone publishes `{ bpm, ts }` to Yjs awareness every 2 s (only when confidence ≥ 0.3, or whenever a BPM is entered manually — the manual value bypasses the confidence gate and writes the same `hr` awareness field).
- The screen pulses with a heartbeat-shaped envelope at the room-average BPM, phase-aligned to `meshNow()` so all phones glow in unison.

## Privacy threat model

See [docs/privacy.md](docs/privacy.md). Short version: **no camera frames or pixel data ever leave your device.** Only a scalar BPM (or null) is published to peers.

## Architecture

- **Mode A** — pure GitHub Pages, zero backend at runtime ([ADR 0001](docs/adr/0001-deployment-mode.md)).
- **WebRTC** — Yjs + y-webrtc with self-hosted signaling and TURN.
- **No GitHub Actions** — `docs/` is the built site, committed directly.

## Run it locally

```bash
git clone https://github.com/baditaflorin/mesh-pulse-photo.git
cd mesh-pulse-photo
npm ci
npm run dev
```

## Settings (in-app)

- **Room ID** — phones must share one to see each other.
- **Recalibrate** — clears the pulse buffer and restarts camera.
- **Signaling URL** / **TURN credentials URL** — override the self-hosted defaults.

All persisted to `localStorage`.

## Release media and checks

- `npm run screenshot` refreshes `docs/screenshot.png`.
- `npm run demo` records the two-peer `docs/preview.png` and `docs/demo.gif`.
- `npm run audit:security` refreshes the published security-audit report.

## Self-hosted infrastructure

| Repo                                                                   | Endpoint                               | Role                      |
| ---------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol fan-out |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds           |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                |

## ADRs

- [0001 — Deployment mode (Mode A)](docs/adr/0001-deployment-mode.md)
- [0002 — Autocorrelation BPM extraction](docs/adr/0002-autocorrelation-bpm.md)
- [0003 — iOS Safari torch caveat](docs/adr/0003-ios-torch-caveat.md)
- [0010 — GitHub Pages publishing](docs/adr/0010-pages-publishing.md)

## Not a medical device

The BPM is a rough estimate. Confidence below 0.3 means "place finger more firmly." Even at high confidence, this is a toy. Don't make medical decisions from it.

## License

[MIT](LICENSE) © 2026 Florin Badita
