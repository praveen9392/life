# Codebase Changes

Every meaningful change from the full engineering review pass.

| Area | Change | Reason | Files | Impact | Verification |
|---|---|---|---|---|---|
| Frontend/E2E | Rewrote smoke spec for current UI: UserMenu logout (desktop), `aria-pressed` health buttons, modal task flow + persistence + whitespace validation | Spec targeted removed UI (quick-add bar, `role=tab`) | `frontend/e2e/smoke.spec.ts` | E2E matches real user flows | 10/10 Playwright passed |
| Frontend/E2E | Force-click + settle wait for one mobile modal click | Playwright mobile-emulation hit-test artifact (verified real clicks work via `page.mouse.click`) | `frontend/e2e/smoke.spec.ts` | Stable mobile E2E | 10/10 passed |
| Frontend | Note autosave flushes pending save on unmount | Debounce window dropped last keystrokes on note switch (data loss) | `frontend/src/features/notes/pages/NotesPage.tsx` | No silent edit loss | typecheck/eslint |
| Frontend | Modal `scrollbar-gutter: stable`; html `text-size-adjust: 100%`; minutes input `inputMode="numeric"`; removed redundant `autoFocus` | Bottom-sheet layout oscillation in mobile Chromium around the 90vh threshold | `Modal.tsx`, `index.css`, `TasksPage.tsx` | Stable mobile modal layout | Mobile E2E first-attempt pass |
| Frontend | MobileHabitCard adopts pending→completed→skipped→clear cycle; honest aria-labels | Was a lying 2-state toggle ("Mark incomplete" set *skipped*) | `frontend/src/features/habits/pages/HabitsPage.tsx` | Consistent habit UX on mobile | typecheck |
| Frontend | Habit heatmap error state; habits error box → `ErrorState` retry; week nav clamped (`MAX_WEEK_OFFSET=0`) | Errors rendered as fake "no entry" data; forward nav into all-disabled weeks | `HabitsPage.tsx` | Honest error/empty states | typecheck/eslint |
| Frontend | NotificationBell listeners gated on `open` | Listeners bound permanently; inconsistent with UserMenu | `frontend/src/features/notifications/NotificationBell.tsx` | Less idle work | eslint |
| Frontend | Calendar: removed malformed `role="row"`/`role="grid"` | Half-implemented grid pattern is worse for SR users than none | `frontend/src/features/calendar/pages/CalendarPage.tsx` | No misleading ARIA | eslint |
| Frontend | Debounced search (300 ms) shared hook | Request flooding per keystroke | `useDebouncedValue.ts`, Notes/GlobalSearch | Fewer requests | vitest/build |
| Frontend | Notifications hooks extraction, Escape close, menu semantics, per-item mark-read, error states | Errors shown as "all caught up"; no keyboard dismissal | `features/notifications/*`, `NotificationBell.tsx` | Correct + accessible | vitest |
| Frontend | `QueryStateBoundary` `isEmpty` prop; migrated Goals/Health/Learning/Workouts | Empty arrays/pages bypassed the empty state | `QueryStateBoundary.tsx` + 4 pages | Correct empty states | vitest |
| Frontend | A11y: `role=tab` → `role=group` + `aria-pressed` (6 pages); mobile task actions always visible; route `errorElement`s; `/onboarding` protected; theme sync from profile | Fake tab semantics; touch-invisible actions; raw router errors; 401 loops; theme not applied on new devices | Analytics/Calendar/Goals/Health/Notes/Dashboard, TasksPage, AppRouter, RouteErrorBoundary, ProtectedRoute, auth hooks | Accessible + resilient UI | eslint/vitest/build |
| Frontend | Habits: dynamic `useHabitMetrics` (useQueries), real progress-ring value, `toISODate()` local dates, empty-ID guards | Hard cap at 10 habits; hardcoded 0 ring; UTC date shifts; `/habits//history` requests | `features/habits/*`, `utils/date.ts` | Correct at any habit count | vitest/build |
| Frontend | Removed fabricated metrics/claims; disabled Board/Calendar stubs | Unsupported data in UI | DashboardPage, AppShell, TasksPage | Honest product surface | build |
| Frontend | Removed 9 unused deps; deleted dead hooks/APIs | Unused Radix packages, date-fns, devtools; dead exports | `package.json`, `package-lock.json`, feature hooks/api | Leaner install | typecheck/build |
| Frontend | Tags UI enhancement (new feature) | Backend tags had zero frontend exposure | `features/tags/{api,hooks,TagPicker.tsx}`, TasksPage, NotesPage | Tag org for tasks/notes | vitest/build/E2E |
| Frontend | Habit un-log UI (new feature) | Check-off was one-way; accidents irreversible | `features/habits/{api,hooks}`, HabitsPage, DashboardPage | Undo habit logs | E2E-adjacent, vitest |
| Frontend | Profile: delete-account password prompt | Backend now requires `current_password` | `features/profile/{api,hooks,pages}` | Matches API contract | typecheck |
| Backend | CSRF enforced when access OR refresh cookie present; login/register/logout exempt | Cross-site POST could force-rotate refresh tokens; stale cookie + missing CSRF cookie could lock users out | `core/middleware.py`, `tests/api/test_auth.py` | CSRF coverage without lockout | pytest (new cases) |
| Backend | `DELETE /privacy/account` requires `current_password` | Irreversible action guarded only by a stolen session | `schemas/search.py`, `routes/search.py`, `privacy_service.py`, tests | Re-auth before deletion | pytest |
| Backend | Account deletion purges S3 avatars (best-effort) | Personal files lingered at public URLs after "permanent" deletion | `privacy_service.py`, `storage_service.py` | True privacy delete | ruff/mypy |
| Backend | Rate limits: password 5/min, logout-all 10/min, delete-account 5/min, export 10/min | Sensitive endpoints unthrottled | `routes/auth.py`, `users.py`, `search.py` | Abuse resistance | pytest |
| Backend | Migration `9f4a2c1e7b3d`: `text("now()")` server defaults | Frozen-at-migration timestamps on notifications/refresh tokens | `alembic/versions/9f4a2c1e7b3d_*` | Correct defaults | alembic current @ head |
| Backend | `DELETE /habits/{id}/log/{date}` → 204 idempotent, ownership-scoped | Un-log endpoint for the frontend enhancement | `routes/habits.py`, `habit_service.py`, `habit_repository.py`, `test_habit_unlog.py` | Habit log undo | pytest incl. cross-user |
| Backend | Bounded `/learning/courses` + `/tags` (offset/limit); `build_page` at 5 sites | Unbounded lists | `routes/learning.py`, `tags.py`, repos | Predictable payloads | pytest |
| Backend | `mark_all_read` single UPDATE; batched exercise-id validation | Paged loop; N+1 per set | `notification_repository.py`, `workout_service.py`, `workout_repository.py` | Fewer round-trips | pytest |
| Backend | Dashboard `due_from=today+1`; course date-pair validation; refresh deletes expired tokens; dead code removed | Semantic + hygiene fixes | `dashboard_service.py`, `learning_service.py`, `auth_service.py`, `user_service.py`, `deps.py` | Correct behavior | pytest |
| Backend | Tags tests, liveness tests, template PATCH regression, CSRF/auth test updates | Coverage gaps vs. documented claims | `tests/api/*` | 113 tests (was 91) | pytest |
| Database | Migration chain verified linear; no model drift | Safety | alembic versions | Deterministic upgrades | `alembic current` |
| DevOps | GitHub Actions CI (backend PG service + frontend gates) | No CI existed | `.github/workflows/ci.yml` | Regression gate on push | workflow YAML |
| DevOps | Compose backend healthcheck; render.yaml `--proxy-headers`; `.env.example` vars; Playwright artifacts ignored/untracked | Ops correctness | `docker-compose.yml`, `render.yaml`, `.env.example`, `frontend/.gitignore` | Deployable + clean tree | docker config |
| Docs | This file set + AGENTS.md port/E2E corrections | Stale claims (port 8000, quick-add flow, missing vars) | `docs/*`, `AGENTS.md` | Docs match reality | manual review |
