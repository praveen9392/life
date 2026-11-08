"""End-to-end behaviour of the centralized exception handlers."""

import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError, OperationalError

from app.core.exceptions import (
    BusinessRuleError,
    ConflictError,
    ExternalServiceError,
    ExternalServiceTimeoutError,
    ExternalServiceUnavailableError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
    register_exception_handlers,
)
from app.core.logging import RedactionFilter
from app.core.middleware import RequestIDMiddleware

SECRET_TEXT = "secret-password=hunter2 /etc/internal/path"
VALID_REQUEST_ID = "abcd1234-req-id-0001"

APP_EXCEPTIONS = {
    "not-found": (NotFoundError("Thing missing"), 404, "NOT_FOUND"),
    "forbidden": (ForbiddenError("No way"), 403, "FORBIDDEN"),
    "validation": (ValidationError("Bad", fields={"title": "too short"}), 422, "VALIDATION_ERROR"),
    "conflict": (ConflictError("Dup"), 409, "CONFLICT"),
    "unauthorized": (UnauthorizedError("Login"), 401, "UNAUTHORIZED"),
    "business": (BusinessRuleError("Bad transition"), 422, "BUSINESS_RULE_VIOLATION"),
    "external": (ExternalServiceError("Upstream"), 502, "EXTERNAL_SERVICE_ERROR"),
    "unavailable": (ExternalServiceUnavailableError("Down"), 503, "EXTERNAL_SERVICE_UNAVAILABLE"),
    "timeout": (ExternalServiceTimeoutError("Slow"), 504, "EXTERNAL_SERVICE_TIMEOUT"),
    "internal": (InternalServerError("Known failure"), 500, "INTERNAL_ERROR"),
    "custom-code": (NotFoundError("No task", code="TASK_NOT_FOUND"), 404, "TASK_NOT_FOUND"),
}


class _Payload(BaseModel):
    title: str
    count: int


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    register_exception_handlers(app)

    def _make_raiser(exc: Exception):
        async def raiser() -> None:
            raise exc

        return raiser

    for name, (exc, _, _) in APP_EXCEPTIONS.items():
        app.add_api_route(f"/app/{name}", _make_raiser(exc), methods=["GET"])

    app.add_api_route("/boom", _make_raiser(RuntimeError(SECRET_TEXT)), methods=["GET"])
    integrity = IntegrityError("INSERT secret-stmt", {"p": 1}, Exception("duplicate key password=hunter2"))
    app.add_api_route("/integrity", _make_raiser(integrity), methods=["GET"])
    operational = OperationalError("SELECT 1", {}, Exception("connection refused /etc/internal/path"))
    app.add_api_route("/operational", _make_raiser(operational), methods=["GET"])
    app.add_api_route("/http-404", _make_raiser(HTTPException(status_code=404, detail="Nope")), methods=["GET"])

    @app.post("/body")
    async def body_route(payload: _Payload) -> dict[str, str]:
        return {"title": payload.title}

    return app


@pytest.fixture
async def client():
    app = _build_app()
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


def _traceback_text(record: logging.LogRecord) -> str:
    """Traceback text of a record. The root handlers' RedactionFilter (installed by app import) mutates
    shared records, moving exc_info into an already-redacted exc_text, so accept either form."""
    if record.exc_info:
        return logging.Formatter().formatException(record.exc_info)
    return record.exc_text or ""


def _has_traceback(record: logging.LogRecord) -> bool:
    return "Traceback (most recent call last)" in _traceback_text(record)


def _error(response) -> dict:
    body = response.json()
    assert set(body) == {"error"}
    return body["error"]


@pytest.mark.parametrize("name", list(APP_EXCEPTIONS))
async def test_app_exception_envelope(client: AsyncClient, name: str, caplog) -> None:
    exc, status_code, code = APP_EXCEPTIONS[name]
    with caplog.at_level(logging.DEBUG):
        response = await client.get(f"/app/{name}", headers={"X-Request-ID": VALID_REQUEST_ID})
    assert response.status_code == status_code
    error = _error(response)
    assert error["code"] == code
    assert error["message"] == exc.message
    assert error["request_id"] == VALID_REQUEST_ID
    assert response.headers["X-Request-ID"] == VALID_REQUEST_ID
    if exc.fields:
        assert error["fields"] == exc.fields
    else:
        assert "fields" not in error
    assert set(error) <= {"code", "message", "fields", "request_id"}


@pytest.mark.parametrize("name", [n for n, (_, s, _) in APP_EXCEPTIONS.items() if s >= 500])
async def test_5xx_app_exception_logged_once_at_error_with_traceback(
    client: AsyncClient, name: str, caplog
) -> None:
    with caplog.at_level(logging.DEBUG):
        await client.get(f"/app/{name}")
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(errors) == 1
    assert _has_traceback(errors[0])
    assert APP_EXCEPTIONS[name][2] in errors[0].getMessage()


@pytest.mark.parametrize("name", [n for n, (_, s, _) in APP_EXCEPTIONS.items() if s < 500])
async def test_4xx_app_exception_not_logged_at_error(client: AsyncClient, name: str, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        await client.get(f"/app/{name}")
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []


async def test_missing_request_id_is_generated_and_matches_header(client: AsyncClient) -> None:
    response = await client.get("/app/not-found")
    request_id = _error(response)["request_id"]
    assert request_id == response.headers["X-Request-ID"]
    uuid.UUID(request_id)


async def test_invalid_request_id_is_replaced_in_body(client: AsyncClient) -> None:
    response = await client.get("/app/not-found", headers={"X-Request-ID": "bad id!"})
    request_id = _error(response)["request_id"]
    assert request_id != "bad id!"
    assert request_id == response.headers["X-Request-ID"]


async def test_unexpected_exception_returns_safe_500(client: AsyncClient) -> None:
    response = await client.get("/boom", headers={"X-Request-ID": VALID_REQUEST_ID})
    assert response.status_code == 500
    error = _error(response)
    assert error == {
        "code": "INTERNAL_ERROR",
        "message": "An unexpected error occurred",
        "request_id": VALID_REQUEST_ID,
    }
    for leaked in ("hunter2", "secret-password", "/etc/internal", "Traceback", "RuntimeError"):
        assert leaked not in response.text


async def test_unexpected_exception_logged_exactly_once(client: AsyncClient, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        await client.get("/boom")
    errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert len(errors) == 1
    assert _has_traceback(errors[0])
    assert _traceback_text(errors[0]).rstrip().endswith('/etc/internal/path') or 'RuntimeError' in _traceback_text(errors[0])
    assert "RuntimeError" in errors[0].getMessage()


async def test_integrity_error_maps_to_409_without_leaking(client: AsyncClient, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        response = await client.get("/integrity", headers={"X-Request-ID": VALID_REQUEST_ID})
    assert response.status_code == 409
    error = _error(response)
    assert error["code"] == "CONFLICT"
    assert error["request_id"] == VALID_REQUEST_ID
    for leaked in ("hunter2", "INSERT", "duplicate key"):
        assert leaked not in response.text
    assert len([r for r in caplog.records if r.levelno >= logging.ERROR]) == 1


async def test_operational_error_maps_to_503_without_leaking(client: AsyncClient, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        response = await client.get("/operational")
    assert response.status_code == 503
    assert _error(response)["code"] == "SERVICE_UNAVAILABLE"
    assert "/etc/internal" not in response.text
    assert "connection refused" not in response.text
    assert len([r for r in caplog.records if r.levelno >= logging.ERROR]) == 1


async def test_http_exception_uses_envelope_and_is_not_logged(client: AsyncClient, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        response = await client.get("/http-404", headers={"X-Request-ID": VALID_REQUEST_ID})
    assert response.status_code == 404
    assert _error(response) == {"code": "HTTP_ERROR", "message": "Nope", "request_id": VALID_REQUEST_ID}
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []


async def test_unknown_route_uses_envelope(client: AsyncClient) -> None:
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
    assert _error(response)["code"] == "HTTP_ERROR"
    assert _error(response)["request_id"] == response.headers["X-Request-ID"]


async def test_method_not_allowed_uses_envelope(client: AsyncClient) -> None:
    response = await client.post("/boom")
    assert response.status_code == 405
    assert _error(response)["code"] == "HTTP_ERROR"


async def test_request_body_validation_error_lists_fields(client: AsyncClient, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        response = await client.post(
            "/body", json={"count": "not-a-number"}, headers={"X-Request-ID": VALID_REQUEST_ID}
        )
    assert response.status_code == 422
    error = _error(response)
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "Invalid request data"
    assert error["request_id"] == VALID_REQUEST_ID
    assert set(error["fields"]) == {"title", "count"}
    assert all(isinstance(message, str) and message for message in error["fields"].values())
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []


async def test_valid_body_is_unaffected(client: AsyncClient) -> None:
    response = await client.post("/body", json={"title": "ok", "count": 1})
    assert response.status_code == 200
    assert response.json() == {"title": "ok"}
    assert "error" not in response.json()


async def test_redaction_filter_masks_logged_exception_secrets(client: AsyncClient) -> None:
    class _CollectingHandler(logging.Handler):
        def __init__(self) -> None:
            super().__init__()
            self.setFormatter(logging.Formatter("%(message)s"))
            self.lines: list[str] = []

        def emit(self, record: logging.LogRecord) -> None:
            self.lines.append(self.format(record))

    handler = _CollectingHandler()
    handler.addFilter(RedactionFilter())
    app_logger = logging.getLogger("life")
    app_logger.addHandler(handler)
    try:
        await client.get("/boom")
    finally:
        app_logger.removeHandler(handler)

    assert len(handler.lines) == 1
    assert "RuntimeError" in handler.lines[0]
    assert "hunter2" not in handler.lines[0]
    assert "password=***" in handler.lines[0]


# Real application regression tests


async def test_real_app_missing_task_returns_envelope(api_client: AsyncClient, user_a) -> None:
    response = await api_client.get(f"/api/v1/tasks/{uuid.uuid4()}", headers={"X-Request-ID": VALID_REQUEST_ID})
    assert response.status_code == 404
    error = _error(response)
    assert "NOT_FOUND" in error["code"]
    assert error["message"]
    assert error["request_id"] == VALID_REQUEST_ID


async def test_real_app_unauthenticated_tasks_returns_401_envelope(api_client: AsyncClient) -> None:
    response = await api_client.get("/api/v1/tasks")
    assert response.status_code == 401
    error = _error(response)
    assert error["code"]
    assert error["request_id"] == response.headers["X-Request-ID"]


async def test_real_app_successful_tasks_response_has_no_error_key(api_client: AsyncClient, user_a) -> None:
    response = await api_client.get("/api/v1/tasks")
    assert response.status_code == 200
    body = response.json()
    assert "error" not in body
    assert isinstance(body, dict | list)


# get_session transaction handling


def _patched_session_factory(session: MagicMock):
    factory = MagicMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=False)
    return factory


def _mock_session() -> MagicMock:
    session = MagicMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    return session


async def test_get_session_rolls_back_and_reraises_on_failure() -> None:
    from app.db import session as session_module

    session = _mock_session()
    with patch.object(session_module, "AsyncSessionLocal", _patched_session_factory(session)):
        generator = session_module.get_session()
        assert await generator.__anext__() is session
        with pytest.raises(RuntimeError, match="after flush"):
            await generator.athrow(RuntimeError("after flush"))
    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()


async def test_get_session_commits_once_on_success() -> None:
    from app.db import session as session_module

    session = _mock_session()
    with patch.object(session_module, "AsyncSessionLocal", _patched_session_factory(session)):
        generator = session_module.get_session()
        await generator.__anext__()
        with pytest.raises(StopAsyncIteration):
            await generator.__anext__()
    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


async def test_get_session_rolls_back_when_commit_fails() -> None:
    from app.db import session as session_module

    session = _mock_session()
    session.commit.side_effect = RuntimeError("commit failed")
    with patch.object(session_module, "AsyncSessionLocal", _patched_session_factory(session)):
        generator = session_module.get_session()
        await generator.__anext__()
        with pytest.raises(RuntimeError, match="commit failed"):
            await generator.__anext__()
    session.rollback.assert_awaited_once()


async def test_app_exception_after_flush_rolls_back_session_via_handler_stack() -> None:
    """A route raising an AppException must make get_session roll back, yet still yield the envelope."""
    from app.db import session as session_module

    session = _mock_session()
    session.flush = AsyncMock()
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    register_exception_handlers(app)

    from fastapi import Depends

    @app.get("/fail")
    async def fail(db=Depends(session_module.get_session)) -> None:
        await db.flush()
        raise ConflictError("late failure")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    with patch.object(session_module, "AsyncSessionLocal", _patched_session_factory(session)):
        async with AsyncClient(transport=transport, base_url="http://test") as http_client:
            response = await http_client.get("/fail")

    assert response.status_code == 409
    assert _error(response)["code"] == "CONFLICT"
    session.flush.assert_awaited_once()
    session.rollback.assert_awaited_once()
    session.commit.assert_not_awaited()
