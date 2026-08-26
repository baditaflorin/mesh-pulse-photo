import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  MeshButton,
  MeshLaunch,
  MeshPresence,
  MeshShellConnectionBridge,
  MeshStatusPill,
  MeshSurface,
  type YRoom,
  useCamera,
  useFlashlight,
} from "@baditaflorin/mesh-common";
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
  const [guideOpen, setGuideOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [roomBpm, setRoomBpm] = useState<number | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [brightness, setBrightness] = useState(0); // 0..1 envelope for the pulsing background
  const [manualBpm, setManualBpm] = useState<number | null>(null);
  const [manualInput, setManualInput] = useState("");

  const cam = useCamera({ armed, facing: "environment" });
  const torch = useFlashlight(cam.stream);
  const videoRef = cam.videoRef;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);
  const lastPublishAtRef = useRef(0);
  const manualBpmRef = useRef<number | null>(null);
  manualBpmRef.current = manualBpm;

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

  // The feature owns the gesture-gated room, but reports that *real* room to
  // MeshShell once it exists. This gives the shared Invite/Settings chrome
  // honest diagnostics without causing a camera or connection on first load.
  const shellRoom = useMemo<YRoom | null>(() => {
    if (!mesh) return null;
    return {
      doc: mesh.room.doc,
      provider: mesh.room.provider,
      peerId: mesh.room.peerId,
      peerCount,
      roomId,
    };
  }, [mesh, peerCount, roomId]);

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

      // Publish BPM every 2s. A manually-entered BPM (desktop / no-torch
      // fallback) takes priority and bypasses the camera confidence gate —
      // it mutates the exact same awareness `hr` field the sensor writes, so
      // the room average and group glow behave identically for both paths.
      if (t - lastPublishAtRef.current > PUBLISH_INTERVAL_MS) {
        lastPublishAtRef.current = t;
        const aw = (mesh.room.provider as unknown as { awareness: AwarenessClock } | null)
          ?.awareness;
        if (aw) {
          const manual = manualBpmRef.current;
          aw.setLocalStateField("hr", {
            bpm: manual !== null ? manual : bpm !== null && confidence >= 0.3 ? bpm : null,
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

  // Manual BPM fallback — for desktop / iOS-no-torch / any device where the
  // finger-over-lens reading isn't available. Publishes the entered BPM into
  // the SAME awareness `hr` field the camera path writes, so the room average
  // and group glow propagate to peers identically. Publishes immediately
  // rather than waiting for the next 2s tick so the change crosses the mesh
  // promptly.
  const publishHrNow = (value: number | null) => {
    if (!mesh) return;
    const aw = (mesh.room.provider as unknown as { awareness: AwarenessClock } | null)?.awareness;
    aw?.setLocalStateField("hr", { bpm: value, ts: mesh.clock.meshNow() });
  };

  const onLogManualBpm = () => {
    const v = Math.round(Number(manualInput));
    if (!Number.isFinite(v) || v < 30 || v > 220) {
      setError("Enter a BPM between 30 and 220.");
      return;
    }
    setError(null);
    setManualBpm(v);
    lastPublishAtRef.current = mesh ? mesh.clock.meshNow() : Date.now();
    publishHrNow(v);
  };

  if (!armed) {
    return (
      <main className="pulse-entry-wrap">
        <MeshLaunch
          className="pulse-entry"
          eyebrow="Private room pulse"
          heading={
            <>
              Find the room’s
              <br />
              shared rhythm.
            </>
          }
          promise="Use your rear camera and light to estimate a pulse, then let every connected phone move with the room average."
          presence={
            <span className="pulse-entry-presence">Camera stays off until you choose to start</span>
          }
          preview={
            <div className="pulse-entry-preview">
              <div className="pulse-entry-preview-step">
                <span className="pulse-entry-step-number">01</span>
                <span>Cover the rear lens and torch with a fingertip.</span>
              </div>
              <div className="pulse-entry-preview-step">
                <span className="pulse-entry-step-number">02</span>
                <span>Share only a BPM with this room — never camera frames.</span>
              </div>
              {guideOpen && (
                <p className="pulse-entry-guide" id="pulse-entry-guide">
                  Works best in a dim room with a bright rear torch. On desktop or iOS Safari, you
                  can join the same room and log a manual BPM instead.
                </p>
              )}
            </div>
          }
          primaryAction={{
            label: "Allow camera & start pulse",
            onClick: onArm,
          }}
          secondaryAction={{
            label: guideOpen ? "Hide sensing guide" : "View sensing guide",
            onClick: () => setGuideOpen((open) => !open),
            "aria-controls": "pulse-entry-guide",
            "aria-expanded": guideOpen,
          }}
        />
      </main>
    );
  }

  const ready = bufferReady(bufRef.current);
  const lowConf = !ready || confidence < 0.3;
  const targetBpm = roomBpm ?? bpm;
  const captureLabel = cam.ready
    ? "Lens reading live"
    : cam.error
      ? "Manual BPM ready"
      : "Preparing lens";
  const captureTone = cam.ready ? "live" : cam.error ? "warning" : "info";
  const visibleError = cam.error ? cameraErrorCopy(cam.error) : error;
  const stageStyle = { "--pulse-level": String(brightness) } as CSSProperties;

  return (
    <main className="pulse-stage" style={stageStyle} aria-label="Pulse reading workspace">
      <video ref={videoRef} className="pulse-video-hidden" playsInline muted />
      <canvas ref={canvasRef} width={16} height={16} className="pulse-canvas-hidden" />
      <MeshShellConnectionBridge room={shellRoom} />

      <div className="pulse-workbench">
        <header className="pulse-stage-header">
          <div className="pulse-room-label">
            <span>Live room</span>
            <strong>{roomId}</strong>
          </div>
          <div className="pulse-stage-status">
            <MeshStatusPill tone={captureTone} dot>
              {captureLabel}
            </MeshStatusPill>
            <MeshPresence
              count={peerCount + 1}
              label={peerCount + 1 === 1 ? "device in room" : "devices in room"}
              state={mesh?.room.provider ? "connected" : "connecting"}
              announce="polite"
            />
          </div>
        </header>

        <div className="pulse-stage-grid">
          <MeshSurface as="section" tone="accent" padding="lg" className="pulse-reading-panel">
            <div className="pulse-reading-kicker">
              <span>Current reading</span>
              <span>{targetBpm ? `Room target ${targetBpm} BPM` : "Waiting for a reading"}</span>
            </div>

            <div className="pulse-meter" aria-hidden="true">
              <div
                className={`pulse-bpm ${manualBpm === null && lowConf ? "pulse-bpm-dim" : ""}`}
                data-testid="local-bpm"
              >
                {manualBpm ?? bpm ?? "—"}
                <span className="pulse-bpm-unit">BPM</span>
              </div>
            </div>

            <div className="pulse-room-bpm" data-testid="room-bpm">
              <span>room avg:</span> <strong>{roomBpm ?? "—"} BPM</strong>
            </div>

            {manualBpm === null && lowConf && (
              <p className="pulse-low-conf">
                {ready
                  ? "Low confidence — cover the lens more completely."
                  : "Calibrating — cover the rear lens and torch with your fingertip."}
              </p>
            )}
          </MeshSurface>

          <MeshSurface as="aside" tone="raised" padding="lg" className="pulse-support-panel">
            <div>
              <p className="pulse-support-eyebrow">Sensor notes</p>
              <h2>Keep the reading local.</h2>
              <p className="pulse-support-copy">
                Camera pixels are sampled only on this device. The room receives a BPM, not an image
                or video stream.
              </p>
            </div>

            {torchSupported === false && (
              <p className="pulse-hint-inline">
                This device has no torch control. Use a bright lamp or enter a manual BPM.
              </p>
            )}

            {visibleError && (
              <p className="pulse-error" role="alert">
                {visibleError}
              </p>
            )}

            <div className="pulse-manual">
              <label htmlFor="pulse-manual-input">Manual BPM</label>
              <div className="pulse-manual-controls">
                <input
                  id="pulse-manual-input"
                  type="number"
                  min={30}
                  max={220}
                  inputMode="numeric"
                  className="pulse-manual-input"
                  aria-label="Enter BPM manually"
                  placeholder="BPM"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <MeshButton variant="secondary" onClick={onLogManualBpm}>
                  Log BPM manually
                </MeshButton>
              </div>
            </div>

            <MeshButton variant="quiet" size="sm" className="pulse-clear" onClick={onRecalibrate}>
              Recalibrate sensor
            </MeshButton>
          </MeshSurface>
        </div>

        <footer className="pulse-stage-footer">
          A room-average light cue for shared moments — not a medical measurement.
        </footer>
      </div>
    </main>
  );
}

function pulseShape(phase: number): number {
  // Heart-beat-ish: fast rise, exponential decay, second small bump.
  if (phase < 0.1) return phase / 0.1;
  if (phase < 0.35) return Math.exp(-(phase - 0.1) * 8);
  if (phase < 0.42) return 0.4 * Math.exp(-(phase - 0.35) * 20);
  return 0;
}

function cameraErrorCopy(error: string): string {
  const normalized = error.toLowerCase();
  if (/notallowed|permission|denied/.test(normalized)) {
    return "Camera permission was not granted. You can stay in this room and log a manual BPM instead.";
  }
  if (/notfound|not supported|unavailable/.test(normalized)) {
    return "Camera sensing is unavailable on this device. You can stay in this room and log a manual BPM instead.";
  }
  return "Camera sensing could not start. You can stay in this room and log a manual BPM instead.";
}
