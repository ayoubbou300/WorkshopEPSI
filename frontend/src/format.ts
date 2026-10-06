const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const shortTimeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatTime = (iso: string | number | null | undefined) =>
  iso == null ? "—" : timeFormat.format(new Date(iso));

export const formatShortTime = (t: number) => shortTimeFormat.format(new Date(t));

export const formatDateTime = (iso: string | null | undefined) =>
  iso == null ? "—" : dateTimeFormat.format(new Date(iso));

export function formatAge(iso: string | null | undefined, now: number): string {
  if (!iso) return "jamais";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return `il y a ${Math.floor(seconds / 86400)} j`;
}

export const formatNumber = (value: number, digits = 1) =>
  value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const SOURCE_LABELS = { sensor: "Capteur", vision: "Vision", anomaly: "Anomalie IA" } as const;
export const SEVERITY_LABELS = { info: "Info", warning: "Avertissement", critical: "Critique" } as const;

const ALERT_TYPE_LABELS: Record<string, string> = {
  person_detected: "Présence humaine détectée",
  intrusion: "Intrusion détectée",
  env_anomaly: "Anomalie environnementale",
  gas_anomaly: "Anomalie de gaz",
  temperature_anomaly: "Anomalie de température",
  motion_detected: "Mouvement détecté",
  device_offline: "Boîtier hors ligne",
};

/** Libellé lisible d'un type d'alerte ; à défaut, le type brut mis en forme. */
export function alertTitle(type: string): string {
  if (ALERT_TYPE_LABELS[type]) return ALERT_TYPE_LABELS[type];
  const text = type.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
