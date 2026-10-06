import { Cpu, Database, LogOut, RadioTower, Server, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatAge } from "../format";
import { deviceHealth, type Tone } from "../status";
import type { Device } from "../types";
import type { Health } from "../useHealth";
import type { SocketState } from "../useLiveData";
import { Logo, StatusDot } from "./ui";

interface Props {
  devices: Device[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  now: number;
  staleAfterSeconds: number;
  socket: SocketState;
  mqtt: "connected" | "disconnected" | "unknown";
  health: Health;
  user: string;
  onLogout: () => void;
}

function SystemRow({ icon: Icon, label, tone, value }: { icon: LucideIcon; label: string; tone: Tone; value: string }) {
  return (
    <li className="system-row">
      <Icon size={15} aria-hidden className="system-icon" />
      <span className="system-label">{label}</span>
      <span className="system-value">
        <StatusDot tone={tone} />
        {value}
      </span>
    </li>
  );
}

export function Sidebar({ devices, selectedId, onSelect, now, staleAfterSeconds, socket, mqtt, health, user, onLogout }: Props) {
  const broker = mqtt !== "unknown" ? mqtt : health.mqtt;
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">
            SENTINEL<span>-X</span>
          </div>
          <div className="brand-sub">Centre de commandement</div>
        </div>
      </div>

      <nav className="side-section" aria-label="Boîtiers">
        <h3 className="side-title">Boîtiers</h3>
        {devices.length === 0 && <p className="side-empty">Aucun boîtier détecté</p>}
        <ul className="device-list">
          {devices.map((d) => {
            const h = deviceHealth(d, now, staleAfterSeconds);
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`device-item${d.id === selectedId ? " active" : ""}`}
                  onClick={() => onSelect(d.id)}
                  aria-current={d.id === selectedId}
                >
                  <span className="device-icon">
                    <Cpu size={16} aria-hidden />
                  </span>
                  <span className="device-text">
                    <span className="device-name">
                      {d.id}
                      {d.simulated && <span className="tag">SIM</span>}
                    </span>
                    <span className="device-meta">
                      <StatusDot tone={h.tone} pulse={h.tone === "good"} />
                      {h.label} · {formatAge(d.last_seen_at, now)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="side-section" aria-label="Système">
        <h3 className="side-title">Système</h3>
        <ul className="system-list">
          <SystemRow
            icon={Server}
            label="Temps réel"
            tone={socket === "open" ? "good" : socket === "connecting" ? "warning" : "critical"}
            value={socket === "open" ? "Connecté" : socket === "connecting" ? "Connexion…" : "Perdu"}
          />
          <SystemRow
            icon={RadioTower}
            label="Broker MQTT"
            tone={broker === "connected" ? "good" : broker === "unknown" ? "idle" : "critical"}
            value={broker === "connected" ? "Connecté" : broker === "unknown" ? "—" : "Indisponible"}
          />
          <SystemRow
            icon={Database}
            label="PostgreSQL"
            tone={!health.reachable ? "critical" : health.database === "ok" ? "good" : health.database === "unknown" ? "idle" : "critical"}
            value={!health.reachable ? "Injoignable" : health.database === "ok" ? "Connectée" : health.database === "unknown" ? "—" : "Indisponible"}
          />
        </ul>
      </section>

      <footer className="side-footer">
        <span className="user">
          <span className="avatar">
            <UserRound size={15} aria-hidden />
          </span>
          {user}
        </span>
        <button type="button" className="icon-btn" onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter">
          <LogOut size={16} />
        </button>
      </footer>
    </aside>
  );
}
