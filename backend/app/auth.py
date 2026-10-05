"""Authentification : session signée (cookie HttpOnly) pour le dashboard,
clé d'API pour le service IA."""

import hmac
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, WebSocket, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import Settings, get_settings

SESSION_COOKIE = "sentinel_session"

# Limitation simple des tentatives de connexion par adresse IP.
LOGIN_WINDOW_SECONDS = 60
LOGIN_MAX_FAILURES = 5
_login_failures: dict[str, deque[float]] = defaultdict(deque)


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="sentinel-session")


def create_session_token(settings: Settings, username: str) -> str:
    return _serializer(settings).dumps({"u": username})


def read_session_token(settings: Settings, token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        data = _serializer(settings).loads(token, max_age=settings.session_max_age_seconds)
    except (BadSignature, SignatureExpired):
        return None
    return data.get("u") if isinstance(data, dict) else None


def check_credentials(settings: Settings, username: str, password: str) -> bool:
    user_ok = hmac.compare_digest(username.encode(), settings.dashboard_user.encode())
    pass_ok = hmac.compare_digest(password.encode(), settings.dashboard_password.encode())
    return user_ok and pass_ok


def login_blocked(client_ip: str) -> bool:
    failures = _login_failures[client_ip]
    now = time.monotonic()
    while failures and now - failures[0] > LOGIN_WINDOW_SECONDS:
        failures.popleft()
    return len(failures) >= LOGIN_MAX_FAILURES


def record_login_failure(client_ip: str) -> None:
    _login_failures[client_ip].append(time.monotonic())


def require_session(request: Request, settings: Settings = Depends(get_settings)) -> str:
    user = read_session_token(settings, request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session absente ou expirée")
    return user


def websocket_user(ws: WebSocket, settings: Settings) -> Optional[str]:
    return read_session_token(settings, ws.cookies.get(SESSION_COOKIE))


def require_api_key(
    x_api_key: Optional[str] = Header(None),
    settings: Settings = Depends(get_settings),
) -> None:
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), settings.alerts_api_key.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Clé d'API invalide")
