import { useCallback, useEffect, useState } from "react";
import { useLiveData, useNow } from "../useLiveData";
import type { Command } from "../types";
import { AlertsPanel } from "./AlertsPanel";
import { Charts } from "./Charts";
import { CommandPanel } from "./CommandPanel";
import { MetricCards } from "./MetricCards";
import { StatusBar, deviceHealth } from "./StatusBar";
import { VideoPanel } from "./VideoPanel";

interface Props {
  user: string;
  onLogout: () => void;
  onUnauthorized: () => void;
}

export function Dashboard({ user, onLogout, onUnauthorized }: Props) {
  const { state, dispatch } = useLiveData(onUnauthorized);
  const now = useNow();
  const devices = Object.values(state.devices);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Par défaut : le premier boîtier physique, sinon le simulateur.
  useEffect(() => {
    if (selectedId && state.devices[selectedId]) return;
    const preferred = devices.find((d) => !d.simulated) ?? devices[0];
    if (preferred) setSelectedId(preferred.id);
  }, [devices, selectedId, state.devices]);

  const device = selectedId ? state.devices[selectedId] : undefined;
  const health = deviceHealth(device, now, state.staleAfterSeconds);
  const onCommand = useCallback((command: Command) => dispatch({ type: "command", data: command }), [dispatch]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          SENTINEL<span className="accent">-X</span> <span className="subtitle">Supervision</span>
        </h1>
        <div className="topbar-right">
          {devices.length > 1 && (
            <select value={selectedId ?? ""} onChange={(e) => setSelectedId(e.target.value)} aria-label="Boîtier">
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id}
                  {d.simulated ? " (simulé)" : ""}
                </option>
              ))}
            </select>
          )}
          <span className="muted">{user}</span>
          <button className="btn btn-small" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <StatusBar socket={state.socket} mqtt={state.mqtt} device={device} now={now} staleAfterSeconds={state.staleAfterSeconds} />

      {device?.simulated && (
        <div className="banner banner-sim" role="note">
          SIMULATION : les données de {device.id} proviennent de scripts/simulate.py, pas d'un capteur physique.
        </div>
      )}
      {state.socket === "closed" && (
        <div className="banner banner-bad" role="alert">
          Connexion temps réel perdue : reconnexion en cours. Les valeurs affichées peuvent être anciennes.
        </div>
      )}
      {state.error && (
        <div className="banner banner-bad" role="alert">
          {state.error}
        </div>
      )}

      {state.loaded && devices.length === 0 ? (
        <div className="panel empty">
          <h2>Aucun boîtier n'a encore publié de mesure</h2>
          <p className="muted">
            Vérifier la connexion MQTTS de l'ESP8266, ou lancer le simulateur : <code>docker compose --profile sim up simulator</code>
          </p>
        </div>
      ) : (
        <main className="grid">
          <section className="col-main">
            <MetricCards device={device} stale={health.tone === "warn" || health.tone === "bad"} />
            <Charts series={(selectedId && state.series[selectedId]) || []} now={now} />
          </section>
          <aside className="col-side">
            <VideoPanel />
            <CommandPanel device={device} commands={state.commands} onCommand={onCommand} />
          </aside>
          <section className="col-full">
            <AlertsPanel liveAlerts={state.alerts} />
          </section>
        </main>
      )}
    </div>
  );
}
