# Agent/Developer Notes for the Life Project

Learned project information that isn't obvious from the code alone. Keep this
updated as new build/test/environment quirks are discovered.

## Local environment quirk: use native PostgreSQL, not Docker, on this machine

This development machine already has **two native Windows PostgreSQL services**
installed (`postgresql-x64-16` and `postgresql-x64-17`), with `postgresql-x64-17`
bound to `localhost:5432`. When the `docker-compose.yml` `postgres` service was
also mapped to host port 5432, connections to `localhost:5432` from the host
were inconsistently routed (sometimes hitting the native service, sometimes
the Docker container depending on address resolution), which manifested as
confusing `InvalidPasswordError`/`password authentication failed` errors that
had nothing to do with the actual configured password.

**Resolution used on this machine**: the `docker-compose.yml` `postgres`
service is stopped (`docker compose stop postgres`) and local development
instead uses the pre-existing native PostgreSQL 17 instance directly:

- Host: `localhost:5432`
- User: `postgres`
- Password: `duck`
- Databases: `life` (dev), `life_test` (test) — both created manually with the
  `pgcrypto` extension enabled.
- `backend/.env` → `DATABASE_URL=postgresql+asyncpg://postgres:duck@localhost:5432/life`
- `backend/.env` → `TEST_DATABASE_URL=postgresql+asyncpg://postgres:duck@localhost:5432/life_test`

The `docker-compose.yml` `postgres` service definition is still kept in the
repo (for CI / other machines / eventual Docker Compose parity per the
project plan), but is not what's actively used for day-to-day local dev on
this particular machine. If Docker networking is fixed/changed later (e.g. a
different host port, or running inside WSL2 directly), switch `DATABASE_URL`
back to the `life`/`life` docker-compose credentials on port 5432 (or
whatever port is mapped) and restart the `postgres` service via
`docker compose up -d postgres`.

## Backend

- Virtualenv: `backend/.venv` (Python 3.11). Activate or call directly via
  `backend\.venv\Scripts\python.exe`.
- Install deps: `pip install -r backend/requirements-dev.txt`
- Run migrations: `cd backend; .venv\Scripts\python.exe -m alembic upgrade head`
- Run the API: `cd backend; .venv\Scripts\python.exe -m uvicorn app.main:app --reload`
- Run tests: `cd backend; .venv\Scripts\python.exe -m pytest`
- Lint: `cd backend; .venv\Scripts\python.exe -m ruff check .`

## E2E / Playwright

- Playwright runs against a **real backend** on :8000 — start one with
  `RATE_LIMIT_ENABLED=false` (register/login are rate-limited and will 429
  across multi-project runs) pointed at `life_test`. Stop the regular dev
  backend first — both use :8000, and the frontend API client defaults to
  `http://localhost:8000` (override via `VITE_API_BASE_URL` in
  `frontend/.env.local`, gitignored).
- `frontend/e2e/smoke.spec.ts` covers register→onboard(skip)→dashboard→
  logout→login, wrong-password error, protected-route redirect, task
  creation via the "Add Task" modal, and health-metric logging on
  chromium + mobile.
- Mobile logout lives on the Profile page ("More" tab → Log out); the
  header button is hidden below `md:` — it overlapped other header controls
  on narrow viewports.

## Phase 8-11 learnings

- `async` + server-managed `onupdate` timestamps expire on flush — any
  update path returning an ORM object must `await session.refresh(entity)`
  first (MissingGreenlet otherwise). Same for relationships: eager-load
  (`selectinload`) before Pydantic serialization.
- Computed fields (e.g. course `progress_percent`) are NOT ORM columns —
  build responses explicitly or pass the derived value; `model_validate`
  on the bare model raises "field required".
- `HealthMetric` uses `DECIMAL` → export serialization must convert
  `Decimal` → `float`.

## Gotcha: don't name a SQLAlchemy column `list`

`app/models/task.py`'s `Task` model needs a column literally named `list`
(Today/Upcoming/Later) per the schema design. Naming the **Python attribute**
`list` shadows the builtin `list` for the rest of that class body (since
class-body annotations are evaluated eagerly without
`from __future__ import annotations`), which broke a later
`Mapped[list["Tag"]]` relationship annotation in the same class. Fixed by
naming the Python attribute `task_list` while keeping the actual DB column
name `list` via `mapped_column("list", ...)`. Watch for this pattern with any
other field name that collides with a builtin (`id` is safe because it's
never used as a bare generic subscript elsewhere).

## Notes directories (folders) feature

- `note_directories` (flat, per-user unique name) + nullable `notes.directory_id` FK with
  ondelete="SET NULL". Migration head: c4a8d2e61b90 (chain: 9f4a2c1e7b3d -> c4a8d2e61b90).
- Deleting a folder soft-deletes its contained notes (deleted_at=now(), directory_id=NULL)
  in one UPDATE, then hard-deletes the folder row - notes are never hard-deleted by this path.
- life_test can lag behind the dev DB (it was 2 revisions behind once). Run
  `alembic upgrade head` against BOTH databases (second run with
  `DATABASE_URL='postgresql+asyncpg://postgres:duck@localhost:5432/life_test'`)
  or pytest fails with `relation "note_directories" does not exist`.
- Frontend DnD is native HTML5 (no library). Gotcha: framer-motion's motion.button
  consumes onDragStart/onDrag* for its own gesture system - native HTML5 drag
  handlers must live on a plain wrapper element (the <li>), not the motion component.
- Background subagents get exec auto-denied in this setup - have the parent session
  run migrations/tests, or use foreground agents for command-heavy work.

- Notes render markdown through `features/notes/MarkdownView.tsx` (shared by the
  Preview pane and the reading modal): GFM via react-markdown + fenced
  ```mermaid blocks via `MermaidDiagram.tsx`. Mermaid v12 is lazy-loaded
  (`import("mermaid")` on first diagram) so it never enters the main bundle;
  it initializes with `securityLevel: "strict"` (sanitizes the generated SVG)
  and re-renders on app theme change by observing `<html data-theme>`.
