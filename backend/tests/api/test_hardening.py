"""Regression tests for audit hardening fixes."""

import re
import uuid

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio

CREDS = {"email": "dup@example.com", "password": "correct-horse-battery", "full_name": "Dup"}


@pytest.mark.parametrize("page_size", [0, 101])
async def test_page_size_out_of_range_is_422(api_client: AsyncClient, user_a, page_size: int) -> None:
    response = await api_client.get(f"/api/v1/tasks?page_size={page_size}")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_invalid_request_id_is_replaced(api_client: AsyncClient) -> None:
    # httpx rejects raw newlines client-side, so use other invalid values.
    for bad in ("short", "has spaces in it!!", "x" * 65):
        response = await api_client.get("/health", headers={"X-Request-ID": bad})
        returned = response.headers["X-Request-ID"]
        assert returned != bad
        uuid.UUID(returned)


async def test_newline_request_id_is_replaced_at_asgi_level() -> None:
    from app.main import app

    sent: dict = {}

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            sent["headers"] = dict(message["headers"])

    scope = {
        "type": "http", "method": "GET", "path": "/health", "raw_path": b"/health",
        "query_string": b"", "http_version": "1.1", "scheme": "http", "server": ("test", 80),
        "client": ("127.0.0.1", 1), "root_path": "",
        "headers": [(b"x-request-id", b"abcdefgh\nInjected: 1")],
    }
    await app(scope, receive, send)
    returned = sent["headers"][b"x-request-id"].decode()
    assert "\n" not in returned
    uuid.UUID(returned)


async def test_valid_request_id_is_echoed(api_client: AsyncClient) -> None:
    response = await api_client.get("/health", headers={"X-Request-ID": "abcd-1234-efgh"})
    assert response.headers["X-Request-ID"] == "abcd-1234-efgh"


async def test_oversized_content_length_returns_413(api_client: AsyncClient) -> None:
    too_big = get_settings().max_request_body_bytes + 1
    response = await api_client.post(
        "/api/v1/auth/login", content=b"{}", headers={"Content-Length": str(too_big), "Content-Type": "application/json"}
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


@pytest.mark.parametrize("wildcard", ["%", "_"])
async def test_search_wildcards_are_literal(api_client: AsyncClient, user_a, wildcard: str) -> None:
    for title in (f"alpha {wildcard} marker", "plain note one", "plain note two"):
        created = await api_client.post(
            "/api/v1/notes", json={"title": title, "content": "x"}, headers=csrf_headers(api_client)
        )
        assert created.status_code == 201, created.text
    response = await api_client.get("/api/v1/search", params={"q": wildcard})
    assert response.status_code == 200
    titles = [item["title"] for items in response.json()["results"].values() for item in items]
    assert titles == [f"alpha {wildcard} marker"]


async def test_duplicate_register_returns_409(api_client: AsyncClient) -> None:
    first = await api_client.post("/api/v1/auth/register", json=CREDS)
    assert first.status_code == 201
    second = await api_client.post("/api/v1/auth/register", json=CREDS)
    assert second.status_code == 409


async def test_register_race_integrity_error_maps_to_409(
    api_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """True concurrency is impossible here (all requests share one rolled-back
    session/connection), so simulate losing the race: the pre-check says the
    email is free but the unique constraint fires on insert."""
    from app.repositories.user_repository import UserRepository

    assert (await api_client.post("/api/v1/auth/register", json=CREDS)).status_code == 201

    async def email_looks_free(self, email):
        return False

    monkeypatch.setattr(UserRepository, "email_exists_query", email_looks_free)
    response = await api_client.post("/api/v1/auth/register", json=CREDS)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


async def test_refresh_token_reuse_revokes_family(api_client: AsyncClient, user_a) -> None:
    """Sequential stand-in for the concurrent-refresh race (shared session)."""
    settings = get_settings()
    old_refresh = api_client.cookies.get(settings.refresh_cookie_name)
    assert old_refresh
    first = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert first.status_code == 200, first.text
    new_refresh = api_client.cookies.get(settings.refresh_cookie_name)
    assert new_refresh

    api_client.cookies.set(settings.refresh_cookie_name, old_refresh)
    reused = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert reused.status_code == 401

    api_client.cookies.set(settings.refresh_cookie_name, new_refresh)
    after = await api_client.post("/api/v1/auth/refresh", headers=csrf_headers(api_client))
    assert after.status_code == 401


async def test_habit_log_upsert_is_idempotent(api_client: AsyncClient, user_a) -> None:
    """Sequential stand-in for concurrent upsert (shared session)."""
    created = await api_client.post(
        "/api/v1/habits",
        json={"name": "Read", "frequency_type": "daily", "start_date": "2024-01-01"},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    habit_id = created.json()["id"]
    url = f"/api/v1/habits/{habit_id}/log/2024-01-05"
    ids = set()
    for _ in range(3):
        response = await api_client.put(url, json={"status": "completed"}, headers=csrf_headers(api_client))
        assert response.status_code == 200, response.text
        ids.add(response.json()["id"])
    assert len(ids) == 1


def _handler_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/integrity")
    async def integrity():
        raise IntegrityError("INSERT secret_sql", {"p": 1}, Exception("duplicate key secret-detail"))

    @app.get("/operational")
    async def operational():
        raise OperationalError("SELECT secret_sql", {}, Exception("conn refused 10.1.2.3 password=pw"))

    return app


async def test_integrity_error_handler_returns_409_envelope() -> None:
    async with AsyncClient(transport=ASGITransport(app=_handler_app()), base_url="http://t") as client:
        response = await client.get("/integrity")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"
    assert "secret" not in response.text


async def test_operational_error_returns_503_without_leaking() -> None:
    async with AsyncClient(transport=ASGITransport(app=_handler_app()), base_url="http://t") as client:
        response = await client.get("/operational")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert not re.search(r"10\.1\.2\.3|secret_sql|password", response.text)


async def test_cookie_samesite_field_default_is_lax() -> None:
    assert Settings.model_fields["cookie_samesite"].default == "lax"
