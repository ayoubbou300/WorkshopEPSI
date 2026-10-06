import { Info, OctagonAlert, ShieldAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { SEVERITY_LABELS, SOURCE_LABELS, alertTitle, formatAge, formatDateTime, formatNumber } from "../format";
import type { Alert, AlertSource, Severity } from "../types";
import { PanelHeader, Segmented } from "./ui";

export const SEVERITY_ICONS: Record<Severity, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  critical: OctagonAlert,
};

export const SEVERITY_TONES = { info: "idle", warning: "warning", critical: "critical" } as const;

export function AlertsPanel({ liveAlerts, now }: { liveAlerts: Alert[]; now: number }) {
  const [source, setSource] = useState<AlertSource | "all">("all");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [history, setHistory] = useState<Alert[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPage = async (beforeId?: number) => {
    setLoading(true);
    try {
      const page = await api.alerts({ source: source === "all" ? undefined : source, severity, before_id: beforeId, limit: 30 });
      setHistory((h) => (beforeId ? [...h, ...page.items] : page.items));
      setNextBefore(page.next_before_id);
    } catch {
      /* Historique indisponible : les alertes temps réel restent affichées. */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPage();
  }, [source, severity]);

  const items = useMemo(() => {
    const byId = new Map<number, Alert>();
    for (const a of [...liveAlerts, ...history]) {
      if ((source === "all" || a.source === source) && (!severity || a.severity === severity)) byId.set(a.id, a);
    }
    return [...byId.values()].sort((a, b) => b.id - a.id);
  }, [liveAlerts, history, source, severity]);

  return (
    <section className="panel alerts">
      <PanelHeader
        icon={ShieldAlert}
        title="Journal des alertes"
        subtitle={`${items.length} affichée(s)`}
        actions={
          <div className="filters">
            <Segmented
              label="Source"
              value={source}
              onChange={setSource}
              options={[
                { value: "all", label: "Toutes" },
                { value: "vision", label: SOURCE_LABELS.vision },
                { value: "anomaly", label: SOURCE_LABELS.anomaly },
                { value: "sensor", label: SOURCE_LABELS.sensor },
              ]}
            />
            <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} aria-label="Niveau">
              <option value="">Tous niveaux</option>
              {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        }
      />
      {items.length === 0 ? (
        <div className="empty-state">
          <ShieldAlert size={22} aria-hidden />
          <p>Aucune alerte pour ces filtres.</p>
        </div>
      ) : (
        <ol className="alert-feed">
          {items.map((a) => {
            const Icon = SEVERITY_ICONS[a.severity];
            const when = a.event_ts ?? a.received_at;
            return (
              <li key={a.id} className={`alert-item sev-${a.severity}`}>
                <span className={`alert-icon tone-${SEVERITY_TONES[a.severity]}`}>
                  <Icon size={16} aria-hidden />
                </span>
                <div className="alert-body">
                  <div className="alert-line">
                    <span className="alert-title">{alertTitle(a.type)}</span>
                    <time title={formatDateTime(when)}>{formatAge(when, now)}</time>
                  </div>
                  {a.message && <p className="alert-message">{a.message}</p>}
                  <div className="alert-meta">
                    <span className={`chip sev-chip-${a.severity}`}>{SEVERITY_LABELS[a.severity]}</span>
                    <span className="chip">{SOURCE_LABELS[a.source]}</span>
                    {a.device_id && <span className="meta">{a.device_id}</span>}
                    {a.score != null && <span className="meta">score {formatNumber(a.score, 2)}</span>}
                    <span className="meta mono">{a.event_id}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {nextBefore && (
        <button type="button" className="btn btn-ghost btn-block" disabled={loading} onClick={() => fetchPage(nextBefore)}>
          {loading ? "Chargement…" : "Afficher les alertes plus anciennes"}
        </button>
      )}
    </section>
  );
}
