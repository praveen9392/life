"""Search, notifications, and privacy API tests."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def test_global_search_finds_across_modules(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await api_client.post(
        "/api/v1/tasks", json={"title": "Buy running shoes"}, headers=csrf_headers(api_client)
    )
    await api_client.post(
        "/api/v1/notes", json={"title": "Shoe research", "content": "running shoe comparison"},
        headers=csrf_headers(api_client),
    )
    await api_client.post(
        "/api/v1/habits",
        json={"name": "Running", "frequency_type": "daily", "start_date": datetime.now(UTC).date().isoformat()},
        headers=csrf_headers(api_client),
    )

    response = await api_client.get("/api/v1/search?q=running")
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert any(item["title"] == "Buy running shoes" for item in results.get("tasks", []))
    assert any(item["title"] == "Shoe research" for item in results.get("notes", []))
    assert any(item["title"] == "Running" for item in results.get("habits", []))
    assert response.json()["total"] == 3


async def test_search_does_not_leak_other_users_data(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await api_client.post(
        "/api/v1/tasks", json={"title": "confidential alpha"}, headers=csrf_headers(api_client)
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
    response = await api_client.get("/api/v1/search?q=confidential")
    assert response.json()["total"] == 0


async def test_notifications_due_tasks_and_read_flow(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date().isoformat()
    await api_client.post(
        "/api/v1/tasks", json={"title": "Due today", "due_date": today}, headers=csrf_headers(api_client)
    )

    listed = await api_client.get("/api/v1/notifications")
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["unread_count"] >= 1
    notification = body["items"][0]
    assert notification["type"] == "task_due_soon"
    assert notification["is_read"] is False

    # Second read within the dedup window doesn't duplicate the reminder.
    again = await api_client.get("/api/v1/notifications")
    types = [item["type"] for item in again.json()["items"]]
    assert types.count("task_due_soon") == 1

    read = await api_client.post(
        f"/api/v1/notifications/{notification['id']}/read", headers=csrf_headers(api_client)
    )
    assert read.status_code == 200
    assert read.json()["is_read"] is True

    await api_client.post("/api/v1/notifications/read-all", headers=csrf_headers(api_client))
    after = await api_client.get("/api/v1/notifications")
    assert after.json()["unread_count"] == 0


async def test_privacy_export_contains_all_owned_data(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    today = datetime.now(UTC).date().isoformat()
    await api_client.post(
        "/api/v1/tasks", json={"title": "Export me"}, headers=csrf_headers(api_client)
    )
    await api_client.post(
        "/api/v1/habits",
        json={"name": "Export habit", "frequency_type": "daily", "start_date": today},
        headers=csrf_headers(api_client),
    )
    await api_client.post(
        "/api/v1/health/metrics",
        json={"metric_type": "weight", "value": 70, "unit": "kg"},
        headers=csrf_headers(api_client),
    )

    response = await api_client.get("/api/v1/privacy/export")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["profile"]["email"] == "user-a@example.com"
    assert "hashed_password" not in data["profile"]
    assert any(task["title"] == "Export me" for task in data["tasks"])
    assert any(habit["name"] == "Export habit" for habit in data["habits"])
    assert len(data["health_metrics"]) == 1


async def test_privacy_delete_removes_account_and_data(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await api_client.post(
        "/api/v1/tasks", json={"title": "Soon gone"}, headers=csrf_headers(api_client)
    )
    # Deletion requires re-auth: a wrong password is rejected.
    wrong_password = await api_client.request(
        "DELETE",
        "/api/v1/privacy/account",
        json={"current_password": "not-the-right-password"},
        headers=csrf_headers(api_client),
    )
    assert wrong_password.status_code == 401

    deleted = await api_client.request(
        "DELETE",
        "/api/v1/privacy/account",
        json={"current_password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert deleted.status_code == 204, deleted.text

    # The session is dead: subsequent authenticated calls fail.
    assert (await api_client.get("/api/v1/tasks")).status_code == 401

    # The credentials can be re-registered (email freed).
    register = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-a@example.com", "password": "correct-horse-battery", "full_name": "A2"},
    )
    assert register.status_code == 201
