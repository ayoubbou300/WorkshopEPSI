import { formatAge, formatTime } from "../format";
import type { Device } from "../types";
import type { SocketState } from "../useLiveData";

type Tone = "ok" | "warn" | "bad" | "idle";

function Pill({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <div className={`pill pill-${tone}`}>
      <span className="dot" aria-hidden />
      <span className="pill-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function deviceHealth(device: Device | undefined, now: number, staleAfterSeconds: number) {
  if (!device) return { tone: "idle" as Tone, text: "Aucun boîtier" };
  if (device.mqtt_online === false) return { tone: "bad" as Tone, text: "Hors ligne" };
  if (!device.last_seen_at) return { tone: "warn" as Tone, text: "Aucune mesure" };
  const age = (now - Date.parse(device.last_seen_at)) / 1000;
  if (age > staleAfterSeconds) return { tone: "warn" as Tone, text: "Données périmées" };
  return { tone: "ok" as Tone, text: "En ligne" };
}

interface Props {
  socket: SocketState;
  mqtt: "connected" | "disconnected" | "unknown";
  device: Device | undefined;
  now: number;
  staleAfterSeconds: number;
}

export function StatusBar({ socket, mqtt, device, now, staleAfterSeconds }: Props) {
  const health = deviceHealth(device, now, staleAfterSeconds);
  return (
    <div className="status-bar" role="status">
      <Pill
        tone={socket === "open" ? "ok" : socket === "connecting" ? "warn" : "bad"}
        label="Serveur"
        value={socket === "open" ? "Connecté" : socket === "connecting" ? "Connexion…" : "Perdu"}
      />
      <Pill
        tone={mqtt === "connected" ? "ok" : mqtt === "unknown" ? "idle" : "bad"}
        label="Broker MQTT"
        value={mqtt === "connected" ? "Connecté" : mqtt === "unknown" ? "—" : "Indisponible"}
      />
      <Pill tone={health.tone} label={device ? `Boîtier ${device.id}` : "Boîtier"} value={health.text} />
      <Pill
        tone={health.tone === "ok" ? "ok" : "idle"}
        label="Dernière mesure"
        value={device?.last_seen_at ? `${formatTime(device.last_seen_at)} (${formatAge(device.last_seen_at, now)})` : "—"}
      />
    </div>
  );
}
