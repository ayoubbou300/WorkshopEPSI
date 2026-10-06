import { Activity } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { formatNumber, formatShortTime, formatTime } from "../format";
import type { Measurement } from "../types";
import { WINDOW_MS } from "../useLiveData";
import { PanelHeader, Segmented } from "./ui";

type Key = "temperature" | "humidity" | "gas_raw";

interface SeriesDef {
  key: Key;
  label: string;
  unit: string;
  color: string;
  digits: number;
  minSpan: number;
}

const SERIES: SeriesDef[] = [
  { key: "temperature", label: "Température", unit: "°C", color: "var(--s-temp)", digits: 1, minSpan: 2 },
  { key: "humidity", label: "Humidité", unit: "%", color: "var(--s-hum)", digits: 1, minSpan: 4 },
  { key: "gas_raw", label: "Gaz brut", unit: "ADC", color: "var(--s-gas)", digits: 0, minSpan: 20 },
];

/** Au-delà de cet écart entre deux mesures, la courbe est interrompue (coupure de données). */
const GAP_MS = 10_000;

type Point = { t: number; v: number | null };

function toPoints(series: Measurement[], key: Key): Point[] {
  const points: Point[] = [];
  let previous: number | null = null;
  for (const m of series) {
    const t = Date.parse(m.received_at);
    if (previous !== null && t - previous > GAP_MS) points.push({ t: previous + 1, v: null });
    points.push({ t, v: m[key] });
    previous = t;
  }
  return points;
}

function domainFor(points: Point[], minSpan: number): [number, number] | ["auto", "auto"] {
  const values = points.map((p) => p.v).filter((v): v is number => v != null);
  if (values.length === 0) return ["auto", "auto"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.2, (minSpan - (max - min)) / 2, 0);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

function ChartTooltip({ active, payload, def }: TooltipProps<number, string> & { def: SeriesDef }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-time">{formatTime(point.t)}</div>
      <div className="chart-tooltip-row">
        <span className="line-key" style={{ background: def.color }} />
        <strong>{point.v == null ? "Inconnue" : `${formatNumber(point.v, def.digits)} ${def.unit}`}</strong>
        <span className="muted">{def.label}</span>
      </div>
    </div>
  );
}

function SeriesRow({ def, points, now, showAxis }: { def: SeriesDef; points: Point[]; now: number; showAxis: boolean }) {
  const last = [...points].reverse().find((p) => p.v != null);
  const gradientId = `grad-${def.key}`;
  return (
    <div className="series-row">
      <div className="series-info">
        <span className="series-name">
          <span className="line-key" style={{ background: def.color }} />
          {def.label}
        </span>
        <span className="series-value">
          {last ? formatNumber(last.v as number, def.digits) : "—"}
          <span className="series-unit">{def.unit}</span>
        </span>
      </div>
      <div className="series-chart">
        <ResponsiveContainer width="100%" height={showAxis ? 128 : 104}>
          <AreaChart data={points} syncId="telemetry" syncMethod="value" margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={def.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={def.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[now - WINDOW_MS, now]}
              tickFormatter={formatShortTime}
              hide={!showAxis}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              minTickGap={48}
              height={24}
            />
            <YAxis
              domain={domainFor(points, def.minSpan)}
              stroke="transparent"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              width={40}
              tickCount={3}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip def={def} />}
              cursor={{ stroke: "var(--text-2)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {/* Pas de connectNulls : une valeur inconnue ou une coupure apparaît comme un trou. */}
            <Area
              type="linear"
              dataKey="v"
              stroke={def.color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)", fill: def.color }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TelemetryTable({ series }: { series: Measurement[] }) {
  const rows = [...series].reverse().slice(0, 60);
  const cell = (v: number | null, digits: number) => (v == null ? <span className="muted" title="Valeur inconnue">—</span> : formatNumber(v, digits));
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Réception</th>
            <th>Température (°C)</th>
            <th>Humidité (%)</th>
            <th>Gaz (ADC)</th>
            <th>Présence</th>
            <th>Séquence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>{formatTime(m.received_at)}</td>
              <td>{cell(m.temperature, 1)}</td>
              <td>{cell(m.humidity, 1)}</td>
              <td>{cell(m.gas_raw, 0)}</td>
              <td>{m.motion == null ? <span className="muted">—</span> : m.motion ? "Oui" : "Non"}</td>
              <td className="muted">{m.sequence ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty-note">Aucune mesure sur les 10 dernières minutes.</p>}
    </div>
  );
}

export function Telemetry({ series, now }: { series: Measurement[]; now: number }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const datasets = useMemo(() => SERIES.map((def) => ({ def, points: toPoints(series, def.key) })), [series]);

  return (
    <section className="panel telemetry">
      <PanelHeader
        icon={Activity}
        title="Télémétrie environnementale"
        subtitle={`10 dernières minutes · ${series.length} mesures`}
        actions={
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Courbes" },
              { value: "table", label: "Tableau" },
            ]}
          />
        }
      />
      {view === "chart" ? (
        <div className="series-stack">
          {datasets.map(({ def, points }, i) => (
            <SeriesRow key={def.key} def={def} points={points} now={now} showAxis={i === datasets.length - 1} />
          ))}
        </div>
      ) : (
        <TelemetryTable series={series} />
      )}
    </section>
  );
}
