"""Task API tests: CRUD, recurrence generation, two-user isolation."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _switch_to_user(client: AsyncClient, db: AsyncSession, email: str) -> None:
    """Register+login a different user on the same client (cookie jar swaps)."""
    headers = csrf_headers(client)
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "full_name": email},
        headers=headers,
    )
    if register.status_code == 409:
        pass  # already registered in this test
    else:
        assert register.status_code == 201, register.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "correct-horse-battery"},
        headers=csrf_headers(client),
    )
    assert login.status_code == 200, login.text


async def test_task_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/tasks",
        json={"title": "Buy groceries", "priority": "high", "list": "today"},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["title"] == "Buy groceries"
    assert task["priority"] == "high"
    assert task["list"] == "today"
    assert task["status"] == "pending"

    fetched = await api_client.get(f"/api/v1/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == task["id"]

    updated = await api_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"title": "Buy groceries tomorrow", "status": "in_progress"},
        headers=csrf_headers(api_client),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Buy groceries tomorrow"
    assert updated.json()["status"] == "in_progress"

    deleted = await api_client.delete(f"/api/v1/tasks/{task['id']}", headers=csrf_headers(api_client))
    assert deleted.status_code == 204
    gone = await api_client.get(f"/api/v1/tasks/{task['id']}")
    assert gone.status_code == 404


async def test_task_completion_sets_completed_at(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/tasks", json={"title": "Finish report"}, headers=csrf_headers(api_client)
    )
    task_id = created.json()["id"]
    completed = await api_client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "completed"}, headers=csrf_headers(api_client)
    )
    assert completed.status_code == 200
    assert completed.json()["completed_at"] is not None

    reopened = await api_client.patch(
        f"/api/v1/tasks/{task_id}", json={"status": "pending"}, headers=csrf_headers(api_client)
    )
    assert reopened.json()["completed_at"] is None


async def test_task_list_filters_and_pagination(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    for index in range(3):
        await api_client.post(
            "/api/v1/tasks",
            json={"title": f"Task {index}", "list": "today"},
            headers=csrf_headers(api_client),
        )
    await api_client.post(
        "/api/v1/tasks", json={"title": "Later task", "list": "later"}, headers=csrf_headers(api_client)
    )

    all_tasks = await api_client.get("/api/v1/tasks")
    assert all_tasks.status_code == 200
    assert all_tasks.json()["total"] == 4

    today_tasks = await api_client.get("/api/v1/tasks?list=today")
    assert today_tasks.json()["total"] == 3

    paged = await api_client.get("/api/v1/tasks?page=1&page_size=2")
    assert len(paged.json()["items"]) == 2
    assert paged.json()["total"] == 4


async def test_task_validation_rejects_bad_input(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    missing_title = await api_client.post(
        "/api/v1/tasks", json={}, headers=csrf_headers(api_client)
    )
    assert missing_title.status_code == 422

    bad_priority = await api_client.post(
        "/api/v1/tasks",
        json={"title": "x", "priority": "urgent-ish"},
        headers=csrf_headers(api_client),
    )
    assert bad_priority.status_code == 422

    bad_weekday = await api_client.post(
        "/api/v1/tasks",
        json={"title": "x", "recurrence_rule": {"frequency": "weekly", "weekdays": [9]}},
        headers=csrf_headers(api_client),
    )
    assert bad_weekday.status_code == 422


async def test_recurring_task_generates_next_occurrence(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date()
    created = await api_client.post(
        "/api/v1/tasks",
        json={
            "title": "Daily standup",
            "due_date": today.isoformat(),
            "recurrence_rule": {"frequency": "daily"},
        },
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    occurrence = created.json()
    assert occurrence["recurrence_template_id"] is not None
    assert occurrence["is_recurring_template"] is False

    completed = await api_client.patch(
        f"/api/v1/tasks/{occurrence['id']}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    assert completed.status_code == 200

    listed = await api_client.get("/api/v1/tasks?status=pending")
    pending = listed.json()["items"]
    # The next generated occurrence exists, template never appears in lists.
    next_occurrences = [task for task in pending if task["title"] == "Daily standup"]
    assert len(next_occurrences) == 1
    assert next_occurrences[0]["due_date"] > today.isoformat()
    assert all(task["is_recurring_template"] is False for task in pending)


async def test_completing_twice_does_not_duplicate_occurrence(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date()
    created = await api_client.post(
        "/api/v1/tasks",
        json={"title": "Water plants", "due_date": today.isoformat(), "recurrence_rule": {"frequency": "daily"}},
        headers=csrf_headers(api_client),
    )
    occurrence_id = created.json()["id"]
    for _ in range(2):
        await api_client.patch(
            f"/api/v1/tasks/{occurrence_id}", json={"status": "completed"}, headers=csrf_headers(api_client)
        )
    pending = (await api_client.get("/api/v1/tasks?status=pending")).json()["items"]
    assert len([task for task in pending if task["title"] == "Water plants"]) == 1


async def test_tasks_are_isolated_between_users(api_client: AsyncClient, db_session: AsyncSession, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/tasks", json={"title": "User A private task"}, headers=csrf_headers(api_client)
    )
    task_a_id = created.json()["id"]

    await _switch_to_user(api_client, db_session, "user-b@example.com")
    await api_client.post(
        "/api/v1/tasks", json={"title": "User B private task"}, headers=csrf_headers(api_client)
    )

    # B cannot see, modify, or delete A's task - 404, not 403 (no disclosure).
    assert (await api_client.get(f"/api/v1/tasks/{task_a_id}")).status_code == 404
    assert (await api_client.patch(
        f"/api/v1/tasks/{task_a_id}", json={"title": "hijacked"}, headers=csrf_headers(api_client)
    )).status_code == 404
    assert (await api_client.delete(f"/api/v1/tasks/{task_a_id}", headers=csrf_headers(api_client))).status_code == 404

    # B's list contains only B's task.
    listed = await api_client.get("/api/v1/tasks")
    titles = [task["title"] for task in listed.json()["items"]]
    assert titles == ["User B private task"]

    # Switching back to A: task still intact.
    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-a@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert login.status_code == 200
    fetched = await api_client.get(f"/api/v1/tasks/{task_a_id}")
    assert fetched.status_code == 200
    assert fetched.json()["title"] == "User A private task"


async def test_tasks_require_authentication(api_client: AsyncClient) -> None:
    assert (await api_client.get("/api/v1/tasks")).status_code == 401
    assert (
        await api_client.post("/api/v1/tasks", json={"title": "x"})
    ).status_code == 401

async def test_task_list_filters_search_date_priority_overdue(
    api_client: AsyncClient, user_a  # type: ignore[no-untyped-def]
) -> None:
    """The Tasks-workspace filters: search, date range, due_on, priority, overdue."""
    headers = csrf_headers(api_client)
    today = datetime.now(UTC).date().isoformat()
    yesterday = "2020-01-01"  # safely in the past for overdue checks
    next_week = "2099-01-08"

    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Gym session", "description": "leg day", "priority": "high",
             "list": "today", "due_date": yesterday},
        headers=headers,
    )
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Buy oat milk", "priority": "low", "list": "today", "due_date": today},
        headers=headers,
    )
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Plan gym schedule", "priority": "medium", "list": "upcoming",
             "due_date": next_week},
        headers=headers,
    )
    await api_client.post(
        "/api/v1/tasks",
        json={"title": "Read a book", "list": "later"},
        headers=headers,
    )

    # Search matches title OR description, partial, case-insensitive.
    search = await api_client.get("/api/v1/tasks", params={"search": "gym"})
    titles = {item["title"] for item in search.json()["items"]}
    assert titles == {"Gym session", "Plan gym schedule"}

    search_desc = await api_client.get("/api/v1/tasks", params={"search": "leg day"})
    assert {item["title"] for item in search_desc.json()["items"]} == {"Gym session"}

    # Date range: due_from..due_before inclusive.
    ranged = await api_client.get(
        "/api/v1/tasks", params={"due_from": today, "due_before": next_week}
    )
    assert {item["title"] for item in ranged.json()["items"]} == {
        "Buy oat milk",
        "Plan gym schedule",
    }

    # due_on: exact-day filter.
    on_day = await api_client.get("/api/v1/tasks", params={"due_on": today})
    assert {item["title"] for item in on_day.json()["items"]} == {"Buy oat milk"}

    # Priority filter.
    by_priority = await api_client.get("/api/v1/tasks", params={"priority": "high"})
    assert {item["title"] for item in by_priority.json()["items"]} == {"Gym session"}

    # Overdue: unfinished + due date passed (server computes user-local today).
    overdue = await api_client.get("/api/v1/tasks", params={"overdue": "true"})
    assert {item["title"] for item in overdue.json()["items"]} == {"Gym session"}

    # Combined: search + date + status (the workspace's core filter combo).
    combined = await api_client.get(
        "/api/v1/tasks", params={"search": "gym", "due_from": today, "status": "pending"}
    )
    assert {item["title"] for item in combined.json()["items"]} == {"Plan gym schedule"}
