from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..auth import (
    SESSION_COOKIE,
    check_credentials,
    create_session_token,
    login_blocked,
    record_login_failure,
    require_session,
)
from ..config import Settings, get_settings
from ..schemas import LoginIn

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
async def login(
    body: LoginIn,
    request: Request,
    response: Response,
    settings: Settings = Depends(get_settings),
) -> dict:
    client_ip = request.client.host if request.client else "inconnu"
    if login_blocked(client_ip):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Trop de tentatives, réessayer plus tard")
    if not check_credentials(settings, body.username, body.password):
        record_login_failure(client_ip)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Identifiants invalides")
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(settings, body.username),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return {"user": body.username}


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: str = Depends(require_session)) -> dict:
    return {"user": user}
