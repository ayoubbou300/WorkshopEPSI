import { Bell, BellOff } from "lucide-react";
import { formatTime } from "../format";
import type { GlobalStatus } from "../status";
import type { Device } from "../types";
import { StatusPill } from "./ui";

interface Props {
  device: Device | undefined;
  status: GlobalStatus;
  now: number;
  soundOn: boolean;
  onToggleSound: () => void;
}

export function Header({ device, status, now, soundOn, onToggleSound }: Props) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Vue d'ensemble</p>
        <h1>
          {device ? `Boîtier ${device.id}` : "Supervision"}
          {device?.simulated && <span className="tag tag-lg">Simulation</span>}
        </h1>
      </div>
      <div className="topbar-right">
        <div className={`status-banner tone-${status.tone}`} role="status" aria-live="polite">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <span className="status-detail">{status.detail}</span>
        </div>
        <div className="clock" aria-label="Heure locale">
          <span className="live-dot" aria-hidden />
          <span>LIVE</span>
          <time>{formatTime(now)}</time>
        </div>
        <button
          type="button"
          className={`icon-btn${soundOn ? " on" : ""}`}
          onClick={onToggleSound}
          title={soundOn ? "Couper le son des alertes" : "Activer le son des alertes"}
          aria-pressed={soundOn}
          aria-label="Son des alertes"
        >
          {soundOn ? <Bell size={17} /> : <BellOff size={17} />}
        </button>
      </div>
    </header>
  );
}
