export const appConfig = {
  appName: "mesh-pulse-photo",
  storagePrefix: "mesh-pulse-photo",
  description:
    "Group heart-rate biofeedback — phones read pulse via the rear camera and glow at the room's average BPM.",
  accentHex: "#ff8a9a",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
  repositoryUrl: "https://github.com/baditaflorin/mesh-pulse-photo",
  pagesUrl: "https://baditaflorin.github.io/mesh-pulse-photo/",
  signalingUrl:
    (import.meta.env.VITE_WEBRTC_SIGNALING as string | undefined) ?? "wss://turn.0docker.com/ws",
  turnTokenUrl:
    (import.meta.env.VITE_TURN_TOKEN_URL as string | undefined) ??
    "https://turn.0docker.com/credentials",
  paypalUrl: "https://www.paypal.com/paypalme/florinbadita",
} as const;
