# Life

A multi-user personal life-management platform. Each user manages their own
private life data — tasks, habits, notes, health metrics, workouts, learning,
goals — with a dashboard, calendar, analytics, global search, and
notifications on top.

## Stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18 + TypeScript + Vite, TanStack Query, React Router, Tailwind-style design tokens, Radix UI, Playwright E2E |
| Backend   | FastAPI (Python 3.11), SQLAlchemy async ORM, Alembic migrations, Pydantic v2 |
| Database  | PostgreSQL 16+ (`pgcrypto`) |
| Auth      | JWT access + opaque rotating refresh tokens in httpOnly cookies, double-submit CSRF |
| Storage   | S3-compatible object storage for avatars (implemented; optional, 503 if unconfigured) |

## Quickstart

Prereqs: Python 3.11+, Node 20+, PostgreSQL.

```bash
# Backend
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements-dev.txt
cp .env.example .env                             # fill in DATABASE_URL + JWT_SECRET_KEY
python -m alembic upgrade head
uvicorn app.main:app --reload --port 8000        # http://localhost:8000

# Frontend (new terminal)
cd frontend
npm ci
npm run dev                                      # http://localhost:5173
```

Or with Docker (full stack incl. Postgres):

```bash
docker compose up --build   # backend :8000, frontend :8080, postgres :5432
```

## Verification

```bash
# Backend: lint + type check + full test suite (90+ tests, incl. two-user isolation)
cd backend
ruff check .
mypy app
pytest

# Frontend: lint + unit/component tests + typecheck + build + E2E
cd frontend
npm run lint
npm run test        # Vitest component/unit tests
npm run build       # tsc --noEmit + vite build
npm run test:e2e    # Playwright (needs test backend running on :8000)
```

Liveness probes: `GET /health` (no auth, no DB) and `GET /health/db`
(runs `SELECT 1`) - Render's health check uses `/health`.

## Repository layout

```
backend/
  app/
    api/v1/routes/       # HTTP layer (thin controllers)
    services/            # business logic
    repositories/        # data access (ownership-scoped)
    models/              # SQLAlchemy models + constraints
    schemas/             # Pydantic request/response
    core/                # config, security, middleware, logging
    utils/               # recurrence, streaks, datetime, pagination
  tests/                 # pytest: unit + API + isolation tests
frontend/
  src/
    app/                 # router, providers
    components/          # ui primitives + shared states
    features/<module>/   # api.ts + hooks.ts + pages/ per feature
    e2e/                 # Playwright specs
docs/                    # architecture, deployment, backup, testing
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design decisions, security
  model, canonical progress formulas, recurrence/timezone semantics
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Render blueprint + Docker
- [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) — backup & restore
- [docs/TESTING.md](docs/TESTING.md) — test strategy and E2E setup
- [CHANGELOG.md](CHANGELOG.md) — release notes
