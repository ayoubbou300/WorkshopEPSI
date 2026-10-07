"""Pont MQTT : abonnement aux remontées des boîtiers et publication des commandes."""

import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional, TypeVar

import aiomqtt
import asyncpg
from pydantic import BaseModel, ValidationError

from . import store
from .config import Settings
from .db import DB_UNAVAILABLE_ERRORS
from .live import LiveHub
from .schemas import (
    DEVICE_ID_PATTERN,
    AlertIn,
    CommandAck,
    DeviceStatus,
    LegacyTelemetry,
    LegacyVisionAlert,
    Telemetry,
)

log = logging.getLogger(__name__)

TOPIC_PREFIX = "sentinel/devices"
MAX_PAYLOAD_BYTES = 4096
RECONNECT_DELAY_SECONDS = 3

# Mode compatibilité : topics partagés de l'ancien firmware et de l'ancien script de vision.
LEGACY_TELEMETRY_TOPIC = "sentinel/telemetry"
LEGACY_COMMANDS_TOPIC = "sentinel/commands"
LEGACY_VISION_TOPIC = "sentinel/alerts/vision"

M = TypeVar("M", bound=BaseModel)


class BrokerUnavailable(Exception):
    pass


def command_topic(device_id: str) -> str:
    return f"{TOPIC_PREFIX}/{device_id}/commands"


def legacy_device_id(raw: str) -> Optional[str]:
    """« SENTINEL-NODE-01 » -> « sentinel-node-01 » ; None si inutilisable."""
    device_id = re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")[:32]
    return device_id if re.fullmatch(DEVICE_ID_PATTERN, device_id) else None


def legacy_command_payload(action: str, value: bool) -> dict[str, Any]:
    """Format de commande compris par l'ancien firmware.
    LED bicolore : alert_level CRITICAL = rouge, autre valeur = vert."""
    if action == "set_buzzer":
        return {"buzzer": value}
    return {"alert_level": "CRITICAL" if value else "NORMAL"}


class MqttBridge:
    def __init__(self, settings: Settings, pool: asyncpg.Pool, hub: LiveHub) -> None:
        self._settings = settings
        self._pool = pool
        self._hub = hub
        self._client: Optional[aiomqtt.Client] = None
        self._legacy_last_stored: dict[str, float] = {}
        self._legacy_last_vision = float("-inf")

    @property
    def connected(self) -> bool:
        return self._client is not None

    def _subscriptions(self) -> list[tuple[str, int]]:
        topics = [(f"{TOPIC_PREFIX}/+/{kind}", 1) for kind in ("telemetry", "status", "acks")]
        if self._settings.legacy_mqtt_enabled:
            topics += [(LEGACY_TELEMETRY_TOPIC, 0), (LEGACY_VISION_TOPIC, 0)]
        return topics

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
                    await client.subscribe(self._subscriptions())
                    self._client = client
                    log.info("Connecté au broker MQTT %s:%s", s.mqtt_host, s.mqtt_port)
                    if s.legacy_mqtt_enabled:
                        log.warning("Mode compatibilité actif : topics %s, %s et %s",
                                    LEGACY_TELEMETRY_TOPIC, LEGACY_COMMANDS_TOPIC, LEGACY_VISION_TOPIC)
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

    async def publish(self, topic: str, payload: dict[str, Any]) -> None:
        client = self._client
        if client is None:
            raise BrokerUnavailable()
        try:
            # QoS 1 et jamais retained : une commande ne doit pas être rejouée à la reconnexion.
            await client.publish(topic, json.dumps(payload), qos=1, retain=False)
        except aiomqtt.MqttError as exc:
            raise BrokerUnavailable() from exc

    async def publish_command(self, device_id: str, payload: dict[str, Any]) -> None:
        await self.publish(command_topic(device_id), payload)

    # --- Réception ----------------------------------------------------------

    async def handle_message(self, topic: str, payload: Any) -> None:
        """Valide puis traite un message. Ne lève jamais : un message invalide est journalisé."""
        try:
            await self._dispatch(topic, payload)
        except DB_UNAVAILABLE_ERRORS as exc:
            log.error("Base indisponible, message perdu (topic=%s) : %s", topic, exc)
        except Exception:
            log.exception("Erreur inattendue sur le topic %s", topic)

    @staticmethod
    def _validate(model: type[M], topic: str, payload: Any) -> Optional[M]:
        if not isinstance(payload, (bytes, bytearray)) or len(payload) > MAX_PAYLOAD_BYTES:
            log.warning("Message rejeté (%s) : taille ou type invalide", topic)
            return None
        try:
            return model.model_validate_json(payload)
        except ValidationError as exc:
            errors = "; ".join(
                f"{'.'.join(str(p) for p in e['loc']) or '<racine>'}: {e['msg']}" for e in exc.errors()
            )
            log.warning("Message rejeté (%s) : %s", topic, errors)
            return None

    async def _dispatch(self, topic: str, payload: Any) -> None:
        if self._settings.legacy_mqtt_enabled:
            if topic == LEGACY_TELEMETRY_TOPIC:
                if (legacy := self._validate(LegacyTelemetry, topic, payload)) is not None:
                    await self._on_legacy_telemetry(legacy)
                return
            if topic == LEGACY_VISION_TOPIC:
                if (vision := self._validate(LegacyVisionAlert, topic, payload)) is not None:
                    await self._on_legacy_vision(vision)
                return

        parts = topic.split("/")
        if len(parts) != 4 or "/".join(parts[:2]) != TOPIC_PREFIX:
            log.warning("Topic inattendu ignoré : %s", topic)
            return
        topic_device, kind = parts[2], parts[3]

        model: Optional[type[BaseModel]] = {
            "telemetry": Telemetry,
            "status": DeviceStatus,
            "acks": CommandAck,
        }.get(kind)
        if model is None:
            log.warning("Type de topic inconnu ignoré : %s", topic)
            return
        message = self._validate(model, topic, payload)
        if message is None:
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

    async def _on_telemetry(self, t: Telemetry, protocol: str = "v1") -> None:
        async with self._pool.acquire() as conn:
            measurement = await store.insert_measurement(conn, t, protocol)
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

    # --- Mode compatibilité -------------------------------------------------

    async def _on_legacy_telemetry(self, legacy: LegacyTelemetry) -> None:
        device_id = legacy_device_id(legacy.device_id)
        if device_id is None:
            log.warning("Message rejeté (%s) : device_id %r inutilisable", LEGACY_TELEMETRY_TOPIC, legacy.device_id)
            return
        # L'ancien firmware publie toutes les 300 ms : on ne stocke qu'une mesure par intervalle.
        now = time.monotonic()
        last = self._legacy_last_stored.get(device_id)
        if last is not None and now - last < self._settings.legacy_min_interval_seconds:
            return
        self._legacy_last_stored[device_id] = now
        telemetry = Telemetry(
            schema_version=1,
            device_id=device_id,
            temperature=legacy.temperature,
            humidity=legacy.humidity,
            gas_raw=legacy.gas,
            motion=legacy.motion,
        )
        await self._on_telemetry(telemetry, protocol="legacy")

    async def _on_legacy_vision(self, vision: LegacyVisionAlert) -> None:
        # L'ancien script publie toutes les 2 s tant qu'une personne est visible.
        now = time.monotonic()
        if now - self._legacy_last_vision < self._settings.legacy_vision_cooldown_seconds:
            return
        self._legacy_last_vision = now

        when = (
            datetime.fromtimestamp(vision.timestamp, tz=timezone.utc)
            if vision.timestamp
            else datetime.now(timezone.utc)
        )
        if vision.alert.upper() == "HUMAN_DETECTION":
            alert_type = "person_detected"
        else:
            alert_type = re.sub(r"[^a-z0-9_]+", "_", vision.alert.lower()).strip("_")[:48] or "vision_event"
        alert = AlertIn(
            event_id=f"legacy-vision-{int(when.timestamp() * 1000)}",
            source="vision",
            type=alert_type,
            severity="warning",
            timestamp=when,
            message=f"{vision.count} personne(s) détectée(s) par la webcam" if vision.count else "Détection webcam",
        )
        async with self._pool.acquire() as conn:
            created = await store.insert_alert(conn, alert)
        if created is not None:
            log.info("Alerte vision (ancien format) : %s", alert.event_id)
            await self._hub.broadcast("alert", created)


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
