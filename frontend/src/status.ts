import type { Alert, Device } from "./types";
import type { SocketState } from "./useLiveData";

export type Tone = "good" | "warning" | "critical" | "idle";

export interface DeviceHealth {
  tone: Tone;
  label: string;
  stale: boolean;
}

export function deviceHealth(device: Device | undefined, now: number, staleAfterSeconds: number): DeviceHealth {
  if (!device) return { tone: "idle", label: "Aucun boîtier", stale: true };
  if (device.mqtt_online === false) return { tone: "critical", label: "Hors ligne", stale: true };
  if (!device.last_seen_at) return { tone: "warning", label: "En attente de mesures", stale: true };
  if ((now - Date.parse(device.last_seen_at)) / 1000 > staleAfterSeconds)
    return { tone: "warning", label: "Données périmées", stale: true };
  return { tone: "good", label: "En ligne", stale: false };
}

/** Une alerte reste « active » pendant cette durée dans le statut global. */
export const ACTIVE_ALERT_MS = 2 * 60 * 1000;

export interface GlobalStatus {
  tone: Tone;
  label: string;
  detail: string;
}

export function globalStatus(params: {
  socket: SocketState;
  mqtt: "connected" | "disconnected" | "unknown";
  health: DeviceHealth;
  alerts: Alert[];
  now: number;
}): GlobalStatus {
  const { socket, mqtt, health, alerts, now } = params;
  const recent = alerts.filter((a) => now - Date.parse(a.received_at) < ACTIVE_ALERT_MS && a.severity !== "info");
  if (recent.some((a) => a.severity === "critical"))
    return { tone: "critical", label: "Alerte critique", detail: `${recent.length} alerte(s) sur les 2 dernières minutes` };
  if (recent.length > 0)
    return { tone: "warning", label: "Alerte en cours", detail: `${recent.length} alerte(s) sur les 2 dernières minutes` };
  if (socket !== "open") return { tone: "warning", label: "Connexion perdue", detail: "Reconnexion au serveur en cours" };
  if (mqtt === "disconnected") return { tone: "warning", label: "Broker indisponible", detail: "Plus aucune mesure reçue" };
  if (health.tone !== "good") return { tone: "warning", label: "Système dégradé", detail: health.label };
  return { tone: "good", label: "Système nominal", detail: "Tous les flux sont opérationnels" };
}
