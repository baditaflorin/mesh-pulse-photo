---
status: accepted
date: 2026-05-12
---

# 0003 — iOS Safari torch caveat

## Context

The PPG signal-to-noise ratio depends heavily on a strong, **constant** light source illuminating the capillaries of the fingertip. On Android Chrome we can turn the phone's torch on via `track.applyConstraints({ advanced: [{ torch: true }] })` — this is a standardised non-standard extension that's been shipping for years.

iOS Safari does not expose any torch API. The standardised `MediaTrackCapabilities.torch` is `undefined`. Without a torch, the only light reaching the sensor is whatever ambient light bends around the fingertip — much weaker, and proportional to room brightness rather than a stable, constant source.

## Decision

- We attempt to enable the torch on arm. If `track.getCapabilities()?.torch` is `true`, we apply it.
- If `track.getCapabilities()?.torch` is `false` or `undefined`, we surface an inline hint in the active UI: **"No torch on this device — point at a bright lamp instead."**
- We **do not** fall back to a different sensing modality (e.g. front camera + screen brightness as a light source). The PPG mechanics still work in good ambient light; we tell the user to find some.
- The estimator's confidence score handles the rest: if the signal is too noisy, the user sees a "Low confidence — place finger more firmly" message and the room aggregate doesn't see a published reading.

## Consequences

- iOS users in bright daylight or under a desk lamp: works. Confidence builds in ~10 s.
- iOS users in a dim room: doesn't work. The UI tells them why.
- Android users: works out of the box.
- The codebase doesn't have to maintain two signal-extraction paths — the front-camera-with-screen-as-light trick is a different geometry (lens isn't being covered) and would be a different mechanic.

## Alternatives considered

- **Pivot the whole app to front-camera + face-RPPG (forehead skin colour modulation).** A real and well-studied technique but ML-grade complexity for a robust implementation, and a different threat model (we'd be looking at people's faces, not fingertips). Rejected for v1.
- **Lie and pretend torch is on.** Considered briefly, rejected — we'd be a sensor that silently doesn't work.
- **Refuse to start on iOS Safari.** Punishing the user for their browser choice; the mechanic actually works in good light. Rejected.

## What we tell the user

- Arm screen: "Best with a bright torch. iOS Safari has no torch API."
- In-app, if torch capability is `false`: "No torch on this device — point at a bright lamp instead."
- Privacy doc is explicit: we attempt to enable the torch on arm.
