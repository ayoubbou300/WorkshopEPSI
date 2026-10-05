import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from ..auth import require_session
from ..config import Settings, get_settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["video"])


@router.get("/video", dependencies=[Depends(require_session)])
async def video(settings: Settings = Depends(get_settings)) -> StreamingResponse:
    """Relaie le flux MJPEG du service IA (seul propriétaire de la webcam) vers le navigateur,
    derrière la session du dashboard."""
    if not settings.video_stream_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Flux vidéo non configuré")
    client = httpx.AsyncClient(timeout=httpx.Timeout(5.0, read=None))
    try:
        upstream = await client.send(client.build_request("GET", settings.video_stream_url), stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        log.warning("Flux vidéo injoignable : %s", exc)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Flux vidéo indisponible")
    if upstream.status_code != 200:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Flux vidéo indisponible")

    async def close() -> None:
        await upstream.aclose()
        await client.aclose()

    return StreamingResponse(
        upstream.aiter_raw(),
        media_type=upstream.headers.get("content-type", "multipart/x-mixed-replace"),
        headers={"Cache-Control": "no-store"},
        background=BackgroundTask(close),
    )
