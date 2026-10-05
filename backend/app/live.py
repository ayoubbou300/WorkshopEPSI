import asyncio
import logging
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

log = logging.getLogger(__name__)


class LiveHub:
    """Diffuse les événements temps réel aux navigateurs connectés."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients.discard(ws)

    async def broadcast(self, event_type: str, data: Any) -> None:
        message = {"type": event_type, "data": jsonable_encoder(data)}
        for ws in list(self._clients):
            try:
                await asyncio.wait_for(ws.send_json(message), timeout=2)
            except Exception:
                # Client lent ou déconnecté : il rechargera l'état par REST à sa reconnexion.
                self._clients.discard(ws)
