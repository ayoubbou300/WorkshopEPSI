import { FlaskConical, Radar, ShieldOff, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSoundSetting } from "../sound";
import { deviceHealth, globalStatus } from "../status";
import type { Command } from "../types";
import { useHealth } from "../useHealth";
import { useLiveData, useNow } from "../useLiveData";
import { AlertToasts } from "./AlertToasts";
import { AlertsPanel } from "./AlertsPanel";
import { CommandPanel } from "./CommandPanel";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StatTiles } from "./StatTiles";
import { Telemetry } from "./Telemetry";
import { VideoPanel } from "./VideoPanel";

interface Props {
  user: string;
  onLogout: () => void;
  onUnauthorized: () => void;
}

export function Dashboard({ user, onLogout, onUnauthorized }: Props) {
  const { state, dispatch } = useLiveData(onUnauthorized);
  const health = useHealth();
  const now = useNow();
  const [soundOn, toggleSound] = useSoundSetting();
  const devices = Object.values(state.devices).sort((a, b) => Number(a.simulated) - Number(b.simulated) || a.id.localeCompare(b.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Par défaut : le premier boîtier physique, sinon le simulateur.
  useEffect(() => {
    if (selectedId && state.devices[selectedId]) return;
    const preferred = devices.find((d) => !d.simulated) ?? devices[0];
    if (preferred) setSelectedId(preferred.id);
  }, [devices, selectedId, state.devices]);

  const device = selectedId ? state.devices[selectedId] : undefined;
  const series = (selectedId && state.series[selectedId]) || [];
  const devHealth = deviceHealth(device, now, state.staleAfterSeconds);
  const status = globalStatus({ socket: state.socket, mqtt: state.mqtt, health: devHealth, alerts: state.alerts, now });
  const onCommand = useCallback((command: Command) => dispatch({ type: "command", data: command }), [dispatch]);

  return (
    <div className="shell">
      <Sidebar
        devices={devices}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        staleAfterSeconds={state.staleAfterSeconds}
        socket={state.socket}
        mqtt={state.mqtt}
        health={health}
        user={user}
        onLogout={onLogout}
      />

      <div className="main">
        <Header device={device} status={status} now={now} soundOn={soundOn} onToggleSound={toggleSound} />

        {state.socket === "closed" && (
          <div className="banner tone-critical" role="alert">
            <WifiOff size={16} aria-hidden />
            Connexion temps réel perdue — reconnexion en cours. Les valeurs affichées peuvent être anciennes.
          </div>
        )}
        {device?.simulated && (
          <div className="banner tone-warning" role="note">
            <FlaskConical size={16} aria-hidden />
            Données simulées : {device.id} est alimenté par scripts/simulate.py, pas par un capteur physique.
          </div>
        )}
        {device?.protocol === "legacy" && (
          <div className="banner tone-warning" role="note">
            <ShieldOff size={16} aria-hidden />
            Mode compatibilité : {device.id} utilise l'ancien firmware (MQTT non chiffré, commandes sans confirmation). À migrer vers MQTTS avant la démo.
          </div>
        )}
        {state.error && (
          <div className="banner tone-critical" role="alert">
            {state.error}
          </div>
        )}

        {state.loaded && devices.length === 0 ? (
          <div className="panel empty-hero">
            <span className="empty-hero-icon">
              <Radar size={30} aria-hidden />
            </span>
            <h2>En attente d'un boîtier</h2>
            <p>Aucun boîtier n'a encore publié de mesure. Vérifiez la connexion MQTTS de l'ESP8266, ou lancez le simulateur :</p>
            <code>docker compose --profile sim up -d simulator</code>
          </div>
        ) : (
          <div className="content">
            <div className="col-main">
              <StatTiles device={device} series={series} stale={devHealth.stale} now={now} />
              <Telemetry series={series} now={now} />
              <AlertsPanel liveAlerts={state.alerts} now={now} />
            </div>
            <div className="col-side">
              <VideoPanel now={now} />
              <CommandPanel device={device} commands={state.commands} now={now} onCommand={onCommand} />
            </div>
          </div>
        )}
      </div>

      <AlertToasts feed={state.liveFeed} soundOn={soundOn} />
    </div>
  );
}
