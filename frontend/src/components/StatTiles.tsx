import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Droplets, Flame, ScanEye, Thermometer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { formatAge, formatNumber } from "../format";
import type { Device, Measurement } from "../types";

type NumericKey = "temperature" | "humidity" | "gas_raw";

const TREND_WINDOW_MS = 60_000;

function trend(series: Measurement[], key: NumericKey) {
  const values = series.filter((m) => m[key] != null);
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const target = Date.parse(last.received_at) - TREND_WINDOW_MS;
  const reference = [...values].reverse().find((m) => Date.parse(m.received_at) <= target) ?? values[0];
  if (reference === last) return null;
  const numbers = values.map((m) => m[key] as number);
  return {
    delta: (last[key] as number) - (reference[key] as number),
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

interface TileProps {
  icon: LucideIcon;
  label: string;
  color: string;
  value: string | null;
  unit?: string;
  stale: boolean;
  footer: ReactNode;
  meter?: number;
  highlight?: boolean;
}

function Tile({ icon: Icon, label, color, value, unit, stale, footer, meter, highlight }: TileProps) {
  return (
    <article className={`panel tile${stale ? " is-stale" : ""}${highlight ? " is-highlight" : ""}`} style={{ "--series": color } as CSSProperties}>
      <div className="tile-head">
        <span className="tile-icon">
          <Icon size={17} strokeWidth={2} aria-hidden />
        </span>
        <span className="tile-label">{label}</span>
        {stale && (
          <span className="tile-stale" title="Aucune mesure récente">
            <Clock3 size={13} aria-hidden /> Périmée
          </span>
        )}
      </div>
      <div className="tile-value">
        {value ?? <span className="tile-unknown">Inconnue</span>}
        {value != null && unit && <span className="tile-unit">{unit}</span>}
      </div>
      {meter != null && (
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={1023} aria-valuenow={Math.round(meter * 1023)} aria-label={`${label} sur l'échelle ADC`}>
          <span style={{ width: `${Math.min(100, Math.max(0, meter * 100))}%` }} />
        </div>
      )}
      <div className="tile-footer">{footer}</div>
    </article>
  );
}

function TrendFooter({ series, keyName, digits, unit }: { series: Measurement[]; keyName: NumericKey; digits: number; unit: string }) {
  const t = trend(series, keyName);
  if (!t) return <span className="muted">Tendance indisponible</span>;
  const flat = Math.abs(t.delta) < Math.pow(10, -digits) / 2;
  const Arrow = flat ? ArrowRight : t.delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <span className="trend">
        <Arrow size={14} aria-hidden />
        {flat ? "stable" : `${t.delta > 0 ? "+" : "−"}${formatNumber(Math.abs(t.delta), digits)} ${unit}`}
        <span className="muted"> / 1 min</span>
      </span>
      <span className="muted range">
        Plage 10 min : {formatNumber(t.min, digits)} – {formatNumber(t.max, digits)}
      </span>
    </>
  );
}

export function StatTiles({ device, series, stale, now }: { device: Device | undefined; series: Measurement[]; stale: boolean; now: number }) {
  const m = device?.latest;
  const lastMotion = [...series].reverse().find((x) => x.motion === true);
  const detections = series.filter((x) => x.motion === true).length;

  return (
    <section className="tiles" aria-label="Dernières mesures">
      <Tile
        icon={Thermometer}
        label="Température"
        color="var(--s-temp)"
        value={m?.temperature != null ? formatNumber(m.temperature) : null}
        unit="°C"
        stale={stale}
        footer={<TrendFooter series={series} keyName="temperature" digits={1} unit="°C" />}
      />
      <Tile
        icon={Droplets}
        label="Humidité"
        color="var(--s-hum)"
        value={m?.humidity != null ? formatNumber(m.humidity) : null}
        unit="%"
        stale={stale}
        footer={<TrendFooter series={series} keyName="humidity" digits={1} unit="%" />}
      />
      <Tile
        icon={Flame}
        label="Gaz · MQ-2"
        color="var(--s-gas)"
        value={m?.gas_raw != null ? String(m.gas_raw) : null}
        unit="ADC"
        stale={stale}
        meter={m?.gas_raw != null ? m.gas_raw / 1023 : undefined}
        footer={<TrendFooter series={series} keyName="gas_raw" digits={0} unit="" />}
      />
      <Tile
        icon={ScanEye}
        label="Présence · PIR"
        color="var(--warning)"
        value={m?.motion == null ? null : m.motion ? "Détectée" : "Aucune"}
        stale={stale}
        highlight={m?.motion === true && !stale}
        footer={
          <>
            <span>{lastMotion ? `Dernière détection ${formatAge(lastMotion.received_at, now)}` : "Aucune détection"}</span>
            <span className="muted range">{detections} détection(s) sur 10 min</span>
          </>
        }
      />
    </section>
  );
}
