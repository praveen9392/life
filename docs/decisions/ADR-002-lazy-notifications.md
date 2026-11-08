# ADR-002: Lazy Notification Generation

Last reviewed: 2026-10-10
Status: Existing behavior documented (not a new proposal).

## Context
There is no scheduler, queue, or worker in the system. Users still need due-task reminders in an in-app tray.

## Current decision (as implemented)
`GET /api/v1/notifications` calls `NotificationService.generate_due_notifications(user_id, timezone)` before listing. It creates at most one aggregated `TASK_DUE_SOON` notification per 20-hour window (`_DEDUP_WINDOW`) when the user has pending/in-progress tasks due today, tomorrow, or overdue (scan limit 50 tasks).

## Consequences
+ Zero extra infrastructure; the generator lives in the service layer, so it could be called from a scheduler without API changes (per code docstring).
- A GET performs writes; failures in generation break the read.
- Reminders only appear when the client polls/opens the endpoint; no push/email.
- Concurrent reads may race the dedup check (unverified).
- Thin tests (single notification test).

## Not decided / proposed elsewhere
Moving to a scheduler requires product input and multi-instance decisions (audit Phase 7); nothing here is implemented.

See [features/notifications.md](../features/notifications.md).
