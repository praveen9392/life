# Documentation Index

Last reviewed: 2026-10-10

Scope: the FastAPI backend (`backend/`). Source of truth is the current code; the audit in [reviews/backend-audit-2026-10-10.md](reviews/backend-audit-2026-10-10.md) is the point-in-time analysis these docs build on. Several audit findings (logging, request IDs, atomic refresh, upsert, pagination, timezone, async storage) have since been fixed in code; the docs describe the **current** behavior. Sections titled "Proposed" are not implemented.

## Freshness table

| Document | Last reviewed | Basis |
|---|---|---|
| [architecture/system-overview.md](architecture/system-overview.md) | 2026-10-10 | code |
| [architecture/error-handling.md](architecture/error-handling.md) | 2026-10-10 | code (`core/exceptions.py`, `core/middleware.py`) |
| [architecture/logging-and-observability.md](architecture/logging-and-observability.md) | 2026-10-10 | code (`core/logging.py`) |
| [architecture/data-architecture.md](architecture/data-architecture.md) | 2026-10-10 | models + migration file names (migration bodies not re-read) |
| [architecture/security.md](architecture/security.md) | 2026-10-10 | code |
| [architecture/deployment-and-configuration.md](architecture/deployment-and-configuration.md) | 2026-10-10 | `config.py`, `.env.example` names only |
| [api/api-overview.md](api/api-overview.md), [api/error-responses.md](api/error-responses.md) | 2026-10-10 | route decorators |
| [features/](features/) (13 files) | 2026-10-10 | services/routes/tests |
| [operations/troubleshooting.md](operations/troubleshooting.md) | 2026-10-10 | code |
| [decisions/ADR-001-logging-destination.md](decisions/ADR-001-logging-destination.md) | 2026-10-10 | newly proposed, implemented as default |
| [decisions/ADR-002-lazy-notifications.md](decisions/ADR-002-lazy-notifications.md) | 2026-10-10 | existing behavior |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 2026-10-10 (factual fixes) | older overview |
| [DEPLOYMENT.md](DEPLOYMENT.md), [BACKUP_RESTORE.md](BACKUP_RESTORE.md), [TESTING.md](TESTING.md) | not re-reviewed | pre-existing |
| `codebase-*.md`, `engineering-checklist.md`, `feature-enhancements.md`, `reviews/*` | not re-reviewed | point-in-time, may be stale |

## Reading order

1. [system-overview](architecture/system-overview.md) -> [data-architecture](architecture/data-architecture.md)
2. [error-handling](architecture/error-handling.md), [logging-and-observability](architecture/logging-and-observability.md), [security](architecture/security.md)
3. [api-overview](api/api-overview.md), then the feature doc you need.

## Conventions

- "Current behavior" = verified in code on the review date. "Proposed" = not implemented.
- Test claims list test files that exist; tests were **not executed** while writing these docs.
- Env var **names** only; never values.
