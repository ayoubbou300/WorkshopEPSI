import { FormEvent, useState } from "react";
import { ApiError, api } from "../api";

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
      <form className="panel login-form" onSubmit={submit}>
        <h1>
          SENTINEL<span className="accent">-X</span>
        </h1>
        <p className="muted">Centre de commandement local</p>
        <label>
          Identifiant
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
