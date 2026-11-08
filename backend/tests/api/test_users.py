"""Profile, onboarding, and session-management API tests."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def test_onboarding_completion_is_idempotent(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    first = await api_client.post("/api/v1/users/me/onboarding", headers=csrf_headers(api_client))
    assert first.status_code == 200
    stamped_at = first.json()["onboarding_completed_at"]
    assert stamped_at is not None

    second = await api_client.post("/api/v1/users/me/onboarding", headers=csrf_headers(api_client))
    assert second.status_code == 200
    assert second.json()["onboarding_completed_at"] == stamped_at


async def test_profile_update_persists_timezone_and_theme(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.patch(
        "/api/v1/users/me",
        json={"timezone": "Asia/Kolkata", "theme_preference": "dark", "full_name": "User A"},
        headers=csrf_headers(api_client),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["timezone"] == "Asia/Kolkata"
    assert body["theme_preference"] == "dark"
    assert body["full_name"] == "User A"


async def test_profile_update_rejects_unknown_timezone(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.patch(
        "/api/v1/users/me",
        json={"timezone": "Mars/Olympus"},
        headers=csrf_headers(api_client),
    )
    assert response.status_code == 422
    assert "fields" in response.json()["error"]


async def test_profile_update_cannot_change_email_or_password(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    """Mass-assignment guard: server-controlled fields are silently ignored."""
    response = await api_client.patch(
        "/api/v1/users/me",
        json={"email": "evil@example.com", "hashed_password": "evil"},
        headers=csrf_headers(api_client),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "user-a@example.com"


async def test_sessions_list_and_revoke(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    listed = await api_client.get("/api/v1/users/me/sessions")
    assert listed.status_code == 200
    sessions = listed.json()
    assert len(sessions) >= 1

    session_id = sessions[0]["id"]
    revoked = await api_client.delete(f"/api/v1/users/me/sessions/{session_id}", headers=csrf_headers(api_client))
    assert revoked.status_code == 200

    listed_after = await api_client.get("/api/v1/users/me/sessions")
    assert all(session["id"] != session_id for session in listed_after.json())


async def test_sessions_flag_current_session(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    """Exactly the session matching the caller's own refresh-token cookie is
    flagged `is_current` (previously the flag was hardcoded False)."""
    raw_refresh = api_client.cookies.get("refresh_token")
    assert raw_refresh, "login must set the refresh cookie"

    listed = await api_client.get("/api/v1/users/me/sessions")
    assert listed.status_code == 200
    sessions = listed.json()
    assert len(sessions) >= 1
    assert sum(1 for session in sessions if session["is_current"]) == 1


async def test_avatar_upload_rejects_invalid_type(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
        headers=csrf_headers(api_client),
    )
    # The storage backend isn't reachable in this environment, but content-type
    # validation happens BEFORE any upload attempt, so we must get a 4xx
    # validation error - never a 502 storage failure - for a bad file type.
    assert response.status_code == 422
    assert response.json()["error"]["fields"]["file"] == "Unsupported image type"


async def test_avatar_upload_stores_url_on_user(
    api_client: AsyncClient, user_a, monkeypatch: pytest.MonkeyPatch  # type: ignore[no-untyped-def]
) -> None:
    """Happy path: a valid image upload sets `avatar_url` on the user.

    No real S3/MinIO exists in the test environment, so the storage layer is
    stubbed at the service's import seam (`app.services.user_service.StorageService`,
    which `UserService.upload_avatar` instantiates per request).
    """

    class _StubStorage:
        async def upload_avatar_async(self, user_id, content, content_type, size):  # type: ignore[no-untyped-def]
            assert content_type == "image/png"
            assert size > 0
            return f"https://cdn.example.com/avatars/{user_id}/avatar.png"

    monkeypatch.setattr("app.services.user_service.StorageService", _StubStorage)

    response = await api_client.post(
        "/api/v1/users/me/avatar",
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nfake-image-bytes", "image/png")},
        headers=csrf_headers(api_client),
    )
    assert response.status_code == 200, response.text
    avatar_url = response.json()["avatar_url"]
    assert avatar_url == f"https://cdn.example.com/avatars/{user_a.id}/avatar.png"

    # And it persists on subsequent reads.
    fetched = await api_client.get("/api/v1/users/me")
    assert fetched.json()["avatar_url"] == avatar_url
