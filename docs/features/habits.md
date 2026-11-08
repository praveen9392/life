# Habits and Streaks

Last reviewed: 2026-10-10

## Overview
Habits with frequency config; one log per (habit, date) with a status; streak computation. No pre-generated rows.

## Workflow
`PUT /habits/{id}/log/{date}` -> `HabitService.upsert_log` -> `get_habit` (ownership 404) -> `HabitRepository.upsert_log`: `INSERT ... ON CONFLICT (habit_id, log_date) DO UPDATE SET status, note RETURNING id`, then re-select with `populate_existing`. Delete log is idempotent (204 even if absent, after ownership check). Streaks: `utils/streaks.py::calculate_streak` over logs from `habit.start_date` to today (user timezone).

## Components
`routes/habits.py`, `services/habit_service.py`, `repositories/habit_repository.py`, `utils/recurrence.py` (due-ness), `utils/streaks.py`, `schemas/habit.py`.

## API contract
`GET/POST /habits` (bare array; `offset`, `limit<=500`; only active habits), `GET/PATCH/DELETE /habits/{id}`, `PUT|DELETE /habits/{id}/log/{log_date}`, `GET /habits/{id}/history?days=30` (1..365), `GET /habits/{id}/streak`.

## Data model
`habits`, `habit_logs` (unique habit+date). Statuses (`HabitLogStatus`): skipped/not_applicable are neutral, missed breaks streaks (`utils/enums.py`).

## Failure scenarios
Foreign habit -> 404 (handled). Concurrent PUT same day -> single row via ON CONFLICT (handled; no concurrency test found). Invalid date path -> 422.

## Edge cases
"Today" for history/streak uses `today_for_user(current_user.timezone)`. Current streak counts consecutive days ending today or yesterday. Logs on non-due days are capped in analytics.

## Security
Ownership checked before upsert/delete; `user_id` set from the session.

## Logging
None beyond global handlers (the noise `logger.info("list of habits")` mentioned in the audit was not re-checked).

## Testing
`backend/tests/api/test_habits.py`, `test_habit_unlog.py`, `backend/tests/unit/test_streaks.py`, `test_recurrence.py`.

## Known limitations
Streak endpoint response model status not re-verified (`HabitStreakResponse` is declared).
