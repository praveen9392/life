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

# Paths that must stay reachable even when a stale refresh/access cookie
# exists but the csrf_token cookie is gone (per-cookie eviction is not
# atomic): login/register mint a fresh session anyway, and a CSRF-forged
# logout can at most end the current session - which the victim wants gone
# anyway if their cookies are in a weird state. Refresh stays protected:
# it is the rotation endpoint the check was added for.
_CSRF_EXEMPT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/logout",
}


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

        if request.url.path in _CSRF_EXEMPT_PATHS:
            return await call_next(request)

        session_cookie = request.cookies.get(settings.access_cookie_name)
        refresh_cookie = request.cookies.get(settings.refresh_cookie_name)
        if session_cookie is None and refresh_cookie is None:
            # No session yet (e.g. login/register itself) - nothing to forge.
            return await call_next(request)

        # The refresh cookie alone still authenticates /auth/refresh and
        # /auth/logout: browsers keep sending it after the short-lived access
        # cookie expires, so refresh-cookie-only requests must pass the same
        # CSRF check (otherwise a cross-site POST could force-rotate - i.e.
        # revoke - a victim's refresh token, a logout-everywhere DoS).

        csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
        csrf_header = request.headers.get("X-CSRF-Token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=403,
                content={"error": {"code": "CSRF_VALIDATION_FAILED", "message": "CSRF token missing or invalid"}},
            )
        return await call_next(request)
