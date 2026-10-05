from typing import AsyncIterator

import asyncpg
from fastapi import Request

from .live import LiveHub
from .mqtt import MqttBridge


async def get_conn(request: Request) -> AsyncIterator[asyncpg.Connection]:
    async with request.app.state.pool.acquire() as conn:
        yield conn


def get_hub(request: Request) -> LiveHub:
    return request.app.state.hub


def get_mqtt(request: Request) -> MqttBridge:
    return request.app.state.mqtt
