import type { Device } from "../types";

function Card({ label, value, unit, hint, tone }: { label: string; value: string; unit?: string; hint?: string; tone?: string }) {
  return (
    <div className={`panel metric ${tone ?? ""}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit && value !== "Inconnue" && value !== "Inconnu" && <span className="metric-unit">{unit}</span>}
      </span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

export function MetricCards({ device, stale }: { device: Device | undefined; stale: boolean }) {
  const m = device?.latest;
  const tone = stale ? "metric-stale" : "";
  const hint = stale ? "Valeur ancienne" : undefined;
  return (
    <div className="metrics">
      <Card label="Température" value={m?.temperature != null ? m.temperature.toFixed(1) : "Inconnue"} unit="°C" hint={hint} tone={tone} />
      <Card label="Humidité" value={m?.humidity != null ? m.humidity.toFixed(1) : "Inconnue"} unit="%" hint={hint} tone={tone} />
      <Card label="Gaz (MQ-2)" value={m?.gas_raw != null ? String(m.gas_raw) : "Inconnu"} unit="ADC brut" hint={hint} tone={tone} />
      <Card
        label="Mouvement (PIR)"
        value={m?.motion == null ? "Inconnu" : m.motion ? "Détecté" : "Aucun"}
        hint={hint}
        tone={m?.motion && !stale ? "metric-alert" : tone}
      />
    </div>
  );
}
