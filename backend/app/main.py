"""FastAPI application factory.

Wires together configuration, structured logging, security/CSRF/request-id
middleware, CORS, rate limiting, centralized exception handling, and the
versioned API router. `/docs` is only exposed outside production (see
`Settings.docs_enabled`).
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api import liveness
from app.api.router import v1_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import CSRFMiddleware, RequestIDMiddleware, SecurityHeadersMiddleware
from app.core.rate_limit import limiter

logger = get_logger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_production_secrets()
    configure_logging()

    app = FastAPI(
        title=settings.app_name,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        # Explicit allowlist: the full method set the API uses, plus only the
        # request headers the frontend actually sends (cookie auth - no
        # Authorization header; CSRF via X-CSRF-Token; X-Request-ID is read
        # by RequestIDMiddleware when clients opt into supplying one).
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token", "X-Request-ID"],
    )
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIDMiddleware)

    register_exception_handlers(app)

    app.include_router(liveness.router)  # unversioned: GET /health, /health/db
    app.include_router(v1_router)

    logger.info("app_startup", environment=settings.environment.value)
    return app


def _rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "RATE_LIMITED", "message": "Too many requests, please try again later"}},
    )


app = create_app()
