# Privacy threat model — mesh-pulse-photo

## What other peers in the same room can see

- Your most recent estimated heart-rate, published every 2 seconds as a Yjs awareness field `{ bpm: number | null, ts: number }`. When the estimator's confidence is below 0.3 we publish `null` instead.
- Plus, from the mesh clock-sync layer, your phone's wall-clock time and the per-session Yjs awareness `clientID`.

That is the entire payload on the wire. **No camera frames. No images. No raw pixel data.**

## What stays local — including video

Your camera stream goes into one `<video>` element and is sampled by drawing a 16×16 center crop to an offscreen `<canvas>` ~30 times per second. From each crop we average the green channel and keep a scalar. The pixels are never:

- shown on screen,
- encoded to a file,
- uploaded anywhere,
- written to `localStorage` or IndexedDB.

The `<video>` element is positioned 1×1 px and offscreen — what the camera sees is never displayed back to you (the only visual is the room-BPM glow, not the camera feed).

Your room ID is in `localStorage` and never leaves your device.

## What the signaling server can see

`signaling-server` (mine) sees:

- The room name (`mesh-pulse-photo:<roomId>`).
- Encrypted SDP offer/answer blobs being relayed between peers.
- The IP address of each WebSocket peer.

It does **not** see BPM values or video. Those flow peer-to-peer over WebRTC DataChannel.

## What the TURN server can see

`coturn-hetzner` (mine) relays encrypted WebRTC bytes when peers cannot connect directly. It sees IP addresses and ciphertext. It cannot decrypt the contents.

## Permissions asked

- **Camera** (rear / environment-facing). Required.
- The app attempts to turn the **torch** on via `track.applyConstraints`. On iOS Safari this is silently unavailable; see [ADR 0003](adr/0003-ios-torch-caveat.md).
- No microphone, no location, no motion.

## Health-data caveat

The BPM displayed on your screen is a rough estimate. Confidence below 0.3 = "place finger more firmly," but even at high confidence this is a toy, not a medical device. Don't use it for anything where the difference between 60 and 80 BPM matters. The room aggregate is an even rougher mean of rough estimates — its only purpose is to give the room a shared "let's all calm down together" target.

## What's NOT in the threat model

- **Inferring your identity from BPM.** A determined adversary with packet inspection could correlate your awareness `clientID` to a BPM trace. The BPM trace is not strongly identifying on its own (resting heart rates of ~60 are extremely common).
- **Adversarial peers spoofing 200 BPM forever.** Anyone in the room can `Recalibrate`. This is a "trusted group of people in a room" app.
