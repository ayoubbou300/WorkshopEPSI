from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import AwareDatetime

from .. import store
from ..auth import require_session
from ..config import Settings, get_settings
from ..deps import get_conn
from ..schemas import DEVICE_ID_PATTERN

router = APIRouter(prefix="/api/v1", tags=["devices"], dependencies=[Depends(require_session)])


@router.get("/devices")
async def list_devices(
    conn: asyncpg.Connection = Depends(get_conn),
    settings: Settings = Depends(get_settings),
) -> dict:
    now = datetime.now(timezone.utc)
    stale_after = timedelta(seconds=settings.stale_after_seconds)
    devices = await store.list_devices(conn)
    for device in devices:
        last_seen = device["last_seen_at"]
        device["stale"] = last_seen is None or now - last_seen > stale_after
    return {
        "server_time": now,
        "stale_after_seconds": settings.stale_after_seconds,
        "devices": devices,
    }


@router.get("/measurements")
async def list_measurements(
    device_id: str = Query(..., pattern=DEVICE_ID_PATTERN),
    since: Optional[AwareDatetime] = None,
    until: Optional[AwareDatetime] = None,
    limit: int = Query(300, ge=1, le=2000),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    return {"items": await store.list_measurements(conn, device_id, since, until, limit)}


@router.get("/devices/{device_id}")
async def get_device(
    device_id: str = Path(..., pattern=DEVICE_ID_PATTERN),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    device = await store.get_device(conn, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Boîtier inconnu")
    return device
