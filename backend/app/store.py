"""Accès à PostgreSQL. Toutes les requêtes sont paramétrées."""

from datetime import datetime
from typing import Any, Optional

import asyncpg

from .schemas import AlertIn, CommandAck, Telemetry

MEASUREMENT_COLUMNS = (
    "id, device_id, sensor_ts, received_at, temperature, humidity, gas_raw, motion, boot_id, sequence"
)
ALERT_COLUMNS = "id, event_id, device_id, source, type, severity, event_ts, received_at, score, message"
COMMAND_COLUMNS = (
    "id, device_id, action, value, created_at, expires_at, status, acked_at, ack_status, detail"
)
DEVICE_COLUMNS = (
    "id, name, simulated, protocol, last_seen_at, mqtt_online, mqtt_status_at, buzzer, led"
)


def _row(record: Optional[asyncpg.Record]) -> Optional[dict[str, Any]]:
    return dict(record) if record is not None else None


# --- Boîtiers ---------------------------------------------------------------


async def ensure_device(
    conn: asyncpg.Connection, device_id: str, simulated: bool = False, protocol: str = "v1"
) -> None:
    await conn.execute(
        "INSERT INTO devices (id, simulated, protocol) VALUES ($1, $2, $3)"
        " ON CONFLICT (id) DO UPDATE SET simulated = EXCLUDED.simulated, protocol = EXCLUDED.protocol",
        device_id,
        simulated,
        protocol,
    )


async def get_device(conn: asyncpg.Connection, device_id: str) -> Optional[dict[str, Any]]:
    return _row(await conn.fetchrow(f"SELECT {DEVICE_COLUMNS} FROM devices WHERE id = $1", device_id))


async def set_device_status(conn: asyncpg.Connection, device_id: str, online: bool) -> dict[str, Any]:
    record = await conn.fetchrow(
        "INSERT INTO devices (id, mqtt_online, mqtt_status_at) VALUES ($1, $2, now())"
        " ON CONFLICT (id) DO UPDATE SET mqtt_online = EXCLUDED.mqtt_online,"
        " mqtt_status_at = EXCLUDED.mqtt_status_at"
        f" RETURNING {DEVICE_COLUMNS}",
        device_id,
        online,
    )
    return dict(record)


async def set_actuator_state(conn: asyncpg.Connection, ack: CommandAck) -> Optional[dict[str, Any]]:
    record = await conn.fetchrow(
        "UPDATE devices SET buzzer = COALESCE($2, buzzer), led = COALESCE($3, led)"
        f" WHERE id = $1 RETURNING {DEVICE_COLUMNS}",
        ack.device_id,
        ack.buzzer,
        ack.led,
    )
    return _row(record)


async def list_devices(conn: asyncpg.Connection) -> list[dict[str, Any]]:
    records = await conn.fetch(
        f"SELECT {', '.join('d.' + c.strip() for c in DEVICE_COLUMNS.split(','))},"
        " to_jsonb(m) - 'device_id' AS latest"
        " FROM devices d"
        " LEFT JOIN LATERAL ("
        f"   SELECT {MEASUREMENT_COLUMNS} FROM measurements"
        "    WHERE device_id = d.id ORDER BY received_at DESC LIMIT 1"
        " ) m ON TRUE"
        " ORDER BY d.simulated, d.id"
    )
    return [dict(r) for r in records]


# --- Mesures ----------------------------------------------------------------


async def insert_measurement(
    conn: asyncpg.Connection, t: Telemetry, protocol: str = "v1"
) -> Optional[dict[str, Any]]:
    """Stocke la mesure ; retourne None si c'est une retransmission déjà reçue."""
    async with conn.transaction():
        await ensure_device(conn, t.device_id, t.simulated, protocol)
        record = await conn.fetchrow(
            "INSERT INTO measurements"
            " (device_id, sensor_ts, temperature, humidity, gas_raw, motion, boot_id, sequence)"
            " VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
            " ON CONFLICT (device_id, boot_id, sequence) DO NOTHING"
            f" RETURNING {MEASUREMENT_COLUMNS}",
            t.device_id,
            t.timestamp,
            t.temperature,
            t.humidity,
            t.gas_raw,
            t.motion,
            t.boot_id,
            t.sequence,
        )
        if record is not None:
            await conn.execute(
                "UPDATE devices SET last_seen_at = $2 WHERE id = $1", t.device_id, record["received_at"]
            )
    return _row(record)


async def list_measurements(
    conn: asyncpg.Connection,
    device_id: str,
    since: Optional[datetime],
    until: Optional[datetime],
    limit: int,
) -> list[dict[str, Any]]:
    # Les plus récentes d'abord pour appliquer la limite, puis remises dans l'ordre chronologique.
    records = await conn.fetch(
        f"SELECT {MEASUREMENT_COLUMNS} FROM measurements"
        " WHERE device_id = $1"
        " AND ($2::timestamptz IS NULL OR received_at >= $2)"
        " AND ($3::timestamptz IS NULL OR received_at < $3)"
        " ORDER BY received_at DESC LIMIT $4",
        device_id,
        since,
        until,
        limit,
    )
    return [dict(r) for r in reversed(records)]


# --- Alertes ----------------------------------------------------------------


async def insert_alert(conn: asyncpg.Connection, alert: AlertIn) -> Optional[dict[str, Any]]:
    """Stocke l'alerte ; retourne None si event_id a déjà été reçu."""
    record = await conn.fetchrow(
        "INSERT INTO alerts (event_id, device_id, source, type, severity, event_ts, score, message)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
        " ON CONFLICT (event_id) DO NOTHING"
        f" RETURNING {ALERT_COLUMNS}",
        alert.event_id,
        alert.device_id,
        alert.source,
        alert.type,
        alert.severity,
        alert.timestamp,
        alert.score,
        alert.message,
    )
    return _row(record)


async def get_alert_by_event(conn: asyncpg.Connection, event_id: str) -> Optional[dict[str, Any]]:
    return _row(await conn.fetchrow(f"SELECT {ALERT_COLUMNS} FROM alerts WHERE event_id = $1", event_id))


async def list_alerts(
    conn: asyncpg.Connection,
    device_id: Optional[str],
    source: Optional[str],
    severity: Optional[str],
    before_id: Optional[int],
    limit: int,
) -> list[dict[str, Any]]:
    records = await conn.fetch(
        f"SELECT {ALERT_COLUMNS} FROM alerts"
        " WHERE ($1::text IS NULL OR device_id = $1)"
        " AND ($2::text IS NULL OR source = $2)"
        " AND ($3::text IS NULL OR severity = $3)"
        " AND ($4::bigint IS NULL OR id < $4)"
        " ORDER BY id DESC LIMIT $5",
        device_id,
        source,
        severity,
        before_id,
        limit,
    )
    return [dict(r) for r in records]


# --- Commandes --------------------------------------------------------------


async def create_command(
    conn: asyncpg.Connection,
    command_id: str,
    device_id: str,
    action: str,
    value: bool,
    expires_at: datetime,
    status: str = "pending",
    detail: Optional[str] = None,
) -> dict[str, Any]:
    record = await conn.fetchrow(
        "INSERT INTO commands (id, device_id, action, value, expires_at, status, detail)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7)"
        f" RETURNING {COMMAND_COLUMNS}",
        command_id,
        device_id,
        action,
        value,
        expires_at,
        status,
        detail,
    )
    return dict(record)


async def get_command(conn: asyncpg.Connection, command_id: str) -> Optional[dict[str, Any]]:
    return _row(await conn.fetchrow(f"SELECT {COMMAND_COLUMNS} FROM commands WHERE id = $1", command_id))


async def fail_command(conn: asyncpg.Connection, command_id: str, detail: str) -> dict[str, Any]:
    record = await conn.fetchrow(
        "UPDATE commands SET status = 'failed', detail = $2"
        f" WHERE id = $1 RETURNING {COMMAND_COLUMNS}",
        command_id,
        detail,
    )
    return dict(record)


async def apply_ack(conn: asyncpg.Connection, ack: CommandAck) -> Optional[dict[str, Any]]:
    """Enregistre la confirmation. Seule une commande encore 'pending' change d'état :
    une confirmation tardive est conservée mais la commande reste 'timeout'."""
    record = await conn.fetchrow(
        "UPDATE commands SET acked_at = now(), ack_status = $3, detail = $4,"
        " status = CASE WHEN status = 'pending'"
        "   THEN (CASE WHEN $3 = 'applied' THEN 'confirmed' ELSE 'failed' END)"
        "   ELSE status END"
        f" WHERE id = $1 AND device_id = $2 RETURNING {COMMAND_COLUMNS}",
        ack.command_id,
        ack.device_id,
        ack.status,
        ack.reason,
    )
    return _row(record)


async def expire_commands(conn: asyncpg.Connection, grace_seconds: float = 1.0) -> list[dict[str, Any]]:
    records = await conn.fetch(
        "UPDATE commands SET status = 'timeout', detail = 'Aucune confirmation reçue'"
        " WHERE status = 'pending' AND expires_at < now() - make_interval(secs => $1)"
        f" RETURNING {COMMAND_COLUMNS}",
        grace_seconds,
    )
    return [dict(r) for r in records]
