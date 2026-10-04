"""Habit business logic: due evaluation, log upserts, streaks."""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.habit import Habit, HabitLog
from app.repositories.habit_repository import HabitRepository
from app.schemas.habit import HabitCreateRequest, HabitLogRequest, HabitUpdateRequest
from app.utils.enums import HabitFrequencyType
from app.utils.recurrence import is_habit_due
from app.utils.streaks import calculate_streak


class HabitService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.habits = HabitRepository(session)

    async def create_habit(self, user_id: uuid.UUID, payload: HabitCreateRequest) -> Habit:
        fields = payload.model_dump()
        fields["frequency_config"] = payload.frequency_config.model_dump(exclude_none=True)
        return await self.habits.create_owned(user_id, **fields)

    async def get_habit(self, user_id: uuid.UUID, habit_id: uuid.UUID) -> Habit:
        habit = await self.habits.get_owned(habit_id, user_id)
        if habit is None:
            raise NotFoundError("Habit not found")
        return habit

    async def list_habits(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Habit]:
        return await self.habits.list_active(user_id, offset=offset, limit=limit)

    async def update_habit(
        self, user_id: uuid.UUID, habit_id: uuid.UUID, payload: HabitUpdateRequest
    ) -> Habit:
        habit = await self.get_habit(user_id, habit_id)
        changes = payload.model_dump(exclude_unset=True)
        if "frequency_config" in changes and changes["frequency_config"] is not None:
            changes["frequency_config"] = payload.frequency_config.model_dump(  # type: ignore[union-attr]
                exclude_none=True
            )
        for key, value in changes.items():
            setattr(habit, key, value)
        await self.session.flush()
        await self.session.refresh(habit)
        return habit

    async def delete_habit(self, user_id: uuid.UUID, habit_id: uuid.UUID) -> None:
        deleted = await self.habits.delete_owned(habit_id, user_id)
        if not deleted:
            raise NotFoundError("Habit not found")

    async def upsert_log(
        self, user_id: uuid.UUID, habit_id: uuid.UUID, log_date: date, payload: HabitLogRequest
    ) -> HabitLog:
        await self.get_habit(user_id, habit_id)  # ownership check -> 404
        return await self.habits.upsert_log(
            habit_id, user_id, log_date, payload.status, payload.note
        )

    async def delete_log(self, user_id: uuid.UUID, habit_id: uuid.UUID, log_date: date) -> None:
        await self.get_habit(user_id, habit_id)  # ownership check -> 404
        await self.habits.delete_log(habit_id, user_id, log_date)

    async def get_streaks(self, user_id: uuid.UUID, habit_id: uuid.UUID, today: date) -> tuple[int, int]:
        habit = await self.get_habit(user_id, habit_id)
        logs = await self.habits.list_logs_between(user_id, habit.start_date, today, habit_ids=[habit.id])
        logs_by_date = {log.log_date: log.status for log in logs}
        return calculate_streak(logs_by_date, today=today)

    @staticmethod
    def is_due_today(habit: Habit, today: date) -> bool:
        return is_habit_due(
            frequency_type=HabitFrequencyType(habit.frequency_type),
            frequency_config=habit.frequency_config or {},
            start_date=habit.start_date,
            end_date=habit.end_date,
            day=today,
        )
