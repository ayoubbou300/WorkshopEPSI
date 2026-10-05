import { useState } from "react";
import { ApiError, api } from "../api";
import type { Command, CommandAction, Device } from "../types";

const STATUS_TEXT: Record<Command["status"], string> = {
  pending: "En attente de confirmation…",
  confirmed: "Confirmée par le boîtier",
  failed: "Échec",
  timeout: "Non confirmée : aucun retour reçu (l'action a pu être exécutée)",
};

interface ActuatorProps {
  label: string;
  action: CommandAction;
  observed: boolean | null;
  device: Device;
  last: Command | undefined;
  onCommand: (command: Command) => void;
}

function Actuator({ label, action, observed, device, last, onCommand }: ActuatorProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = sending || last?.status === "pending";

  const send = async (value: boolean) => {
    setSending(true);
    setError(null);
    try {
      onCommand(await api.sendCommand(device.id, action, value));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Serveur injoignable");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="actuator">
      <div className="actuator-head">
        <h3>{label}</h3>
        <span className={`state state-${observed == null ? "unknown" : observed ? "on" : "off"}`}>
          État confirmé : {observed == null ? "inconnu" : observed ? "ACTIVÉ" : "arrêté"}
        </span>
      </div>
      <div className="actuator-buttons">
        <button className="btn btn-danger" disabled={pending} onClick={() => send(true)}>
          Activer
        </button>
        <button className="btn" disabled={pending} onClick={() => send(false)}>
          Arrêter
        </button>
      </div>
      {last && (
        <p className={`command-result result-${last.status}`}>
          Dernière demande ({last.value ? "activer" : "arrêter"}) : {STATUS_TEXT[last.status]}
          {last.status === "failed" && last.detail ? ` — ${last.detail}` : ""}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

interface Props {
  device: Device | undefined;
  commands: Record<string, Command>;
  onCommand: (command: Command) => void;
}

export function CommandPanel({ device, commands, onCommand }: Props) {
  if (!device) return null;
  const latest = (action: CommandAction) =>
    Object.values(commands)
      .filter((c) => c.device_id === device.id && c.action === action)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

  return (
    <div className="panel commands">
      <h2>Commandes — {device.id}</h2>
      <Actuator label="Buzzer d'alarme" action="set_buzzer" observed={device.buzzer} device={device} last={latest("set_buzzer")} onCommand={onCommand} />
      <Actuator label="LED de statut" action="set_led" observed={device.led} device={device} last={latest("set_led")} onCommand={onCommand} />
    </div>
  );
}
