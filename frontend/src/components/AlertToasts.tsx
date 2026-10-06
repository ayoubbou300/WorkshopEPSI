import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SEVERITY_LABELS, SOURCE_LABELS, alertTitle, formatNumber, formatTime } from "../format";
import { playAlertSound } from "../sound";
import type { Alert } from "../types";
import { SEVERITY_ICONS, SEVERITY_TONES } from "./AlertsPanel";

const AUTO_DISMISS_MS = 9000;

/**
 * Notifications des alertes reçues en temps réel. Les critiques restent affichées
 * jusqu'à acquittement ; les autres disparaissent seules.
 */
export function AlertToasts({ feed, soundOn }: { feed: Alert[]; soundOn: boolean }) {
  const [visible, setVisible] = useState<Alert[]>([]);
  const seen = useRef(new Set<number>());

  useEffect(() => {
    const fresh = feed.filter((a) => !seen.current.has(a.id));
    if (fresh.length === 0) return;
    fresh.forEach((a) => seen.current.add(a.id));
    setVisible((v) => [...fresh, ...v].slice(0, 4));
    const loudest = fresh.find((a) => a.severity === "critical") ?? fresh[0];
    if (soundOn) playAlertSound(loudest.severity);
    fresh
      .filter((a) => a.severity !== "critical")
      .forEach((a) => window.setTimeout(() => setVisible((v) => v.filter((x) => x.id !== a.id)), AUTO_DISMISS_MS));
  }, [feed, soundOn]);

  const dismiss = (id: number) => setVisible((v) => v.filter((x) => x.id !== id));

  return (
    <div className="toasts" aria-live="assertive">
      {visible.map((a) => {
        const Icon = SEVERITY_ICONS[a.severity];
        return (
          <div key={a.id} className={`toast sev-${a.severity}`} role="alert">
            <span className={`alert-icon tone-${SEVERITY_TONES[a.severity]}`}>
              <Icon size={18} aria-hidden />
            </span>
            <div className="toast-body">
              <div className="toast-top">
                <span className="toast-kicker">
                  {SEVERITY_LABELS[a.severity]} · {SOURCE_LABELS[a.source]}
                </span>
                <time>{formatTime(a.event_ts ?? a.received_at)}</time>
              </div>
              <p className="toast-title">{alertTitle(a.type)}</p>
              {a.message && <p className="toast-message">{a.message}</p>}
              <p className="toast-meta">
                {a.device_id ?? "—"}
                {a.score != null && ` · score ${formatNumber(a.score, 2)}`}
              </p>
            </div>
            <button type="button" className="icon-btn icon-btn-sm" onClick={() => dismiss(a.id)} aria-label={a.severity === "critical" ? "Acquitter l'alerte" : "Fermer"} title={a.severity === "critical" ? "Acquitter" : "Fermer"}>
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
