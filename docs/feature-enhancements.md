# Feature Enhancements

Only enhancements that clearly improve the product and fit it naturally. No
feature-count padding.

## 1. Tags UI for tasks and notes

| | |
|---|---|
| **Enhancement** | Full tag organization surfaced in the frontend: pick tags on tasks and notes, create tags inline, see tag chips on rows. |
| **User value** | Backend tags existed (create/list/attach, ownership-scoped) but were unreachable — users could not organize anything. |
| **Implementation** | `TagPicker` component (multi-select chips + inline creation with duplicate-name error display); TanStack Query hooks for list/create/attach; immediate note-tag PATCHing kept separate from title/content autosave so the two never clobber each other. |
| **Files/components** | `frontend/src/features/tags/{api.ts,hooks.ts,TagPicker.tsx}`; `TasksPage.tsx` (create/edit modal + row chips); `NotesPage.tsx` (editor + row chips); task/note frontend types gained `tags`. |
| **Backend/API changes** | None — existing `/api/v1/tags` + `tag_ids` on task/note schemas were already complete. |
| **Database changes** | None. |
| **Tests** | Backend `tests/api/test_tags.py` (list/create, duplicate conflict, attach to task/note, cross-user tag ID dropped, PATCH replace/omit/clear, auth). Frontend covered by typecheck/build; exercised in E2E task flow. |
| **Status** | Done. |

## 2. Habit log un-log (undo check-off)

| | |
|---|---|
| **Enhancement** | Habit check-off is no longer one-way: completed → skipped → cleared via the weekly grid, dashboard toggle, and mobile card (one consistent cycle: pending → completed → skipped → cleared). |
| **User value** | Accidental completions were permanent; streaks could not be corrected. |
| **Implementation** | `DELETE /api/v1/habits/{habit_id}/log/{log_date}` → 204, idempotent, ownership-scoped twice (service 404s foreign habits; repository filters `user_id` in the query). Frontend `removeLog` API + `useUnlogHabit` mutation wired into grid, dashboard, and mobile card with cache invalidation. |
| **Files/components** | `backend/app/api/v1/routes/habits.py`, `habit_service.py`, `habit_repository.py`; `frontend/src/features/habits/{api.ts,hooks.ts}`, `HabitsPage.tsx`, `DashboardPage.tsx`. |
| **Backend/API changes** | New endpoint (above). |
| **Database changes** | None (deletes existing log rows). |
| **Tests** | `tests/api/test_habit_unlog.py`: delete existing log → 204, idempotent repeat → 204, cross-user habit → 404. |
| **Status** | Done. |

## Deliberately deferred (not added)

- Full `Page`-shaped pagination everywhere (5 routes done as the pattern).
- Habit/learning/workout notifications, yearly analytics, Board/Calendar task views —
  larger product decisions; stubs are honest "Coming soon" controls.
- Avatar magic-byte validation and old-avatar storage cleanup.
