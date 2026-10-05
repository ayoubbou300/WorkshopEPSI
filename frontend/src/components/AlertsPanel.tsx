import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { SEVERITY_LABELS, SOURCE_LABELS, formatDateTime } from "../format";
import type { Alert, AlertSource, Severity } from "../types";

export function AlertsPanel({ liveAlerts }: { liveAlerts: Alert[] }) {
  const [source, setSource] = useState<AlertSource | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [history, setHistory] = useState<Alert[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPage = async (beforeId?: number) => {
    setLoading(true);
    try {
      const page = await api.alerts({ source, severity, before_id: beforeId, limit: 30 });
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
      if ((!source || a.source === source) && (!severity || a.severity === severity)) byId.set(a.id, a);
    }
    return [...byId.values()].sort((a, b) => b.id - a.id);
  }, [liveAlerts, history, source, severity]);

  return (
    <div className="panel alerts">
      <div className="alerts-head">
        <h2>Alertes</h2>
        <div className="filters">
          <select value={source} onChange={(e) => setSource(e.target.value as AlertSource | "")} aria-label="Source">
            <option value="">Toutes sources</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity | "")} aria-label="Niveau">
            <option value="">Tous niveaux</option>
            {Object.entries(SEVERITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="muted">Aucune alerte.</p>
      ) : (
        <ul className="alert-list">
          {items.map((a) => (
            <li key={a.id} className={`alert alert-${a.severity}`}>
              <div className="alert-top">
                <span className={`badge badge-${a.severity}`}>{SEVERITY_LABELS[a.severity]}</span>
                <span className="badge badge-source">{SOURCE_LABELS[a.source]}</span>
                <span className="alert-type">{a.type}</span>
                <time className="muted">{formatDateTime(a.event_ts ?? a.received_at)}</time>
              </div>
              {a.message && <p>{a.message}</p>}
              <p className="muted small">
                {a.device_id ?? "—"}
                {a.score != null && ` · score ${a.score.toFixed(2)}`} · {a.event_id}
              </p>
            </li>
          ))}
        </ul>
      )}
      {nextBefore && (
        <button className="btn btn-block" disabled={loading} onClick={() => fetchPage(nextBefore)}>
          {loading ? "Chargement…" : "Alertes plus anciennes"}
        </button>
      )}
    </div>
  );
}
