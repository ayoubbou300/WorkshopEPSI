import { BellRing, CheckCircle2, Hourglass, Lightbulb, Loader2, SlidersHorizontal, TimerOff, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "../api";
import { formatTime } from "../format";
import type { Command, CommandAction, Device } from "../types";
import { PanelHeader, StatusPill } from "./ui";

interface ActuatorProps {
  icon: LucideIcon;
  label: string;
  action: CommandAction;
  observed: boolean | null;
  device: Device;
  last: Command | undefined;
  now: number;
  onCommand: (command: Command) => void;
}

function CommandResult({ command, now }: { command: Command; now: number }) {
  const verb = command.value ? "activer" : "arrêter";
  switch (command.status) {
    case "pending": {
      const remaining = Math.max(0, Math.ceil((Date.parse(command.expires_at) - now) / 1000));
      return (
        <p className="command-result tone-warning">
          <Hourglass size={14} aria-hidden />
          Demande « {verb} » envoyée — attente de confirmation · {remaining} s
        </p>
      );
    }
    case "confirmed":
      return (
        <p className="command-result tone-good">
          <CheckCircle2 size={14} aria-hidden />
          « {verb} » confirmé par le boîtier à {formatTime(command.acked_at)}
        </p>
      );
    case "failed":
      return (
        <p className="command-result tone-critical">
          <XCircle size={14} aria-hidden />
          « {verb} » refusé{command.detail ? ` : ${command.detail}` : ""}
        </p>
      );
    case "timeout":
      return (
        <p className="command-result tone-critical">
          <TimerOff size={14} aria-hidden />
          « {verb} » non confirmé : aucun retour reçu (l'action a pu être exécutée)
        </p>
      );
  }
}

function Actuator({ icon: Icon, label, action, observed, device, last, now, onCommand }: ActuatorProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = sending || last?.status === "pending";
  const requested = last?.status === "pending" ? last.value : null;

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
    <div className={`actuator${observed ? " is-on" : ""}`}>
      <div className="actuator-head">
        <span className="actuator-icon">
          <Icon size={18} aria-hidden />
        </span>
        <div className="actuator-text">
          <h3>{label}</h3>
          <span className="muted small">État confirmé par le boîtier</span>
        </div>
        {observed == null ? (
          <StatusPill tone="idle">Inconnu</StatusPill>
        ) : observed ? (
          <StatusPill tone="warning" icon={Icon}>
            Activé
          </StatusPill>
        ) : (
          <StatusPill tone="idle">Arrêté</StatusPill>
        )}
      </div>
      <div className="actuator-controls" role="group" aria-label={`Commande ${label}`}>
        <button
          type="button"
          className={`ctrl ctrl-on${observed === true ? " current" : ""}`}
          disabled={pending}
          onClick={() => send(true)}
        >
          {pending && requested === true ? <Loader2 size={15} className="spin" aria-hidden /> : null}
          Activer
        </button>
        <button
          type="button"
          className={`ctrl ctrl-off${observed === false ? " current" : ""}`}
          disabled={pending}
          onClick={() => send(false)}
        >
          {pending && requested === false ? <Loader2 size={15} className="spin" aria-hidden /> : null}
          Arrêter
        </button>
      </div>
      {last && <CommandResult command={last} now={now} />}
      {error && (
        <p className="command-result tone-critical">
          <XCircle size={14} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  device: Device | undefined;
  commands: Record<string, Command>;
  now: number;
  onCommand: (command: Command) => void;
}

export function CommandPanel({ device, commands, now, onCommand }: Props) {
  const latest = (action: CommandAction) =>
    device &&
    Object.values(commands)
      .filter((c) => c.device_id === device.id && c.action === action)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

  return (
    <section className="panel commands">
      <PanelHeader icon={SlidersHorizontal} title="Actionneurs" subtitle={device ? `Commandes vers ${device.id}` : "Aucun boîtier"} />
      {device ? (
        <div className="actuators">
          <Actuator icon={BellRing} label="Buzzer d'alarme" action="set_buzzer" observed={device.buzzer} device={device} last={latest("set_buzzer")} now={now} onCommand={onCommand} />
          <Actuator icon={Lightbulb} label="LED de statut" action="set_led" observed={device.led} device={device} last={latest("set_led")} now={now} onCommand={onCommand} />
        </div>
      ) : (
        <p className="empty-note">Sélectionnez un boîtier pour envoyer des commandes.</p>
      )}
    </section>
  );
}
