"""Recurring tasks without due_date use the user's local date, not UTC's."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio

# 23:30 UTC on Jan 1 is already Jan 2 in Kiritimati (UTC+14) and Jan 1 in UTC.
FROZEN_UTC = datetime(2030, 1, 1, 23, 30, tzinfo=UTC)


async def _create_daily_task(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/v1/tasks",
        json={"title": "Stretch", "recurrence_rule": {"frequency": "daily"}},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_recurring_task_default_due_date_uses_user_timezone(
    api_client: AsyncClient, user_a, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.utils.datetime.now_utc", lambda: FROZEN_UTC)
    patched = await api_client.patch(
        "/api/v1/users/me", json={"timezone": "Pacific/Kiritimati"}, headers=csrf_headers(api_client)
    )
    assert patched.status_code == 200, patched.text
    task = await _create_daily_task(api_client)
    assert task["due_date"] == "2030-01-02"


async def test_recurring_task_default_due_date_utc_user(
    api_client: AsyncClient, user_a, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.utils.datetime.now_utc", lambda: FROZEN_UTC)
    task = await _create_daily_task(api_client)
    assert task["due_date"] == "2030-01-01"
