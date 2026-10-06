"""Pont MQTT : abonnement aux remontées des boîtiers et publication des commandes."""

import asyncio
import json
import logging
from typing import Any, Optional

import aiomqtt
import asyncpg
from pydantic import BaseModel, ValidationError

from . import store
from .config import Settings
from .db import DB_UNAVAILABLE_ERRORS
from .live import LiveHub
from .schemas import CommandAck, DeviceStatus, Telemetry

log = logging.getLogger(__name__)

TOPIC_PREFIX = "sentinel/devices"
MAX_PAYLOAD_BYTES = 4096
RECONNECT_DELAY_SECONDS = 3


class BrokerUnavailable(Exception):
    pass


def command_topic(device_id: str) -> str:
    return f"{TOPIC_PREFIX}/{device_id}/commands"


class MqttBridge:
    def __init__(self, settings: Settings, pool: asyncpg.Pool, hub: LiveHub) -> None:
        self._settings = settings
        self._pool = pool
        self._hub = hub
        self._client: Optional[aiomqtt.Client] = None

    @property
    def connected(self) -> bool:
        return self._client is not None

    async def run(self) -> None:
        """Boucle de connexion avec reconnexion automatique."""
        s = self._settings
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=s.mqtt_host,
                    port=s.mqtt_port,
                    username=s.mqtt_username,
                    password=s.mqtt_password,
                    identifier="sentinel-backend",
                    keepalive=30,
                ) as client:
                    await client.subscribe(
                        [(f"{TOPIC_PREFIX}/+/{kind}", 1) for kind in ("telemetry", "status", "acks")]
                    )
                    self._client = client
                    log.info("Connecté au broker MQTT %s:%s", s.mqtt_host, s.mqtt_port)
                    await self._hub.broadcast("server", {"mqtt": "connected"})
                    async for message in client.messages:
                        await self.handle_message(str(message.topic), message.payload)
            except aiomqtt.MqttError as exc:
                log.warning("Connexion MQTT perdue ou impossible : %s", exc)
            finally:
                if self._client is not None:
                    self._client = None
                    await self._hub.broadcast("server", {"mqtt": "disconnected"})
            await asyncio.sleep(RECONNECT_DELAY_SECONDS)

    async def publish_command(self, device_id: str, payload: dict[str, Any]) -> None:
        client = self._client
        if client is None:
            raise BrokerUnavailable()
        try:
            # QoS 1 et jamais retained : une commande ne doit pas être rejouée à la reconnexion.
            await client.publish(command_topic(device_id), json.dumps(payload), qos=1, retain=False)
        except aiomqtt.MqttError as exc:
            raise BrokerUnavailable() from exc

    # --- Réception ----------------------------------------------------------

    async def handle_message(self, topic: str, payload: Any) -> None:
        """Valide puis traite un message. Ne lève jamais : un message invalide est journalisé."""
        try:
            await self._dispatch(topic, payload)
        except DB_UNAVAILABLE_ERRORS as exc:
            log.error("Base indisponible, message perdu (topic=%s) : %s", topic, exc)
        except Exception:
            log.exception("Erreur inattendue sur le topic %s", topic)

    async def _dispatch(self, topic: str, payload: Any) -> None:
        parts = topic.split("/")
        if len(parts) != 4 or "/".join(parts[:2]) != TOPIC_PREFIX:
            log.warning("Topic inattendu ignoré : %s", topic)
            return
        topic_device, kind = parts[2], parts[3]

        if not isinstance(payload, (bytes, bytearray)) or len(payload) > MAX_PAYLOAD_BYTES:
            log.warning("Message rejeté (%s) : taille ou type invalide", topic)
            return

        model: type[BaseModel] = {"telemetry": Telemetry, "status": DeviceStatus, "acks": CommandAck}.get(
            kind
        )
        if model is None:
            log.warning("Type de topic inconnu ignoré : %s", topic)
            return
        try:
            message = model.model_validate_json(payload)
        except ValidationError as exc:
            errors = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']) or '<racine>'}: {e['msg']}" for e in exc.errors()
            )
            log.warning("Message rejeté (%s) : %s", topic, errors)
            return

        device_id = getattr(message, "device_id", topic_device)
        if device_id != topic_device:
            log.warning("Message rejeté (%s) : device_id %r différent du topic", topic, device_id)
            return

        if isinstance(message, Telemetry):
            await self._on_telemetry(message)
        elif isinstance(message, DeviceStatus):
            await self._on_status(topic_device, message)
        else:
            await self._on_ack(message)

    async def _on_telemetry(self, t: Telemetry) -> None:
        async with self._pool.acquire() as conn:
            measurement = await store.insert_measurement(conn, t)
            if measurement is None:
                log.info("Mesure dupliquée ignorée : %s boot=%s seq=%s", t.device_id, t.boot_id, t.sequence)
                return
            device = await store.get_device(conn, t.device_id)
        await self._hub.broadcast("measurement", measurement)
        await self._hub.broadcast("device", device)

    async def _on_status(self, device_id: str, status: DeviceStatus) -> None:
        async with self._pool.acquire() as conn:
            device = await store.set_device_status(conn, device_id, status.online)
        log.info("Boîtier %s : %s", device_id, "en ligne" if status.online else "hors ligne")
        await self._hub.broadcast("device", device)

    async def _on_ack(self, ack: CommandAck) -> None:
        async with self._pool.acquire() as conn:
            command = await store.apply_ack(conn, ack)
            if command is None:
                log.warning("Confirmation pour une commande inconnue : %s (%s)", ack.command_id, ack.device_id)
                return
            device = await store.set_actuator_state(conn, ack)
        log.info("Confirmation %s : %s -> %s", ack.command_id, ack.status, command["status"])
        await self._hub.broadcast("command", command)
        if device is not None:
            await self._hub.broadcast("device", device)


async def expire_commands_loop(pool: asyncpg.Pool, hub: LiveHub) -> None:
    """Passe en 'timeout' les commandes restées sans confirmation après leur expiration."""
    while True:
        try:
            async with pool.acquire() as conn:
                expired = await store.expire_commands(conn)
            for command in expired:
                log.warning("Commande %s non confirmée (timeout)", command["id"])
                await hub.broadcast("command", command)
        except DB_UNAVAILABLE_ERRORS as exc:
            log.error("Base indisponible pour le suivi des commandes : %s", exc)
        except Exception:
            log.exception("Erreur dans le suivi des commandes")
        await asyncio.sleep(1)
