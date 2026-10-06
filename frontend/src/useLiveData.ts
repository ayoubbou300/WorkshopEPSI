import { useEffect, useReducer, useState } from "react";
import { ApiError, api } from "./api";
import type { Alert, Command, Device, LiveEvent, Measurement } from "./types";

/** Fenêtre affichée par les courbes : les points plus anciens sont retirés. */
export const WINDOW_MS = 10 * 60 * 1000;
const MAX_ALERTS = 200;

export type SocketState = "connecting" | "open" | "closed";

interface State {
  devices: Record<string, Device>;
  series: Record<string, Measurement[]>;
  alerts: Alert[];
  /** Alertes reçues en temps réel pendant la session (pour les notifications). */
  liveFeed: Alert[];
  commands: Record<string, Command>;
  staleAfterSeconds: number;
  mqtt: "connected" | "disconnected" | "unknown";
  socket: SocketState;
  loaded: boolean;
  error: string | null;
}

type Action =
  | { type: "socket"; state: SocketState }
  | { type: "error"; message: string | null }
  | {
      type: "reset";
      devices: Device[];
      series: Record<string, Measurement[]>;
      alerts: Alert[];
      staleAfterSeconds: number;
    }
  | LiveEvent;

const initialState: State = {
  devices: {},
  series: {},
  alerts: [],
  liveFeed: [],
  commands: {},
  staleAfterSeconds: 15,
  mqtt: "unknown",
  socket: "connecting",
  loaded: false,
  error: null,
};

function mergeMeasurements(existing: Measurement[], incoming: Measurement[]): Measurement[] {
  const byId = new Map<number, Measurement>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  const cutoff = Date.now() - WINDOW_MS;
  return [...byId.values()]
    .filter((m) => Date.parse(m.received_at) >= cutoff)
    .sort((a, b) => Date.parse(a.received_at) - Date.parse(b.received_at));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "socket":
      return { ...state, socket: action.state };
    case "error":
      return { ...state, error: action.message };
    case "reset": {
      // Les événements reçus pendant le rechargement sont conservés.
      const series: Record<string, Measurement[]> = {};
      for (const [id, items] of Object.entries(action.series)) {
        series[id] = mergeMeasurements(state.series[id] ?? [], items);
      }
      const alertIds = new Set(action.alerts.map((a) => a.id));
      const alerts = [...state.alerts.filter((a) => !alertIds.has(a.id)), ...action.alerts]
        .sort((a, b) => b.id - a.id)
        .slice(0, MAX_ALERTS);
      return {
        ...state,
        devices: Object.fromEntries(action.devices.map((d) => [d.id, d])),
        series,
        alerts,
        staleAfterSeconds: action.staleAfterSeconds,
        loaded: true,
        error: null,
      };
    }
    case "measurement": {
      const m = action.data;
      const device = state.devices[m.device_id];
      return {
        ...state,
        series: { ...state.series, [m.device_id]: mergeMeasurements(state.series[m.device_id] ?? [], [m]) },
        devices: device
          ? { ...state.devices, [m.device_id]: { ...device, latest: m, last_seen_at: m.received_at } }
          : state.devices,
      };
    }
    case "device": {
      const id = action.data.id;
      const previous = state.devices[id];
      const latest = action.data.latest ?? previous?.latest ?? state.series[id]?.at(-1) ?? null;
      return { ...state, devices: { ...state.devices, [id]: { ...previous, ...action.data, latest } } };
    }
    case "alert":
      if (state.alerts.some((a) => a.id === action.data.id)) return state;
      return {
        ...state,
        alerts: [action.data, ...state.alerts].slice(0, MAX_ALERTS),
        liveFeed: [action.data, ...state.liveFeed].slice(0, 20),
      };
    case "command":
      return { ...state, commands: { ...state.commands, [action.data.id]: action.data } };
    case "server":
      return { ...state, mqtt: action.data.mqtt };
  }
}

async function loadSnapshot() {
  const since = new Date(Date.now() - WINDOW_MS);
  const [devicesResponse, alerts] = await Promise.all([api.devices(), api.alerts({ limit: 30 })]);
  const series: Record<string, Measurement[]> = {};
  await Promise.all(
    devicesResponse.devices.map(async (d) => {
      series[d.id] = (await api.measurements(d.id, since)).items;
    }),
  );
  return {
    type: "reset" as const,
    devices: devicesResponse.devices,
    series,
    alerts: alerts.items,
    staleAfterSeconds: devicesResponse.stale_after_seconds,
  };
}

/**
 * Charge l'état courant par REST puis applique les événements WebSocket.
 * À chaque (re)connexion, l'état est rechargé : le temps réel ne remplace pas l'historique.
 */
export function useLiveData(onUnauthorized: () => void) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: number | undefined;
    let attempt = 0;
    let stopped = false;

    const resync = async () => {
      try {
        dispatch(await loadSnapshot());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return onUnauthorized();
        dispatch({ type: "error", message: err instanceof Error ? err.message : "Erreur de chargement" });
      }
    };

    const connect = () => {
      if (stopped) return;
      dispatch({ type: "socket", state: "connecting" });
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/live`);
      socket.onopen = () => {
        attempt = 0;
        dispatch({ type: "socket", state: "open" });
        void resync();
      };
      socket.onmessage = (message) => {
        try {
          dispatch(JSON.parse(message.data) as LiveEvent);
        } catch {
          /* message illisible ignoré */
        }
      };
      socket.onclose = (event) => {
        dispatch({ type: "socket", state: "closed" });
        if (stopped) return;
        if (event.code === 1008) {
          // Session refusée : vérifier par REST avant de renvoyer vers la connexion.
          void api.me().catch((err) => err instanceof ApiError && err.status === 401 && onUnauthorized());
        }
        const delay = Math.min(10_000, 1000 * 2 ** attempt++);
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    void resync();
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [onUnauthorized]);

  return { state, dispatch };
}

/** Horloge locale pour détecter les données périmées même sans nouveau message. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
