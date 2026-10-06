import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDashed, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { Tone } from "../status";

const TONE_ICONS: Record<Tone, LucideIcon> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonAlert,
  idle: CircleDashed,
};

/** Statut : une icône colorée et un libellé, jamais la couleur seule. */
export function StatusPill({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? TONE_ICONS[tone];
  return (
    <span className={`pill tone-${tone}`}>
      <Icon size={14} strokeWidth={2.25} aria-hidden />
      {children}
    </span>
  );
}

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return <span className={`dot tone-${tone}${pulse ? " dot-pulse" : ""}`} aria-hidden />;
}

export function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="panel-title">
        <span className="panel-icon">
          <Icon size={16} strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="panel-actions">{actions}</div>}
    </header>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo-mark">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <path d="M16 2.5 4.5 7v8.2c0 7 4.9 12.6 11.5 14.3 6.6-1.7 11.5-7.3 11.5-14.3V7z" fill="url(#logo-g)" />
      <path d="M16 8.5v15M10.5 12.5 16 16l5.5-3.5" fill="none" stroke="#04111d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
