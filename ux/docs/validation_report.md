# Validation Report - Life UX redesign prototype

Date: 2026-11-08. Everything below was actually executed; nothing is claimed without a run.

## Environment used

- Backend: FastAPI on `http://localhost:8002`, pointed at the `life_test` PostgreSQL database (migration head `c4a8d2e61b90`), with `RATE_LIMIT_ENABLED=false`, `COOKIE_SECURE=false`, `ALLOWED_ORIGINS=http://localhost:5175,http://localhost:5180`.
- Prototype: `ux/prototype` served by its zero-dependency `serve.mjs` on `http://localhost:5180`.
- Throwaway users on the test DB, one per validation run (fresh registration each run to avoid collisions).
- Drivers: Playwright (headless Chromium) scripts in `frontend/.audit/` (deleted after validation; documented in `PROGRESS.md` so they can be recreated).

## What was executed

### 1. Existing-app audit captures (evidence for the audit docs)
- All 12 authenticated routes at 320 / 414 / 820 / 1366 / 1800 px, full-page screenshots + `report.json` (overflow, console errors, failed requests, redirects) + API JSON snapshots (`api-dashboard`, `api-analytics-week`, `api-analytics-month`, `api-me`).
- Interaction pass: 45 steps (auth forms incl. wrong password, notification popover, account menu, command bar, quick add, task create/delete/filter, habits heatmap, notes preview/reader, health forms, workout modal, learning expand, goals modal, calendar week/day, analytics settled + month, sidebar collapse, keyboard focus walk, 404, mobile More sheet/search/modal/note/workouts/calendar/analytics/profile).
- Dark-mode captures of the existing app (in-app toggle; full reloads revert - that is finding UX-011, verified).
- Result: findings UX-002..UX-030 (see `ux_audit_report.md`); overflow only on `/app/notes` (320/414/820); one duplicate-key console error on `/app/workouts`.

### 2. Prototype smoke run (first pass)
- Guest: `/login` renders; empty submit -> inline errors; wrong password -> server error shown; guest hitting `/app` -> redirected to `/login`; unknown URL -> not-found page.
- Authenticated: onboarding steps 1-3 + finish; all 10 app routes + settings load with **zero console errors** and correct page titles.

### 3. Prototype functional flows (final run: **34/34 steps passed**)
Highlights (full list in the run output, archived in `ux/audit/screens/prototype-flows/flows.json`):
- Today: habit toggle updates the ring 25% -> 50% and the API log status becomes `completed`; task complete toggle works.
- Quick Add chooser lists all 6 create actions; task form: empty submit shows "Title is required." with the button still enabled (fixes UX-016); created a task with a new tag and due-today.
- Tasks: search, complete -> Finished group, filter chips persist in the URL and survive reload, delete requires confirmation.
- Habits: created with a reminder time; clicking today's cell produced a `completed` log (API-verified); right-click menu skip works; History view renders heat strips; the Today page then showed the Morning tab (UX-009 fix); deleted with confirmation.
- Notes: created -> editor -> autosave ("All changes saved") -> markdown preview renders; folder created; note moved via the folder select; note deleted; folder deleted; archive shows an explicit "can't restore" warning and the note disappears from all lists (UX-032 handled honestly).
- Health: logged 71.9 kg -> detail chart + stats rendered -> entry deleted.
- Workouts: logged a session with a brand-new exercise ("QA-Deadlift") created in-form; the session card shows the exercise name with its sets (UX-004 fix); deleted.
- Learning: logged a 25-minute session attached to the course; it appears in the Sessions tab; expanding the course and toggling "Caching" moved progress 50% -> 100%; library item added and removed.
- Goals: created a manual goal, edited its progress to 40% via the slider (UX-019 fix), deleted it.
- Calendar: selected 5 Nov -> side panel listed that day's tasks including the overdue passport task; week view works (UX-017 fix).
- Insights: week/month toggle; charts render.
- Command bar: Ctrl+K opens; searching "passport" finds the task; Enter navigates to `/app/tasks?search=...`; Esc closes and restores focus.
- Settings: sessions listed with parsed device names ("Chrome on Windows", "Script"); dark theme saved to the server and **survived a full reload** (UX-011 fix, server `theme_preference=dark` confirmed via API); header toggle also persists; wrong current password -> inline "Current password is incorrect"; export downloaded `life-export-2026-11-08.json`.
- Session behaviour (UX-001 fix): with the access cookie removed, in-app navigation silently refreshed and kept working (no redirect); with all cookies cleared, the next navigation landed on `/login`.
- Expected-and-benign 401s: the guest boot probe (`/users/me` + `/auth/refresh`) on public pages, the wrong-password test, and the deliberately expired-cookie test.

### 4. Prototype viewport captures
- All 12 authenticated routes at 320 / 414 / 820 / 1366 / 1800 px + guest routes (`/login`, `/register`, 404): **zero horizontal overflow, zero console errors, zero failed requests** after fixes (first capture found three 320 px overflows - workouts 336>320, goals 356>320, calendar 335>320 - all fixed: `minmax(min(320px,100%),1fr)` grids and a flexible calendar nav label).
- Viewed by me: Today at 320/414, Notes at 320/820, Habits at 320, Workouts/Goals/Calendar/Insights/Health/Learning/Tasks at 1366, login at 1366, dark Today/Habits/Insights/Notes, mobile More sheet, mobile task sheet, mobile Today.
- Not viewed: the remaining viewport/route combinations (overflow numbers + console checks only), 1800 px detail.

### 5. Prototype state checks
- Dark mode: coherent across shell, cards, charts, sheets (captured).
- Mobile: tab bar with centre Quick Add FAB (6 actions), More sheet with all destinations + logout, task modal renders as a bottom sheet, notes editor with back button, Escape closes overlays.
- Double-mount probe: one `#page-title`, one segmented control, one Morning button on a plain load. (One transient duplicate was observed once during a refresh-race in the flow run; not reproducible on plain loads - noted as a watch item.)

## Defects found in the prototype during validation and fixed
1. `settings.js` syntax error (missing parenthesis) -> page failed to load; fixed; page-load errors now log to the console.
2. Native `append`/`replaceChildren` rendered `null` as the text "null" on Tasks; fixed centrally in `dom.js`.
3. Charts used a fixed viewBox (unreadable text on phones); now redraw at container width; sparkline min/max normalised; bar ticks whole numbers; last x-label no longer clipped.
4. Sidebar "Collapse" button had browser-default styling; route titles showed a focus ring; fixed.
5. Notes editor folder select went stale after creating a folder; fixed.
6. Calendar showed "0/5 habits" noise on future days and a habit chip on future days; fixed.
7. Three 320 px overflows (workouts/goals/calendar); fixed (see 4).
8. Character encoding corruption (`–`, `×`) introduced by a scripted edit; repaired.

## Known limitations of the prototype (by design, documented)
- No mermaid diagram rendering (shows the source with a note); needs a ~1 MB library, and the prototype is dependency-free.
- No avatar upload (backend needs S3 configuration unavailable here); no password reset (no backend endpoint exists).
- "Completed today" on Tasks is derived from the latest 100 completed tasks (the API has no `completed_at` filter/sort); labelled in the UI when capped.
- Single keyboard shortcut: Ctrl/Cmd+K. No `/` or single-letter shortcuts.
- The prototype is a client of the live API: with the API stopped it shows the connection-error state.

## Not verified / residue
- Notification mark-read click, session revoke click, logout-all execution, account deletion, password-change success path, drag-and-drop with a real mouse drag, screen readers, contrast ratios: wired but not executed (destructive or environment-limited).
- Test-data residue on `life_test`: archived note "QA-note one" (unremovable - UX-032), extra learning sessions, and the capture user's theme left on `dark`.
