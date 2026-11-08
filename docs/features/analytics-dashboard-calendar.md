# Analytics, Dashboard and Calendar

Last reviewed: 2026-10-10

## Overview
Read-only aggregations over tasks, habits, goals, workouts, learning. All percentages come from `services/progress_rules.py`.

## Workflow
Routes pass `current_user.timezone` to services. `today_for_user` anchors "today". Analytics `period` = `week|month`; the range end is capped at today (future days are not counted as expected). Habit rate: completed / (expected - neutral) where skipped/not_applicable are neutral; logs on non-due days are capped (`min(completed, expected)`). Goals: average progress over `not_started`/`in_progress` goals.

## Components
`routes/analytics.py` (also hosts `/calendar`), `routes/dashboard.py`; `services/analytics_service.py`, `dashboard_service.py`, `calendar_service.py`, `progress_rules.py`; `utils/datetime.py`, `streaks.py`, `recurrence.py`; `schemas/analytics.py`, `dashboard.py`.

## API contract
`GET /dashboard/summary`; `GET /analytics/summary?period=week|month` (other value -> 422); `GET /calendar?start=&end=` (both required dates; if `end` exceeds `start + 62 days` it is silently clamped, BE-039 mitigated by clamp, not by error).

## Data model
No own tables.

## Failure scenarios
Invalid period / missing dates -> 422 handled. Heavy users: analytics loops habit x day in Python (`analytics_service.py`); performance unmeasured.

## Edge cases
`end < start` behavior not verified. Invalid user timezone falls back to UTC. Week bounds via `week_bounds_for_user`.

## Security
Owner-scoped; soft-deleted tasks excluded in calendar queries.

## Logging
None.

## Testing
`backend/tests/api/test_analytics_calendar.py`, `test_dashboard.py`, `backend/tests/unit/test_streaks.py`, `test_recurrence.py`.

## Known limitations
Raw SQL/ORM queries live in services rather than repositories and are partly duplicated between dashboard and analytics (audit BE-016; not re-verified).
