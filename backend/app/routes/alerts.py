import logging
from typing import Literal, Optional

import asyncpg
from fastapi import APIRouter, Depends, Query, Response, status

from .. import store
from ..auth import require_api_key, require_session
from ..deps import get_conn, get_hub
from ..live import LiveHub
from ..schemas import DEVICE_ID_PATTERN, AlertIn

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_key)])
async def create_alert(
    alert: AlertIn,
    response: Response,
    conn: asyncpg.Connection = Depends(get_conn),
    hub: LiveHub = Depends(get_hub),
) -> dict:
    created = await store.insert_alert(conn, alert)
    if created is None:
        # Retransmission d'un event_id déjà reçu : pas de seconde alerte.
        response.status_code = status.HTTP_200_OK
        return {"duplicate": True, "alert": await store.get_alert_by_event(conn, alert.event_id)}
    log.info("Alerte %s reçue : %s/%s (%s)", alert.event_id, alert.source, alert.type, alert.severity)
    await hub.broadcast("alert", created)
    return {"duplicate": False, "alert": created}


@router.get("", dependencies=[Depends(require_session)])
async def list_alerts(
    device_id: Optional[str] = Query(None, pattern=DEVICE_ID_PATTERN),
    source: Optional[Literal["sensor", "vision", "anomaly"]] = None,
    severity: Optional[Literal["info", "warning", "critical"]] = None,
    before_id: Optional[int] = Query(None, ge=1, description="Pagination : alertes d'id inférieur"),
    limit: int = Query(50, ge=1, le=200),
    conn: asyncpg.Connection = Depends(get_conn),
) -> dict:
    items = await store.list_alerts(conn, device_id, source, severity, before_id, limit)
    next_before = items[-1]["id"] if len(items) == limit else None
    return {"items": items, "next_before_id": next_before}
