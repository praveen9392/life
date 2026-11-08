# System Overview

Last reviewed: 2026-10-10

Layered modular monolith: one FastAPI process, one PostgreSQL database, optional S3-compatible storage. No queue, cache, scheduler, or background worker exists (grep-verified in the audit; `BackgroundTasks` not used).

## Context

```mermaid
graph LR
  User([Browser SPA]) -->|HTTPS, httpOnly cookies + X-CSRF-Token| API[Life API - FastAPI]
  API -->|asyncpg| PG[(PostgreSQL)]
  API -->|boto3 in worker thread| S3[(S3-compatible bucket: avatars)]
  API -->|stdout logs| Platform[Container log collector]
```

## Container

```mermaid
graph TD
  subgraph Process[uvicorn: app.main:app]
    MW[Middleware stack] --> R[Routers /api/v1 + /health]
    R --> S[Services] --> Repo[Repositories] --> M[Models]
  end
  M --> PG[(PostgreSQL)]
  S -.StorageService.-> S3[(S3)]
  Docker[Dockerfile CMD: alembic upgrade head, then uvicorn] --> Process
```

Deploy artifacts: `backend/Dockerfile`, `render.yaml` (start command uses `--proxy-headers`), `docker-compose.yml`.

## Middleware order (outermost first)

`create_app()` in `backend/app/main.py` adds middleware in this order; Starlette runs the **last added first**:

```mermaid
graph LR
  In[Request] --> B[BodySizeLimit] --> RID[RequestID] --> SH[SecurityHeaders] --> CSRF[CSRF] --> CORS[CORS] --> SA[SlowAPI] --> Rt[Router]
```

`lifespan` (`main.py`) awaits `engine.dispose()` on shutdown. `create_app()` calls `validate_production_secrets()` then `configure_logging(settings)`. `/docs`, `/redoc`, `/openapi.json` only in development/test (`Settings.docs_enabled`).

## Components

```mermaid
graph TD
  subgraph api[app/api]
    deps[deps.py: get_db, get_current_user, get_pagination]
    cookies[cookies.py]
    live[liveness.py]
    routes[v1/routes: 16 modules]
  end
  subgraph core[app/core]
    cfg[config] --- exc[exceptions] --- log[logging] --- mw[middleware] --- rl[rate_limit] --- sec[security]
  end
  routes --> deps
  routes --> svc[services: 20 modules]
  svc --> repos[repositories: base + 11 + export_repository]
  repos --> models[models + mixins]
  svc --> utils[utils: datetime, recurrence, streaks, pagination, sql]
  models --> db[db/session.py: engine pool_pre_ping, recycle 1800s, timeout 30s]
```

## Request lifecycle

Middleware -> route -> dependencies (`get_db` yields one session per request: commit on success, rollback on exception; `get_current_user` decodes the access cookie and loads the user) -> service -> repository -> Pydantic response. Errors go through `core/exceptions.py` handlers (see [error-handling](error-handling.md)).

## Layer rules and known leaks

- Routes thin; services hold rules; repositories own SQL and ownership scoping (`repositories/base.py::_base_query`).
- Known leaks (audit BE-016/017/018, status not re-verified): raw SQL still in some services (dashboard/analytics/search/privacy-delete), `routes/users.py` avatar handling. Cookie helpers were moved to `app/api/cookies.py` (verified), so `auth_service` no longer sets cookies.
- Routes `search.py`, `notifications.py`, `privacy.py` are separate modules (verified in `api/router.py`); each still declares `tags=["search","notifications","privacy"]` (cosmetic OpenAPI grouping).

## Current vs proposed

| Topic | Current | Proposed (not implemented) |
|---|---|---|
| Rate-limit store | `memory://` per instance | Redis when scaling to multiple instances |
| Notification generation | lazy on read ([ADR-002](../decisions/ADR-002-lazy-notifications.md)) | scheduler only with product input |
| Search | ILIKE | `pg_trgm`/FTS if data grows |
