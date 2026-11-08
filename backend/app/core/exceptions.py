"""Centralized exception hierarchy and FastAPI exception handlers.

Hierarchy (mirrors the reference `errors/error.py` design):

    AppException(Exception)            <- pure parent; NEVER raise it directly
    ├── ServiceError                   <- unexpected service-layer failure -> 500
    ├── NotFoundError(AppException, ValueError)
    ├── InvalidPayloadError(AppException, ValueError)
    ├── ConflictError
    │   └── DuplicateRecordError       <- structured 409 details via to_dict()
    ├── ForbiddenError / UnauthorizedError
    ├── ValidationError / BusinessRuleError
    ├── ExternalServiceError (502) -> Unavailable (503) / Timeout (504)
    └── InternalServerError

Every error response uses the same envelope:
    {"error": {"code": "TASK_NOT_FOUND", "message": "Task not found", "request_id": "..."}}
(validation errors add a "fields" map; `request_id` is present when known). Stack traces are never returned to
the client in any environment; unexpected exceptions are logged with a
request ID and returned as a generic, safe 500.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import logger, request_id_ctx


class AppException(Exception):
    """Pure parent of every application exception. Never raise it directly:
    always raise a subclass so the status code and error code are meaningful."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "APP_ERROR"

    def __init__(self, message: str, *, code: str | None = None, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        self.code = code or self.code
        self.fields = fields


class ServiceError(AppException):
    """Unexpected service-layer failure -> 500 INTERNAL_ERROR with a generic
    client message; the original exception stays attached as __cause__ for the
    server-side log. Expected (client-facing) failures raise AppException
    subclasses instead."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "INTERNAL_ERROR"

    def __init__(self, message: str = "Unexpected service error"):
        super().__init__(message)


class NotFoundError(AppException, ValueError):
    """The resource does not exist - or belongs to another user (never leak IDOR).

    Two construction styles:
        NotFoundError("Habit not found")                    # explicit message
        NotFoundError(resource="Habit", id=habit_id)        # auto-builds the message
    """

    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"

    def __init__(
        self,
        resource: str,
        id: Any = None,
        *,
        message: str | None = None,
        code: str | None = None,
        fields: dict[str, str] | None = None,
    ):
        if id is None:
            final_message = resource
            self.resource: str | None = None
            self.resource_id: Any = None
        else:
            final_message = message or f"{resource} not found with id: {id}"
            self.resource = resource
            self.resource_id = id
        super().__init__(final_message, code=code, fields=fields)


class InvalidPayloadError(AppException, ValueError):
    """A semantically invalid payload for an operation that is otherwise
    well-formed (mirrors the reference InvalidPayloadError)."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "VALIDATION_ERROR"

    def __init__(self, resource: str, invalid_fields: list[str], message: str | None = None):
        self.resource = resource
        self.invalid_fields = invalid_fields
        final_message = message or f"Invalid payload: cannot update {invalid_fields} on {resource}"
        super().__init__(final_message, fields={"invalid_fields": ",".join(invalid_fields)})


class ForbiddenError(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"


class ValidationError(AppException):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "VALIDATION_ERROR"


class ConflictError(AppException):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"


class DuplicateRecordError(ConflictError):
    """A record already exists (unique constraint). Carries structured details
    exposed in the 409 envelope's `fields` map; `to_dict()` matches the
    reference exception's contract."""

    def __init__(
        self,
        resource: str,
        resource_id: Any = None,
        resource_name: str | None = None,
        message: str | None = None,
    ):
        self.resource = resource
        self.resource_id = resource_id
        self.resource_name = resource_name
        if message is None:
            message = f"{resource} already exists"
            if resource_name is not None:
                message += f" with name: {resource_name}"
            elif resource_id is not None:
                message += f" with id: {resource_id}"
        self.message = message
        super().__init__(message, fields=self.to_dict(include_message=False))

    def to_dict(self, include_message: bool = True) -> dict[str, str]:
        """All non-None details as a string dictionary."""
        details: dict[str, str] = {}
        if include_message:
            details["message"] = self.message
        details["resource"] = self.resource
        if self.resource_id:
            details["resource_id"] = str(self.resource_id)
        if self.resource_name:
            details["resource_name"] = self.resource_name
        return details


class UnauthorizedError(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHORIZED"


class BusinessRuleError(AppException):
    """A well-formed request that violates a domain rule (e.g. invalid state transition)."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "BUSINESS_RULE_VIOLATION"


class ExternalServiceError(AppException):
    """An upstream dependency returned an error or an unusable response (502)."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "EXTERNAL_SERVICE_ERROR"


class ExternalServiceUnavailableError(ExternalServiceError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "EXTERNAL_SERVICE_UNAVAILABLE"


class ExternalServiceTimeoutError(ExternalServiceError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "EXTERNAL_SERVICE_TIMEOUT"


class InternalServerError(AppException):
    """Explicit 500 for a known-unrecoverable condition; the message stays generic to clients."""

    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "INTERNAL_ERROR"


def _current_request_id(request: Request) -> str | None:
    request_id = getattr(request.state, "request_id", None) or request_id_ctx.get()
    return None if request_id in (None, "-") else request_id


def _error_body(
    code: str,
    message: str,
    fields: dict[str, str] | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if fields:
        body["error"]["fields"] = fields
    if request_id:
        body["error"]["request_id"] = request_id
    return body


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    fields: dict[str, str] | None = None,
) -> JSONResponse:
    body = _error_body(code, message, fields, _current_request_id(request))
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the centralized handlers that give every error the same shape.

    Logging policy: expected client errors (4xx) are not logged here (no noise);
    server-side failures are logged exactly once, with the stack trace, here.
    """

    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException) -> JSONResponse:
        if exc.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
            logger.error(f"app_exception | code={exc.code} | status={exc.status_code}", exc_info=True)
        return _error_response(request, exc.status_code, exc.code, exc.message, exc.fields)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = {".".join(str(part) for part in err["loc"][1:]): err["msg"] for err in exc.errors()}
        return _error_response(
            request, status.HTTP_422_UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Invalid request data", fields
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error_response(request, exc.status_code, "HTTP_ERROR", str(exc.detail))

    @app.exception_handler(IntegrityError)
    async def handle_integrity_error(request: Request, exc: IntegrityError) -> JSONResponse:
        logger.error(f"integrity_error | error_type={type(exc.orig or exc).__name__}", exc_info=True)
        return _error_response(
            request, status.HTTP_409_CONFLICT, "CONFLICT", "The request conflicts with existing data"
        )

    @app.exception_handler(OperationalError)
    async def handle_database_unavailable(request: Request, exc: OperationalError) -> JSONResponse:
        logger.error("database_unavailable", exc_info=True)
        return _error_response(
            request,
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "SERVICE_UNAVAILABLE",
            "Service temporarily unavailable",
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(request: Request, exc: Exception) -> JSONResponse:
        logger.error(f"unhandled_exception | error_type={type(exc).__name__}", exc_info=True)
        return _error_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "An unexpected error occurred",
        )