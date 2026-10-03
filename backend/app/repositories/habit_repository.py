"""Habit repository - ownership-scoped, with log upserts and streak data."""

import uuid
from datetime import date

from sqlalchemy import select

from app.models.habit import Habit, HabitLog
from app.repositories.base import BaseRepository
from app.utils.enums import HabitLogStatus


class HabitRepository(BaseRepository[Habit]):
    model = Habit

    async def list_active(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Habit]:
        query = (
            self._base_query(user_id)
            .where(Habit.is_active.is_(True))
            .order_by(Habit.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_log(self, habit_id: uuid.UUID, user_id: uuid.UUID, log_date: date) -> HabitLog | None:
        query = select(HabitLog).where(
            HabitLog.habit_id == habit_id, HabitLog.user_id == user_id, HabitLog.log_date == log_date
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def upsert_log(
        self, habit_id: uuid.UUID, user_id: uuid.UUID, log_date: date, status: HabitLogStatus, note: str | None
    ) -> HabitLog:
        existing = await self.get_log(habit_id, user_id, log_date)
        if existing is not None:
            existing.status = status
            existing.note = note
            await self.session.flush()
            return existing
        log = HabitLog(habit_id=habit_id, user_id=user_id, log_date=log_date, status=status, note=note)
        self.session.add(log)
        await self.session.flush()
        return log

    async def list_logs_between(
        self, user_id: uuid.UUID, start: date, end: date, *, habit_ids: list[uuid.UUID] | None = None
    ) -> list[HabitLog]:
        query = (
            select(HabitLog)
            .where(HabitLog.user_id == user_id, HabitLog.log_date >= start, HabitLog.log_date <= end)
            .order_by(HabitLog.log_date)
        )
        if habit_ids:
            query = query.where(HabitLog.habit_id.in_(habit_ids))
        return list((await self.session.execute(query)).scalars().all())
