"""Learning API tests: items, course tree, progress derivation, sessions."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


async def _create_course_with_lessons(client: AsyncClient) -> dict:
    course = (
        await client.post(
            "/api/v1/learning/courses",
            json={"title": "FastAPI Mastery", "provider": "Docs"},
            headers=csrf_headers(client),
        )
    ).json()
    module = (
        await client.post(
            f"/api/v1/learning/courses/{course['id']}/modules",
            json={"title": "Basics"},
            headers=csrf_headers(client),
        )
    ).json()
    for title in ("Routing", "Dependencies"):
        await client.post(
            f"/api/v1/learning/modules/{module['id']}/lessons",
            json={"title": title},
            headers=csrf_headers(client),
        )
    return (await client.get(f"/api/v1/learning/courses/{course['id']}")).json()


async def test_learning_item_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/learning/items",
        json={"type": "book", "title": "Deep Work"},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["status"] == "not_started"
    assert item["progress_percent"] == 0

    updated = await api_client.patch(
        f"/api/v1/learning/items/{item['id']}",
        json={"status": "in_progress", "progress_percent": 40},
        headers=csrf_headers(api_client),
    )
    assert updated.status_code == 200
    assert updated.json()["progress_percent"] == 40

    out_of_range = await api_client.patch(
        f"/api/v1/learning/items/{item['id']}",
        json={"progress_percent": 150},
        headers=csrf_headers(api_client),
    )
    assert out_of_range.status_code == 422

    deleted = await api_client.delete(
        f"/api/v1/learning/items/{item['id']}", headers=csrf_headers(api_client)
    )
    assert deleted.status_code == 204


async def test_course_tree_and_progress(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    course = await _create_course_with_lessons(api_client)
    assert course["progress_percent"] == 0
    assert len(course["modules"]) == 1
    lessons = course["modules"][0]["lessons"]
    assert len(lessons) == 2

    # Complete one of two lessons -> 50%, course auto-advances to in_progress.
    completed = await api_client.patch(
        f"/api/v1/learning/lessons/{lessons[0]['id']}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    assert completed.status_code == 200
    assert completed.json()["completed_at"] is not None

    course = (await api_client.get(f"/api/v1/learning/courses/{course['id']}")).json()
    assert course["progress_percent"] == 50
    assert course["status"] == "in_progress"

    # Complete the second lesson -> 100%, status completes.
    await api_client.patch(
        f"/api/v1/learning/lessons/{lessons[1]['id']}",
        json={"status": "completed"},
        headers=csrf_headers(api_client),
    )
    course = (await api_client.get(f"/api/v1/learning/courses/{course['id']}")).json()
    assert course["progress_percent"] == 100
    assert course["status"] == "completed"


async def test_learning_session_logging(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    course = (
        await api_client.post(
            "/api/v1/learning/courses",
            json={"title": "Course"},
            headers=csrf_headers(api_client),
        )
    ).json()

    logged = await api_client.post(
        "/api/v1/learning/sessions",
        json={"course_id": course["id"], "duration_minutes": 45, "session_date": _today()},
        headers=csrf_headers(api_client),
    )
    assert logged.status_code == 201, logged.text
    assert logged.json()["duration_minutes"] == 45

    listed = await api_client.get("/api/v1/learning/sessions")
    assert listed.json()["total"] == 1

    # Session referencing another user's/nonexistent course is rejected.
    bogus = await api_client.post(
        "/api/v1/learning/sessions",
        json={
            "course_id": "00000000-0000-0000-0000-000000000000",
            "duration_minutes": 30,
            "session_date": _today(),
        },
        headers=csrf_headers(api_client),
    )
    assert bogus.status_code == 404


async def test_learning_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    course = (
        await api_client.post(
            "/api/v1/learning/courses", json={"title": "A's course"}, headers=csrf_headers(api_client)
        )
    ).json()
    item = (
        await api_client.post(
            "/api/v1/learning/items",
            json={"type": "technology", "title": "Rust"},
            headers=csrf_headers(api_client),
        )
    ).json()

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

    assert (await api_client.get("/api/v1/learning/courses")).json() == []
    assert (await api_client.get("/api/v1/learning/items")).json() == []
    assert (await api_client.get(f"/api/v1/learning/courses/{course['id']}")).status_code == 404
    assert (await api_client.delete(
        f"/api/v1/learning/items/{item['id']}", headers=csrf_headers(api_client)
    )).status_code == 404
