"""Unauthenticated liveness/readiness routes for deployment health checks.

These are intentionally separate from `app.api.v1.routes.health`, which is
the authenticated HealthMetric *feature* router (`/api/v1/health/metrics`).
`render.yaml`'s `healthCheckPath` (and any load balancer / orchestrator
liveness probe) needs a route that never requires auth and never 404s, so
it is mounted unversioned at `/health` and `/health/db`.
"""

import asyncio

from fastapi import APIRouter, status
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.exceptions import AppException
from app.core.logging import logger

router = APIRouter(tags=["liveness"])
_DB_PROBE_TIMEOUT_SECONDS = 3


class DatabaseUnavailableError(AppException):
    """Raised when the `/health/db` connectivity probe cannot reach the database."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "DATABASE_UNAVAILABLE"


@router.get("/health")
async def get_liveness() -> dict[str, str]:
    """Pure liveness probe: no DB access, no auth, always 200 if the process is up."""
    return {"status": "ok"}


@router.get("/health/db")
async def get_database_connectivity(db: DbSession) -> dict[str, str]:
    """Deeper readiness probe: confirms the database is reachable.

    Runs a trivial `SELECT 1` against the configured database using the
    same async session factory as the rest of the app (`app.db.session`).

    Raises:
        DatabaseUnavailableError: with a 503 status if the database is unreachable.
    """
    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=_DB_PROBE_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.error(f"liveness_db_check_failed | error_type={type(exc).__name__}")
        raise DatabaseUnavailableError("Database connectivity check failed") from exc
    return {"status": "ok", "database": "connected"}
