"""/health/db must degrade to a sanitized 503 when the DB probe fails."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.asyncio

SECRET_TEXT = "boom-secret-host-10.0.0.5-password=hunter2"


async def test_health_db_returns_503_without_leaking_exception(
    api_client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def failing_execute(*args, **kwargs):
        raise RuntimeError(SECRET_TEXT)

    monkeypatch.setattr(db_session, "execute", failing_execute)
    response = await api_client.get("/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "boom-secret" not in response.text and "hunter2" not in response.text
    assert "RuntimeError" not in response.text
