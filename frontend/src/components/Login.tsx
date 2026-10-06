import { ArrowRight, BrainCircuit, Loader2, LockKeyhole, RadioTower, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { ApiError, api } from "../api";
import { Logo } from "./ui";

const FEATURES = [
  { icon: LockKeyhole, title: "Flux chiffrés", text: "MQTTS et HTTPS de bout en bout" },
  { icon: BrainCircuit, title: "IA locale", text: "Vision et détection d'anomalies sur site" },
  { icon: RadioTower, title: "Contrôle confirmé", text: "Chaque commande est acquittée par le boîtier" },
];

export function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Serveur injoignable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-brand">
        <div className="brand">
          <Logo size={40} />
          <div>
            <div className="brand-name">
              SENTINEL<span>-X</span>
            </div>
            <div className="brand-sub">AetherCorp Industrial Solutions</div>
          </div>
        </div>
        <div className="login-hero">
          <p className="eyebrow">Centre de commandement local</p>
          <h1>La sécurité à la bordure.</h1>
          <p className="login-lead">Supervision temps réel de l'avant-poste : environnement, intrusions et actionneurs, depuis un seul écran.</p>
        </div>
        <ul className="login-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="feature-icon">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-form-head">
            <span className="login-badge">
              <ShieldCheck size={20} aria-hidden />
            </span>
            <h2>Connexion superviseur</h2>
            <p className="muted">Accès réservé à l'équipe d'exploitation.</p>
          </div>
          <label className="field">
            <span>Identifiant</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? <Loader2 size={17} className="spin" aria-hidden /> : null}
            {busy ? "Connexion…" : "Se connecter"}
            {!busy && <ArrowRight size={17} aria-hidden />}
          </button>
          <p className="login-foot muted small">Session chiffrée · cookie HttpOnly · 5 tentatives par minute</p>
        </form>
      </section>
    </main>
  );
}
