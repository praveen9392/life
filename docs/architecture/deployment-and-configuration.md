# Deployment and Configuration

Last reviewed: 2026-10-10

Names only; `backend/.env` was not read. Defaults are from `backend/app/core/config.py`. Names also present in `backend/.env.example` per grep. See also [../DEPLOYMENT.md](../DEPLOYMENT.md) (not re-reviewed).

## Environment variables

| Name | Default (code) | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `development|staging|production|test`; drives docs exposure, HSTS, JSON logs, secret validation |
| `DATABASE_URL` | local dev URL | `postgres://`/`postgresql://` are rewritten to `postgresql+asyncpg://` |
| `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW` | 5, 5 | |
| `TEST_DATABASE_URL` | - | tests only (in `.env.example`) |
| `JWT_SECRET_KEY`, `JWT_ALGORITHM` | insecure dev secret, HS256 | secret required outside dev/test |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | 15, 30 | |
| `CSRF_COOKIE_NAME`, `ACCESS_COOKIE_NAME`, `REFRESH_COOKIE_NAME` | csrf_token, access_token, refresh_token | |
| `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAMESITE` | none, true, lax | |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | comma-separated |
| `RATE_LIMIT_STORAGE_URI`, `RATE_LIMIT_ENABLED` | `memory://`, true | |
| `S3_ENDPOINT_URL`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` | unset / `life-avatars` / `auto` | storage "configured" iff endpoint+access+secret all set; names not in `.env.example` grep (unverified there) |
| `LOG_LEVEL`, `LOG_FILE`, `LOG_JSON` | INFO, unset, unset | see [logging](logging-and-observability.md) |
| `MAX_REQUEST_BODY_BYTES` | 12582912 | 413 above declared Content-Length |

## Startup sequence

`create_app()`: load settings -> `validate_production_secrets()` -> `configure_logging()` -> middleware/routers. Container: `alembic upgrade head` then `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}` (`backend/Dockerfile`). `render.yaml` start command adds `--proxy-headers`. Shutdown: `engine.dispose()`.

Import-time side effects remain: `db/session.py` builds the engine and `core/rate_limit.py` builds the limiter from settings at import; `app = create_app()` at module import.

## Health probes

`GET /health` (no DB), `GET /health/db` (`SELECT 1`, 3 s timeout, 503 `DATABASE_UNAVAILABLE`). Unversioned, unauthenticated.

## Proposed (not implemented)

Redis rate limiting for multi-instance; `--proxy-headers` in the Dockerfile CMD; hashed lockfile; removing `build-essential` from runtime image (audit BE-042, not re-verified).
