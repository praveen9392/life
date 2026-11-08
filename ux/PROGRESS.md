# UX redesign - progress and hand-off

**Read this first when resuming.** Last updated: 2026-11-08 (end of day). Everything here is what was actually done or observed; unverified items are labelled.

## 1. Goal (user request, in short)

Use the `existing-product-audit-and-redesign` skill (`C:\Users\Praveen\.codeium\windsurf\skills\existing-product-audit-and-redesign\SKILL.md`; it is not registered as a callable skill, read the file directly) on the Life app:
understand the whole system first, audit every screen, then redesign everything and put the **complete system prototype in `ux/`**. Preserve all functionality, business logic and API contracts. Do not touch the production `frontend/` (the user has uncommitted edits there).

**Status: all phases complete.** Understand -> audit -> strategy -> implement -> validate are done; the deliverables live in `ux/docs/` and the prototype in `ux/prototype/`.

## 2. Status at a glance

| Phase | State |
|---|---|
| 1-3 Discovery, isolated stack, exploration (5 viewports + interaction pass) | Done |
| 4 Audit docs (`existing_system_analysis`, `screen_audit`, `ux_audit_report`) | Done (UX-001..UX-032) |
| 5 `redesign_strategy.md` + `functionality_mapping.md` | Done (mapping statuses updated from validation) |
| 6 Prototype implementation (all screens) | Done, runs against the live API |
| 7a Functional validation | Done - final run **34/34 steps passed** |
| 7b Viewport / dark / mobile validation of the prototype | Done - 0 overflow / 0 console errors after fixes |
| 7c `validation_report.md`, `ux/README.md`, cleanup | Done |
| 7d Direct-open access (`standalone.html` for file://) | Done - renders fully; cookie limitation explained in-app |

## 3. What is in `ux/`

```
ux/
  PROGRESS.md                  <- this file
  README.md                    <- how to run the prototype
  docs/
    existing_system_analysis.md  screen_audit.md  ux_audit_report.md
    redesign_strategy.md  functionality_mapping.md  validation_report.md
  audit/screens/
    current/          existing app: 12 routes x 5 viewports + report.json + api-*.json
    interactions/     existing app interaction pass + results.json
    prototype/        prototype smoke screenshots
    prototype-flows/  functional-run screenshots + flows.json (34/34)
    prototype-viewports/  prototype: 12 routes x 5 viewports + report.json + api-*.json
    prototype-guest/      prototype: login/register/404 x 5 viewports
    prototype-states/     prototype: dark mode + mobile states
  prototype/                   <- the redesign, standalone, no build step
    index.html, serve.mjs
    assets/styles/ tokens.css base.css components.css layout.css
    src/main.js shell.js forms.js prefs.js
    src/core/ api.js dom.js router.js session.js ui.js charts.js markdown.js format.js icons.js
    src/pages/ auth today onboarding tasks habits notes health workouts learning goals calendar insights settings notfound
```

Design: "Paper & Ink, Evergreen accent": warm paper background, ink text, evergreen accent, serif display type, per-module colour dots, 5 nav groups (Today / Plan / Routines / Capture / Review), command bar (Ctrl/Cmd+K), Quick Add chooser, mobile bottom bar with centre FAB.

The prototype is a **live client of the real REST API** (cookies + `X-CSRF-Token`), not a static mock. There is no mock/offline mode; with the API down it shows a connection-error state.

## 4. How to run / resume (environment)

```powershell
# backend (test DB life_test is at migration head c4a8d2e61b90)
cd C:\workspace2\life\backend
$env:DATABASE_URL="postgresql+asyncpg://postgres:duck@localhost:5432/life_test"
$env:RATE_LIMIT_ENABLED="false"; $env:COOKIE_SECURE="false"; $env:ALLOWED_ORIGINS="http://localhost:5180"
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8002

# prototype
cd C:\workspace2\life\ux\prototype
node serve.mjs 5180        # open http://localhost:5180/login?api=http://localhost:8002
```

- The API base is chosen with `?api=<url>` once (stored in `localStorage` key `life.proto.api`), default `http://localhost:8000`.
- Test users on `life_test` (all throwaway): `ux.audit@example.com`, `ux.flows.*@example.com`, `ux.cap.*@example.com` (passwords in the deleted `.audit` scripts; pattern `AuditPassw0rd!x`).
- **Do not touch** ports 5174 / 8001 or the `node e2e/realism-*.mjs` / `a-repro.mjs` processes: they belong to another project (`C:\workspace2\fit`). Never kill browsers by `ms-playwright` path; check the parent process first.
- The throwaway driver scripts (`frontend/.audit/`) were deleted at the end of validation. They are small and can be recreated from the descriptions in `docs/validation_report.md` if re-validation is ever needed.

## 5. Findings (full detail in `docs/ux_audit_report.md`)

Existing app: 1 Critical, 5 High, 15 Medium, 9 Low. Headlines:
- **UX-001 (Critical):** no `/auth/refresh` call anywhere in the frontend; the 15-minute access cookie expires and the user is bounced to `/login`. Verified (source, backend log, manual refresh = 200). **Fixed in the prototype** (single-flight refresh + retry; verified by removing the access cookie mid-session).
- UX-002 Notes overflow at 320/414/820; UX-004 workout sets don't name the exercise; UX-006/007 invented "Energy" and "Streak Shields" metrics; UX-012 today's habit column clipped; UX-008 "Completed Today" counts by due date not `completed_at`; UX-009 Morning/Evening tabs can never be populated; UX-011 header theme toggle is overridden by the server preference on reload.
- **UX-031 (Medium):** analytics per-habit rates count skipped days while the overall percentage excludes them - the two definitions disagree on one screen (backend behaviour).
- **UX-032 (High):** archiving a note is irreversible - archived notes are excluded from list/get/update/delete, so they can't even be deleted (backend behaviour). The prototype warns explicitly before archiving.

## 6. Prototype defects found by testing and fixed (all verified after the fix)

1. `settings.js` syntax error -> page failed to load; fixed; page-load errors now log to the console.
2. Native `append`/`replaceChildren` rendered `null` as text; fixed centrally in `dom.js`.
3. Charts used a fixed viewBox (unreadable text on phones); now redraw at container width; sparkline min/max normalised; bar ticks whole numbers; last x-label no longer clipped.
4. Sidebar "Collapse" default button styling; route-title focus ring; fixed.
5. Notes editor folder select stale after folder creation; fixed.
6. Calendar "0/5 habits" noise + habit chip on future days; fixed.
7. Three 320 px overflows (workouts 336, goals 356, calendar 335); fixed via `minmax(min(Npx,100%),1fr)` and a flexible calendar nav label. Re-captured: 0 overflow everywhere.
8. Character encoding corruption (`–`, `×`) from a PowerShell regex edit; repaired. **Use editor tools, not PowerShell regex rewrites, for file edits.**

## 7. Validation evidence (summary; full detail in `docs/validation_report.md`)

- Existing app: 12 routes x 5 viewports captured; 45-step interaction pass; dark-mode captures; findings as above.
- Prototype smoke: guest flows (validation, wrong password, redirect, 404) + onboarding + all routes with zero console errors.
- Prototype functional flows: **34/34 passed** against the live API - Today toggles (ring + API round-trip), Quick Add chooser, task create/search/complete/filter-URL/delete-confirm, habit create-with-reminder + cell complete (API-verified) + skip menu + history + Morning tab + delete, notes create/autosave/preview/folder/move/delete/archive-warning, health log/chart/delete, workout with in-form exercise creation + named sets + delete, learning session-with-course + lesson toggle 50->100% + library, goal create/edit-progress-40%/delete, calendar day panel with real tasks + week view, insights month, command bar (Ctrl+K/search/Enter/Esc), settings (parsed sessions, theme persists to server + survives reload, header toggle persists, wrong-password inline error, export downloads JSON), UX-001 silent refresh verified, cleared session -> `/login`.
- Prototype viewports: 12 authed routes + 3 guest routes x 5 viewports - 0 overflow, 0 console errors, 0 failed requests.
- Prototype states: dark mode coherent (shell/cards/charts/sheets), mobile tab bar + FAB + More sheet + bottom-sheet modals + notes back button, Escape closes overlays; double-mount probe clean on plain loads (one transient duplicate observed once during a refresh race - watch item, not reproducible).
- Not verified (wired but not executed, destructive or environment-limited): notification mark-read click, session revoke, logout-all execution, account deletion, password-change success, real mouse drag-and-drop, screen readers, contrast ratios.

## 8. Remaining work / ideas (nothing blocking)

- Optional: port the design system into the React `frontend/` (tokens + patterns + copy; the API layer is identical). The user has uncommitted edits there - coordinate first.
- Optional backend follow-ups from the audit: UX-031 (one completion definition), UX-032 (archived-notes view or hard-delete on archive), a `completed_at` filter/sort on `/tasks`, password-reset endpoint.
- If re-validating: recreate the driver scripts (see `docs/validation_report.md` for exactly what they did), run ONE instance at a time, and never `import()` a script to "syntax check" it (that executes it).

## 8b. DEMO MODE (final answer to "I must be able to click index.html with no server/backend") - 2026-11-08 night

Superseded the "cookie limitation banner" approach below: the user wants the full product visible by double-clicking `index.html`.
- `src/core/mock.js` (new, ~600 lines): in-browser mock of every endpoint `api.js` calls, seeded with realistic data relative to today, persisted in `localStorage` key `life.proto.demo.v3`, `resetDemo()` clears it. `api.js` routes every request to it when `DEMO_MODE` (always on for `file:`; `?demo=1` / `?demo=0` toggle it on http; `?api=` switches back to the real API).
- `src/core/errors.js` (new): `ApiError` moved here so `mock.js` and `api.js` don't import each other circularly.
- `index.html` is now the **built single file** (`node build-standalone.mjs`, ~300 KB; no imports, no external refs). The module entry moved to **`dev.html`**, served by `serve.mjs` (`/` and deep links serve `dev.html`).
- UI: "Demo data" chip in the top bar, "Reset demo data" in the account menu, login page shows a demo-mode hint (any credentials work). The old amber cookie banner and `standalone.html` are gone.
- Verified (Playwright on `file:///.../index.html`, no server): 29/29 steps, **zero HTTP requests**, zero console/page errors; all 11 pages render with data; toggles/creates/edits persist across reload; logout/login/deep-link guard; dark mode persists; mobile tab bar + More sheet, no overflow. Served mode re-checked: `/`, deep links and `?demo=1` work.
- Gotcha: `serve.mjs` loads its code at start; after editing it, restart it (a killed shell can take a few seconds to release port 5180).

## 8a. (superseded by 8b) Direct-open (file://) support - added 2026-11-08 evening

The user opened `index.html` directly and got a blank page. Root causes and fixes:
1. Absolute asset paths (`/assets/...`) break on file:// -> `index.html` now uses relative paths.
2. Browsers block ES-module scripts from file:// (CORS) -> `build-standalone.mjs` (uses the rolldown from `frontend/node_modules`) produces **`standalone.html`**: all CSS + JS inlined, ~250 KB.
3. The history router matched `location.pathname` (the file path) -> the router now falls back to **hash routing** (`#/app/tasks`) when `location.protocol === "file:"` (exported `FILE_MODE`).
4. Computed dynamic imports (`import(\`./pages/${file}.js\`)`) can't be inlined by the bundler -> replaced with a static `PAGES` map in `main.js`.
5. A real bug found during this: the session-lost handler checked `location.pathname` (never `/login` on file://) -> **infinite 401 loop** (verified in the backend log). Fixed to use the router's `currentPath()`.
6. Verified by experiment: after a successful login (200) from file://, Chrome does NOT attach the `SameSite=Lax` auth cookie to subsequent requests (cross-site context) - the session cannot hold from a file:// page, by browser design. The login page now shows an amber banner explaining this and pointing to `node serve.mjs`.
7. `errorState` gained an **API-address field** (set `life.proto.api` + reload) - useful on file:// and anywhere else.

Verified: served prototype re-smoked after the router changes (login + 4 routes, no page errors); standalone on file:// renders the full UI, the API field works, the banner shows.

## 9. Gotchas learned (save time)

- Access token lives 15 minutes; long browser runs need fresh logins per context (`ctx.request.post(.../auth/login)` with an `Origin` header) - or the prototype's own silent refresh handles it.
- `getByLabel("Password")` matches the input AND the show-password button; use `{ exact: true }`. Scope ambiguous labels (`Name`, `Goal`) to `getByRole("dialog")`.
- On phones the sidebar is `display:none`; navigate via the tab bar / More sheet in tests.
- The first guest page load produces expected 401s (`/users/me`, then `/auth/refresh`); not defects.
- Full-page screenshots place fixed/sticky elements mid-page; capture artifact.
- `node --check` can pass a file the browser rejects; import it with `node --input-type=module` instead.
- Playwright's `?api=` query param must be stripped from screenshot slugs (Windows filenames) - fixed in the capture script.
- Tasks API: default order due-date asc; `sort` supports `due_date|created_at|priority` only. Notes API: `directory_id: null` unfiles, omitting it leaves the folder untouched.
- Do not use background subagents for command-heavy work in this setup (exec is auto-denied for them); run commands from the main session.
