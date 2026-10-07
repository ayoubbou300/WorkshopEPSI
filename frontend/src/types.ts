export interface Measurement {
  id: number;
  device_id: string;
  sensor_ts: string | null;
  received_at: string;
  temperature: number | null;
  humidity: number | null;
  gas_raw: number | null;
  motion: boolean | null;
  boot_id: string | null;
  sequence: number | null;
}

export interface Device {
  id: string;
  name: string | null;
  simulated: boolean;
  /** "legacy" : ancien firmware (topics partagés, MQTT en clair, sans confirmation). */
  protocol: "v1" | "legacy";
  last_seen_at: string | null;
  mqtt_online: boolean | null;
  mqtt_status_at: string | null;
  buzzer: boolean | null;
  led: boolean | null;
  latest?: Omit<Measurement, "device_id"> | null;
}

export type AlertSource = "sensor" | "vision" | "anomaly";
export type Severity = "info" | "warning" | "critical";

export interface Alert {
  id: number;
  event_id: string;
  device_id: string | null;
  source: AlertSource;
  type: string;
  severity: Severity;
  event_ts: string | null;
  received_at: string;
  score: number | null;
  message: string | null;
}

export type CommandAction = "set_buzzer" | "set_led";
export type CommandStatus = "pending" | "confirmed" | "failed" | "timeout" | "sent";

export interface Command {
  id: string;
  device_id: string;
  action: CommandAction;
  value: boolean;
  created_at: string;
  expires_at: string;
  status: CommandStatus;
  acked_at: string | null;
  ack_status: string | null;
  detail: string | null;
}

export interface DevicesResponse {
  server_time: string;
  stale_after_seconds: number;
  devices: Device[];
}

export type LiveEvent =
  | { type: "measurement"; data: Measurement }
  | { type: "device"; data: Device }
  | { type: "alert"; data: Alert }
  | { type: "command"; data: Command }
  | { type: "server"; data: { mqtt: "connected" | "disconnected" } };
