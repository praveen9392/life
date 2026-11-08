"""ServiceError handling and route-level exception wrapper behaviour.

Two layers are covered:

1. ServiceError through the centralized handlers (mini FastAPI app): ServiceError
   is an AppException subclass, so the AppException handler renders it as a 500
   INTERNAL_ERROR envelope carrying the service's generic message - never the
   traceback or class name - and logs it exactly once at ERROR with a traceback.
2. The real habit routes' exception wrappers (`except (AppException,
   SQLAlchemyError): raise` plus the broad `except Exception ->
   HTTPException(500)`): ServiceError re-raises into a 500 INTERNAL_ERROR
   envelope, unexpected non-AppException errors become a generic HTTP_ERROR 500
   without leaking, AppExceptions still map to their own status codes (404
   regression guard), SQLAlchemyError still passes through to the central 503
   handler, and the happy path is unchanged.
"""

import logging
import uuid
from datetime import UTC, datetime

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import OperationalError

from app.core.exceptions import ServiceError, register_exception_handlers
from app.core.middleware import RequestIDMiddleware
from app.models.user import User
from app.repositories.habit_repository import HabitRepository
from app.services.habit_service import HabitService
from tests.conftest import csrf_headers

VALID_REQUEST_ID = "abcd1234-req-id-0001"
GENERIC_500_MESSAGE = "An unexpected error occurred"
SERVICE_ERROR_DEFAULT_MESSAGE = "Unexpected service error"
SERVICE_LIST_MESSAGE = "Unexpected error while listing habits"


def _build_service_error_app() -> FastAPI:
    """Minimal app with the centralized handlers and one route raising ServiceError."""
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    register_exception_handlers(app)

    async def raise_service_error() -> None:
        raise ServiceError()

    app.add_api_route("/service-error", raise_service_error, methods=["GET"])
    return app


def _traceback_text(record: logging.LogRecord) -> str:
    """Traceback text of a record. The root handlers' RedactionFilter (installed by app
    import) mutates shared records, moving exc_info into an already-redacted exc_text,
    so accept either form."""
    if record.exc_info:
        return logging.Formatter().formatException(record.exc_info)
    return record.exc_text or ""


def _has_traceback(record: logging.LogRecord) -> bool:
    return "Traceback (most recent call last)" in _traceback_text(record)


def _error(response) -> dict:
    body = response.json()
    assert set(body) == {"error"}
    return body["error"]


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


# ServiceError through the AppException handler (mini app)


async def test_service_error_returns_safe_500_envelope_and_logs_once(caplog) -> None:
    """ServiceError flows through the AppException handler: 500 INTERNAL_ERROR with the
    generic default message, no traceback or class-name leak, logged exactly once."""
    transport = ASGITransport(app=_build_service_error_app(), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with caplog.at_level(logging.DEBUG):
            response = await client.get("/service-error", headers={"X-Request-ID": VALID_REQUEST_ID})

    assert response.status_code == 500
    error = _error(response)
    assert error["code"] == "INTERNAL_ERROR"
    assert error["message"] == SERVICE_ERROR_DEFAULT_MESSAGE
    assert error["request_id"] == VALID_REQUEST_ID
    assert response.headers["X-Request-ID"] == VALID_REQUEST_ID
    for leaked in ("ServiceError", "Traceback"):
        assert leaked not in response.text

    error_records = [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert len(error_records) == 1
    assert error_records[0].levelno == logging.ERROR
    assert error_records[0].getMessage() == "app_exception | code=INTERNAL_ERROR | status=500"
    assert _has_traceback(error_records[0])


# Real app: route-level exception wrappers on /api/v1/habits


async def test_real_app_unexpected_service_exception_returns_safe_500(
    api_client: AsyncClient, user_a: User, monkeypatch
) -> None:
    """A non-AppException blowing up in the service becomes a generic HTTP_ERROR 500."""

    async def raise_runtime_error(self, *args, **kwargs) -> None:
        raise RuntimeError("db-password=hunter2")

    monkeypatch.setattr(HabitService, "list_habits", raise_runtime_error)

    response = await api_client.get("/api/v1/habits")

    assert response.status_code == 500
    error = _error(response)
    assert error["code"] == "HTTP_ERROR"
    assert error["message"] == GENERIC_500_MESSAGE
    assert error["request_id"] == response.headers["X-Request-ID"]
    for leaked in ("hunter2", "RuntimeError", "Traceback"):
        assert leaked not in response.text


async def test_real_app_service_error_from_service_is_wrapped_to_generic_500(
    api_client: AsyncClient, user_a: User, monkeypatch
) -> None:
    """ServiceError is an AppException, so the route's `except (AppException,
    SQLAlchemyError): raise` re-raises it and the central AppException handler
    renders a 500 INTERNAL_ERROR envelope carrying the service's generic
    (client-safe) message - the traceback and class name never reach the client."""

    async def raise_service_error(self, *args, **kwargs) -> None:
        raise ServiceError(SERVICE_LIST_MESSAGE)

    monkeypatch.setattr(HabitService, "list_habits", raise_service_error)

    response = await api_client.get("/api/v1/habits")

    assert response.status_code == 500
    error = _error(response)
    assert error["code"] == "INTERNAL_ERROR"
    assert error["message"] == SERVICE_LIST_MESSAGE
    assert error["request_id"] == response.headers["X-Request-ID"]
    for leaked in ("ServiceError", "Traceback"):
        assert leaked not in response.text


async def test_real_app_missing_habit_still_returns_404_not_found(
    api_client: AsyncClient, user_a: User
) -> None:
    """Regression guard: the route wrapper must not convert AppException (NotFoundError)
    into a generic 500 - unknown habit ids keep their 404 NOT_FOUND envelope."""
    created = await api_client.post(
        "/api/v1/habits",
        json={"name": "Guard habit", "frequency_type": "daily", "start_date": _today()},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text

    response = await api_client.get(f"/api/v1/habits/{uuid.uuid4()}")

    assert response.status_code == 404
    error = _error(response)
    assert error["code"] == "NOT_FOUND"
    assert error["message"] == "Habit not found"
    assert error["request_id"] == response.headers["X-Request-ID"]


async def test_real_app_sqlalchemy_error_passes_through_to_503(
    api_client: AsyncClient, user_a: User, monkeypatch
) -> None:
    """SQLAlchemyError must escape the route wrapper and reach the central handler -> 503."""

    async def raise_operational_error(self, *args, **kwargs) -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(HabitRepository, "list_active_query", raise_operational_error)

    response = await api_client.get("/api/v1/habits")

    assert response.status_code == 503
    error = _error(response)
    assert error["code"] == "SERVICE_UNAVAILABLE"
    assert error["message"] == "Service temporarily unavailable"
    assert "connection refused" not in response.text


async def test_real_app_happy_path_list_unchanged(api_client: AsyncClient, user_a: User) -> None:
    """The wrappers leave the success path untouched: 200 with the created habit listed."""
    created = await api_client.post(
        "/api/v1/habits",
        json={"name": "Happy path habit", "frequency_type": "daily", "start_date": _today()},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text

    response = await api_client.get("/api/v1/habits")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert any(habit["id"] == created.json()["id"] for habit in body)
    assert all("error" not in habit for habit in body)
