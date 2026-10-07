import logging
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Path, status

from .. import store
from ..auth import require_session
from ..config import Settings, get_settings
from ..deps import get_conn, get_hub, get_mqtt
from ..live import LiveHub
from ..mqtt import LEGACY_COMMANDS_TOPIC, BrokerUnavailable, MqttBridge, legacy_command_payload
from ..schemas import DEVICE_ID_PATTERN, CommandIn

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["commands"])


@router.post("/devices/{device_id}/commands", status_code=status.HTTP_202_ACCEPTED)
async def create_command(
    body: CommandIn,
    device_id: str = Path(..., pattern=DEVICE_ID_PATTERN),
    user: str = Depends(require_session),
    conn: asyncpg.Connection = Depends(get_conn),
    hub: LiveHub = Depends(get_hub),
    mqtt: MqttBridge = Depends(get_mqtt),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Crée et publie une commande. La réponse est 'pending' : la réussite physique
    n'est connue qu'à la réception de la confirmation du boîtier."""
    device = await store.get_device(conn, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Boîtier inconnu")
    if device["protocol"] == "legacy":
        return await _send_legacy_command(device_id, body, user, conn, hub, mqtt, settings)

    # Secondes entières : le firmware compare expires_at à son heure NTP.
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = now + timedelta(seconds=settings.command_timeout_seconds)
    command_id = f"cmd-{uuid.uuid4().hex[:20]}"

    # La commande est enregistrée avant publication pour qu'une confirmation rapide la retrouve.
    command = await store.create_command(conn, command_id, device_id, body.action, body.value, expires_at)
    try:
        await mqtt.publish_command(
            device_id,
            {
                "command_id": command_id,
                "action": body.action,
                "value": body.value,
                "expires_at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
    except BrokerUnavailable:
        command = await store.fail_command(conn, command_id, "Broker MQTT indisponible")
        await hub.broadcast("command", command)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Broker MQTT indisponible")

    log.info("Commande %s publiée par %s : %s=%s sur %s", command_id, user, body.action, body.value, device_id)
    await hub.broadcast("command", command)
    return command


async def _send_legacy_command(
    device_id: str,
    body: CommandIn,
    user: str,
    conn: asyncpg.Connection,
    hub: LiveHub,
    mqtt: MqttBridge,
    settings: Settings,
) -> dict:
    """Mode compatibilité : l'ancien firmware lit un topic partagé et ne confirme jamais.
    La commande est donc enregistrée comme 'sent' (envoyée, sans confirmation possible)."""
    if not settings.legacy_mqtt_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Mode compatibilité désactivé (LEGACY_MQTT_ENABLED)")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    command_id = f"cmd-{uuid.uuid4().hex[:20]}"
    try:
        await mqtt.publish(LEGACY_COMMANDS_TOPIC, legacy_command_payload(body.action, body.value))
    except BrokerUnavailable:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Broker MQTT indisponible")
    command = await store.create_command(
        conn, command_id, device_id, body.action, body.value, now,
        status="sent", detail="Ancien firmware : aucune confirmation possible",
    )
    log.info("Commande %s (ancien format) publiée par %s : %s=%s", command_id, user, body.action, body.value)
    await hub.broadcast("command", command)
    return command


@router.get("/commands/{command_id}", dependencies=[Depends(require_session)])
async def get_command(
    command_id: str = Path(..., max_length=64),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    command = await store.get_command(conn, command_id)
    if command is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commande inconnue")
    return command
