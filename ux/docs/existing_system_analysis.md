# Existing System Analysis - Life

Status: audit phase deliverable. Written before any redesign work.
Date of observation: 2026-11-08. Observations marked **[V]** were verified by running the app or reading source; **[I]** are inferences; **[N]** were not tested.

## 1. Product overview

Life is a single-user "personal operating system" web app. One account holds a person's tasks, habits, notes, health metrics, workouts, learning (courses and items), goals, calendar roll-up, analytics, notifications and profile/security settings. There are no multi-user, team, sharing or admin features **[V - no such routes/endpoints]**.

Target user: an individual running their own daily routine and long-term growth, mostly on desktop, with real mobile use (a bottom-tab layout and a mobile "More" sheet exist) **[V]**.

Core value: one place to plan (tasks, calendar, goals), build routines (habits, learning, workouts, health), capture (notes), and review (dashboard, analytics).

## 2. Technical understanding

| Area | Finding |
|---|---|
| Frontend | React + TypeScript + Vite 8, Tailwind 3 (custom breakpoints `xs360 sm390 md768 lg1024 xl1440 2xl1920`), TanStack Query for server state, Zustand for UI state, react-router 7, framer-motion, recharts, react-hook-form + zod, Radix Dialog, react-markdown + mermaid **[V - package.json]** |
| Backend | FastAPI 0.115, SQLAlchemy 2 async, PostgreSQL, Alembic, Pydantic v2 **[V]** |
| Auth | httpOnly cookies `access_token` (15 min) and `refresh_token` (30 d), readable `csrf_token` echoed as `X-CSRF-Token` on non-GET **[V - config.py, httpClient.ts]** |
| API envelope | Errors: `{"error":{"code","message","fields?","request_id"}}`; lists: `{items,total,page,page_size}` **[V]** |
| Routing | Public `/login`, `/register`; protected `/app/*` inside `AppShell`; standalone `/onboarding`; catch-all 404 page; every feature page is a lazy chunk **[V - AppRouter.tsx]** |
| Design system | CSS variable tokens (`tokens.css`) paired light/dark; indigo accent; slate neutrals; one custom radius `card`; Inter/system font **[V]** |
| Client contract | One `httpClient` wraps `fetch`; on any non-auth 401 it hard-redirects to `/login` **[V]** |

### How frontend and backend communicate **[V]**
Browser (`:5173` by default) -> `VITE_API_BASE_URL` (default `http://localhost:8000`) with `credentials: include`. CORS is allow-listed by `ALLOWED_ORIGINS` (default only `http://localhost:5173`). I ran an isolated stack (API `:8002` on the `life_test` DB, Vite `:5175`) and confirmed the app loads, registers, logs in and reads/writes every module.

## 3. Product structure

Sidebar (desktop, collapsible): Dashboard, Tasks, Habits, Notes, Health, Workouts, Learning, Goals, Calendar, Analytics; Profile is pinned at the bottom.
Mobile bottom tabs: Dashboard, Tasks, Habits, Learning, More. "More" sheet: Notes, Health, Workouts, Goals, Calendar, Analytics, Profile, Log out.
Header: global search (Ctrl/Cmd+K focuses it), Quick Add (links to `/app/tasks?new=1`), notification bell, theme toggle, account menu (only action: Log out).

## 4. Screen inventory

| # | Screen | Route | Purpose / main content | Key actions |
|---|---|---|---|---|
| 1 | Login | `/login` | Email + password | Log in, link to register |
| 2 | Register | `/register` | Name (optional), email, password (>=10 chars) | Create account |
| 3 | Onboarding | `/onboarding` | 3-step wizard: name+timezone, theme, notification prefs | Skip, Next, Finish |
| 4 | Dashboard | `/app` | Greeting, daily-progress ring, Habits Today, Focus Tasks, weekly stat strip | Check off habits, complete tasks, Add habit/task |
| 5 | Tasks | `/app/tasks` | Stat pills, filters (due date, status, priority, search), grouped list (Overdue/Today/...) | Create/edit/complete/delete (confirm dialog), recurrence, tags |
| 6 | Habits | `/app/habits` | Summary cards, weekly grid, heatmap view, search, category filter | Log/unlog a day, create/edit/delete habit |
| 7 | Notes | `/app/notes` | Folder rail, note list, editor (Write/Preview with markdown + mermaid), reader modal | Create/edit/pin/archive/delete, folders CRUD, drag notes into folders, tags, sort, search |
| 8 | Health | `/app/health` | Metric-type tabs, trend chart, entry list, log form | Log/delete a metric |
| 9 | Workouts | `/app/workouts` | Weekly frequency chart, personal records, session list | Log workout (sets), add exercise to catalog, delete session |
| 10 | Learning | `/app/learning` | Log-session form, Courses (modules/lessons), Learning items | Add course/module/lesson, toggle lesson, add item |
| 11 | Goals | `/app/goals` | Goal cards with milestones and progress | Create goal, add/toggle/delete milestone, delete goal |
| 12 | Calendar | `/app/calendar` | Month/Week/Day roll-up of counts per day | Navigate periods |
| 13 | Analytics | `/app/analytics` | Week/Month KPIs, completion trend, per-habit rates | Switch period |
| 14 | Profile & settings | `/app/profile` | Profile, preferences (theme, 5 notification toggles), security (password, sessions), privacy (export, delete) | Save, revoke session, export, delete account |
| 15 | 404 | `*` | "Page not found" | Back to dashboard |
| 16 | Route error boundary | (runtime) | Friendly error page | - |

Global overlays: notification dropdown, account menu, search results panel, task/habit/goal/workout modals, delete confirm dialog, mobile "More" sheet, toast.

## 5. Backend capability map (86 endpoints) **[V - route grep]**

auth (register, login, refresh, logout, logout-all) - users/me (get, patch, avatar upload, onboarding, password, sessions list/revoke) - tasks (CRUD + recurring template patch) - habits (CRUD, log put/delete, history, streak) - notes (CRUD, sort/search/directory filters) - note-directories (CRUD + move notes) - tags (list, create) - health metrics (list, create, delete) - exercises, workouts, workout-sessions - learning (items, courses, modules, lessons, sessions) - goals (CRUD, milestones CRUD) - dashboard summary - analytics summary - calendar range - notifications (list, read, read-all) - search - privacy (export, delete account) - liveness (`/health`, `/health/db`).

## 6. Existing functionality status

**Works [V]:** register/login/logout, protected redirect, dashboard summary, tasks CRUD with delete confirmation and URL-persisted filters, habits logging with weekly grid and heatmap, notes with folders, markdown and mermaid preview, health logging, workout logging with PRs, learning courses/lessons, goals with milestones, calendar month/week/day, analytics week/month, notification list with mark-all-read, global search with grouped results, theme toggle, mobile More sheet, 404 page.

**Partially works / gaps [V]:**
- Session auth silently dies after 15 minutes - there is no `/auth/refresh` call anywhere in the frontend (finding UX-001).
- Backend APIs with no UI: avatar upload, logout-all, goal update (PATCH), course update (PATCH), habit `reminder_time`, workout `performed_at`, learning-session `course_id`, health types `resting_heart_rate`/`custom` filtering.
- Dashboard "Morning/Evening" habit tabs depend on `reminder_time`, which no form can set.

**Mocked / placeholder [V]:** none found. The `useComingSoon` toast helper exists but I found no active use on a primary path **[I]**.

**Not tested [N]:** avatar upload (needs S3 configuration), account deletion and data export end-to-end, password change success path, multi-device session revoke, notification generation timing (lazy, on-read by ADR-002), drag-and-drop of notes into folders, calendar month-cell click behaviour.

## 7. Key workflows **[V unless noted]**

1. **Onboarding [I - route and wizard viewed at `/onboarding`; the post-register redirect was not exercised in a browser]:** register -> `/onboarding` -> 3 steps (skippable) -> `/app`.
2. **Daily loop:** Dashboard -> tick habits and tasks -> daily-progress ring updates.
3. **Capture a task:** Quick Add (`/app/tasks?new=1`) -> modal -> Create (button disabled until a title exists).
4. **Review:** Calendar / Analytics.
5. **Sign out:** account menu (desktop) or Profile/More (mobile).

## 8. Limitations of this investigation

- One seeded test user (`life_test` database); no multi-role perspectives exist because the product has a single role.
- Full-page screenshots mis-place fixed/sticky elements (sidebar, bottom nav); I treated those as capture artifacts, not defects.
- Screenshots at 320 px and 1800 px were generated and their overflow numbers recorded, but I only visually inspected a subset (see `screen_audit.md` coverage table).
- Contrast ratios and screen-reader behaviour were not measured; accessibility notes are code/visual observations only.
