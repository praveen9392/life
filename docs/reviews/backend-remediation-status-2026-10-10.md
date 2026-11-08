# Backend Remediation Status (2026-10-10)

Follows `backend-audit-2026-10-10.md`. Baseline before changes: ruff clean, mypy clean (101 files), 125 tests passed.
After changes: ruff clean, mypy clean (105 files), **156 tests passed** (31 new). Frontend untouched.

## Agents and file ownership
| Agent | Scope | Owned files |
|---|---|---|
| A | Logging, errors, config | core/{logging,middleware,exceptions,config}.py, main.py, db/session.py, api/liveness.py, .dockerignore, .gitignore, .env.example |
| B | API security, data | deps.py, auth_service, user_service, storage_service, routes auth/users/habits, habit/task/user repos, search_service, core/security.py, new api/cookies.py, utils/sql.py |
| C | Architecture | task/dashboard/analytics/privacy/notification/habit services, learning/workout repos, routes search/notifications/privacy/tasks, router.py, new export_repository.py |
| D | Tests | new test files only |
| E | Docs | docs/** |
| Lead | Integration | privacy_service storage call, cookie shim removal, test seam update, lint/type/test runs, final small fixes |

## Issue status
| ID | Status | Notes |
|---|---|---|
| BE-001, 002, 003 | Done | `configure_logging(settings)`; stdout default; optional absolute `LOG_FILE`; `LOG_LEVEL` honored |
| BE-031, 032 | Done | `request_id_ctx` + filter; inbound ID validated |
| BE-033, 034 | Done | JSON formatter (prod default), `RedactionFilter`; tested |
| BE-004 | Done | `Query(ge/le)` -> 422 |
| BE-005 | Done | savepoint + ConflictError (tested via patched path, not true concurrency) |
| BE-006 | Done | atomic `revoke_refresh_token_if_active`; reuse test is sequential |
| BE-007 | Done | `ON CONFLICT DO UPDATE` |
| BE-008 | Done | `*_async` wrappers via `to_thread`, botocore timeouts; privacy delete uses async |
| BE-009 | Done | user-timezone today; tested with Pacific/Kiritimati |
| BE-011 | Done | dummy Argon2 verify |
| BE-012, 014 | Done | samesite default lax; secret validation for staging |
| BE-013 | Done | `escape_like` in search, tasks, notes, exercises |
| BE-015 | Partial | 413 on declared Content-Length only |
| BE-016 | Mostly | SQL moved to repos; dashboard `build_summary` (~85 lines) not split |
| BE-017, 018, 028 | Done | cookies in `api/cookies.py`; avatar/delete logic in services; router split with identical URLs |
| BE-019, 029, 036 | Done | dead code, enums, noisy log |
| BE-020, 035, 037, 038, 041 | Done | lifespan dispose, Integrity/Operational handlers, ignore files, probe timeout, pool recycle |
| BE-022, 023, 025 | Partial | new tests; true parallel-DB concurrency tests not feasible with shared-session fixtures |
| BE-040 | Done | docstring corrected (ILIKE) |
| BE-044 | Done | docs under `docs/` created; ARCHITECTURE.md/README fixed |
| BE-010 | Needs approval | Dockerfile lacks `--proxy-headers` (render.yaml has it); Redis limiter for multi-instance |
| BE-021 | Open | CI coverage gate and `pip-audit` not added (needs baseline/CI decision) |
| BE-024 | Open | notification generation on read: product decision |
| BE-026 (part), 027, 030, 042, 043 | Open | dashboard split, import-time engine/limiter, strict mypy, Dockerfile build deps, `gather` perf (measure first) |

## Deployment notes
- No migrations or schema changes.
- Behavior changes: no `app.log` by default (set `LOG_FILE` to an absolute path to re-enable); cookie `SameSite` defaults to `lax`; staging requires a real JWT secret; production logs JSON.
- Existing `backend/app.log` and repo-root `app.log` are stale and gitignored; delete manually if wanted.
- Test change: `tests/api/test_users.py` avatar stub moved to `app.services.user_service.StorageService` / `upload_avatar_async` (seam moved with the refactor; assertions unchanged).

## Known issues found by docs review (unfixed)
Privacy export includes soft-deleted rows and omits `note_directories`; avatar purge runs before commit; relative `LOG_FILE` is silently ignored; all three split routers share one combined OpenAPI tag.
