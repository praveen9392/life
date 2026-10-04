"""Workout API tests: exercises, workouts, sessions, isolation."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _create_exercise(client: AsyncClient, name: str = "Bench Press") -> dict:
    response = await client.post(
        "/api/v1/exercises",
        json={"name": name, "muscle_group": "chest"},
        headers=csrf_headers(client),
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_exercise_create_and_list(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    exercise = await _create_exercise(api_client)
    assert exercise["name"] == "Bench Press"
    assert exercise["user_id"] is not None

    listed = await api_client.get("/api/v1/exercises")
    assert any(item["id"] == exercise["id"] for item in listed.json())

    searched = await api_client.get("/api/v1/exercises?search=bench")
    assert any(item["id"] == exercise["id"] for item in searched.json())


async def test_exercise_list_pagination(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    """`offset`/`limit` slice the visible exercise list (shared catalog + own).

    Compared against a full (unpaged) fetch rather than fixed positions so the
    test is robust whether or not the shared catalog is seeded.
    """
    await _create_exercise(api_client, "Pagination exercise A")
    await _create_exercise(api_client, "Pagination exercise B")

    full = await api_client.get("/api/v1/exercises", params={"limit": 500})
    assert full.status_code == 200
    all_ids = [exercise["id"] for exercise in full.json()]
    assert len(all_ids) >= 2

    first_page = await api_client.get("/api/v1/exercises", params={"limit": 1})
    assert [exercise["id"] for exercise in first_page.json()] == all_ids[:1]

    middle = await api_client.get("/api/v1/exercises", params={"offset": 1, "limit": 2})
    assert [exercise["id"] for exercise in middle.json()] == all_ids[1:3]

    beyond = await api_client.get("/api/v1/exercises", params={"offset": len(all_ids) + 10})
    assert beyond.status_code == 200
    assert beyond.json() == []

    # Bounds are validated: limit >= 1 and <= 500.
    assert (await api_client.get("/api/v1/exercises", params={"limit": 0})).status_code == 422
    assert (await api_client.get("/api/v1/exercises", params={"limit": 501})).status_code == 422


async def test_workout_session_with_sets(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    exercise = await _create_exercise(api_client)
    workout = (
        await api_client.post(
            "/api/v1/workouts",
            json={"name": "Push day", "description": "Chest and triceps"},
            headers=csrf_headers(api_client),
        )
    ).json()

    created = await api_client.post(
        "/api/v1/workout-sessions",
        json={
            "workout_id": workout["id"],
            "duration_minutes": 45,
            "sets": [
                {"exercise_id": exercise["id"], "set_number": 1, "reps": 10, "weight": 60, "weight_unit": "kg"},
                {"exercise_id": exercise["id"], "set_number": 2, "reps": 8, "weight": 65, "weight_unit": "kg"},
            ],
        },
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    session = created.json()
    assert session["duration_minutes"] == 45
    assert len(session["sets"]) == 2
    assert session["sets"][0]["reps"] == 10

    fetched = await api_client.get(f"/api/v1/workout-sessions/{session['id']}")
    assert fetched.status_code == 200
    assert len(fetched.json()["sets"]) == 2

    deleted = await api_client.delete(
        f"/api/v1/workout-sessions/{session['id']}", headers=csrf_headers(api_client)
    )
    assert deleted.status_code == 204
    assert (await api_client.get(f"/api/v1/workout-sessions/{session['id']}")).status_code == 404


async def test_session_rejects_unknown_exercise(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/workout-sessions",
        json={
            "sets": [
                {
                    "exercise_id": "00000000-0000-0000-0000-000000000000",
                    "set_number": 1,
                    "reps": 10,
                }
            ]
        },
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 422


async def test_workouts_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    exercise_a = await _create_exercise(api_client, "A's exercise")
    workout = (
        await api_client.post(
            "/api/v1/workouts", json={"name": "A's workout"}, headers=csrf_headers(api_client)
        )
    ).json()
    session = (
        await api_client.post(
            "/api/v1/workout-sessions",
            json={"workout_id": workout["id"], "duration_minutes": 30},
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

    # B sees neither A's exercises, workouts, nor sessions.
    assert all(item["id"] != exercise_a["id"] for item in (await api_client.get("/api/v1/exercises")).json())
    assert (await api_client.get("/api/v1/workouts")).json() == []
    assert (await api_client.get("/api/v1/workout-sessions")).json()["total"] == 0
    assert (await api_client.get(f"/api/v1/workout-sessions/{session['id']}")).status_code == 404
    assert (await api_client.delete(
        f"/api/v1/workouts/{workout['id']}", headers=csrf_headers(api_client)
    )).status_code == 404

    # B cannot reference A's exercise in a session (IDOR via foreign key).
    assert (
        await api_client.post(
            "/api/v1/workout-sessions",
            json={"sets": [{"exercise_id": exercise_a["id"], "set_number": 1, "reps": 5}]},
            headers=csrf_headers(api_client),
        )
    ).status_code == 422
