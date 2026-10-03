"""Habit API tests: CRUD, logging, streaks, two-user isolation."""

from datetime import UTC, datetime, timedelta

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


async def test_habit_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    habit = await _create_habit(api_client, description="10 minutes", category="mindfulness")
    assert habit["name"] == "Meditate"
    assert habit["is_active"] is True

    fetched = await api_client.get(f"/api/v1/habits/{habit['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["category"] == "mindfulness"

    updated = await api_client.patch(
        f"/api/v1/habits/{habit['id']}",
        json={"name": "Meditate 20 min", "color": "#22c55e"},
        headers=csrf_headers(api_client),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Meditate 20 min"

    listed = await api_client.get("/api/v1/habits")
    assert listed.status_code == 200
    assert any(habit["id"] == updated.json()["id"] for habit in listed.json())

    deleted = await api_client.delete(f"/api/v1/habits/{habit['id']}", headers=csrf_headers(api_client))
    assert deleted.status_code == 204
    assert (await api_client.get(f"/api/v1/habits/{habit['id']}")).status_code == 404


async def test_habit_validation(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    end_before_start = await api_client.post(
        "/api/v1/habits",
        json={
            "name": "Bad dates",
            "frequency_type": "daily",
            "start_date": "2025-06-01",
            "end_date": "2025-05-01",
        },
        headers=csrf_headers(api_client),
    )
    assert end_before_start.status_code == 422

    bad_weekday = await api_client.post(
        "/api/v1/habits",
        json={
            "name": "Bad weekday",
            "frequency_type": "weekly",
            "start_date": _today(),
            "frequency_config": {"weekdays": [8]},
        },
        headers=csrf_headers(api_client),
    )
    assert bad_weekday.status_code == 422


async def test_habit_log_upsert_is_idempotent(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    habit = await _create_habit(api_client)
    first = await api_client.put(
        f"/api/v1/habits/{habit['id']}/log/{_today()}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    assert first.status_code == 200, first.text
    first_log = first.json()
    assert first_log["status"] == "completed"
    assert first_log["log_date"] == _today()

    # Same day + same habit updates in place instead of duplicating.
    second = await api_client.put(
        f"/api/v1/habits/{habit['id']}/log/{_today()}",
        json={"status": "skipped", "note": "Traveling"},
        headers=csrf_headers(api_client),
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_log["id"]
    assert second.json()["status"] == "skipped"

    history = await api_client.get(f"/api/v1/habits/{habit['id']}/history")
    assert len(history.json()) == 1


async def test_habit_streak_counts_consecutive_completions(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date()
    # Habit started 2 days ago so all three logged days are within its active window.
    habit = await _create_habit(
        api_client, start_date=(today - timedelta(days=2)).isoformat()
    )
    for offset in range(3):
        await api_client.put(
            f"/api/v1/habits/{habit['id']}/log/{(today - timedelta(days=offset)).isoformat()}",
            json={"status": "completed"},
            headers=csrf_headers(api_client),
        )
    streak = await api_client.get(f"/api/v1/habits/{habit['id']}/streak")
    assert streak.status_code == 200
    assert streak.json()["current_streak"] == 3
    assert streak.json()["longest_streak"] == 3


async def test_habit_log_on_other_users_habit_is_404(api_client: AsyncClient, db_session: AsyncSession, user_a) -> None:  # type: ignore[no-untyped-def]
    habit_a = await _create_habit(api_client, name="A's habit")

    # Switch identity to user B.
    headers = csrf_headers(api_client)
    register = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-b@example.com", "password": "correct-horse-battery", "full_name": "B"},
        headers=headers,
    )
    assert register.status_code == 201, register.text
    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-b@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert login.status_code == 200

    assert (await api_client.get(f"/api/v1/habits/{habit_a['id']}")).status_code == 404
    assert (await api_client.patch(
        f"/api/v1/habits/{habit_a['id']}", json={"name": "hijacked"}, headers=csrf_headers(api_client)
    )).status_code == 404
    assert (await api_client.delete(f"/api/v1/habits/{habit_a['id']}", headers=csrf_headers(api_client))).status_code == 404
    assert (await api_client.put(
        f"/api/v1/habits/{habit_a['id']}/log/{_today()}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )).status_code == 404
    assert (await api_client.get(f"/api/v1/habits/{habit_a['id']}/streak")).status_code == 404

    # B's habit list is empty of A's habits.
    assert (await api_client.get("/api/v1/habits")).json() == []
