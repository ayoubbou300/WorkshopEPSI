from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from ..auth import websocket_user
from ..config import get_settings

router = APIRouter()


@router.websocket("/api/v1/live")
async def live(ws: WebSocket) -> None:
    """Flux temps réel : messages {"type": ..., "data": ...}.
    Types : measurement, device, alert, command, server."""
    if websocket_user(ws, get_settings()) is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    hub = ws.app.state.hub
    await hub.connect(ws)
    await ws.send_json(
        {"type": "server", "data": {"mqtt": "connected" if ws.app.state.mqtt.connected else "disconnected"}}
    )
    try:
        # Le client n'envoie rien d'utile ; la boucle détecte la déconnexion.
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
