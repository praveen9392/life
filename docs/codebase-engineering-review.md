# Codebase Engineering Review

Full-repo engineering review: audit → cleanup → hardening → enhancement → test → verify.
Scope: frontend, backend, database, tests, configuration, deployment, documentation.

## Executive summary

The Life app (React + TS + Vite frontend, FastAPI + SQLAlchemy async + PostgreSQL backend)
had a fundamentally sound architecture: feature-foldered frontend with TanStack Query for
server state and Zustand restricted to UI state, and a backend with clean
route → service → repository layering, ownership filtering in every query, explicit
Pydantic schemas for mass-assignment protection, and a consistent error envelope.

The review found and fixed **no architectural rewrites** — instead ~60 targeted defects:
two E2E-breaking UI regressions, a note-autosave data-loss bug, a CSRF lockout edge,
account deletion without re-authentication, missing rate limits on sensitive endpoints,
a frozen `now()` default in two migrations, fabricated UI metrics, dead ARIA semantics,
N+1 query patterns, and stale documentation. Two product enhancements were added
(tags UI, habit un-log). Final state: **backend 113 tests passed, frontend 14 Vitest
tests passed, 10/10 Playwright E2E passed, ruff/mypy/ESLint/tsc clean, production
build green.**

## Architecture

- **Verdict: sound, preserved.** No layer violations introduced by the fixes.
- Route handlers stay thin; business rules live in services; SQL in repositories.
- Frontend: lazy routes, `QueryStateBoundary` for loading/error/empty states, shared
  HTTP client with cookie auth + CSRF header echo.
- Deferred (documented, not fixed): full `Page`-shaped pagination for all list
  endpoints; Board/Calendar task views remain explicit "Coming soon" stubs.

## Frontend

Fixed (highlights):
- **E2E regressions**: desktop logout moved into the `UserMenu` dropdown and health
  metric tabs lost `role="tab"` — spec updated to the real UI.
- **Data loss**: `NoteEditor` cleared its debounce timer on unmount, silently dropping
  the last keystrokes when switching notes within the 600 ms window. It now flushes
  the pending save.
- **Mobile modal fragility**: the task modal's bottom sheet oscillated layout in
  mobile Chromium (scrollbar-gutter toggle around the `90vh` threshold reflowing
  wrapped text). Fixed with `scrollbar-gutter: stable`, `text-size-adjust: 100%`,
  `inputMode="numeric"` for the minutes field, and no redundant `autoFocus`
  (Radix already manages dialog focus).
- Search flooding: shared `useDebouncedValue` (300 ms) for global + notes search.
- Notifications: extracted hooks, Escape close, `role="menu"`, per-item mark-read,
  open-gated listeners (consistent with `UserMenu`).
- A11y: fake `role="tab"` groups → `role="group"` + `aria-pressed` across 6 pages;
  malformed calendar `role="grid"`/`role="row"` removed; mobile task actions always
  visible below `md`; `ErrorState` retry on habits; heatmap error state added.
- Habits: dynamic `useHabitMetrics` via `useQueries` (was hard-capped at 10 habits),
  real progress-ring value (was hardcoded 0), week navigation clamped forward,
  timezone-safe local `toISODate()`, mobile card adopts the same
  pending → completed → skipped → clear cycle as the grid.
- Dead code: 9 unused npm dependencies removed; dead hooks/APIs deleted
  (`useUpdateGoal`, `useWorkouts`, `useCreateWorkout`, `useLearningSessions`,
  `goalsApi.update`, `learningApi.listSessions`).
- Fabricated content ("Velocity +18%", "Top 5% user", "Cloud Sync Active") removed.

## Backend

Fixed (highlights):
- **CSRF**: enforcement extended to refresh-cookie-only sessions (cross-site POST
  could force-rotate a victim's refresh token), with login/register/logout exempted
  so a stale session cookie + missing CSRF cookie can never lock a user out.
- **Account deletion** now requires `current_password` (re-authentication before an
  irreversible action) and purges the user's S3 avatar objects (best-effort).
- Rate limits added: password change (5/min), logout-all (10/min), account deletion
  (5/min), privacy export (10/min).
- Migration `9f4a2c1e7b3d` fixes frozen `now()` server defaults on
  `notifications.created_at` / `refresh_tokens.created_at`.
- `mark_all_read` is a single `UPDATE` (was paged SELECT + ORM writes).
- Workout set validation batches exercise visibility in one `IN` query (was N+1).
- Bounded list endpoints (`/learning/courses`, `/tags`); `build_page` shared by 5 routes.
- Dashboard "upcoming" excludes today/overdue via SQL `due_from` filter.
- Refresh rotation deletes expired tokens for the user before minting a new one.

## Database

- Schema at head (`53096170c4b1` → `9f4a2c1e7b3d`); linear migration chain verified;
  no model/migration drift.
- Ownership scoping verified on every new/changed query (habit un-log, tags, export).
- No N+1 on new paths (`selectinload` on courses; batched exercise validation).
- Known caps documented: dashboard lists truncate at 50/100 rows (counts understate
  beyond that) — acceptable for a personal productivity app, noted as debt.

## Security

Second-pass verdict: **no remaining P0/P1**.
- IDOR: all new endpoints ownership-scoped (verified by cross-user tests).
- CSRF: double-submit pattern covers access- and refresh-cookie sessions; exemptions
  are only the session-minting/logout endpoints.
- Privacy export strips `hashed_password`; account deletion requires password and
  removes avatar objects.
- Error responses do not leak internals; sort params are closed `Literal` whitelists.
- Follow-ups (documented, deferred): avatar magic-byte validation, tightening CORS
  further, `get_remote_address` keying behind proxies (render.yaml now passes
  `--proxy-headers`), `SameSite=none` default relies on double-submit CSRF.

## Testing

- Backend: **113 passed** (was 91) — new: tags API (list/create/conflict/attach/
  cross-user drop/PATCH semantics), habit un-log (incl. cross-user isolation),
  liveness endpoints, CSRF refresh-cookie cases, account-deletion password cases,
  template PATCH regression.
- Frontend: **14 Vitest tests** across 4 suites.
- E2E: **10/10 Playwright** (chromium + mobile Pixel 7) — register → onboard →
  dashboard → logout → login, wrong-password error, protected-route redirect,
  task modal creation + persistence + whitespace validation, health metric logging.
- The E2E suite was rewritten for the current UI (modal task flow, UserMenu logout,
  `aria-pressed` buttons) after the fix pass changed those surfaces.

## Performance

- Bundle splitting verified (react vendor ~459 KB, charts ~385 KB lazy chunk,
  main ~227 KB, query ~40 KB).
- Debounced search stops request flooding; `useQueries` replaced unrolled per-habit
  hooks (N requests → N cached, deduped).
- Backend: single-UPDATE mark-all-read, batched exercise validation, SQL-level
  dashboard filters.
- Deferred: dashboard streak badges issue one cached query per habit row (could be
  embedded in the summary payload).

## DevOps

- GitHub Actions CI added (`.github/workflows/ci.yml`): backend job with PostgreSQL
  service + ruff/mypy/pytest; frontend job with typecheck/lint/test/build.
- Docker Compose backend healthcheck added (`/health`, 40 s start period).
- render.yaml: `--proxy-headers` so the rate limiter keys real client IPs.
- `.env.example` gained `TEST_DATABASE_URL` + `RATE_LIMIT_ENABLED`; MinIO comment
  corrected. Playwright artifacts gitignored and untracked.

## Code quality

- Naming, layering, and error handling consistent with the existing style.
- No new comments beyond intent-documenting ones; no secrets in code or logs.
- Dead code removed rather than commented out.

## Technical debt (known, documented)

1. Full `Page`-shaped pagination for all list endpoints (partially done: 5 routes).
2. Courses/tags pagination UI.
3. Calendar full WAI-ARIA grid keyboard navigation.
4. Notifications for habits/learning/workouts; yearly analytics.
5. Board/Calendar task views (currently honest "Coming soon" stubs).
6. Dashboard list caps (50/100) understate counts for very large datasets.
7. Avatar magic-byte validation; old-avatar storage cleanup on replace.
8. Frontend feature-level test coverage beyond the 14 Vitest tests.

## Feature enhancements

1. **Tags UI** — backend tags existed with zero frontend exposure; added
   `features/tags/{api,hooks,TagPicker}`, tag selection in task + note editors,
   read-only chips on rows, inline tag creation with duplicate-error display.
2. **Habit un-log** — `DELETE /api/v1/habits/{id}/log/{date}` (204, idempotent,
   ownership-scoped) + frontend cycle pending → completed → skipped → clear on the
   weekly grid, dashboard toggle, and mobile card.

## Risks

- `SameSite=none` cookie default (cross-origin frontend) leans on double-submit CSRF;
  same-origin deployment could tighten to `lax`.
- Rate limiter uses in-memory storage (single-instance only); redis for multi-instance.
- Mobile E2E relies on `force: true` for one click inside the task modal sheet —
  documented Playwright mobile-emulation hit-test artifact (real pointer events at
  the same point verified working).

## Remaining issues

None known blocking. All deferred items above are documented in this file and in
`docs/feature-enhancements.md` / `docs/engineering-checklist.md`.
