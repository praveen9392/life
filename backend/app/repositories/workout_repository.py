"""Workout repositories: exercise catalog, workouts, sessions+sets.

Exercise rows with `user_id IS NULL` form the shared catalog every user can
read; user-created rows are only visible to their creator. Writes are always
ownership-scoped.
"""

import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models.workout import Exercise, Workout, WorkoutSession, WorkoutSet
from app.repositories.base import BaseRepository
from app.utils.sql import escape_like


class ExerciseRepository(BaseRepository[Exercise]):
    model = Exercise

    async def list_visible_query(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None = None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Exercise]:
        """Shared catalog entries plus the user's own custom exercises."""
        query = (
            select(Exercise)
            .where(or_(Exercise.user_id.is_(None), Exercise.user_id == user_id))
            .order_by(Exercise.user_id.is_not(None), Exercise.name)
            .offset(offset)
            .limit(limit)
        )
        if search:
            query = query.where(Exercise.name.ilike(f"%{escape_like(search)}%", escape="\\"))
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def get_visible_query(self, exercise_id: uuid.UUID, user_id: uuid.UUID) -> Exercise | None:
        """Fetch an exercise only if it's shared-catalog or owned by `user_id`."""
        query = select(Exercise).where(
            Exercise.id == exercise_id,
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def get_visible_many_query(
        self, exercise_ids: set[uuid.UUID], user_id: uuid.UUID
    ) -> set[uuid.UUID]:
        """Return the IDs from `exercise_ids` visible to the user (shared or own) - the batched
        form of `get_visible_query` for validating a session's sets in one query."""
        if not exercise_ids:
            return set()
        query = select(Exercise.id).where(
            Exercise.id.in_(exercise_ids),
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
        )
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return set(matching_records)


class WorkoutRepository(BaseRepository[Workout]):
    model = Workout


class WorkoutSessionRepository(BaseRepository[WorkoutSession]):
    model = WorkoutSession

    async def count_between_query(self, user_id: uuid.UUID, start: date, end: date) -> int:
        """Count sessions performed within [start, end] (UTC calendar date, inclusive)."""
        query = select(func.count()).select_from(WorkoutSession).where(
            WorkoutSession.user_id == user_id,
            func.date(WorkoutSession.performed_at) >= start,
            func.date(WorkoutSession.performed_at) <= end,
        )
        query_result = await self.session.execute(query)
        total_count = query_result.scalar_one()
        return int(total_count)

    async def list_for_user_query(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 20
    ) -> tuple[list[WorkoutSession], int]:
        """Return (page, total) of the user's workout sessions with sets eager-loaded, newest first."""
        query = (
            self._base_query(user_id)
            .options(selectinload(WorkoutSession.sets))
            .order_by(WorkoutSession.performed_at.desc())
        )
        count_query = select(func.count()).select_from(
            self._base_query(user_id).order_by(None).subquery()
        )
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total

    async def get_owned_with_sets_query(
        self, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkoutSession | None:
        """Fetch an owned workout session with its sets eager-loaded, or None."""
        query = (
            self._base_query(user_id)
            .where(WorkoutSession.id == session_id)
            .options(selectinload(WorkoutSession.sets))
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def add_set_query(self, session: WorkoutSession, **fields: object) -> WorkoutSet:
        """Append a set to a session the caller already fetched as owned (via
        `get_owned_with_sets_query`)."""
        workout_set = WorkoutSet(workout_session_id=session.id, **fields)
        self.session.add(workout_set)
        await self.session.flush()
        return workout_set
