"""Analytics + calendar API tests: canonical formulas and per-day aggregation."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def test_analytics_summary_matches_seeded_data(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = _today()
    habit = (
        await api_client.post(
            "/api/v1/habits",
            json={"name": "Read", "frequency_type": "daily", "start_date": today},
            headers=csrf_headers(api_client),
        )
    ).json()
    await api_client.put(
        f"/api/v1/habits/{habit['id']}/log/{today}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    task = (
        await api_client.post(
            "/api/v1/tasks",
            json={"title": "Due", "due_date": today},
            headers=csrf_headers(api_client),
        )
    ).json()
    await api_client.patch(
        f"/api/v1/tasks/{task['id']}", json={"status": "completed"}, headers=csrf_headers(api_client)
    )
    await api_client.post(
        "/api/v1/learning/sessions",
        json={"duration_minutes": 30, "session_date": today},
        headers=csrf_headers(api_client),
    )

    summary = await api_client.get("/api/v1/analytics/summary?period=week")
    assert summary.status_code == 200, summary.text
    body = summary.json()
    assert body["period"] == "week"
    # Daily habit started today: only today is within the window AND due.
    assert body["habit_completion_percent"] == 100
    assert body["task_completion_percent"] == 100
    assert body["tasks_due"] == 1
    assert body["learning_minutes"] == 30
    assert body["learning_sessions"] == 1
    assert len(body["habits"]) == 1
    assert body["habits"][0]["rate_percent"] == 100


async def test_analytics_rejects_bad_period(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.get("/api/v1/analytics/summary?period=century")
    assert response.status_code == 422


async def test_calendar_aggregates_per_day(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date()
    start = (today - timedelta(days=1)).isoformat()
    end = (today + timedelta(days=1)).isoformat()

    habit = (
        await api_client.post(
            "/api/v1/habits",
            json={"name": "Stretch", "frequency_type": "daily", "start_date": start},
            headers=csrf_headers(api_client),
        )
    ).json()
    await api_client.put(
        f"/api/v1/habits/{habit['id']}/log/{today.isoformat()}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Due today", "due_date": today.isoformat()},
        headers=csrf_headers(api_client),
    )

    response = await api_client.get(f"/api/v1/calendar?start={start}&end={end}")
    assert response.status_code == 200, response.text
    days = {entry["date"]: entry for entry in response.json()["days"]}
    assert len(days) == 3
    today_entry = days[today.isoformat()]
    assert today_entry["tasks_due"] == 1
    assert today_entry["habits_due"] == 1
    assert today_entry["habits_completed"] == 1


async def test_calendar_is_scoped_to_user(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date().isoformat()
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "A's task", "due_date": today},
        headers=csrf_headers(api_client),
    )
    headers = csrf_headers(api_client)
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-b@example.com", "password": "correct-horse-battery", "full_name": "B"},
        headers=headers,
    )
    await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-b@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    response = await api_client.get(f"/api/v1/calendar?start={today}&end={today}")
    day = response.json()["days"][0]
    assert day["tasks_due"] == 0
