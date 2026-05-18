import { useEffect, useState } from "react";
import { MeshShell } from "@baditaflorin/mesh-common";
import { PulsePhoto } from "./features/pulse/PulsePhoto";
import { SettingsExtras } from "./features/settings/SettingsExtras";
import { appConfig } from "./shared/config";

const STORAGE = {
  room: `${appConfig.storagePrefix}:room`,
};

function readString(key: string, fallback: string): string {
  return localStorage.getItem(key) ?? fallback;
}

export function App() {
  const [roomId, setRoomId] = useState(() => readString(STORAGE.room, "default"));
  const [recalKey, setRecalKey] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE.room, roomId);
  }, [roomId]);

  return (
    <MeshShell
      config={appConfig}
      roomId={roomId}
      onRoomChange={setRoomId}
      settingsExtras={<SettingsExtras onRecalibrate={() => setRecalKey((k) => k + 1)} />}
    >
      <PulsePhoto key={recalKey} roomId={roomId} />
    </MeshShell>
  );
}
