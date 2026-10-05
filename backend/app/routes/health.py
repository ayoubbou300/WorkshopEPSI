from datetime import datetime, timezone

from fastapi import APIRouter, Request

from ..db import DB_UNAVAILABLE_ERRORS

router = APIRouter()


@router.get("/health")
async def health(request: Request) -> dict:
    """Le service répond (200) ; l'état de chaque dépendance est détaillé séparément."""
    database = "ok"
    try:
        async with request.app.state.pool.acquire(timeout=2) as conn:
            await conn.fetchval("SELECT 1")
    except (*DB_UNAVAILABLE_ERRORS, TimeoutError):
        database = "unavailable"
    return {
        "status": "ok",
        "database": database,
        "mqtt": "connected" if request.app.state.mqtt.connected else "disconnected",
        "server_time": datetime.now(timezone.utc),
    }
