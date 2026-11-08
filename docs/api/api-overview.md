# API Overview

Last reviewed: 2026-10-10

Inventory built from `@router.*` decorators in `backend/app/api/v1/routes/*.py` and `app/api/liveness.py`, mounted by `app/api/router.py` under `/api/v1`. OpenAPI (`/docs`) is available in development/test only.

## Conventions

- Auth: httpOnly cookies. Mutating requests (non GET/HEAD/OPTIONS) need `X-CSRF-Token` equal to the `csrf_token` cookie once a session cookie exists (exempt: login, register, logout).
- "Auth" column: `Y` = requires access cookie (`CurrentUser`).
- Errors: see [error-responses.md](error-responses.md).
- Pagination: `Page[T]` envelope for endpoints marked **Page** (`page>=1`, `page_size` 1..100, default 20; `api/deps.py`). Other lists return bare arrays. Notifications use `offset`/`limit<=200`; habits use `offset`/`limit<=500`.
- `X-Request-ID` is returned on every response.
- Response models are schema names; see `backend/app/schemas/`.

## Endpoints

### Unversioned
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | N | liveness, no DB |
| GET | `/health/db` | N | 503 `DATABASE_UNAVAILABLE` |

### Auth - [features/auth.md](../features/auth.md)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/register` | N | 201, 5/min |
| POST | `/auth/login` | N | 10/min |
| POST | `/auth/refresh` | cookie | 30/min, CSRF-protected |
| POST | `/auth/logout` | N | clears cookies |
| POST | `/auth/logout-all` | Y | 10/min |

### Users - [features/users-and-storage.md](../features/users-and-storage.md)
| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/users/me` | profile |
| POST | `/users/me/avatar` | multipart `file`, 10/min |
| POST | `/users/me/onboarding` | idempotent |
| POST | `/users/me/password` | 5/min, revokes all sessions |
| GET | `/users/me/sessions` | `is_current` flag |
| DELETE | `/users/me/sessions/{session_id}` | |

### Tasks - [tasks](../features/tasks.md)
GET (Page) / POST `/tasks`; GET/PATCH/DELETE `/tasks/{task_id}`; PATCH `/tasks/templates/{template_id}`. List filters: `status`, `list`, `due_before`, `due_on`, `due_from`, `search`, `overdue`, `priority`, `sort`, `order`.

### Habits - [habits](../features/habits.md)
GET/POST `/habits`; GET/PATCH/DELETE `/habits/{habit_id}`; PUT/DELETE `/habits/{habit_id}/log/{log_date}`; GET `/habits/{habit_id}/history?days=1..365`; GET `/habits/{habit_id}/streak`.

### Goals - [goals](../features/goals.md)
GET/POST `/goals`; GET/PATCH/DELETE `/goals/{goal_id}`; POST `/goals/{goal_id}/milestones`; PATCH/DELETE `/goals/milestones/{milestone_id}`.

### Learning - [learning](../features/learning.md)
`/learning/items` (GET, POST), `/learning/items/{item_id}` (PATCH, DELETE); `/learning/courses` (GET, POST), `/learning/courses/{course_id}` (GET detail, PATCH, DELETE); POST `/learning/courses/{course_id}/modules`; POST `/learning/modules/{module_id}/lessons`; PATCH `/learning/lessons/{lesson_id}`; `/learning/sessions` (GET Page, POST), DELETE `/learning/sessions/{session_id}`.

### Workouts - [workouts](../features/workouts.md) (no prefix)
GET/POST `/exercises`; GET/POST `/workouts`; PATCH/DELETE `/workouts/{workout_id}`; GET (Page)/POST `/workout-sessions`; GET/DELETE `/workout-sessions/{session_id}`.

### Health metrics - [health-metrics](../features/health-metrics.md)
GET (Page; `metric_type`, `on_date`) / POST `/health/metrics`; DELETE `/health/metrics/{metric_id}`.

### Notes - [notes](../features/notes.md)
GET (Page)/POST `/notes`; GET/PATCH/DELETE `/notes/{note_id}`; GET/POST `/note-directories`; PATCH/DELETE `/note-directories/{directory_id}`; POST `/note-directories/{directory_id}/notes` (move); GET/POST `/tags`.

### Others
| Method | Path | Feature |
|---|---|---|
| GET | `/search?q=` (1..200 chars) | [search](../features/search.md) |
| GET | `/dashboard/summary` | [analytics-dashboard-calendar](../features/analytics-dashboard-calendar.md) |
| GET | `/analytics/summary?period=week|month` | same |
| GET | `/calendar?start&end` (max 62 days, silently clamped) | same |
| GET | `/notifications` (`unread_only`, `offset`, `limit`) | [notifications](../features/notifications.md) |
| POST | `/notifications/{notification_id}/read`, `/notifications/read-all` | same |
| GET | `/privacy/export` (10/min) | [privacy](../features/privacy.md) |
| DELETE | `/privacy/account` (5/min, 204) | same |

Status codes on success: 201 for creates, 204 for deletes, 200 otherwise (per decorators).
