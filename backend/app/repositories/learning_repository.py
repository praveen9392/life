"""Learning repository - ownership-scoped, including the course tree.

CourseModule and CourseLesson have no user_id column: ownership is enforced
by joining through their parent course, which is owned.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.learning import (
    Course,
    CourseLesson,
    CourseModule,
    LearningItem,
    LearningSession,
)
from app.repositories.base import BaseRepository


class LearningItemRepository(BaseRepository[LearningItem]):
    model = LearningItem


class LearningSessionRepository(BaseRepository[LearningSession]):
    model = LearningSession

    async def totals_between_query(self, user_id: uuid.UUID, start: date, end: date) -> tuple[int, int]:
        """(total minutes, session count) for sessions dated within [start, end]."""
        query = select(
            func.coalesce(func.sum(LearningSession.duration_minutes), 0),
            func.count(),
        ).where(
            LearningSession.user_id == user_id,
            LearningSession.session_date >= start,
            LearningSession.session_date <= end,
        )
        row = (await self.session.execute(query)).one()
        return int(row[0]), int(row[1])

    async def list_for_user_query(
        self, user_id: uuid.UUID, *, since: date | None = None, offset: int = 0, limit: int = 50
    ) -> tuple[list[LearningSession], int]:
        """Return (page, total) of the user's learning sessions, newest first, optionally
        restricted to sessions on/after `since`.
        """
        query = self._base_query(user_id).order_by(LearningSession.session_date.desc())
        if since is not None:
            query = query.where(LearningSession.session_date >= since)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total


class CourseRepository(BaseRepository[Course]):
    model = Course

    async def get_owned_with_tree_query(self, course_id: uuid.UUID, user_id: uuid.UUID) -> Course | None:
        """Fetch an owned course with its modules and lessons eager-loaded, or None."""
        query = (
            self._base_query(user_id)
            .where(Course.id == course_id)
            .options(selectinload(Course.modules).selectinload(CourseModule.lessons))
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def list_for_user_query(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Course]:
        """List the user's courses (modules+lessons eager-loaded), newest first, as one page."""
        query = (
            self._base_query(user_id)
            .options(selectinload(Course.modules).selectinload(CourseModule.lessons))
            .order_by(Course.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def get_owned_module_query(self, module_id: uuid.UUID, user_id: uuid.UUID) -> CourseModule | None:
        """Fetch a module only if its parent course belongs to `user_id`."""
        query = (
            select(CourseModule)
            .join(Course, CourseModule.course_id == Course.id)
            .where(CourseModule.id == module_id, Course.user_id == user_id)
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def get_owned_lesson_query(self, lesson_id: uuid.UUID, user_id: uuid.UUID) -> CourseLesson | None:
        """Fetch a lesson only if its parent course belongs to `user_id`."""
        query = (
            select(CourseLesson)
            .join(CourseModule, CourseLesson.module_id == CourseModule.id)
            .join(Course, CourseModule.course_id == Course.id)
            .where(CourseLesson.id == lesson_id, Course.user_id == user_id)
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def create_module_query(self, course: Course, **fields: object) -> CourseModule:
        """Add a module under an owned course and flush so its ID is assigned."""
        module = CourseModule(course_id=course.id, **fields)
        self.session.add(module)
        await self.session.flush()
        return module

    async def create_lesson_query(self, module: CourseModule, **fields: object) -> CourseLesson:
        """Add a lesson under an owned module and flush so its ID is assigned."""
        lesson = CourseLesson(module_id=module.id, **fields)
        self.session.add(lesson)
        await self.session.flush()
        return lesson
