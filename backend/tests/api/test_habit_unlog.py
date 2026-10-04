"""DELETE /habits/{id}/log/{date}: clearing a habit log (undo check-off)."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def _create_habit(client: AsyncClient, name: str = "Meditate", **overrides) -> dict:
    payload = {"name": name, "frequency_type": "daily", "start_date": _today(), **overrides}
    response = await client.post("/api/v1/habits", json=payload, headers=csrf_headers(client))
    assert response.status_code == 201, response.text
    return response.json()


async def test_delete_log_removes_it_from_history(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    habit = await _create_habit(api_client)
    url = f"/api/v1/habits/{habit['id']}/log/{_today()}"

    logged = await api_client.put(url, json={"status": "completed"}, headers=csrf_headers(api_client))
    assert logged.status_code == 200, logged.text

    deleted = await api_client.delete(url, headers=csrf_headers(api_client))
    assert deleted.status_code == 204

    history = await api_client.get(f"/api/v1/habits/{habit['id']}/history")
    assert history.status_code == 200
    assert history.json() == []


async def test_delete_log_is_idempotent(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    habit = await _create_habit(api_client)
    url = f"/api/v1/habits/{habit['id']}/log/{_today()}"

    # Deleting a log that never existed is a no-op, not an error.
    assert (await api_client.delete(url, headers=csrf_headers(api_client))).status_code == 204

    await api_client.put(url, json={"status": "skipped"}, headers=csrf_headers(api_client))
    assert (await api_client.delete(url, headers=csrf_headers(api_client))).status_code == 204
    # Deleting the same (now-missing) log again still returns 204.
    assert (await api_client.delete(url, headers=csrf_headers(api_client))).status_code == 204

    # A habit that doesn't exist at all is still a 404, not a 204.
    missing = await api_client.delete(
        f"/api/v1/habits/{uuid.uuid4()}/log/{_today()}", headers=csrf_headers(api_client)
    )
    assert missing.status_code == 404


async def test_delete_log_on_other_users_habit_is_404(api_client: AsyncClient, db_session: AsyncSession, user_a) -> None:  # type: ignore[no-untyped-def]
    habit_a = await _create_habit(api_client, name="A's habit")
    url = f"/api/v1/habits/{habit_a['id']}/log/{_today()}"
    await api_client.put(url, json={"status": "completed"}, headers=csrf_headers(api_client))

    # Switch identity to user B.
    register = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-b@example.com", "password": "correct-horse-battery", "full_name": "B"},
        headers=csrf_headers(api_client),
    )
    assert register.status_code == 201, register.text
    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-b@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert login.status_code == 200

    # B cannot clear A's log - same 404 as every other unowned-habit route.
    assert (await api_client.delete(url, headers=csrf_headers(api_client))).status_code == 404

    # Switch back to user A: the log must still be there (nothing was deleted).
    relogin = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-a@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert relogin.status_code == 200
    history = await api_client.get(f"/api/v1/habits/{habit_a['id']}/history")
    assert len(history.json()) == 1
