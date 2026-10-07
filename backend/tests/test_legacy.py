"""Mode compatibilité avec l'ancien firmware et l'ancien script de vision."""

import json

import pytest

from app.config import get_settings
from app.main import app
from app.mqtt import MqttBridge

LEGACY = {"device_id": "SENTINEL-NODE-01", "temperature": 23.4, "humidity": 41.0, "gas": 1024, "motion": True}


@pytest.fixture
def legacy_settings():
    settings = get_settings().model_copy(update={"legacy_mqtt_enabled": True})
    app.dependency_overrides[get_settings] = lambda: settings
    yield settings
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def legacy_bridge(pool, hub, mqtt_client, legacy_settings):
    bridge = MqttBridge(legacy_settings, pool, hub)
    bridge._client = mqtt_client
    return bridge


@pytest.fixture
async def legacy_client(client, legacy_bridge):
    app.state.mqtt = legacy_bridge
    response = await client.post("/api/v1/auth/login", json={"username": "superviseur", "password": "test-password"})
    assert response.status_code == 200
    return client


async def test_legacy_telemetry_converted(legacy_bridge, pool, hub):
    await legacy_bridge.handle_message("sentinel/telemetry", json.dumps(LEGACY).encode())
    row = await pool.fetchrow("SELECT device_id, temperature, humidity, gas_raw, motion FROM measurements")
    assert dict(row) == {"device_id": "sentinel-node-01", "temperature": 23.4, "humidity": 41.0, "gas_raw": 1024, "motion": True}
    assert await pool.fetchval("SELECT protocol FROM devices WHERE id = 'sentinel-node-01'") == "legacy"
    assert [e[0] for e in hub.events] == ["measurement", "device"]


async def test_legacy_telemetry_throttled(legacy_bridge, pool):
    for _ in range(5):  # l'ancien firmware publie toutes les 300 ms
        await legacy_bridge.handle_message("sentinel/telemetry", json.dumps(LEGACY).encode())
    assert await pool.fetchval("SELECT count(*) FROM measurements") == 1


async def test_legacy_topics_ignored_when_disabled(bridge, pool):
    await bridge.handle_message("sentinel/telemetry", json.dumps(LEGACY).encode())
    await bridge.handle_message("sentinel/alerts/vision", b'{"alert": "HUMAN_DETECTION", "count": 1}')
    assert await pool.fetchval("SELECT count(*) FROM measurements") == 0
    assert await pool.fetchval("SELECT count(*) FROM alerts") == 0


async def test_legacy_invalid_payload_rejected(legacy_bridge, pool):
    await legacy_bridge.handle_message("sentinel/telemetry", json.dumps({**LEGACY, "temperature": "chaud"}).encode())
    await legacy_bridge.handle_message("sentinel/telemetry", json.dumps({**LEGACY, "device_id": "!!!"}).encode())
    assert await pool.fetchval("SELECT count(*) FROM measurements") == 0


async def test_legacy_vision_alert_with_cooldown(legacy_bridge, pool, hub):
    payload = json.dumps({"alert": "HUMAN_DETECTION", "count": 2, "timestamp": 1791216000.5}).encode()
    await legacy_bridge.handle_message("sentinel/alerts/vision", payload)
    await legacy_bridge.handle_message("sentinel/alerts/vision", payload)  # 2 s plus tard : ignorée
    rows = await pool.fetch("SELECT source, type, severity, message FROM alerts")
    assert len(rows) == 1
    assert dict(rows[0]) == {
        "source": "vision",
        "type": "person_detected",
        "severity": "warning",
        "message": "2 personne(s) détectée(s) par la webcam",
    }
    assert [e[0] for e in hub.events] == ["alert"]


@pytest.mark.parametrize(
    ("action", "value", "expected"),
    [
        ("set_buzzer", True, {"buzzer": True}),
        ("set_buzzer", False, {"buzzer": False}),
        ("set_led", True, {"alert_level": "CRITICAL"}),
        ("set_led", False, {"alert_level": "NORMAL"}),
    ],
)
async def test_legacy_command_format(legacy_bridge, legacy_client, mqtt_client, action, value, expected):
    await legacy_bridge.handle_message("sentinel/telemetry", json.dumps(LEGACY).encode())
    response = await legacy_client.post(
        "/api/v1/devices/sentinel-node-01/commands", json={"action": action, "value": value}
    )
    assert response.status_code == 202
    assert response.json()["status"] == "sent"
    topic, body, qos, retain = mqtt_client.published[-1]
    assert topic == "sentinel/commands" and json.loads(body) == expected and retain is False


async def test_legacy_command_refused_when_disabled(pool, logged_client):
    await pool.execute("INSERT INTO devices (id, protocol) VALUES ('sentinel-node-01', 'legacy')")
    response = await logged_client.post(
        "/api/v1/devices/sentinel-node-01/commands", json={"action": "set_buzzer", "value": True}
    )
    assert response.status_code == 409
