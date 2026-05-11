import { useEffect, useState } from "react";
import { PulsePhoto } from "./features/pulse/PulsePhoto";
import { SettingsDrawer } from "./features/settings/SettingsDrawer";
import { appConfig } from "./shared/config";

const STORAGE = {
  room: `${appConfig.storagePrefix}:room`,
};

function readString(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

export function App() {
  const [roomId, setRoomId] = useState(() => readString(STORAGE.room, "default"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recalKey, setRecalKey] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE.room, roomId);
  }, [roomId]);

  return (
    <div className="app-root">
      <PulsePhoto key={recalKey} roomId={roomId} />

      <button
        type="button"
        className="settings-fab"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
      >
        ⚙
      </button>

      <div className="self-ref">
        <a href={appConfig.repositoryUrl} target="_blank" rel="noreferrer">
          source
        </a>
        <span aria-hidden="true">·</span>
        <a href={appConfig.paypalUrl} target="_blank" rel="noreferrer">
          tip ♥
        </a>
        <span aria-hidden="true">·</span>
        <span>
          v{appConfig.version} · {appConfig.commit}
        </span>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        roomId={roomId}
        onRoomChange={setRoomId}
        onRecalibrate={() => setRecalKey((k) => k + 1)}
      />
    </div>
  );
}
