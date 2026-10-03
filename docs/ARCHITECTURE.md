# Architecture

## Layers

```
routes (app/api/v1/routes/)   -> HTTP only: parse, call service, serialize
services (app/services/)      -> business logic, derived state, policy
repositories (app/repos/)     -> data access; EVERY query ownership-scoped
models (app/models/)          -> tables, FKs, check constraints, indexes
schemas (app/schemas/)        -> request/response contracts
```

- Controllers are thin; services own decisions; repositories own SQL.
- One request = one session: `get_session()` commits on success, rolls back
  on exception (`app/db/session.py`).

## AuthN vs AuthZ

**Authentication** proves who you are:

- Short-lived JWT access token + opaque refresh token, both **httpOnly
  cookies** (not JS-readable → no token exfiltration via XSS).
- Refresh tokens are stored only as SHA-256 hashes, rotated on every use.
  Reuse of a rotated token = theft → the entire token family is revoked.
- CSRF: double-submit pattern — readable `csrf_token` cookie must match the
  `X-CSRF-Token` header on every mutating request once a session exists.

**Authorization** decides what you can see:

- Every personal-data row carries `user_id` (via `OwnedMixin`).
- `BaseRepository` composes `user_id` into every read/update/delete query.
- Foreign-owned and nonexistent IDs are indistinguishable → 404, never 403,
  so no information leaks through the difference.
- Client-supplied `user_id` is never trusted; ownership always comes from
  `current_user.id`.
- Nested entities without their own `user_id` (course modules/lessons, goal
  milestones, workout sets) are owned *through* their parent: repository
  lookups join through the parent and filter on `parent.user_id`.

## Timezone model

All timestamps are stored in UTC. User-local dates derive from the user's
IANA timezone via `zoneinfo`. Single source of truth: `app/utils/datetime.py`
(`today_for_user`, `user_day_bounds_utc`, `week_bounds_for_user`,
`month_bounds_for_user`). Never call `date.today()` in business logic.

## Canonical progress & rate formulas

`app/services/progress_rules.py` is the one place these live — analytics,
dashboard, and anywhere else MUST reuse them so surfaces never disagree:

- `daily_progress_percent = round(100 * done / max(due, 1))` — capped at 100.
- `completion_rate(completed, expected) = round(100 * completed / expected)`
  with `expected == 0 → 0` (vacuous truth: nothing due is not "100%").
- `habit_completion_rate` treats `skipped`/`not_applicable` logs as neutral:
  they reduce `expected` rather than count as failures.
- `task_completion_rate` counts cancelled tasks as neither due nor done.
- `milestone_progress`, `measurable_progress`, `learning_progress_percent`
  all follow the same `completed / total` shape.
- `streak_bonus_percent` (future gamification) = min(30, 3% per streak day).

Goal progress: `progress_mode=milestones` derives `progress_percent` from
completed milestones (manual edits ignored in that mode); `manual` stores
what the user sets. Status auto-syncs: >0% → in_progress, 100% → completed.

## Recurrence & streaks

- **Tasks**: one hidden template row (`is_recurring_template=True`) plus ONE
  generated occurrence at a time. Completing/cancelling the current
  occurrence generates the next. Editing an occurrence affects only itself;
  editing the template affects the future. Templates never appear in lists.
- **Habits**: frequency-driven, no pre-generated rows. Due-ness per day via
  pure functions in `app/utils/recurrence.py`.
- **Streaks**: `app/utils/streaks.py` — `current` streak counts consecutive
  logged days ending today or yesterday (today may be incomplete);
  `longest` is the max run overall. Skipped/N-A days are neutral.

## Error contract

```json
{ "error": { "code": "ERROR_CODE", "message": "..." , "fields": {...}? } }
```

- 400 `VALIDATION_ERROR` (with per-field messages)
- 401 `UNAUTHORIZED` / `TOKEN_EXPIRED`
- 403 `CSRF_VALIDATION_FAILED` (browser-session mutations only)
- 404 `NOT_FOUND` (also for foreign-owned resources)
- 409 `CONFLICT` (e.g. duplicate email)
- 429 `RATE_LIMIT_EXCEEDED` (slowapi; auth endpoints 5–10/min)
- 500 `INTERNAL_ERROR` — request ID logged, stack never exposed

## Notifications

`NotificationService.generate_due_notifications` runs lazily on
`GET /notifications` (deduplicated per 20h window) and is designed to be
called from a cron/worker later without API changes — the service boundary
is already correct.

## Observability

- Structlog JSON logs; `X-Request-ID` correlated through every request.
- Slowapi rate limiting with a Redis upgrade path (`RATE_LIMIT_STORAGE_URI`).
- Security headers on every response (nosniff, DENY framing, HSTS in prod).
- `/health` liveness endpoint (no auth, no DB access) and `/health/db`
  connectivity probe (runs `SELECT 1`), mounted unversioned in `app/main.py`;
  Render health checks point at `/health`.

## Privacy

- `GET /api/v1/privacy/export` — complete JSON snapshot of all owned data
  (excludes `hashed_password`).
- `DELETE /api/v1/privacy/account` — hard delete; FK `ON DELETE CASCADE`
  covers every owned table; custom exercises (FK `SET NULL`, which protects
  shared catalog rows) are deleted explicitly; session cookies cleared.
