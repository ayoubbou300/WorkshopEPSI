"""Scénarios de recette automatisés (section 13 du plan) contre une vraie base PostgreSQL."""

import json

from app import store

API_KEY = {"X-API-Key": "test-api-key"}

TELEMETRY = {
    "schema_version": 1,
    "device_id": "esp-01",
    "boot_id": "boot-001",
    "sequence": 1,
    "timestamp": "2026-10-05T14:00:00Z",
    "temperature": 24.5,
    "humidity": 53.2,
    "gas_raw": 318,
    "motion": False,
}


def payload(**override) -> bytes:
    return json.dumps({**TELEMETRY, **override}).encode()


# --- Mesures ----------------------------------------------------------------


async def test_measurement_stored_and_broadcast(bridge, hub, logged_client):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    assert [e[0] for e in hub.events] == ["measurement", "device"]

    devices = (await logged_client.get("/api/v1/devices")).json()["devices"]
    assert devices[0]["id"] == "esp-01"
    assert devices[0]["latest"]["temperature"] == 24.5
    assert devices[0]["stale"] is False

    items = (await logged_client.get("/api/v1/measurements", params={"device_id": "esp-01"})).json()["items"]
    assert len(items) == 1 and items[0]["humidity"] == 53.2


async def test_missing_value_stored_as_null(bridge, pool):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload(temperature=None))
    assert await pool.fetchval("SELECT temperature FROM measurements") is None


async def test_duplicate_measurement_ignored(bridge, pool, hub):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    assert await pool.fetchval("SELECT count(*) FROM measurements") == 1
    assert [e[0] for e in hub.events].count("measurement") == 1


async def test_invalid_messages_rejected_without_crash(bridge, pool):
    for topic, body in [
        ("sentinel/devices/esp-01/telemetry", b"not json"),
        ("sentinel/devices/esp-01/telemetry", payload(temperature="hot")),
        ("sentinel/devices/esp-01/telemetry", payload(device_id="esp-02")),  # usurpation de topic
        ("sentinel/devices/esp-01/telemetry", b"x" * 10_000),
        ("sentinel/devices/esp-01/unknown", payload()),
        ("other/topic", payload()),
    ]:
        await bridge.handle_message(topic, body)
    assert await pool.fetchval("SELECT count(*) FROM measurements") == 0


async def test_status_offline(bridge, logged_client):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    await bridge.handle_message("sentinel/devices/esp-01/status", b'{"online": false}')
    device = (await logged_client.get("/api/v1/devices/esp-01")).json()
    assert device["mqtt_online"] is False


# --- Alertes ----------------------------------------------------------------

ALERT = {
    "event_id": "vision-001",
    "device_id": "esp-01",
    "source": "vision",
    "type": "person_detected",
    "severity": "warning",
    "timestamp": "2026-10-05T14:00:03Z",
    "score": 0.91,
    "message": "Présence humaine détectée",
}


async def test_alert_requires_api_key(client):
    assert (await client.post("/api/v1/alerts", json=ALERT)).status_code == 401
    assert (await client.post("/api/v1/alerts", json=ALERT, headers={"X-API-Key": "faux"})).status_code == 401


async def test_alert_duplicate_persisted_once(client, pool, hub):
    first = await client.post("/api/v1/alerts", json=ALERT, headers=API_KEY)
    second = await client.post("/api/v1/alerts", json=ALERT, headers=API_KEY)
    assert first.status_code == 201 and first.json()["duplicate"] is False
    assert second.status_code == 200 and second.json()["duplicate"] is True
    assert await pool.fetchval("SELECT count(*) FROM alerts") == 1
    assert [e[0] for e in hub.events] == ["alert"]


async def test_alert_invalid_rejected(client):
    response = await client.post("/api/v1/alerts", json={**ALERT, "severity": "panic"}, headers=API_KEY)
    assert response.status_code == 422


async def test_body_too_large(client):
    response = await client.post(
        "/api/v1/alerts", content=b"{" + b" " * 20_000 + b"}", headers={**API_KEY, "Content-Type": "application/json"}
    )
    assert response.status_code == 413


async def test_alert_list_pagination(client, logged_client):
    for i in range(3):
        await client.post("/api/v1/alerts", json={**ALERT, "event_id": f"e-{i}"}, headers=API_KEY)
    page = (await logged_client.get("/api/v1/alerts", params={"limit": 2})).json()
    assert [a["event_id"] for a in page["items"]] == ["e-2", "e-1"]
    rest = (await logged_client.get("/api/v1/alerts", params={"before_id": page["next_before_id"]})).json()
    assert [a["event_id"] for a in rest["items"]] == ["e-0"]


# --- Accès ------------------------------------------------------------------


async def test_reads_and_commands_require_session(client):
    assert (await client.get("/api/v1/devices")).status_code == 401
    assert (await client.get("/api/v1/alerts")).status_code == 401
    response = await client.post("/api/v1/devices/esp-01/commands", json={"action": "set_buzzer", "value": True})
    assert response.status_code == 401


async def test_login_rate_limited(client):
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"username": "superviseur", "password": "faux"})
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"username": "superviseur", "password": "test-password"})
    assert r.status_code == 429


# --- Commandes --------------------------------------------------------------


async def test_command_cycle_confirmed(bridge, logged_client, mqtt_client, hub):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())

    response = await logged_client.post(
        "/api/v1/devices/esp-01/commands", json={"action": "set_buzzer", "value": True}
    )
    assert response.status_code == 202
    command = response.json()
    assert command["status"] == "pending"

    topic, body, qos, retain = mqtt_client.published[0]
    assert topic == "sentinel/devices/esp-01/commands" and qos == 1 and retain is False
    sent = json.loads(body)
    assert sent["command_id"] == command["id"] and sent["value"] is True and sent["expires_at"].endswith("Z")

    ack = {"command_id": command["id"], "device_id": "esp-01", "status": "applied", "buzzer": True}
    await bridge.handle_message("sentinel/devices/esp-01/acks", json.dumps(ack).encode())

    result = (await logged_client.get(f"/api/v1/commands/{command['id']}")).json()
    assert result["status"] == "confirmed"
    device = (await logged_client.get("/api/v1/devices/esp-01")).json()
    assert device["buzzer"] is True


async def test_command_rejected_by_device(bridge, logged_client):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    command = (
        await logged_client.post("/api/v1/devices/esp-01/commands", json={"action": "set_led", "value": True})
    ).json()
    ack = {"command_id": command["id"], "device_id": "esp-01", "status": "rejected", "reason": "test"}
    await bridge.handle_message("sentinel/devices/esp-01/acks", json.dumps(ack).encode())
    assert (await logged_client.get(f"/api/v1/commands/{command['id']}")).json()["status"] == "failed"


async def test_ack_from_other_device_ignored(bridge, logged_client):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    await bridge.handle_message("sentinel/devices/esp-02/telemetry", payload(device_id="esp-02"))
    command = (
        await logged_client.post("/api/v1/devices/esp-01/commands", json={"action": "set_buzzer", "value": True})
    ).json()
    ack = {"command_id": command["id"], "device_id": "esp-02", "status": "applied", "buzzer": True}
    await bridge.handle_message("sentinel/devices/esp-02/acks", json.dumps(ack).encode())
    assert (await logged_client.get(f"/api/v1/commands/{command['id']}")).json()["status"] == "pending"


async def test_command_timeout_then_late_ack(bridge, logged_client, pool):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    command = (
        await logged_client.post("/api/v1/devices/esp-01/commands", json={"action": "set_buzzer", "value": True})
    ).json()
    await pool.execute("UPDATE commands SET expires_at = now() - interval '5 seconds' WHERE id = $1", command["id"])
    async with pool.acquire() as conn:
        expired = await store.expire_commands(conn)
    assert [c["id"] for c in expired] == [command["id"]]

    # Une confirmation tardive met à jour l'état observé mais la commande reste non confirmée.
    ack = {"command_id": command["id"], "device_id": "esp-01", "status": "applied", "buzzer": True}
    await bridge.handle_message("sentinel/devices/esp-01/acks", json.dumps(ack).encode())
    assert (await logged_client.get(f"/api/v1/commands/{command['id']}")).json()["status"] == "timeout"
    assert (await logged_client.get("/api/v1/devices/esp-01")).json()["buzzer"] is True


async def test_command_broker_down(bridge, logged_client, pool):
    await bridge.handle_message("sentinel/devices/esp-01/telemetry", payload())
    bridge._client = None
    response = await logged_client.post(
        "/api/v1/devices/esp-01/commands", json={"action": "set_buzzer", "value": True}
    )
    assert response.status_code == 503
    assert await pool.fetchval("SELECT status FROM commands") == "failed"


async def test_command_unknown_device_or_action(logged_client):
    r = await logged_client.post("/api/v1/devices/esp-99/commands", json={"action": "set_buzzer", "value": True})
    assert r.status_code == 404
    r = await logged_client.post("/api/v1/devices/esp-01/commands", json={"action": "reboot", "value": True})
    assert r.status_code == 422
