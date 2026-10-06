import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Dashboard } from "./components/Dashboard";
import { Login } from "./components/Login";

type Session = { status: "checking" } | { status: "anonymous" } | { status: "authenticated"; user: string };

export function App() {
  const [session, setSession] = useState<Session>({ status: "checking" });

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setSession({ status: "authenticated", user }))
      .catch(() => setSession({ status: "anonymous" }));
  }, []);

  const onUnauthorized = useCallback(() => setSession({ status: "anonymous" }), []);
  const onLogout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setSession({ status: "anonymous" });
  }, []);

  if (session.status === "checking") return <div className="boot" aria-busy="true" />;
  if (session.status === "anonymous") return <Login onLogin={(user) => setSession({ status: "authenticated", user })} />;
  return <Dashboard user={session.user} onLogout={onLogout} onUnauthorized={onUnauthorized} />;
}
