"""Habit repository - ownership-scoped, with log upserts and streak data."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.models.habit import Habit, HabitLog
from app.repositories.base import BaseRepository
from app.utils.enums import HabitLogStatus


class HabitRepository(BaseRepository[Habit]):
    model = Habit

    async def list_active_query(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Habit]:
        """List the user's active habits, newest first, as one page."""
        query = (
            self._base_query(user_id)
            .where(Habit.is_active.is_(True))
            .order_by(Habit.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def get_log_query(
        self, habit_id: uuid.UUID, user_id: uuid.UUID, log_date: date
    ) -> HabitLog | None:
        """Fetch the user's log for one habit on one date, or None."""
        query = select(HabitLog).where(
            HabitLog.habit_id == habit_id, HabitLog.user_id == user_id, HabitLog.log_date == log_date
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def upsert_log_query(
        self, habit_id: uuid.UUID, user_id: uuid.UUID, log_date: date, status: HabitLogStatus, note: str | None
    ) -> HabitLog:
        """Insert or update the (habit, date) log atomically and return the fresh row."""
        stmt = (
            insert(HabitLog)
            .values(habit_id=habit_id, user_id=user_id, log_date=log_date, status=status, note=note)
            .on_conflict_do_update(
                index_elements=[HabitLog.habit_id, HabitLog.log_date],
                set_={"status": status, "note": note},
            )
            .returning(HabitLog.id)
        )
        log_id = (await self.session.execute(stmt)).scalar_one()
        log = (
            await self.session.execute(
                select(HabitLog).where(HabitLog.id == log_id).execution_options(populate_existing=True)
            )
        ).scalar_one()
        return log

    async def delete_log_query(self, habit_id: uuid.UUID, user_id: uuid.UUID, log_date: date) -> bool:
        """Delete the log for (habit, date) if one exists - idempotent, returning False for a
        nonexistent log; ownership is scoped via `get_log_query`, like `upsert_log_query`.
        """
        existing = await self.get_log_query(habit_id, user_id, log_date)
        if existing is None:
            return False
        await self.session.delete(existing)
        await self.session.flush()
        return True

    async def list_logs_between_query(
        self, user_id: uuid.UUID, start: date, end: date, *, habit_ids: list[uuid.UUID] | None = None
    ) -> list[HabitLog]:
        """List the user's habit logs dated in [start, end], optionally limited to given
        habits, ordered by log date.
        """
        query = (
            select(HabitLog)
            .where(HabitLog.user_id == user_id, HabitLog.log_date >= start, HabitLog.log_date <= end)
            .order_by(HabitLog.log_date)
        )
        if habit_ids:
            query = query.where(HabitLog.habit_id.in_(habit_ids))
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)
