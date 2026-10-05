import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTime } from "../format";
import type { Measurement } from "../types";
import { WINDOW_MS } from "../useLiveData";

interface SeriesDef {
  key: "temperature" | "humidity" | "gas_raw";
  label: string;
  unit: string;
  color: string;
}

const SERIES: SeriesDef[] = [
  { key: "temperature", label: "Température", unit: "°C", color: "var(--c-temp)" },
  { key: "humidity", label: "Humidité", unit: "%", color: "var(--c-hum)" },
  { key: "gas_raw", label: "Gaz brut", unit: "ADC", color: "var(--c-gas)" },
];

function Chart({ def, data, now }: { def: SeriesDef; data: { t: number; v: number | null }[]; now: number }) {
  return (
    <div className="panel chart">
      <h3>
        {def.label} <span className="muted">({def.unit}, 10 dernières minutes)</span>
      </h3>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[now - WINDOW_MS, now]}
            tickFormatter={(t) => formatTime(t).slice(0, 5)}
            stroke="var(--muted)"
            tick={{ fontSize: 12 }}
            minTickGap={40}
          />
          <YAxis domain={["auto", "auto"]} stroke="var(--muted)" tick={{ fontSize: 12 }} width={48} />
          <Tooltip
            labelFormatter={(t) => formatTime(t as number)}
            formatter={(v) => [`${v} ${def.unit}`, def.label]}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          {/* Pas de connectNulls : une valeur inconnue apparaît comme un trou, pas comme 0. */}
          <Line dataKey="v" stroke={def.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Au-delà de cet écart entre deux mesures, la courbe est interrompue (coupure de données). */
const GAP_MS = 10_000;

function toPoints(series: Measurement[], key: SeriesDef["key"]) {
  const points: { t: number; v: number | null }[] = [];
  let previous: number | null = null;
  for (const m of series) {
    const t = Date.parse(m.received_at);
    if (previous !== null && t - previous > GAP_MS) points.push({ t: previous + 1, v: null });
    points.push({ t, v: m[key] });
    previous = t;
  }
  return points;
}

export function Charts({ series, now }: { series: Measurement[]; now: number }) {
  const datasets = useMemo(() => SERIES.map((def) => ({ def, data: toPoints(series, def.key) })), [series]);
  return (
    <div className="charts">
      {datasets.map(({ def, data }) => (
        <Chart key={def.key} def={def} data={data} now={now} />
      ))}
    </div>
  );
}
