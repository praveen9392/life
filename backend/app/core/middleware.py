"""Cross-cutting HTTP middleware: request IDs, security headers, and CSRF.

CSRF uses the double-submit-cookie pattern (see ARCHITECTURE.md "Authn/Authz
Security"): a non-httpOnly `csrf_token` cookie is set at login; the frontend
echoes it back as an `X-CSRF-Token` header on every mutating request; this
middleware rejects the request if they don't match. The check only applies
once a session exists (i.e. an access-token cookie is present) - there is
nothing to forge before a user is authenticated.
"""

import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique `X-Request-ID` to every request/response for log correlation."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add baseline security headers to every response."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if get_settings().is_production:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    """Reject mutating requests whose CSRF header doesn't match the CSRF cookie."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if request.method in _SAFE_METHODS:
            return await call_next(request)

        session_cookie = request.cookies.get(settings.access_cookie_name)
        if session_cookie is None:
            # No session yet (e.g. login/register itself) - nothing to forge.
            return await call_next(request)

        csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=403,
                content={"error": {"code": "CSRF_VALIDATION_FAILED", "message": "CSRF token missing or invalid"}},
            )
        return await call_next(request)
