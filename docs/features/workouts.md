# Workouts

Last reviewed: 2026-10-10

## Overview
Exercise catalog (shared + user-custom), workout templates, and performed workout sessions with sets.

## Workflow
`POST /workout-sessions` validates every set's `exercise_id` is visible (shared or own) via `_validate_exercise_ids` (422 `ValidationError` otherwise), then stores the session and sets (max 500 sets).

## Components
`routes/workouts.py` (no URL prefix), `services/workout_service.py`, `repositories/workout_repository.py`, `schemas/workout.py`.

## API contract
`GET/POST /exercises`, `GET/POST /workouts`, `PATCH/DELETE /workouts/{id}`, `GET (Page)/POST /workout-sessions`, `GET/DELETE /workout-sessions/{id}`. Set: `set_number` 1..100, `reps` 1..10000, `weight` 0..10000, duration limits.

## Data model
`exercises` (`user_id` nullable, SET NULL), `workouts`, `workout_sessions` (workout FK SET NULL), `workout_sets` (reps>0, weight>=0 checks; exercise FK RESTRICT).

## Failure scenarios
Foreign workout/session -> 404; foreign exercise in a set -> 422; deleting an exercise referenced by sets is blocked by RESTRICT but no delete-exercise endpoint exists. Account deletion removes custom exercises explicitly.

## Edge cases
Exercise `search` filter uses unescaped `ILIKE %term%` (`workout_repository.py:38`): `%`/`_` act as wildcards (low impact; not fixed).

## Security
Sets have no `user_id`; ownership via session.

## Logging
None.

## Testing
`backend/tests/api/test_workouts.py`.

## Known limitations
No update endpoint for sessions or exercises.
