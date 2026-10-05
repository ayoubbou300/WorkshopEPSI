import os

# Valeurs de test, définies avant l'import de l'application.
os.environ.setdefault("DATABASE_URL", "postgresql://unused/unused")
os.environ.setdefault("MQTT_PASSWORD", "test-mqtt")
os.environ.setdefault("ALERTS_API_KEY", "test-api-key")
os.environ.setdefault("DASHBOARD_USER", "superviseur")
os.environ.setdefault("DASHBOARD_PASSWORD", "test-password")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COMMAND_TIMEOUT_SECONDS", "10")

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402

from app import auth  # noqa: E402
from app.db import create_pool, run_migrations  # noqa: E402
from app.live import LiveHub  # noqa: E402
from app.main import app  # noqa: E402
from app.mqtt import MqttBridge  # noqa: E402
from app.config import get_settings  # noqa: E402

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TEST_DB_NAME = "sentinel_test"


class RecordingHub(LiveHub):
    def __init__(self) -> None:
        super().__init__()
        self.events: list[tuple[str, dict]] = []

    async def broadcast(self, event_type, data) -> None:
        self.events.append((event_type, data))


class FakeMqttClient:
    def __init__(self) -> None:
        self.published: list[tuple[str, str, int, bool]] = []

    async def publish(self, topic, payload, qos=0, retain=False) -> None:
        self.published.append((topic, payload, qos, retain))


async def _ensure_test_database() -> str:
    admin = await asyncpg.connect(TEST_DATABASE_URL)
    try:
        exists = await admin.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB_NAME)
        if not exists:
            await admin.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        await admin.close()
    return TEST_DATABASE_URL.rsplit("/", 1)[0] + "/" + TEST_DB_NAME


@pytest.fixture
async def pool():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL non défini (lancer via docker compose --profile test)")
    pool = await create_pool(await _ensure_test_database(), attempts=1)
    await run_migrations(pool)
    await pool.execute("TRUNCATE commands, alerts, measurements, devices RESTART IDENTITY CASCADE")
    yield pool
    await pool.close()


@pytest.fixture
def hub():
    return RecordingHub()


@pytest.fixture
def mqtt_client():
    return FakeMqttClient()


@pytest.fixture
def bridge(pool, hub, mqtt_client):
    bridge = MqttBridge(get_settings(), pool, hub)
    bridge._client = mqtt_client  # simule une connexion au broker
    return bridge


@pytest.fixture
async def client(pool, hub, bridge):
    app.state.pool, app.state.hub, app.state.mqtt = pool, hub, bridge
    auth._login_failures.clear()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def logged_client(client):
    response = await client.post(
        "/api/v1/auth/login", json={"username": "superviseur", "password": "test-password"}
    )
    assert response.status_code == 200
    return client
