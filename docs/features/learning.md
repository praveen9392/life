# Learning

Last reviewed: 2026-10-10

## Overview
Learning items (books/etc.), courses with modules and lessons, and time-logged learning sessions.

## Workflow
Lesson `PATCH` sets/clears `completed_at`; `_sync_course_status` recomputes course progress = completed lessons / total lessons (never stored). 100% -> course `COMPLETED`; >0% and `NOT_STARTED` -> `IN_PROGRESS`. Responses are built explicitly because `progress_percent` is derived.

## Components
`routes/learning.py`, `services/learning_service.py`, `repositories/learning_repository.py` (eager-loaded course tree), `services/progress_rules.py`, `schemas/learning.py`.

## API contract
`/learning/items` GET/POST; `/learning/items/{id}` PATCH/DELETE; `/learning/courses` GET/POST; `/learning/courses/{id}` GET (tree)/PATCH/DELETE; `POST /learning/courses/{id}/modules`; `POST /learning/modules/{id}/lessons`; `PATCH /learning/lessons/{id}`; `/learning/sessions` GET (Page)/POST; `DELETE /learning/sessions/{id}`.

## Data model
`learning_items` (CHECK progress 0..100), `courses`, `course_modules`, `course_lessons`, `learning_sessions` (course/item FKs SET NULL; index user+date).

## Failure scenarios
Foreign ids (item, course, module, lesson, session) -> 404 handled. `target_date < start_date` -> 422 handled. Session referencing foreign course/item: check not verified.

## Edge cases
Deleting a course cascades modules/lessons; sessions keep rows with NULL course. No ordering/reorder endpoints. Lesson completion never regresses course status.

## Security
Modules/lessons have no `user_id`; ownership flows through parent course.

## Logging
None.

## Testing
`backend/tests/api/test_learning.py` (few tests; no failure-path coverage per audit).

## Known limitations
Lists for items/courses are unpaginated bare arrays (items) - courses route params not re-verified.
