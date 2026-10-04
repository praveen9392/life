"""Liveness/readiness probe tests: unversioned, unauthenticated /health routes."""

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio


async def test_health_returns_ok_without_authentication(api_client: AsyncClient) -> None:
    response = await api_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_db_confirms_database_connectivity(api_client: AsyncClient) -> None:
    """Readiness probe: must return 200 while the test database is reachable."""
    response = await api_client.get("/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
