import asyncio
import json
import logging
from pathlib import Path

import asyncpg

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
MIGRATION_LOCK_ID = 7_431_001

# Erreurs signifiant « base injoignable » plutôt qu'une requête invalide.
DB_UNAVAILABLE_ERRORS = (
    OSError,
    asyncpg.PostgresConnectionError,
    asyncpg.InterfaceError,
    asyncpg.CannotConnectNowError,
)


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def create_pool(url: str, attempts: int = 15) -> asyncpg.Pool:
    for attempt in range(1, attempts + 1):
        try:
            return await asyncpg.create_pool(
                url, min_size=1, max_size=10, command_timeout=10, init=_init_connection
            )
        except DB_UNAVAILABLE_ERRORS as exc:
            log.warning("Base indisponible (tentative %d/%d) : %s", attempt, attempts, exc)
            await asyncio.sleep(2)
    raise RuntimeError("Impossible de se connecter à PostgreSQL")


async def run_migrations(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("SELECT pg_advisory_lock($1)", MIGRATION_LOCK_ID)
        try:
            await conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                " version TEXT PRIMARY KEY,"
                " applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
            )
            applied = {r["version"] for r in await conn.fetch("SELECT version FROM schema_migrations")}
            for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                if path.name in applied:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO schema_migrations (version) VALUES ($1)", path.name)
                log.info("Migration appliquée : %s", path.name)
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_ID)
