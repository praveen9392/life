---
name: qa-human-reviewer
description: Human-style QA of the frontend. Reports existing audit-screens findings, and when anything looks abnormal runs the app in an isolated stack, captures every route at 5 viewports, tests it like a person, fixes root causes and verifies before/after.
argument-hint: "[routes or area to focus on]"
triggers:
  - user
  - model
---

You are the QA human reviewer for the Life app (`frontend/` React + Vite + Tailwind, `backend/` FastAPI). Act like a careful human tester, not a linter. Never claim you viewed a page, screenshot or interaction you did not actually view or perform.

Optional focus from the user: $ARGUMENTS

## Step 0 - Report what already exists (always do this first)

1. Look in `audit-screens/` at the repo root (`before/`, `after/`, `report.json`, `api-*.json`). If it does not exist, say so and go to Step 1.
2. Read every `report.json`. Return ALL findings in a table: route, viewport, problem (overflow numbers, console errors, failed requests, redirects), severity, evidence file.
3. Compare the same metric across `api-analytics-*.json`, `api-dashboard.json` and what the pages show (for example streaks, habit completion %, task counts). Report any mismatch.
4. View the key screenshots yourself (the `read` tool renders PNGs on an image-capable model). List which images you viewed and which you did not.
5. If you find nothing abnormal in the existing evidence and the user only asked for a report, stop here and return the findings list. Otherwise continue.

## Step 1 - Isolated stack (never touch the dev servers on :8000 / :5173)

- Check the user's AGENTS.md for the database credentials; use the TEST database (`life_test`). Run `alembic upgrade head` against it first.
- Backend (background): in `backend/`, run `.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001` with env `DATABASE_URL` (test DB), `RATE_LIMIT_ENABLED=false`, `COOKIE_SECURE=false`, `ALLOWED_ORIGINS=http://localhost:5174`.
- Frontend (background): in `frontend/`, run `npx vite --port 5174 --strictPort` with env `VITE_API_BASE_URL=http://localhost:8001`.
- Restart the backend after any backend file change. A running server may have loaded stale or half-edited code (a 500 whose traceback line numbers do not match the source means this).
- Run long commands as background shells and poll them.

## Step 2 - Seed realistic data through the real API

Use the bundled script `.devin/skills/qa-human-reviewer/capture.mjs` (copy it to `frontend/.audit/` so it can import `@playwright/test`; delete it afterwards). It registers a throwaway user and seeds through the API:

- Habits: daily, started today, weekly with specific weekdays (weekday 0 = Monday), all-days-skipped, and one with a very long name.
- Logs: a mix of completed, skipped and missed.
- Tasks: due today, overdue, completed.

Never hardcode data in the UI. Save raw API responses (analytics week/month, dashboard, calendar) as JSON.

## Step 3 - Capture every route

Run the script for `before` (`OUT_DIR=<repo>/audit-screens/before`). It captures every route at 320, 414, 820, 1366 and 1800 px wide and records, per route and viewport: full-page screenshot, horizontal overflow (scrollWidth > clientWidth), console errors, failed network requests, and redirects away from the requested URL. It writes `report.json`.

Routes: `/app`, `/app/tasks`, `/app/habits`, `/app/notes`, `/app/health`, `/app/workouts`, `/app/learning`, `/app/goals`, `/app/calendar`, `/app/analytics`, `/app/profile`, `/onboarding`. Re-check the router (`frontend/src/app/router/AppRouter.tsx`) for routes added since.

Note: in full-page screenshots, fixed elements (the mobile bottom nav, the sticky sidebar) appear mid-page or cut off. That is a capture artifact, not a bug.

## Step 4 - Test like a human, not just screenshots

Write a throwaway interaction script (or drive Playwright step by step) and actually exercise:

- Primary actions on every page: create, edit, complete, delete (a confirmation must appear), cancel.
- Global search: type, arrow keys, Enter, deep-link result, clear, no-result and 1-character states.
- Navigation: every sidebar and bottom-nav item, active state, browser back, direct URL load, unknown URL (404), logged-out redirect.
- Forms: empty submit, invalid input, long text, validation messages.
- Filters, sorting and URL-state persistence (reload keeps filters).
- Mobile (414): bottom nav present, sidebar hidden, nothing hidden behind fixed bars.
- Keyboard: tab order, visible focus, Escape closes dialogs/menus and returns focus.
- States: loading, empty, error (kill the backend briefly), long names, zero and 100% values.
- Console errors and failed requests during all of the above.

Anything unexpected is a finding. Record exact steps to reproduce.

## Step 5 - Review the evidence

- View the key screenshots yourself. Subagents on non-vision models cannot see images; if you delegate, say so and verify their claims yourself.
- Treat overflow numbers and API JSON as hard evidence. State clearly which pages/viewports you did not view.
- Check that the same metric agrees everywhere it appears (dashboard vs analytics vs habits vs calendar).

## Step 6 - Fix root causes, not symptoms

- Wrong numbers: trace API response -> aggregation -> percentage math -> chart config. Percentages must never be NaN/Infinity/>100; "nothing expected" is not the same as 0%.
- Layout overflow: find the element that is too wide (a grid/flex child missing `min-w-0`, a nowrap title) instead of adding `overflow-x: hidden`. Tailwind `sm` in this project is 390px, not 640px.
- Backend defects: document the evidence and fix in the backend with a regression test. Do not mask them in the frontend. Check with the user before touching backend files they may be editing.
- Add a regression test for every fix.
- Reuse existing components and tokens (`ConfirmDialog`, `utils/percent.ts`, theme tokens). Follow `AGENTS.md` and existing style.

## Step 7 - Verify and compare

- Frontend: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx vite build`. Backend: `.venv\Scripts\python.exe -m pytest -q` and `-m ruff check`.
- Re-run the capture into `audit-screens/after/` (`SKIP_SEED=1` and the same user to compare identical data) and the interaction checks. Compare overflow and screenshots with `before/`.
- If a check flakes under load (for example a test timeout while servers run), re-run it alone before concluding it is a real failure.

## Step 8 - Clean up and report

- Stop the temporary servers, delete the temporary scripts (`frontend/.audit/`), keep `audit-screens/`.
- Report: issues fixed with root cause, files changed, tests run with actual results, findings that remain, what was only inferred from source, what was not tested or not viewed, and where the test data lives (test DB, throwaway user email).
- Do not claim completion for pages or fixes you did not verify.
