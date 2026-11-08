# Goals and Milestones

Last reviewed: 2026-10-10

## Overview
Goals with status, category, target date, and progress either `manual` (user-set percent) or `milestones` (derived).

## Workflow
Create/update/delete milestone -> `GoalService` reloads the goal -> `_sync_progress_and_status`: in `milestones` mode (and with milestones present) `progress_percent = milestone_progress(completed, total)`; `>=100` sets `COMPLETED`; `>0` and `NOT_STARTED` sets `IN_PROGRESS`. In milestones mode manual `progress_percent` edits are dropped.

## Components
`routes/goals.py`, `services/goal_service.py`, `services/progress_rules.py`, `repositories/goal_repository.py`, `schemas/goal.py`.

## API contract
`GET/POST /goals`, `GET/PATCH/DELETE /goals/{goal_id}`, `POST /goals/{goal_id}/milestones`, `PATCH|DELETE /goals/milestones/{milestone_id}`. Title 1-200, description <=5000, `progress_percent` 0..100.

## Data model
`goals` (CHECK 0..100), `goal_milestones` (no `user_id`; ownership via goal; CASCADE).

## Failure scenarios
Foreign goal/milestone -> 404 (handled). Out-of-range percent -> 422. Status never auto-reverts (e.g. un-completing a milestone after COMPLETED leaves status COMPLETED - inferred from code: only upward transitions exist).

## Edge cases
Milestones mode with zero milestones keeps stored percent. Deleting the last milestone does not reset progress (inferred).

## Security
Milestone lookups join through the parent goal's `user_id`.

## Logging
None.

## Testing
`backend/tests/api/test_goals.py` (3 tests per audit; isolation covered, failure paths thin).

## Known limitations
Analytics only counts `not_started`/`in_progress` goals as active.
