# Deployment

## Render (recommended)

The repo ships a Blueprint: `render.yaml` provisions three resources —

1. `life-db` — managed PostgreSQL
2. `life-api` — FastAPI web service (`backend/`), runs `alembic upgrade head`
   then uvicorn on every deploy
3. `life-frontend` — static site (`frontend/dist`), SPA rewrite to
   `index.html`

Steps:

1. Push the repo to GitHub/GitLab.
2. In Render: **New → Blueprint** → point at this repo. Render reads
   `render.yaml` and creates all three resources.
3. Set the two env vars Render can't infer:
   - `life-api` → `ALLOWED_ORIGINS` = your static site's real URL
     (e.g. `https://life-frontend.onrender.com`)
   - `life-frontend` → `VITE_API_BASE_URL` = your API's real URL
     (e.g. `https://life-api.onrender.com`)
4. Trigger a deploy. `JWT_SECRET_KEY` auto-generates.

Notes:

- `DATABASE_URL` arrives as `postgresql://`; `Settings` rewrites it to
  `postgresql+asyncpg://` automatically (`app/core/config.py`).
- `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true` are required because the
  frontend and API are different origins; cookies are httpOnly and CSRF is
  enforced via the double-submit cookie.
- `RATE_LIMIT_STORAGE_URI` defaults to in-memory — fine for one instance;
  swap to `redis://…` if you scale beyond one replica.
- `render.yaml`'s `healthCheckPath` is `/health` — a true unauthenticated
  liveness probe (`app/api/liveness.py`) that returns `{"status": "ok"}`
  with no DB access and no auth required. A deeper `/health/db` route is
  also available (runs a trivial `SELECT 1`) if Render's health-check
  config is ever changed to verify database connectivity instead of plain
  process liveness.

## Docker (self-host / VM)

```bash
docker compose up --build
```

- `postgres` (data volume `postgres_data`)
- `backend` — migrates then serves on :8000
- `frontend` — nginx serving the Vite build on :8080 with SPA fallback

Set `JWT_SECRET_KEY`, `ALLOWED_ORIGINS`, `VITE_API_BASE_URL` in a `.env` at
the repo root (compose reads it). For TLS-terminated deployments, put a
reverse proxy in front and set `COOKIE_SECURE=true`.

## Production checklist

- [ ] `ENVIRONMENT=production`
- [ ] strong `JWT_SECRET_KEY` (Render generates; elsewhere:
      `python -c "import secrets; print(secrets.token_urlsafe(64))"`)
- [ ] `COOKIE_SECURE=true` behind TLS
- [ ] `ALLOWED_ORIGINS` = exact frontend origin(s), comma-separated
- [ ] `RATE_LIMIT_STORAGE_URI=redis://…` for multi-instance
- [ ] S3 vars (`S3_*`) once avatar upload ships
- [ ] Postgres backups configured (see docs/BACKUP_RESTORE.md)
