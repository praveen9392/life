"""Goal API tests: CRUD, milestone-driven progress, isolation."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _create_goal(client: AsyncClient, **overrides) -> dict:
    response = await client.post(
        "/api/v1/goals",
        json={"title": "Run a 5k", **overrides},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_goal_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    goal = await _create_goal(api_client, category="fitness", target_date="2026-12-31")
    assert goal["status"] == "not_started"
    assert goal["progress_percent"] == 0
    assert goal["milestones"] == []

    updated = await api_client.patch(
        f"/api/v1/goals/{goal['id']}",
        json={"progress_percent": 40, "description": "Training plan started"},
        headers=csrf_headers(api_client),
    )
    assert updated.status_code == 200
    assert updated.json()["progress_percent"] == 40
    # >0% auto-advances status
    assert updated.json()["status"] == "in_progress"

    complete = await api_client.patch(
        f"/api/v1/goals/{goal['id']}", json={"progress_percent": 100}, headers=csrf_headers(api_client)
    )
    assert complete.json()["status"] == "completed"

    deleted = await api_client.delete(f"/api/v1/goals/{goal['id']}", headers=csrf_headers(api_client))
    assert deleted.status_code == 204


async def test_milestones_drive_progress(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    goal = await _create_goal(api_client, progress_mode="milestones")
    milestone_a = (
        await api_client.post(
            f"/api/v1/goals/{goal['id']}/milestones",
            json={"title": "Run 1k"},
            headers=csrf_headers(api_client),
        )
    ).json()
    milestone_b = (
        await api_client.post(
            f"/api/v1/goals/{goal['id']}/milestones",
            json={"title": "Run 3k"},
            headers=csrf_headers(api_client),
        )
    ).json()

    await api_client.patch(
        f"/api/v1/goals/milestones/{milestone_a['id']}",
        json={"is_completed": True},
        headers=csrf_headers(api_client),
    )
    goal = (await api_client.get(f"/api/v1/goals/{goal['id']}")).json()
    assert goal["progress_percent"] == 50
    assert goal["status"] == "in_progress"

    # Manual progress edit is ignored in milestones mode.
    await api_client.patch(
        f"/api/v1/goals/{goal['id']}", json={"progress_percent": 5}, headers=csrf_headers(api_client)
    )
    goal = (await api_client.get(f"/api/v1/goals/{goal['id']}")).json()
    assert goal["progress_percent"] == 50

    await api_client.patch(
        f"/api/v1/goals/milestones/{milestone_b['id']}",
        json={"is_completed": True},
        headers=csrf_headers(api_client),
    )
    goal = (await api_client.get(f"/api/v1/goals/{goal['id']}")).json()
    assert goal["progress_percent"] == 100
    assert goal["status"] == "completed"


async def test_goals_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    goal = await _create_goal(api_client)
    milestone = (
        await api_client.post(
            f"/api/v1/goals/{goal['id']}/milestones",
            json={"title": "A's milestone"},
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

    assert (await api_client.get("/api/v1/goals")).json() == []
    assert (await api_client.get(f"/api/v1/goals/{goal['id']}")).status_code == 404
    assert (await api_client.patch(
        f"/api/v1/goals/milestones/{milestone['id']}",
        json={"is_completed": True},
        headers=csrf_headers(api_client),
    )).status_code == 404
    assert (await api_client.delete(
        f"/api/v1/goals/{goal['id']}", headers=csrf_headers(api_client)
    )).status_code == 404
