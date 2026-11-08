"""Tag API tests: CRUD, task/note tag attachment, cross-user IDOR."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _create_tag(client: AsyncClient, name: str) -> dict:
    response = await client.post("/api/v1/tags", json={"name": name}, headers=csrf_headers(client))
    assert response.status_code == 201, response.text
    return response.json()


async def _switch_to_user(client: AsyncClient, email: str) -> None:
    """Register+login a different user on the same client (cookie jar swaps)."""
    register = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-horse-battery", "full_name": email},
        headers=csrf_headers(client),
    )
    assert register.status_code == 201, register.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "correct-horse-battery"},
        headers=csrf_headers(client),
    )
    assert login.status_code == 200, login.text


async def test_tags_list_starts_empty_then_lists_created(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    empty = await api_client.get("/api/v1/tags")
    assert empty.status_code == 200
    assert empty.json() == []

    first = await _create_tag(api_client, "urgent")
    second = await _create_tag(api_client, "home")

    listed = await api_client.get("/api/v1/tags")
    assert listed.status_code == 200
    by_id = {tag["id"]: tag["name"] for tag in listed.json()}
    assert by_id == {first["id"]: "urgent", second["id"]: "home"}


async def test_create_tag_and_duplicate_name_conflict(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/tags", json={"name": "urgent"}, headers=csrf_headers(api_client)
    )
    assert created.status_code == 201
    assert created.json()["name"] == "urgent"
    assert created.json()["id"]

    duplicate = await api_client.post(
        "/api/v1/tags", json={"name": "urgent"}, headers=csrf_headers(api_client)
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "CONFLICT"


async def test_task_create_with_tag_ids_returns_tags(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    tag = await _create_tag(api_client, "errand")

    created = await api_client.post(
        "/api/v1/tasks",
        json={"title": "Buy groceries", "tag_ids": [tag["id"]]},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert [t["id"] for t in task["tags"]] == [tag["id"]]
    assert task["tags"][0]["name"] == "errand"

    fetched = await api_client.get(f"/api/v1/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert [t["id"] for t in fetched.json()["tags"]] == [tag["id"]]


async def test_task_create_with_other_users_tag_silently_drops_it(
    api_client: AsyncClient, db_session: AsyncSession, user_a  # type: ignore[no-untyped-def]
) -> None:
    """IDOR guard: tag ids owned by another user are dropped, never errors/leaks."""
    tag_a = await _create_tag(api_client, "user-a-tag")

    await _switch_to_user(api_client, "user-b@example.com")
    created = await api_client.post(
        "/api/v1/tasks",
        json={"title": "B's task", "tag_ids": [tag_a["id"]]},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    task = created.json()
    assert task["tags"] == []

    fetched = await api_client.get(f"/api/v1/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["tags"] == []


async def test_note_create_with_tag_ids_returns_tags(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    tag = await _create_tag(api_client, "reference")

    created = await api_client.post(
        "/api/v1/notes",
        json={"title": "Reading list", "tag_ids": [tag["id"]]},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    note = created.json()
    assert [t["id"] for t in note["tags"]] == [tag["id"]]


async def test_task_patch_tag_ids_replaces_and_clears(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    first = await _create_tag(api_client, "first")
    second = await _create_tag(api_client, "second")
    task = (
        await api_client.post(
            "/api/v1/tasks",
            json={"title": "Tagged task", "tag_ids": [first["id"]]},
            headers=csrf_headers(api_client),
        )
    ).json()

    # Sending tag_ids replaces the whole set.
    replaced = await api_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"tag_ids": [second["id"]]},
        headers=csrf_headers(api_client),
    )
    assert replaced.status_code == 200
    assert [t["id"] for t in replaced.json()["tags"]] == [second["id"]]

    # Omitting tag_ids leaves tags untouched.
    untouched = await api_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"title": "Renamed"},
        headers=csrf_headers(api_client),
    )
    assert untouched.status_code == 200
    assert [t["id"] for t in untouched.json()["tags"]] == [second["id"]]

    # An empty list clears all tags.
    cleared = await api_client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"tag_ids": []},
        headers=csrf_headers(api_client),
    )
    assert cleared.status_code == 200
    assert cleared.json()["tags"] == []


async def test_tags_require_authentication(api_client: AsyncClient) -> None:
    assert (await api_client.get("/api/v1/tags")).status_code == 401
    assert (
        await api_client.post("/api/v1/tags", json={"name": "x"})
    ).status_code == 401
