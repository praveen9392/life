"""Note API tests: CRUD, search, pin/archive, two-user isolation."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _create_note(client: AsyncClient, title: str, **overrides) -> dict:
    response = await client.post(
        "/api/v1/notes", json={"title": title, **overrides}, headers=csrf_headers(client)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_note_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    note = await _create_note(api_client, "Ideas", content="# Hello\nWorld", category="personal")
    assert note["title"] == "Ideas"
    assert note["content"].startswith("# Hello")

    updated = await api_client.patch(
        f"/api/v1/notes/{note['id']}",
        json={"content": "Updated body", "is_pinned": True},
        headers=csrf_headers(api_client),
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "Updated body"
    assert updated.json()["is_pinned"] is True

    deleted = await api_client.delete(f"/api/v1/notes/{note['id']}", headers=csrf_headers(api_client))
    assert deleted.status_code == 204
    assert (await api_client.get(f"/api/v1/notes/{note['id']}")).status_code == 404


async def test_note_search_filters_by_title(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await _create_note(api_client, "Shopping list")
    await _create_note(api_client, "Meeting notes")

    results = await api_client.get("/api/v1/notes?search=shopping")
    assert results.status_code == 200
    titles = [note["title"] for note in results.json()["items"]]
    assert titles == ["Shopping list"]


async def test_pinned_notes_sort_first(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    await _create_note(api_client, "Ordinary note")
    pinned = await _create_note(api_client, "Pinned note", is_pinned=True)

    listed = await api_client.get("/api/v1/notes")
    assert listed.json()["items"][0]["id"] == pinned["id"]


async def test_archived_notes_hidden_from_default_list(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    note = await _create_note(api_client, "Old note")
    archived = await api_client.patch(
        f"/api/v1/notes/{note['id']}", json={"is_archived": True}, headers=csrf_headers(api_client)
    )
    assert archived.status_code == 200
    listed = await api_client.get("/api/v1/notes")
    assert all(item["id"] != note["id"] for item in listed.json()["items"])


async def test_notes_are_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    note_a = await _create_note(api_client, "A's secret note")

    headers = csrf_headers(api_client)
    register = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-b@example.com", "password": "correct-horse-battery", "full_name": "B"},
        headers=headers,
    )
    assert register.status_code == 201
    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-b@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert login.status_code == 200

    assert (await api_client.get(f"/api/v1/notes/{note_a['id']}")).status_code == 404
    assert (await api_client.patch(
        f"/api/v1/notes/{note_a['id']}", json={"title": "hijacked"}, headers=csrf_headers(api_client)
    )).status_code == 404
    assert (await api_client.delete(f"/api/v1/notes/{note_a['id']}", headers=csrf_headers(api_client))).status_code == 404
    # B's search can't see A's note either.
    assert (await api_client.get("/api/v1/notes?search=secret")).json()["total"] == 0
