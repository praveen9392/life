# Security

Last reviewed: 2026-10-10

## Authentication

- Passwords: Argon2id (`core/security.py`). Unknown-email logins run `verify_password_dummy` to equalize timing (BE-011 mitigated for timing; register still returns 409 for existing emails, i.e. email enumeration is accepted).
- Access token: HS256 JWT (`sub`, `token_type=access`, `iat`, `exp`), default 15 min, in httpOnly cookie. `get_current_user` (`api/deps.py`) decodes, loads the user, rejects inactive users (401).
- Refresh token: `secrets.token_urlsafe(48)`, stored only as SHA-256 hash, 30-day default, rotated per use, family-revoked on reuse. See [auth](../features/auth.md).

## Cookies (`app/api/cookies.py`)

Access and refresh: httpOnly. CSRF cookie: readable. Attributes from settings: `COOKIE_SECURE` (default true), `COOKIE_SAMESITE` (**default `lax`**; literal `lax|strict|none`), `COOKIE_DOMAIN`. Max-age: access = minutes*60; refresh/CSRF = refresh days. `clear_auth_cookies` deletes all three (note: delete passes secure+domain but not samesite/httponly).

## CSRF (`core/middleware.py::CSRFMiddleware`)

Double submit: `X-CSRF-Token` header must equal `csrf_token` cookie for non-safe methods (not GET/HEAD/OPTIONS) when an access **or** refresh cookie exists. Exempt: `/api/v1/auth/login`, `/register`, `/logout`. `/auth/refresh` is protected. Failure: 403 `CSRF_VALIDATION_FAILED`. Comparison is plain `!=` (not constant-time).

## CORS

`ALLOWED_ORIGINS` allowlist, credentials true, methods GET/POST/PUT/PATCH/DELETE/OPTIONS, headers `Content-Type`, `X-CSRF-Token`, `X-Request-ID`.

## Other headers / limits

`SecurityHeadersMiddleware`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS in production. `BodySizeLimitMiddleware` checks only the declared `Content-Length` (413); chunked bodies without Content-Length are not capped here (limit is `MAX_REQUEST_BODY_BYTES`, default 12 MiB). Avatars are capped at 2 MB in the service.

## Rate limits (slowapi, key = client host, `memory://` default)

| Endpoint | Limit |
|---|---|
| POST auth/register | 5/min |
| POST auth/login | 10/min |
| POST auth/refresh | 30/min |
| POST auth/logout-all | 10/min |
| POST users/me/password | 5/min |
| POST users/me/avatar | 10/min |
| GET privacy/export | 10/min |
| DELETE privacy/account | 5/min |

`RATE_LIMIT_ENABLED=false` disables (E2E only). Behind a proxy the app needs uvicorn `--proxy-headers` (set in `render.yaml`; the Dockerfile CMD does **not** pass it - verify your platform) or all users share one bucket. In-memory counters are per instance. Logout, `/auth/logout` and CRUD routes are unlimited.

## Ownership scoping

`BaseRepository._base_query(user_id)` adds `user_id` filter (and `deleted_at IS NULL` when present) to every get/list/update/delete. Foreign IDs return 404. Nested resources are checked via the parent (e.g. habit log upsert calls `get_habit` first; note moves validate the directory; tags via `resolve_owned_tag_ids` silently drop foreign IDs). Exercises are visible if shared (`user_id` NULL) or own. `user_id` is never taken from request bodies.

## Secrets and config validation

`Settings.validate_production_secrets()` runs at startup: for any environment other than development/test (so **staging and production**) a default `JWT_SECRET_KEY` aborts startup; production additionally rejects the default local DB URL. No other strength checks.

## Input

Search uses `escape_like` (`utils/sql.py`) so `%`, `_`, `\` are literal. Pydantic schemas validate bodies; avatar content type allowlist (jpeg/png/webp/gif); S3 keys are server-generated.

## Known gaps

- No email verification or password reset flow.
- No Redis rate limiting; no dependency scan in CI (audit BE-021, not re-verified).
- Client IP stored in `refresh_tokens.ip_address` is `request.client.host`.
- CSRF compare not constant-time (low impact for random tokens).
