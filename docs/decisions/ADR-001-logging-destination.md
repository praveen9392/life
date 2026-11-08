# ADR-001: Logging Destination and Format

Last reviewed: 2026-10-10
Status: **Newly proposed (2026-10-10), implemented as the default in code.** This is not a historical record of an earlier decision. Owner confirmation of open question 1 in the audit (is persistent file logging wanted?) is still pending.

## Context
Before this change (audit BE-001/002/003/031-034) logging was configured at import time, wrote DEBUG to a relative-path `app.log` (ephemeral in containers), ignored `LOG_LEVEL`, lacked request IDs, and had no redaction.

## Decision
- Log to **stdout** by default; container platforms collect it.
- File logging only when `LOG_FILE` is an absolute path; rotate 5 MB x 5.
- Level from `LOG_LEVEL` (default INFO). JSON when `ENVIRONMENT=production` unless `LOG_JSON` overrides.
- Configure explicitly via `configure_logging(settings)` from `create_app()`.
- Inject `request_id` via ContextVar; validate inbound `X-Request-ID`; mask secrets with `RedactionFilter`.

## Consequences
+ No ephemeral file by default; one stream; machine-readable in prod; correlation possible.
- A relative `LOG_FILE` is silently ignored (no warning).
- Redaction is regex-based, best effort.
- No dedicated tests found for these behaviors.

## Alternatives considered (from audit)
Keep file logging always (rejected: ephemeral FS); add a third-party structured logging library (rejected: stdlib JSON formatter suffices).

## Verification
`backend/app/core/logging.py`, `main.py`, `core/middleware.py`.
