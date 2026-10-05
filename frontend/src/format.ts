const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatTime = (iso: string | number | null | undefined) =>
  iso == null ? "—" : timeFormat.format(new Date(iso));

export const formatDateTime = (iso: string | null | undefined) =>
  iso == null ? "—" : dateTimeFormat.format(new Date(iso));

export function formatAge(iso: string | null | undefined, now: number): string {
  if (!iso) return "jamais";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `il y a ${seconds} s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  return `il y a ${Math.floor(seconds / 3600)} h`;
}

export const SOURCE_LABELS = { sensor: "Capteur", vision: "Vision", anomaly: "Anomalie IA" } as const;
export const SEVERITY_LABELS = { info: "Info", warning: "Avertissement", critical: "Critique" } as const;
