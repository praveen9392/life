# Life - UX redesign prototype (`ux/`)

A complete, working redesign prototype of the Life app, produced by the existing-product audit-and-redesign workflow. It is a **standalone client of the real Life REST API** - not a static mock, and not a replacement for `frontend/` (which is untouched).

## Open it (no server, no backend)

**Double-click `ux/prototype/index.html`.** That's it. It is a single self-contained file (~300 KB: HTML + CSS + JS + a built-in mock API). It opens straight into the **Today** screen with realistic sample data and every page works: Tasks, Habits, Notes, Health, Workouts, Learning, Goals, Calendar, Insights, Settings, the command bar (Ctrl/Cmd+K), Quick Add, notifications, dark mode, mobile layout. Changes you make (ticking habits, adding tasks, editing notes, ...) are saved in your browser's localStorage and survive a reload. Use **account menu -> Reset demo data** to start over. Any email/password signs in on the login page.

- Works from `file://` in Chrome/Edge/Firefox; needs no internet, no Node, no database.
- If you edit anything under `src/` or `assets/`, regenerate the file with `node build-standalone.mjs` (uses the bundler already in `frontend/node_modules`).

## Run it against the real API (optional)

The same code can talk to the real Life backend instead of the built-in sample data. In that mode `dev.html` is served by `serve.mjs` (add `?demo=1` to any served URL to use sample data there too).

1. Start the API (test database, and allow the prototype's origin):

   ```powershell
   cd C:\workspace2\life\backend
   $env:DATABASE_URL = "postgresql+asyncpg://postgres:duck@localhost:5432/life_test"   # or your dev DB
   $env:RATE_LIMIT_ENABLED = "false"; $env:COOKIE_SECURE = "false"
   $env:ALLOWED_ORIGINS = "http://localhost:5180"
   .venv\Scripts\python.exe -m uvicorn app.main:app --port 8002
   ```

2. Start the prototype (no build step, no dependencies):

   ```powershell
   cd C:\workspace2\life\ux\prototype
   node serve.mjs 5180
   ```

3. Open **http://localhost:5180/login?api=http://localhost:8002** - the `?api=` parameter is remembered (localStorage); after that plain `http://localhost:5180` works. Register a new account or use an existing one on that database.

If the API is stopped, pages show a "Can't reach the Life API" state with a retry button **and an API-address field**, so you can point the prototype at any running API without touching code.

## Why demo mode exists

A `file://` page cannot hold the real API's login session (browsers refuse to send its `SameSite=Lax` cookie from a file page), and browsers also block ES-module loading from `file://`. So `index.html` is bundled into one classic script and, when opened as a file, automatically runs against `src/core/mock.js` - an in-browser mock of the whole REST API (same response shapes: pagination, filters, 409 on duplicate folders/tags, hidden archived notes, computed dashboard / insights / calendar). The same page code runs in both modes; only the transport differs.

What the demo does **not** do: talk to your real data, send real notifications, or sync across browsers/devices (state lives in this browser's localStorage).

## What is implemented

Every screen of the existing app, redesigned: login/register (with show-password), 3-step onboarding, **Today** (honest progress ring + habits + tasks), Tasks (filters in the URL, stats, recurrence, tags, confirm-delete), Habits (week board with per-day complete/skip, history heat strips, reminder times), Notes (folders, autosave editor, markdown preview, pin/archive/delete), Health (all six metric types, trend charts), Workouts (sets grouped by exercise, PRs, in-form exercise creation), Learning (courses/modules/lessons, library, session log + history), Goals (milestones + manual progress editing), Calendar (month/week + a day panel listing that day's real tasks), **Insights** (week/month KPIs, daily completion trend, per-habit rates), **Settings** (profile, theme that persists to the account, notifications, password, parsed session list, logout-everywhere, data export, delete account), plus a **command bar** (Ctrl/Cmd+K: search + actions) and a **Quick Add chooser** (task/habit/note/health/workout/goal).

Design language: "Paper & Ink, Evergreen accent" - warm paper surfaces, serif display type, one evergreen accent, per-module colour dots, 5-group navigation (Today / Plan / Routines / Capture / Review). Fully responsive (320 px phones to 1800 px), dark mode included, `prefers-reduced-motion` respected.

Fixes for every audit finding are listed in `docs/redesign_strategy.md` section 6; feature-by-feature preservation proof is in `docs/functionality_mapping.md`.

## Deliberate limitations

- Mermaid diagrams show as source (the ~1 MB `mermaid` library is not bundled; the prototype has zero dependencies).
- Avatar upload is not included (needs S3 configuration); password reset doesn't exist in the backend either.
- "Completed today" on Tasks is computed from the latest 100 completed tasks (the API has no `completed_at` filter); the UI says so when capped.
- Keyboard shortcut: Ctrl/Cmd+K only.

## Layout of `ux/`

```
ux/
  README.md            <- this file
  PROGRESS.md          <- work log / hand-off (read when resuming)
  docs/                <- audit + strategy deliverables
    existing_system_analysis.md  screen_audit.md  ux_audit_report.md
    redesign_strategy.md  functionality_mapping.md  validation_report.md
  audit/screens/       <- evidence (existing app + prototype, screenshots + reports)
  prototype/           <- the redesign
                          index.html            double-click build (self-contained, demo mode)
                          dev.html + serve.mjs  module entry for the optional served/real-API mode
                          build-standalone.mjs  regenerates index.html
                          assets/styles, src/   source (src/core/mock.js = in-browser mock API)
```

The prototype talks to the same API contract as `frontend/` (cookie auth + CSRF header, `{error:{...}}` envelope). Porting the design into the React app means porting tokens, patterns and copy - the API layer is identical.
