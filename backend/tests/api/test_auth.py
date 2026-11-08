"""Authentication API tests: register, login, refresh rotation/reuse
detection, logout, logout-all, password change, rate limiting, CSRF."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def test_register_creates_account_and_sets_cookies(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "new-user@example.com", "password": "correct-horse-battery", "full_name": "New User"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "new-user@example.com"
    assert "hashed_password" not in body["user"]
    assert "access_token" in api_client.cookies
    assert "refresh_token" in api_client.cookies
    assert "csrf_token" in api_client.cookies


async def test_register_rejects_short_password(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/auth/register", json={"email": "short-pw@example.com", "password": "short"}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_register_rejects_duplicate_email_case_insensitively(api_client: AsyncClient) -> None:
    first = await api_client.post(
        "/api/v1/auth/register", json={"email": "dup@example.com", "password": "correct-horse-battery"}
    )
    assert first.status_code == 201
    # A second registration attempt from the same (now-authenticated) client
    # must include the CSRF header, exactly like the real frontend would.
    second = await api_client.post(
        "/api/v1/auth/register",
        json={"email": "DUP@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "CONFLICT"


async def test_login_success_returns_user(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "login-test@example.com", "password": "correct-horse-battery"}
    )
    api_client.cookies.clear()
    response = await api_client.post(
        "/api/v1/auth/login", json={"email": "login-test@example.com", "password": "correct-horse-battery"}
    )
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "login-test@example.com"


async def test_login_wrong_password_gives_generic_error(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "wrong-pw@example.com", "password": "correct-horse-battery"}
    )
    api_client.cookies.clear()
    response = await api_client.post(
        "/api/v1/auth/login", json={"email": "wrong-pw@example.com", "password": "wrong-password-123"}
    )
    assert response.status_code == 401
    # Same message whether the account exists or not - never leak which failed.
    assert response.json()["error"]["message"] == "Invalid email or password"


async def test_login_unknown_email_gives_same_generic_error(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "whatever-password"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid email or password"


async def test_refresh_rotates_token(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "refresh@example.com", "password": "correct-horse-battery"}
    )
    old_refresh = api_client.cookies.get("refresh_token")
    response = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert response.status_code == 200
    new_refresh = api_client.cookies.get("refresh_token")
    assert new_refresh is not None and new_refresh != old_refresh


async def test_reusing_rotated_refresh_token_revokes_family(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "reuse@example.com", "password": "correct-horse-battery"}
    )
    stolen_token = api_client.cookies.get("refresh_token")

    first = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert first.status_code == 200

    # Replay the stolen (already rotated-out) token:
    api_client.cookies.set("refresh_token", stolen_token)
    replay = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert replay.status_code == 401

    # The whole family is now revoked - even the NEW token no longer works.
    replay_with_new = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert replay_with_new.status_code == 401


async def test_logout_revokes_session(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "logout@example.com", "password": "correct-horse-battery"}
    )
    response = await api_client.post("/api/v1/auth/logout", headers=csrf_headers(api_client))
    assert response.status_code == 200
    assert "access_token" not in api_client.cookies


async def test_logout_all_revokes_every_session(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": "logout-all@example.com", "password": "correct-horse-battery"},
    )
    old_refresh = api_client.cookies.get("refresh_token")
    assert old_refresh is not None

    response = await api_client.post("/api/v1/auth/logout-all", headers=csrf_headers(api_client))
    assert response.status_code == 200
    assert "refresh_token" not in api_client.cookies
    assert "access_token" not in api_client.cookies

    # Re-present the pre-logout refresh token (as a stale second device would):
    # revoked server-side, so refresh must 401. A CSRF cookie+header pair is
    # set so the request exercises the service layer (not the CSRF guard).
    api_client.cookies.set("refresh_token", old_refresh)
    api_client.cookies.set("csrf_token", "stale-csrf-token")
    refresh = await api_client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": "stale-csrf-token"}
    )
    assert refresh.status_code == 401


async def test_me_requires_authentication(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/users/me")
    assert response.status_code == 401


async def test_me_returns_current_user(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    response = await api_client.get("/api/v1/users/me")
    assert response.status_code == 200
    assert response.json()["email"] == "user-a@example.com"


async def test_mutating_request_without_csrf_header_is_rejected(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "csrf@example.com", "password": "correct-horse-battery"}
    )
    # Session exists (access cookie present) but no CSRF header sent:
    response = await api_client.patch("/api/v1/users/me", json={"full_name": "Hacker"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_VALIDATION_FAILED"


async def test_mutating_request_with_wrong_csrf_header_is_rejected(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "csrf2@example.com", "password": "correct-horse-battery"}
    )
    response = await api_client.patch(
        "/api/v1/users/me", json={"full_name": "Hacker"}, headers={"X-CSRF-Token": "forged-token"}
    )
    assert response.status_code == 403


async def test_mutating_request_with_correct_csrf_header_succeeds(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "csrf3@example.com", "password": "correct-horse-battery"}
    )
    response = await api_client.patch(
        "/api/v1/users/me", json={"full_name": "Renamed"}, headers=csrf_headers(api_client)
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "Renamed"


async def test_refresh_without_csrf_header_is_rejected_when_access_cookie_absent(
    api_client: AsyncClient,
) -> None:
    """The refresh cookie is itself a session credential: a CSRF must not be
    able to turn it into a fresh access token just because the short-lived
    access cookie already expired."""
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": "csrf-refresh@example.com", "password": "correct-horse-battery"},
    )
    api_client.cookies.delete("access_token")
    assert "access_token" not in api_client.cookies
    assert api_client.cookies.get("refresh_token") is not None

    response = await api_client.post("/api/v1/auth/refresh")  # no X-CSRF-Token
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_VALIDATION_FAILED"


async def test_refresh_with_csrf_header_succeeds_when_access_cookie_absent(
    api_client: AsyncClient,
) -> None:
    """Same shape as the real frontend's expired-access-token refresh: refresh
    + csrf cookies present, X-CSRF-Token header matching the csrf cookie."""
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": "csrf-refresh-ok@example.com", "password": "correct-horse-battery"},
    )
    api_client.cookies.delete("access_token")
    assert "access_token" not in api_client.cookies

    response = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert response.status_code == 200
    # A fresh access cookie was issued.
    assert api_client.cookies.get("access_token") is not None


async def test_password_change_revokes_sessions(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "pwchange@example.com", "password": "correct-horse-battery"}
    )
    response = await api_client.post(
        "/api/v1/users/me/password",
        json={"current_password": "correct-horse-battery", "new_password": "brand-new-password-99"},
        headers=csrf_headers(api_client),
    )
    assert response.status_code == 200
    assert "access_token" not in api_client.cookies

    # Old password no longer works:
    relogin_old = await api_client.post(
        "/api/v1/auth/login", json={"email": "pwchange@example.com", "password": "correct-horse-battery"}
    )
    assert relogin_old.status_code == 401

    # New password works:
    relogin_new = await api_client.post(
        "/api/v1/auth/login", json={"email": "pwchange@example.com", "password": "brand-new-password-99"}
    )
    assert relogin_new.status_code == 200


async def test_login_rate_limiting_returns_429(api_client: AsyncClient) -> None:
    await api_client.post(
        "/api/v1/auth/register", json={"email": "ratelimit@example.com", "password": "correct-horse-battery"}
    )
    api_client.cookies.clear()
    last_status = None
    for _ in range(12):
        response = await api_client.post(
            "/api/v1/auth/login", json={"email": "ratelimit@example.com", "password": "wrong-password-123"}
        )
        last_status = response.status_code
        if last_status == 429:
            break
    assert last_status == 429
