# Testing

## Frontend unit/component tests (Vitest)

```
cd frontend && npm run test        # run once
npx vitest                         # watch mode
```

- jsdom environment; `src/test/setup.ts` wires `@testing-library/jest-dom`
  and a `matchMedia` stub (needed by the theme system and framer-motion).
- Covers shared state machinery (`QueryStateBoundary` loading/error/empty/
  retry behavior, `EmptyState`, the theme store) and the login form
  (validation, submit, API-error surfacing).
- E2E browser tests live separately under `e2e/` (below).

## Backend (pytest)

```
cd backend && pytest            # full suite
pytest -k tasks                 # focused
pytest --cov                    # coverage (if pytest-cov installed)
```

- Uses `life_test` via `TEST_DATABASE_URL` — never the dev database.
- Transaction-rollback per test via the `db_session` fixture; `api_client`
  is an httpx `AsyncClient` over the ASGI app; `csrf_headers(client)` adds
  the required `X-CSRF-Token`.
- Two-user isolation is mandatory: every owned module has a test where user
  B cannot read/mutate user A's resources (404, not 403).

## E2E (Playwright)

`frontend/e2e/` runs against a **real backend + real DB**:

```bash
# 1. Point a backend at the test DB with rate limiting off
cd backend
$env:DATABASE_URL="postgresql+asyncpg://postgres:duck@localhost:5432/life_test"
$env:RATE_LIMIT_ENABLED="false"           # register/login would otherwise 429
uvicorn app.main:app --port 8001

# 2. Run the suite (starts the Vite dev server itself)
cd frontend
npm run test:e2e                          # chromium + mobile projects
npx playwright test --project=chromium    # one project
npx playwright test -g "tasks"            # focused
```

- Each test registers a unique user — no shared fixture state.
- `webServer.reuseExistingServer` reuses a running dev server locally.

## What "two-user tested" means here

Every owned module has at least one test that, while authenticated as user
B, cannot see, read, update, or delete resources created by user A —
including nested children (course lessons, goal milestones, workout sets,
private exercises) reachable only through a foreign-key guess.
