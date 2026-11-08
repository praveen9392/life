# Troubleshooting

Last reviewed: 2026-10-10

| Symptom | Likely cause | What to check |
|---|---|---|
| All logs missing a file | file logging is opt-in | logs go to stdout; set `LOG_FILE` to an **absolute** path (relative is silently ignored) |
| Want request correlation | - | send/read `X-Request-ID` (8-64 chars `[A-Za-z0-9-]`, else replaced by a UUID); grep the ID in logs |
| Too verbose / DEBUG missing | `LOG_LEVEL` | default INFO |
| Text logs in prod | `LOG_JSON=false` set | unset => JSON when `ENVIRONMENT=production` |
| 403 `CSRF_VALIDATION_FAILED` | header != `csrf_token` cookie, or cookie lost | client must echo cookie in `X-CSRF-Token`; login/register/logout are exempt; refresh is not |
| 401 after refresh | token reused/revoked | `refresh_token_reuse_detected` WARNING; user must log in again; concurrent tabs refreshing can trigger it |
| Cookies not sent cross-site | `COOKIE_SAMESITE=lax` default, `COOKIE_SECURE` | for cross-site SPA need `none` + secure + matching `ALLOWED_ORIGINS` |
| 429 for everyone behind proxy | all users share proxy IP | run uvicorn with `--proxy-headers` (render.yaml does; Dockerfile CMD does not) |
| 429 locally/E2E | rate limits | `RATE_LIMIT_ENABLED=false` for E2E only |
| 413 `PAYLOAD_TOO_LARGE` | declared Content-Length > limit | `MAX_REQUEST_BODY_BYTES` (default 12 MiB) |
| 409 `CONFLICT` "conflicts with existing data" | untranslated unique violation | check `integrity_error` log line |
| 503 `SERVICE_UNAVAILABLE` | `OperationalError` | DB down/pool exhausted (`pool_timeout` 30 s); check `database_unavailable` log |
| `/health/db` 503 | DB unreachable within 3 s | `liveness_db_check_failed | error_type` |
| 503 `STORAGE_NOT_CONFIGURED` | S3 endpoint/key/secret not all set | env names in [deployment](../architecture/deployment-and-configuration.md) |
| 502 `STORAGE_UPLOAD_FAILED` | S3 error/timeout | `avatar_upload_failed` ERROR |
| App fails to start in staging/prod | default `JWT_SECRET_KEY` (or default local DB URL in prod) | set secrets |
| `relation "note_directories" does not exist` in tests | `life_test` not migrated | run `alembic upgrade head` against both DBs (AGENTS.md) |
| Search with `%` returns everything in notes list | `GET /notes?search=` does not escape wildcards | known; global `/search` does escape |
| Notification not appearing | generation is lazy and 20 h deduped | call `GET /notifications`; see [ADR-002](../decisions/ADR-002-lazy-notifications.md) |
| Docs `/docs` 404 | disabled outside development/test | by design |

Redaction reminder: secrets matching `password|token|secret|authorization|cookie` key/value text are masked as `***` in logs.
