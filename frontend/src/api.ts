import type { Alert, Command, CommandAction, DevicesResponse, Measurement } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: string }>("/api/v1/auth/me"),
  login: (username: string, password: string) =>
    request<{ user: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),

  devices: () => request<DevicesResponse>("/api/v1/devices"),
  measurements: (deviceId: string, since: Date, limit = 1000) =>
    request<{ items: Measurement[] }>(
      `/api/v1/measurements?${new URLSearchParams({
        device_id: deviceId,
        since: since.toISOString(),
        limit: String(limit),
      })}`,
    ),
  alerts: (params: { source?: string; severity?: string; before_id?: number; limit?: number } = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && query.set(k, String(v)));
    return request<{ items: Alert[]; next_before_id: number | null }>(`/api/v1/alerts?${query}`);
  },
  sendCommand: (deviceId: string, action: CommandAction, value: boolean) =>
    request<Command>(`/api/v1/devices/${encodeURIComponent(deviceId)}/commands`, {
      method: "POST",
      body: JSON.stringify({ action, value }),
    }),
};
