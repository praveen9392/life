"""Dashboard API tests: aggregation correctness and isolation."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def test_dashboard_summary_shape_and_counts(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = _today()
    # Seed: 1 habit (due daily), 1 task due today completed, 1 task pending.
    habit = await api_client.post(
        "/api/v1/habits",
        json={"name": "Meditate", "frequency_type": "daily", "start_date": today},
        headers=csrf_headers(api_client),
    )
    habit_id = habit.json()["id"]
    await api_client.put(
        f"/api/v1/habits/{habit_id}/log/{today}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    done_task = await api_client.post(
        "/api/v1/tasks",
        json={"title": "Done", "due_date": today},
        headers=csrf_headers(api_client),
    )
    await api_client.patch(
        f"/api/v1/tasks/{done_task.json()['id']}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Pending", "due_date": today},
        headers=csrf_headers(api_client),
    )

    summary = await api_client.get("/api/v1/dashboard/summary")
    assert summary.status_code == 200, summary.text
    body = summary.json()

    assert body["today"] == today
    assert body["habits_due_today"] == 1
    assert body["habits_completed_today"] == 1
    assert body["tasks_due_today"] == 2
    assert body["tasks_completed_today"] == 1
    # habit rate 100%, task rate 50% -> mean 75%
    assert body["daily_progress_percent"] == 75
    assert body["best_current_streak"] == 1
    assert len(body["habits"]) == 1
    assert body["habits"][0]["status"] == "completed"
    assert {task["title"] for task in body["tasks_today"]} == {"Done", "Pending"}


async def test_dashboard_is_empty_and_zeroed_for_new_user(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    summary = await api_client.get("/api/v1/dashboard/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["daily_progress_percent"] == 0
    assert body["habits"] == []
    assert body["tasks_today"] == []
    assert body["best_current_streak"] == 0


async def test_dashboard_is_scoped_to_current_user(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "A only", "due_date": _today()},
        headers=csrf_headers(api_client),
    )
    # Switch to user B.
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
    summary = await api_client.get("/api/v1/dashboard/summary")
    assert summary.json()["tasks_due_today"] == 0
    assert summary.json()["tasks_today"] == []
