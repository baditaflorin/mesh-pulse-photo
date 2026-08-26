import { createMeshConfig } from "@baditaflorin/mesh-common";

export const appConfig = createMeshConfig({
  appName: "mesh-pulse-photo",
  displayName: "Pulse Photo",
  visualProfile: "studio",
  shellLayout: "inset",
  description:
    "A private, shared pulse reading for live rooms. Camera pixels stay on your device; peers receive only a BPM.",
  accentHex: "#d8b66a",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  signalingUrl:
    (import.meta.env.VITE_WEBRTC_SIGNALING as string | undefined) ?? "wss://turn.0docker.com/ws",
  turnTokenUrl:
    (import.meta.env.VITE_TURN_TOKEN_URL as string | undefined) ??
    "https://turn.0docker.com/credentials",
  paypalUrl: "https://www.paypal.com/paypalme/florinbadita",
});
