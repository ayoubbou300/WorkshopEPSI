import { useEffect, useState } from "react";

export interface Health {
  database: "ok" | "unavailable" | "unknown";
  mqtt: "connected" | "disconnected" | "unknown";
  reachable: boolean;
}

/** Interroge /health périodiquement pour afficher l'état de la base et du broker. */
export function useHealth(intervalMs = 10_000): Health {
  const [health, setHealth] = useState<Health>({ database: "unknown", mqtt: "unknown", reachable: true });

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch("/health", { cache: "no-store" });
        const body = await response.json();
        if (!stopped) setHealth({ database: body.database, mqtt: body.mqtt, reachable: true });
      } catch {
        if (!stopped) setHealth((h) => ({ ...h, reachable: false }));
      }
    };
    void poll();
    const id = window.setInterval(poll, intervalMs);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return health;
}
