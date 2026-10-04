"""Workout repositories: exercise catalog, workouts, sessions+sets.

Exercise rows with `user_id IS NULL` form the shared catalog every user can
read; user-created rows are only visible to their creator. Writes are always
ownership-scoped.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.models.workout import Exercise, Workout, WorkoutSession, WorkoutSet
from app.repositories.base import BaseRepository


class ExerciseRepository(BaseRepository[Exercise]):
    model = Exercise

    async def list_visible(
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
            query = query.where(Exercise.name.ilike(f"%{search}%"))
        return list((await self.session.execute(query)).scalars().all())

    async def get_visible(self, exercise_id: uuid.UUID, user_id: uuid.UUID) -> Exercise | None:
        query = select(Exercise).where(
            Exercise.id == exercise_id,
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def get_visible_many(
        self, exercise_ids: set[uuid.UUID], user_id: uuid.UUID
    ) -> set[uuid.UUID]:
        """IDs from `exercise_ids` that are visible to the user (shared or
        own) - the batched form of `get_visible` for validating a session's
        sets in one query."""
        if not exercise_ids:
            return set()
        query = select(Exercise.id).where(
            Exercise.id.in_(exercise_ids),
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
        )
        return set((await self.session.execute(query)).scalars().all())


class WorkoutRepository(BaseRepository[Workout]):
    model = Workout


class WorkoutSessionRepository(BaseRepository[WorkoutSession]):
    model = WorkoutSession

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 20
    ) -> tuple[list[WorkoutSession], int]:
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

    async def get_owned_with_sets(
        self, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkoutSession | None:
        query = (
            self._base_query(user_id)
            .where(WorkoutSession.id == session_id)
            .options(selectinload(WorkoutSession.sets))
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def add_set(self, session: WorkoutSession, **fields: object) -> WorkoutSet:
        """Append a set; ownership is enforced by the caller fetching the
        session via `get_owned_with_sets` first."""
        workout_set = WorkoutSet(workout_session_id=session.id, **fields)
        self.session.add(workout_set)
        await self.session.flush()
        return workout_set
