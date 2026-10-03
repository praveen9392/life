# Changelog

## Unreleased (MVP)

### Remediation (post-audit)
- **Tasks workspace redesign**: the quick-add bar (which looked like search
  but created tasks) is replaced by a proper task-management workspace -
  real debounced search bar (server-side, never creates), prominent
  "+ Add Task" button opening a full create/edit modal (priority, status,
  list, due date/time, duration, recurrence with weekday picker), a filter
  toolbar (date chips incl. custom date, status incl. server-computed
  Overdue, priority) that combine and persist in the URL, grouped task
  cards (Overdue/Today/Tomorrow/This week/Later) with human-friendly dates,
  overdue accent edges + badges, green completion state (check animation,
  tint, strikethrough, badge - `success` token used consistently),
  snooze-by-a-day quick action, contextual empty states, skeleton cards,
  "Load more" pagination, and horizontally scrollable filter chips on
  mobile. Backend: `GET /tasks` gained `search`, `due_from`, `due_on`,
  `overdue` (user-timezone aware) and `priority` filters + tests.
- **Deployment**: added unauthenticated `GET /health` (liveness) and
  `GET /health/db` (connectivity probe) - the Render blueprint previously
  pointed at a nonexistent `/api/health`; added root + backend `.gitignore`
  so `.env`/caches can't be committed.
- **Backend**: fixed `PATCH /tasks/templates/{id}` crashing with 500
  (`recurrence_rule` missing from `TaskUpdateRequest`); fixed notification
  de-duplication creating duplicate `task_due_soon` reminders; fixed a
  tautological date filter in task completion counts; `is_current` on the
  session list now actually identifies the calling device (by refresh-token
  hash); removed the duplicate `GET /auth/sessions` endpoint (canonical:
  `GET /users/me/sessions`); deleted unscoped repository helpers
  (`get_habit_log`, `tag_ids_for_task`) as an IDOR-hygiene measure.
- **Tags**: new `/api/v1/tags` endpoints; tasks and notes accept `tag_ids`
  on create/update (foreign tag ids silently dropped - no existence leak).
- **API**: `sort`/`order` params on tasks and notes; offset/limit on the
  exercise catalog.
- **Typing**: `mypy app` is now clean (was 27 errors) - `BaseRepository`
  uses a property-based `OwnedEntity` protocol that models with
  `declared_attr` columns satisfy.
- **Database**: new migration adding missing FK indexes
  (`workout_sessions.workout_id`, `workout_sets.exercise_id`,
  `learning_sessions.{course_id,learning_item_id}`) and a
  `notifications(user_id, is_read)` composite index.
- **Frontend**: charts (Recharts) on Analytics, Health and Workouts; habit
  completion heatmap + habit editing; full task edit sheet (priority, due
  date/time, duration, status, list); calendar day/week views; markdown
  write/preview editor for notes; dynamic hero subtitles on Health,
  Learning and Goals; theme + notification preferences on the Profile page
  (and the onboarding theme choice now applies immediately); Framer Motion
  micro-interactions (hover/tap/completion) across all feature pages;
  mobile "More" sheet giving every section bottom-nav parity; fixed the
  390px horizontal-overflow bug (compact mobile search); charts chunk
  code-split out of the core bundle.
- **Tooling**: ESLint (flat config) + `npm run lint`; Vitest +
  Testing Library + `npm run test` with component/unit tests
  (QueryStateBoundary, EmptyState, LoginPage, theme store).

### Added
- **Auth**: register/login/logout, JWT access + rotating opaque refresh
  tokens in httpOnly cookies, double-submit CSRF, refresh-theft detection
  (whole-family revocation), sessions list + revoke, password change.
- **Profile & settings**: name, IANA timezone, session management, password
  change, theme toggle (light/dark paired tokens, WCAG AA).
- **Onboarding**: skippable 3-step setup (name/timezone, first habits,
  first goals) — every step optional.
- **Tasks**: lists (Today/Upcoming/Later), priorities, due dates, tags,
  recurring templates that generate one occurrence at a time.
- **Habits**: frequency model (daily/weekdays/custom N-per-week), per-day
  logging, streaks with neutral skipped/N-A days.
- **Notes**: markdown notes, pin/archive, tags, soft-delete.
- **Dashboard**: one aggregated payload — today's habits/tasks, overdue,
  upcoming, streaks, weekly counts, progress ring.
- **Health**: manual metric logging (weight/water/sleep/steps/custom),
  type-filtered history.
- **Workouts**: shared + private exercise catalog, sessions with sets
  (reps/weight), duration.
- **Learning**: items (book/technology/topic/project), course → module →
  lesson tree with derived progress and auto-advancing course status,
  study-session logging.
- **Goals**: manual or milestone-derived progress, auto status sync.
- **Analytics**: week/month summary — habit rates, task completion,
  learning minutes, workouts, goal progress, best streak — all computed
  from canonical `progress_rules` formulas.
- **Calendar**: month grid aggregating tasks due/done, habits due/done,
  workouts, learning minutes, milestones per user-local day.
- **Search**: global debounced search across tasks, notes, habits, goals,
  learning items, courses.
- **Notifications**: in-app bell with unread badge; lazy-generated
  task-due-soon reminders (deduped, cron-ready service boundary).
- **Privacy**: full JSON data export (`/privacy/export`) and permanent
  account deletion (`/privacy/account`) with cascade + cookie cleanup.
- **Infra**: Alembic migrations, request IDs, structured logging, rate
  limiting, security headers, consistent `{"error": {...}}` envelopes,
  Dockerfiles + docker-compose, Render blueprint, 90+ backend tests and
  Playwright E2E (chromium + mobile).

### Security
- Ownership (`user_id`) enforced in every query; foreign IDs are
  indistinguishable from missing (404).
- No client-supplied `user_id` is ever trusted.
- Two-user isolation tests cover every owned module including nested
  children.
