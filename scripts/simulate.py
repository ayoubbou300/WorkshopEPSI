"""Simulateur du boîtier Sentinel-X (identifiant sim-01).

Publie des mesures au format convenu (avec "simulated": true pour qu'elles ne soient jamais
confondues avec des mesures physiques), gère le statut avec Last Will et confirme les commandes
comme le ferait le firmware.

Lancement : docker compose --profile sim up simulator
Variables : MQTT_HOST, MQTT_PORT, MQTT_USERNAME (= sim-01), MQTT_PASSWORD, SIM_INTERVAL (s)
"""

import asyncio
import itertools
import json
import math
import os
import random
import signal
import uuid
from datetime import datetime, timezone

import aiomqtt

DEVICE_ID = os.environ.get("MQTT_USERNAME", "sim-01")
BASE = f"sentinel/devices/{DEVICE_ID}"
INTERVAL = float(os.environ.get("SIM_INTERVAL", "2"))


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def telemetry(sequence: int, boot_id: str) -> dict:
    t = sequence * INTERVAL
    temperature = round(24 + 1.5 * math.sin(t / 60) + random.gauss(0, 0.1), 1)
    humidity = round(52 + 4 * math.sin(t / 90) + random.gauss(0, 0.3), 1)
    gas = int(310 + 15 * math.sin(t / 45) + random.gauss(0, 3))
    return {
        "schema_version": 1,
        "device_id": DEVICE_ID,
        "boot_id": boot_id,
        "sequence": sequence,
        "timestamp": now_iso(),
        # Une lecture DHT22 sur 15 échoue : la valeur est inconnue, pas 0.
        "temperature": None if sequence % 15 == 7 else temperature,
        "humidity": None if sequence % 15 == 7 else humidity,
        "gas_raw": max(0, min(1023, gas)),
        "motion": random.random() < 0.1,
        "simulated": True,
    }


async def publish_loop(client: aiomqtt.Client, boot_id: str, counter: "itertools.count[int]") -> None:
    # Le compteur survit aux reconnexions : (boot_id, sequence) ne se répète jamais dans un même boot.
    while True:
        await client.publish(f"{BASE}/telemetry", json.dumps(telemetry(next(counter), boot_id)), qos=1)
        await asyncio.sleep(INTERVAL)


async def command_loop(client: aiomqtt.Client) -> None:
    state = {"buzzer": False, "led": False}
    seen: set[str] = set()
    async for message in client.messages:
        try:
            cmd = json.loads(message.payload)
            command_id = cmd["command_id"]
        except (ValueError, KeyError, TypeError):
            print("Commande illisible ignorée")
            continue
        ack = {"command_id": command_id, "device_id": DEVICE_ID}
        expires = datetime.fromisoformat(cmd.get("expires_at", "").replace("Z", "+00:00") or now_iso())
        if command_id in seen:
            ack.update(status="applied", **state)  # doublon : on reconfirme sans rejouer
        elif expires < datetime.now(timezone.utc):
            ack.update(status="expired", reason="commande expirée")
        elif cmd.get("action") in ("set_buzzer", "set_led") and isinstance(cmd.get("value"), bool):
            state[cmd["action"].removeprefix("set_")] = cmd["value"]
            seen.add(command_id)
            ack.update(status="applied", **state)
        else:
            ack.update(status="rejected", reason="action inconnue")
        await asyncio.sleep(0.3)  # temps d'exécution simulé
        await client.publish(f"{BASE}/acks", json.dumps(ack), qos=1)
        print(f"Commande {command_id} -> {ack['status']} {state}")


async def main() -> None:
    boot_id = f"sim-{uuid.uuid4().hex[:8]}"
    counter = itertools.count()
    will = aiomqtt.Will(f"{BASE}/status", json.dumps({"online": False}), qos=1, retain=True)
    while True:
        try:
            async with aiomqtt.Client(
                hostname=os.environ.get("MQTT_HOST", "localhost"),
                port=int(os.environ.get("MQTT_PORT", "1883")),
                username=DEVICE_ID,
                password=os.environ["MQTT_PASSWORD"],
                identifier=DEVICE_ID,
                will=will,
                keepalive=15,
            ) as client:
                await client.publish(f"{BASE}/status", json.dumps({"online": True}), qos=1, retain=True)
                await client.subscribe(f"{BASE}/commands", qos=1)
                print(f"Simulateur {DEVICE_ID} connecté (boot {boot_id}), une mesure toutes les {INTERVAL}s")
                await asyncio.gather(publish_loop(client, boot_id, counter), command_loop(client))
        except aiomqtt.MqttError as exc:
            print(f"Connexion MQTT perdue : {exc} ; nouvelle tentative dans 3 s")
            await asyncio.sleep(3)


if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    task = loop.create_task(main())
    loop.add_signal_handler(signal.SIGTERM, task.cancel)
    try:
        loop.run_until_complete(task)
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
