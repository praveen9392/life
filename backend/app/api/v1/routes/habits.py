"""Habit routes - thin HTTP layer over HabitService."""

import uuid
from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.habit import (
    HabitCreateRequest,
    HabitLogRequest,
    HabitLogResponse,
    HabitResponse,
    HabitUpdateRequest,
)
from app.services.habit_service import HabitService
from app.utils.datetime import today_for_user

router = APIRouter(prefix="/habits", tags=["habits"])

# A deliberately generous default so existing callers that never pass
# `limit` keep seeing effectively everything they did before this was added
# (the endpoint was previously fully unbounded) while still capping worst-case
# query size - see master-implementation-review.md §10/§21 item 18.
_DEFAULT_LIST_LIMIT = 200


@router.get("", response_model=list[HabitResponse])
async def list_habits(
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=_DEFAULT_LIST_LIMIT, ge=1, le=500),
) -> list[HabitResponse]:
    """Returns a bare array (not the `Page[T]` envelope) for backward
    compatibility with the current frontend contract; `offset`/`limit` bound
    the result set instead of the previous fully-unbounded query."""
    service = HabitService(db)
    habits = await service.list_habits(current_user.id, offset=offset, limit=limit)
    return [HabitResponse.model_validate(habit) for habit in habits]


@router.post("", response_model=HabitResponse, status_code=201)
async def create_habit(
    payload: HabitCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HabitResponse:
    service = HabitService(db)
    habit = await service.create_habit(current_user.id, payload)
    return HabitResponse.model_validate(habit)


@router.get("/{habit_id}", response_model=HabitResponse)
async def get_habit(
    habit_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> HabitResponse:
    service = HabitService(db)
    habit = await service.get_habit(current_user.id, habit_id)
    return HabitResponse.model_validate(habit)


@router.patch("/{habit_id}", response_model=HabitResponse)
async def update_habit(
    habit_id: uuid.UUID,
    payload: HabitUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HabitResponse:
    service = HabitService(db)
    habit = await service.update_habit(current_user.id, habit_id, payload)
    return HabitResponse.model_validate(habit)


@router.delete("/{habit_id}", status_code=204)
async def delete_habit(
    habit_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    service = HabitService(db)
    await service.delete_habit(current_user.id, habit_id)


@router.put("/{habit_id}/log/{log_date}", response_model=HabitLogResponse)
async def log_habit(
    habit_id: uuid.UUID,
    log_date: date,
    payload: HabitLogRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HabitLogResponse:
    """Upsert today's (or a past day's) log entry - idempotent by design."""
    service = HabitService(db)
    log = await service.upsert_log(current_user.id, habit_id, log_date, payload)
    return HabitLogResponse.model_validate(log)


@router.get("/{habit_id}/history", response_model=list[HabitLogResponse])
async def habit_history(
    habit_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    days: int = Query(default=30, ge=1, le=365),
) -> list[HabitLogResponse]:
    """Recent log history for heatmap/calendar rendering."""
    service = HabitService(db)
    habit = await service.get_habit(current_user.id, habit_id)
    today = today_for_user(current_user.timezone)
    from datetime import timedelta

    logs = await service.habits.list_logs_between(
        current_user.id, today - timedelta(days=days), today, habit_ids=[habit.id]
    )
    return [HabitLogResponse.model_validate(log) for log in logs]


@router.get("/{habit_id}/streak")
async def habit_streak(
    habit_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    service = HabitService(db)
    today = today_for_user(current_user.timezone)
    current, longest = await service.get_streaks(current_user.id, habit_id, today)
    return {"current_streak": current, "longest_streak": longest}
