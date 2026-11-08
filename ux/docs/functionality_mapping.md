# Functionality Mapping - existing app -> redesigned prototype

Purpose: prove nothing was silently dropped. Statuses come from the validation passes of 2026-11-08 (`validation_report.md` has the evidence).
Status values: **Verified** (exercised against the real API in a browser) - **Captured** (renders correctly in screenshots, interactions not exercised) - **Not included** (with reason).

API base: all calls use the existing REST contract unchanged (cookies + `X-CSRF-Token`).

## Authentication and account

| Existing feature | Existing screen | New screen / interaction | API | Status |
|---|---|---|---|---|
| Register (name optional, email, password >=10) | `/register` | Register page, inline validation, rule shown up front | `POST /auth/register` | Captured (empty-submit validation verified; successful register exercised via API seed) |
| Login with inline error | `/login` | Login page, show-password toggle | `POST /auth/login` | Verified (empty, wrong password, success) |
| Logout | account menu / Profile / More | Avatar menu -> Log out; More sheet -> Log out | `POST /auth/logout` | Verified (session-gone flow ends at `/login`) |
| (new, API existed) Logout everywhere | none | Avatar menu + Settings | `POST /auth/logout-all` | Captured (dialog wired; destructive call not executed against the shared test session) |
| Protected-route redirect | `ProtectedRoute` | Router guard | `GET /users/me` | Verified (guest -> `/login`; logged-in guest page -> `/app`) |
| Session persistence | none (bug UX-001) | Silent refresh + retry | `POST /auth/refresh` | Verified (access cookie removed -> in-app navigation still loads data; cookies fully cleared -> `/login`) |
| Onboarding wizard (name, timezone, theme, notifications, skip) | `/onboarding` | 3-step onboarding | `PATCH /users/me`, `POST /users/me/onboarding` | Verified (all 3 steps + skip + finish) |

## Today / dashboard

| Existing feature | New | API | Status |
|---|---|---|---|
| Greeting + daily progress | Today hero with ring + honest breakdown | `GET /dashboard/summary` | Verified |
| Habits Today with check-off | Habits panel, one-tap complete/undo | summary + `PUT/DELETE /habits/{id}/log/{date}` | Verified (toggle + API round-trip + optimistic rollback path coded) |
| Focus tasks (overdue/today/upcoming), complete | Tasks panel, complete toggle | summary + `PATCH /tasks/{id}` | Verified |
| Weekly stats (notes, learning minutes, workouts, streak) | Stat row (auto-fit grid) | summary | Captured (values match `api-dashboard.json`) |
| Morning/Evening tabs | Shown only if a habit has a reminder time | summary | Verified (tab absent without reminders; present after creating one with a reminder) |
| "Energy" pill, "Focus %" pill | **Not included** - invented metric (UX-006) | - | Not included |

## Tasks

| Existing feature | New | API | Status |
|---|---|---|---|
| List with filters (due date, status, priority, list), search | Tasks page: segmented views + filter chips + search, URL state | `GET /tasks` | Verified (search, due/status filters, URL persistence across reload) |
| Stat pills (Due today, In progress, Completed today, Overdue) | Stat row; Completed today by `completed_at` | `GET /tasks` (several) | Verified (cards render + act as filters; counts match API) |
| Create (title, description, priority, list, due date/time, est. minutes, recurrence, tags) | Task modal / sheet | `POST /tasks`, `POST /tags` | Verified (create with tag; inline error on empty title; bottom sheet on mobile) |
| Edit, complete, reopen, status values | Row toggle + edit modal | `PATCH /tasks/{id}` | Verified (complete/reopen via toggle + menu; edit modal opens) |
| Recurring templates | Recurrence field; edits to template | `PATCH /tasks/templates/{id}` | Captured (recurrence field works; template-edit path not exercised - no recurring instance was edited) |
| Delete with confirmation | ConfirmDialog | `DELETE /tasks/{id}` | Verified |
| Pagination | Page size 50 + "Load more" | `GET /tasks?page=` | Captured (button renders when total > page; not clicked - dataset < 50) |
| "Priority Sprint" banner | **Not included** - copy only (UX-022) | - | Not included |

## Habits

| Existing feature | New | API | Status |
|---|---|---|---|
| List/create/edit/delete (name, category, frequency daily/weekly/custom, target, dates) | Habits page + habit modal (+ reminder time) | `/habits` CRUD | Verified (create with reminder; delete with confirm; edit modal opens) |
| Weekly grid with log/unlog/skip | Week board, 7 fitting columns, today highlighted; mobile stacked rows | `PUT/DELETE /habits/{id}/log/{date}` | Verified (click completes - API log confirmed; right-click menu skip) |
| Week navigation | Prev/next week + Today | `GET /habits/{id}/history` | Captured (buttons wired; navigation clicked in capture pass) |
| Heatmap | History view (heat strip with month labels + tooltips) | `GET /habits/{id}/history?days=` | Verified (renders per habit; 100-day window) |
| Streaks | Per-habit streak and best streak | `GET /habits/{id}/streak` | Verified (values match API) |
| Search, category filter | Search + category chips | client | Captured |
| "Streak Shields" card | **Not included** - no mechanic behind it (UX-007) | - | Not included |

## Notes

| Existing feature | New | API | Status |
|---|---|---|---|
| List, search, sort (created/updated/title, asc/desc) | Notes list column | `GET /notes` | Verified (sort select; search exercised via command bar + list) |
| Folders: list, create, rename, delete (notes -> unfiled), counts, Unfiled | Folder rail | `/note-directories` | Verified (create, counts, delete; rename dialog wired) |
| Move notes into folder (drag and drop) | Drag onto folder + folder select in editor | `POST /note-directories/{id}/notes` | Verified (folder select path; drag handlers wired, not mouse-dragged in the run) |
| Create/edit (title, content, category, tags), autosave | Editor with autosave indicator | `POST/PATCH /notes` | Verified (create -> editor -> autosave "All changes saved" -> API round-trip) |
| Pin, archive, delete (confirm) | Note menu | `PATCH/DELETE /notes/{id}` | Verified (delete; archive with explicit irreversibility warning per UX-032) |
| Markdown preview incl. mermaid | Preview with markdown; mermaid shown as source | client | Verified (markdown renders; mermaid shows source with a note - see limitations) |
| Reader modal | Reader view | `GET /notes/{id}` | Captured (opens from the note menu; deep-link `?note=` verified) |

## Health, Workouts, Learning, Goals

| Existing feature | New | API | Status |
|---|---|---|---|
| Health: list by type, trend chart, log, delete | Health page; every metric type incl. resting HR + custom | `/health/metrics` | Verified (log -> chart + stats -> delete; overview cards with sparklines) |
| Workouts: list sessions, weekly frequency, PRs | Workouts page, sets grouped by exercise | `GET /workout-sessions`, `GET /exercises` | Verified (sets show exercise names; PRs match API) |
| Log workout (sets), add exercise to catalog, delete session | Workout modal (+ date) | `POST /workout-sessions`, `POST /exercises`, `DELETE ...` | Verified (new exercise created in-form; session logged; deleted) |
| Learning: courses, modules, lessons toggle, items, log session | Learning page with tabs; session history; course select | `/learning/*` | Verified (session log with course; lesson toggle 50%->100%; library add/remove; sessions tab) |
| Goals: create, milestones add/toggle/delete, delete | Goals page; + edit goal, manual progress | `/goals/*` (`PATCH /goals/{id}`) | Verified (create -> edit progress to 40% -> delete; milestone toggle verified in seed data) |

## Calendar, Insights, Notifications, Search, Settings

| Existing feature | New | API | Status |
|---|---|---|---|
| Calendar month/week/day roll-up | Month grid + week view + day side panel with real tasks | `GET /calendar`, `GET /tasks?due_on=` | Verified (day selection lists that day's tasks incl. overdue; week view) |
| Analytics week/month KPIs, trend, habit rates | Insights page | `GET /analytics/summary` | Verified (week + month; charts render; per-habit rates match API) |
| Notification list, mark read, mark all read, unread badge | Bell popover | `/notifications` | Captured (popover renders with items + mark-all-read; mark-read click not exercised - only one notification existed) |
| Global search (grouped) | Command bar (+ actions) | `GET /search` | Verified (Ctrl+K, results, Enter navigates, Esc closes) |
| Profile: name, timezone | Settings -> Profile | `PATCH /users/me` | Captured (form renders with values; save exercised in onboarding path) |
| Preferences: theme (light/dark/system), 5 notification toggles | Settings -> Preferences; header toggle persists | `PATCH /users/me` | Verified (dark -> reload -> still dark; server pref confirmed; header toggle persists too) |
| Security: change password, list/revoke sessions | Settings -> Security (parsed devices) | `/users/me/password`, `/users/me/sessions` | Verified (wrong current password -> inline server error; sessions listed with parsed names; revoke button wired, not clicked) |
| Privacy: export data, delete account (typed confirm + password) | Settings -> Privacy | `GET /privacy/export`, `DELETE /privacy/account` | Verified (export downloads `life-export-2026-11-08.json`; delete dialog wired, not executed) |
| Avatar upload | **Not included** - requires S3 configuration that is not available here | `POST /users/me/avatar` | Not included |
| 404 and error pages | Not-found view, connection-error view | - | Verified (unknown URL -> not-found; API down -> "Can't reach the Life API" state) |

## Deliberate additions in the prototype (not in the existing app)

- Command bar with action entries (create shortcuts, theme, logout) on top of search.
- Quick Add chooser across all six create flows.
- Day panel in Calendar listing the actual tasks of a selected day.
- Goal editing with manual progress; course editing; workout date; learning-session course attach + history list; habit reminder time.
- Logout-everywhere in the avatar menu and Settings.
- Honest-metrics copy throughout (no Energy/Streak Shields).
