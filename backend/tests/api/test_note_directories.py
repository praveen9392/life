"""Note directory API tests: CRUD, counts, note filing/moving, cross-user IDOR."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def _create_directory(client: AsyncClient, name: str) -> dict:
    response = await client.post(
        "/api/v1/note-directories", json={"name": name}, headers=csrf_headers(client)
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_note(client: AsyncClient, title: str, **overrides) -> dict:
    response = await client.post(
        "/api/v1/notes", json={"title": title, **overrides}, headers=csrf_headers(client)
    )
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


async def test_directory_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await _create_directory(api_client, "Work")
    assert created["name"] == "Work"
    assert created["note_count"] == 0

    listed = await api_client.get("/api/v1/note-directories")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [created["id"]]
    assert listed.json()["unfiled_count"] == 0
    assert listed.json()["total_count"] == 0

    renamed = await api_client.patch(
        f"/api/v1/note-directories/{created['id']}",
        json={"name": "Personal"},
        headers=csrf_headers(api_client),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Personal"

    duplicate = await api_client.post(
        "/api/v1/note-directories", json={"name": "Personal"}, headers=csrf_headers(api_client)
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "CONFLICT"

    deleted = await api_client.delete(
        f"/api/v1/note-directories/{created['id']}", headers=csrf_headers(api_client)
    )
    assert deleted.status_code == 204
    remaining = await api_client.get("/api/v1/note-directories")
    assert remaining.json()["items"] == []


async def test_directory_counts(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder_a = await _create_directory(api_client, "Folder A")
    await _create_directory(api_client, "Folder B")
    await _create_note(api_client, "First in A", directory_id=folder_a["id"])
    await _create_note(api_client, "Second in A", directory_id=folder_a["id"])
    await _create_note(api_client, "Unfiled note")

    listed = await api_client.get("/api/v1/note-directories")
    assert listed.status_code == 200
    body = listed.json()
    assert body["unfiled_count"] == 1
    assert body["total_count"] == 3
    counts = {item["name"]: item["note_count"] for item in body["items"]}
    assert counts == {"Folder A": 2, "Folder B": 0}


async def test_note_filing_via_create_and_patch(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder = await _create_directory(api_client, "Recipes")
    note = await _create_note(api_client, "Pancakes", directory_id=folder["id"])
    assert note["directory_id"] == folder["id"]

    # Omitting directory_id on a patch leaves the filing untouched.
    untouched = await api_client.patch(
        f"/api/v1/notes/{note['id']}", json={"title": "Pancakes v2"}, headers=csrf_headers(api_client)
    )
    assert untouched.status_code == 200
    assert untouched.json()["directory_id"] == folder["id"]

    # An explicit null moves the note back to unfiled.
    unfiled = await api_client.patch(
        f"/api/v1/notes/{note['id']}", json={"directory_id": None}, headers=csrf_headers(api_client)
    )
    assert unfiled.status_code == 200
    assert unfiled.json()["directory_id"] is None


async def test_note_with_other_users_directory_is_404(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder_a = await _create_directory(api_client, "A's folder")

    await _switch_to_user(api_client, "user-b@example.com")
    created = await api_client.post(
        "/api/v1/notes",
        json={"title": "B's note", "directory_id": folder_a["id"]},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 404
    assert created.json()["error"]["code"] == "NOT_FOUND"

    # B's existing note can't be moved into A's folder either.
    note_b = await _create_note(api_client, "B's note")
    patched = await api_client.patch(
        f"/api/v1/notes/{note_b['id']}",
        json={"directory_id": folder_a["id"]},
        headers=csrf_headers(api_client),
    )
    assert patched.status_code == 404


async def test_notes_filter_by_directory_and_unfiled(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder = await _create_directory(api_client, "Trips")
    filed = await _create_note(api_client, "Filed note", directory_id=folder["id"])
    unfiled_note = await _create_note(api_client, "Unfiled note")

    in_folder = await api_client.get(f"/api/v1/notes?directory_id={folder['id']}")
    assert in_folder.status_code == 200
    assert [item["id"] for item in in_folder.json()["items"]] == [filed["id"]]

    unfiled = await api_client.get("/api/v1/notes?unfiled=true")
    assert unfiled.status_code == 200
    assert [item["id"] for item in unfiled.json()["items"]] == [unfiled_note["id"]]


async def test_move_notes_into_folder(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder = await _create_directory(api_client, "Inbox")
    first = await _create_note(api_client, "First")
    second = await _create_note(api_client, "Second")

    moved = await api_client.post(
        f"/api/v1/note-directories/{folder['id']}/notes",
        json={"note_ids": [first["id"], second["id"]]},
        headers=csrf_headers(api_client),
    )
    assert moved.status_code == 200
    assert moved.json() == {"moved": 2}

    in_folder = await api_client.get(f"/api/v1/notes?directory_id={folder['id']}")
    assert {item["id"] for item in in_folder.json()["items"]} == {first["id"], second["id"]}
    unfiled = await api_client.get("/api/v1/notes?unfiled=true")
    assert unfiled.json()["items"] == []


async def test_move_notes_silently_drops_foreign_note_ids(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    note_a = await _create_note(api_client, "A's note")

    await _switch_to_user(api_client, "user-b@example.com")
    folder_b = await _create_directory(api_client, "B's folder")
    note_b = await _create_note(api_client, "B's note")
    moved = await api_client.post(
        f"/api/v1/note-directories/{folder_b['id']}/notes",
        json={"note_ids": [note_a["id"], note_b["id"]]},
        headers=csrf_headers(api_client),
    )
    assert moved.status_code == 200
    assert moved.json() == {"moved": 1}

    in_folder = await api_client.get(f"/api/v1/notes?directory_id={folder_b['id']}")
    assert [item["id"] for item in in_folder.json()["items"]] == [note_b["id"]]


async def test_move_notes_to_other_users_folder_is_404(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder_a = await _create_directory(api_client, "A's folder")

    await _switch_to_user(api_client, "user-b@example.com")
    note_b = await _create_note(api_client, "B's note")
    moved = await api_client.post(
        f"/api/v1/note-directories/{folder_a['id']}/notes",
        json={"note_ids": [note_b["id"]]},
        headers=csrf_headers(api_client),
    )
    assert moved.status_code == 404


async def test_delete_directory_soft_deletes_its_notes(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder = await _create_directory(api_client, "Ephemeral")
    first = await _create_note(api_client, "First", directory_id=folder["id"])
    second = await _create_note(api_client, "Second", directory_id=folder["id"])

    deleted = await api_client.delete(
        f"/api/v1/note-directories/{folder['id']}", headers=csrf_headers(api_client)
    )
    assert deleted.status_code == 204

    assert (await api_client.get(f"/api/v1/notes/{first['id']}")).status_code == 404
    assert (await api_client.get(f"/api/v1/notes/{second['id']}")).status_code == 404
    listed = await api_client.get("/api/v1/notes")
    assert listed.json()["items"] == []
    folders = await api_client.get("/api/v1/note-directories")
    assert folders.json()["items"] == []


async def test_directories_are_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    folder_a = await _create_directory(api_client, "A's folder")

    await _switch_to_user(api_client, "user-b@example.com")
    # B's list never shows A's folder (there is no single-folder GET route).
    listed = await api_client.get("/api/v1/note-directories")
    assert listed.json()["items"] == []
    assert (await api_client.patch(
        f"/api/v1/note-directories/{folder_a['id']}",
        json={"name": "hijacked"},
        headers=csrf_headers(api_client),
    )).status_code == 404
    assert (
        await api_client.delete(
            f"/api/v1/note-directories/{folder_a['id']}", headers=csrf_headers(api_client)
        )
    ).status_code == 404


async def test_directory_name_over_100_chars_is_422(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.post(
        "/api/v1/note-directories", json={"name": "x" * 101}, headers=csrf_headers(api_client)
    )
    assert response.status_code == 422
