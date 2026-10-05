-- Schéma initial Sentinel-X

CREATE TABLE devices (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    simulated       BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at    TIMESTAMPTZ,
    mqtt_online     BOOLEAN,
    mqtt_status_at  TIMESTAMPTZ,
    -- État des actionneurs tel que confirmé par le boîtier (NULL = inconnu)
    buzzer          BOOLEAN,
    led             BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE measurements (
    id           BIGSERIAL PRIMARY KEY,
    device_id    TEXT NOT NULL REFERENCES devices(id),
    sensor_ts    TIMESTAMPTZ,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    temperature  DOUBLE PRECISION,
    humidity     DOUBLE PRECISION,
    gas_raw      INTEGER,
    motion       BOOLEAN,
    boot_id      TEXT,
    sequence     BIGINT,
    -- Un message retransmis (même boot et même séquence) n'est stocké qu'une fois.
    UNIQUE (device_id, boot_id, sequence)
);
CREATE INDEX measurements_device_received_idx ON measurements (device_id, received_at DESC);

CREATE TABLE alerts (
    id           BIGSERIAL PRIMARY KEY,
    event_id     TEXT NOT NULL UNIQUE,
    device_id    TEXT,
    source       TEXT NOT NULL CHECK (source IN ('sensor', 'vision', 'anomaly')),
    type         TEXT NOT NULL,
    severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    event_ts     TIMESTAMPTZ,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    score        DOUBLE PRECISION,
    message      TEXT
);
CREATE INDEX alerts_received_idx ON alerts (received_at DESC);
CREATE INDEX alerts_device_received_idx ON alerts (device_id, received_at DESC);

CREATE TABLE commands (
    id           TEXT PRIMARY KEY,
    device_id    TEXT NOT NULL REFERENCES devices(id),
    action       TEXT NOT NULL CHECK (action IN ('set_buzzer', 'set_led')),
    value        BOOLEAN NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed', 'timeout')),
    acked_at     TIMESTAMPTZ,
    ack_status   TEXT,
    detail       TEXT
);
CREATE INDEX commands_pending_idx ON commands (expires_at) WHERE status = 'pending';
CREATE INDEX commands_device_created_idx ON commands (device_id, created_at DESC);
