"""Read-only queries used by the privacy data export."""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.goal import Goal
from app.models.learning import Course, CourseModule
from app.models.workout import WorkoutSession


class ExportRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def fetch_rows_query(self, model: type[Any], *filters: ColumnElement[bool]) -> list[Any]:
        """Return all ORM rows of `model` matching every filter."""
        stmt = select(model)
        for clause in filters:
            stmt = stmt.where(clause)
        query_result = await self.session.execute(stmt)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def _ids(self, column: Any, *filters: ColumnElement[bool]) -> list[uuid.UUID]:
        query = select(column).where(*filters)
        query_result = await self.session.execute(query)
        return [row[0] for row in query_result]

    async def course_ids_query(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """Return the user's course IDs (for the module/lesson export queries)."""
        return await self._ids(Course.id, Course.user_id == user_id)

    async def module_ids_query(self, course_ids: list[uuid.UUID]) -> list[uuid.UUID]:
        """Return the IDs of modules belonging to the given (user-owned) courses."""
        if not course_ids:
            return []
        return await self._ids(CourseModule.id, CourseModule.course_id.in_(course_ids))

    async def workout_session_ids_query(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """Return the user's workout-session IDs (for the set export query)."""
        return await self._ids(WorkoutSession.id, WorkoutSession.user_id == user_id)

    async def goal_ids_query(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """Return the user's goal IDs (for the milestone export query)."""
        return await self._ids(Goal.id, Goal.user_id == user_id)
