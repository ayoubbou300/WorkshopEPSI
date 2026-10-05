import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import DB_UNAVAILABLE_ERRORS, create_pool, run_migrations
from .live import LiveHub
from .mqtt import MqttBridge, expire_commands_loop
from .routes import alerts, auth, commands, devices, health, live, video

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
log = logging.getLogger("sentinel")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    pool = await create_pool(settings.database_url)
    await run_migrations(pool)
    hub = LiveHub()
    mqtt = MqttBridge(settings, pool, hub)
    app.state.pool, app.state.hub, app.state.mqtt = pool, hub, mqtt
    tasks = [
        asyncio.create_task(mqtt.run(), name="mqtt"),
        asyncio.create_task(expire_commands_loop(pool, hub), name="command-timeouts"),
    ]
    log.info("API Sentinel-X démarrée")
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await pool.close()


app = FastAPI(title="Sentinel-X API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    length = request.headers.get("content-length")
    if length is not None and (not length.isdigit() or int(length) > get_settings().max_body_bytes):
        return JSONResponse({"detail": "Corps de requête trop volumineux"}, status_code=413)
    return await call_next(request)


async def db_unavailable(request: Request, exc: Exception) -> JSONResponse:
    log.error("Base indisponible pendant %s %s : %s", request.method, request.url.path, exc)
    return JSONResponse({"detail": "Base de données indisponible"}, status_code=503)


for _exc in DB_UNAVAILABLE_ERRORS:
    app.add_exception_handler(_exc, db_unavailable)

for router in (health.router, auth.router, devices.router, alerts.router, commands.router, live.router, video.router):
    app.include_router(router)
