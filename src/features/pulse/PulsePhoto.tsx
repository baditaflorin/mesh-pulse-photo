import { useEffect, useMemo, useRef, useState } from "react";
import { useCamera, useFlashlight } from "@baditaflorin/mesh-common";
import { createRoomSync } from "../sync/yjsRoom";
import { createClockSync } from "../sync/clockSync";
import { maybeFetchTurnCredentials } from "../sync/iceConfig";
import { appendSample, bufferReady, estimateBpm } from "./bpm";

type AwarenessClock = {
  clientID: number;
  setLocalStateField: (key: string, value: unknown) => void;
  getStates: () => Map<number, Record<string, unknown>>;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
};

const SAMPLE_INTERVAL_MS = 33;
const PUBLISH_INTERVAL_MS = 2000;

type Props = {
  roomId: string;
};

export function PulsePhoto({ roomId }: Props) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [roomBpm, setRoomBpm] = useState<number | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [brightness, setBrightness] = useState(0); // 0..1 envelope for the pulsing background

  const cam = useCamera({ armed, facing: "environment" });
  const torch = useFlashlight(cam.stream);
  const videoRef = cam.videoRef;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);
  const lastPublishAtRef = useRef(0);

  // Surface camera errors through the existing error UI.
  useEffect(() => {
    if (cam.error) setError(cam.error);
  }, [cam.error]);

  // Auto-engage torch once the camera is ready (pulse-photo needs the torch on
  // for the finger-over-lens reading). The hook is a no-op if unsupported.
  useEffect(() => {
    if (!armed || !cam.ready || !torch.supported || torch.on) return;
    void torch.setOn(true);
  }, [armed, cam.ready, torch.supported, torch.on, torch.setOn]);

  const torchSupported: boolean | null = !armed
    ? null
    : cam.error
      ? false
      : cam.ready
        ? torch.supported
        : null;

  const mesh = useMemo(() => {
    if (!armed) return null;
    const room = createRoomSync(roomId);
    const clock = createClockSync(room.provider);
    return { room, clock };
  }, [armed, roomId]);

  useEffect(() => {
    if (!armed) return;
    void maybeFetchTurnCredentials();
  }, [armed]);

  useEffect(() => {
    return () => {
      mesh?.clock.destroy();
      mesh?.room.provider?.destroy();
    };
  }, [mesh]);

  // Main rAF loop: sample green channel, estimate BPM, publish, draw pulse.
  useEffect(() => {
    if (!mesh) return undefined;
    let raf = 0;

    const tick = () => {
      const t = mesh.clock.meshNow();
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Sample green channel every ~33 ms
      if (video && canvas && t - lastSampleAtRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleAtRef.current = t;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && video.readyState >= 2) {
          // Draw a 16x16 center crop
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (vw > 0 && vh > 0) {
            const cropSize = Math.min(vw, vh) / 4;
            const sx = (vw - cropSize) / 2;
            const sy = (vh - cropSize) / 2;
            ctx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 16, 16);
            const data = ctx.getImageData(0, 0, 16, 16).data;
            let g = 0;
            for (let i = 0; i < data.length; i += 4) g += data[i + 1] ?? 0;
            const avgG = g / (data.length / 4);
            appendSample(bufRef.current, avgG);
          }
        }
      }

      // Estimate BPM every tick (cheap on 180 samples)
      if (bufferReady(bufRef.current)) {
        const est = estimateBpm(bufRef.current);
        if (est) {
          setBpm(est.bpm);
          setConfidence(est.confidence);
        }
      }

      // Publish BPM every 2s
      if (t - lastPublishAtRef.current > PUBLISH_INTERVAL_MS) {
        lastPublishAtRef.current = t;
        const aw = (mesh.room.provider as unknown as { awareness: AwarenessClock } | null)
          ?.awareness;
        if (aw) {
          aw.setLocalStateField("hr", {
            bpm: bpm !== null && confidence >= 0.3 ? bpm : null,
            ts: t,
          });
        }
      }

      // Compute room average BPM from awareness
      const aw = (mesh.room.provider as unknown as { awareness: AwarenessClock } | null)?.awareness;
      if (aw) {
        const states = aw.getStates();
        const bpms: number[] = [];
        let total = 0;
        states.forEach((state) => {
          total += 1;
          const hr = state["hr"] as { bpm?: number | null; ts?: number } | undefined;
          if (typeof hr?.bpm === "number" && hr.bpm > 0) bpms.push(hr.bpm);
        });
        setPeerCount(Math.max(0, total - 1));
        if (bpms.length > 0) {
          const avg = bpms.reduce((a, b) => a + b, 0) / bpms.length;
          setRoomBpm(Math.round(avg));
        } else {
          setRoomBpm(null);
        }
      }

      // Pulse envelope: brightness = 0.5 + 0.5 * sin(2π * t / period)
      // Use mesh-time so all phones glow in phase.
      const targetBpm = roomBpm ?? bpm ?? 60;
      if (targetBpm > 0) {
        const periodMs = 60000 / targetBpm;
        const phase = (t % periodMs) / periodMs;
        // Soft pulse with attack/decay rather than pure sine — heartbeat-shaped.
        const v = pulseShape(phase);
        setBrightness(v);
      } else {
        setBrightness(0);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mesh, bpm, confidence, roomBpm]);

  const onArm = () => {
    setError(null);
    setArmed(true);
  };

  const onRecalibrate = () => {
    bufRef.current = [];
    setBpm(null);
    setConfidence(0);
  };

  if (!armed) {
    return (
      <div className="pulse-arm">
        <h1>mesh-pulse-photo</h1>
        <p>
          Group heart-rate biofeedback. Place a fingertip lightly over your phone's rear camera (and
          torch). The phone reads the green channel of the camera frame to estimate your BPM. All
          phones glow together at the room's average BPM, synced in mesh-time.
        </p>
        <button type="button" className="pulse-arm-button" onClick={onArm}>
          Allow camera &amp; connect
        </button>
        {error && <p className="pulse-error">Camera error: {error}</p>}
        <p className="pulse-hint">Best with a bright torch. iOS Safari has no torch API.</p>
      </div>
    );
  }

  const ready = bufferReady(bufRef.current);
  const lowConf = !ready || confidence < 0.3;
  const targetBpm = roomBpm ?? bpm;
  const hue = 350; // pinky-red heartbeat
  const bg = `radial-gradient(ellipse at center, hsla(${hue}, 70%, ${Math.round(15 + 35 * brightness)}%, 1) 0%, hsl(${hue}, 40%, 6%) 80%)`;

  return (
    <div className="pulse-stage" style={{ background: bg }}>
      <video ref={videoRef} className="pulse-video-hidden" playsInline muted />
      <canvas ref={canvasRef} width={16} height={16} className="pulse-canvas-hidden" />

      <div className="pulse-hud">
        {peerCount + 1} phones · target {targetBpm ?? "—"} BPM
      </div>

      <div className="pulse-center">
        <div className={`pulse-bpm ${lowConf ? "pulse-bpm-dim" : ""}`}>
          {bpm ?? "—"}
          <span className="pulse-bpm-unit">BPM</span>
        </div>
        <div className="pulse-room-bpm">room avg: {roomBpm ?? "—"} BPM</div>
        {lowConf && (
          <div className="pulse-low-conf">
            {ready
              ? "Low confidence — place finger more firmly over the camera lens."
              : "Calibrating… place finger gently over the camera + torch."}
          </div>
        )}
        {torchSupported === false && (
          <div className="pulse-hint-inline">
            No torch on this device — point at a bright lamp instead.
          </div>
        )}
      </div>

      <button type="button" className="pulse-clear" onClick={onRecalibrate}>
        Recalibrate
      </button>
    </div>
  );
}

function pulseShape(phase: number): number {
  // Heart-beat-ish: fast rise, exponential decay, second small bump.
  if (phase < 0.1) return phase / 0.1;
  if (phase < 0.35) return Math.exp(-(phase - 0.1) * 8);
  if (phase < 0.42) return 0.4 * Math.exp(-(phase - 0.35) * 20);
  return 0;
}
