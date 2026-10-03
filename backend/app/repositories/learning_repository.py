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

    async def list_for_user(
        self, user_id: uuid.UUID, *, since: date | None = None, offset: int = 0, limit: int = 50
    ) -> tuple[list[LearningSession], int]:
        query = self._base_query(user_id).order_by(LearningSession.session_date.desc())
        if since is not None:
            query = query.where(LearningSession.session_date >= since)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total


class CourseRepository(BaseRepository[Course]):
    model = Course

    async def get_owned_with_tree(self, course_id: uuid.UUID, user_id: uuid.UUID) -> Course | None:
        """Course + modules + lessons, eager-loaded, ownership-scoped."""
        query = (
            self._base_query(user_id)
            .where(Course.id == course_id)
            .options(selectinload(Course.modules).selectinload(CourseModule.lessons))
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def list_for_user(self, user_id: uuid.UUID) -> list[Course]:
        query = (
            self._base_query(user_id)
            .options(selectinload(Course.modules).selectinload(CourseModule.lessons))
            .order_by(Course.created_at.desc())
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_owned_module(self, module_id: uuid.UUID, user_id: uuid.UUID) -> CourseModule | None:
        query = (
            select(CourseModule)
            .join(Course, CourseModule.course_id == Course.id)
            .where(CourseModule.id == module_id, Course.user_id == user_id)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def get_owned_lesson(self, lesson_id: uuid.UUID, user_id: uuid.UUID) -> CourseLesson | None:
        query = (
            select(CourseLesson)
            .join(CourseModule, CourseLesson.module_id == CourseModule.id)
            .join(Course, CourseModule.course_id == Course.id)
            .where(CourseLesson.id == lesson_id, Course.user_id == user_id)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def create_module(self, course: Course, **fields: object) -> CourseModule:
        module = CourseModule(course_id=course.id, **fields)
        self.session.add(module)
        await self.session.flush()
        return module

    async def create_lesson(self, module: CourseModule, **fields: object) -> CourseLesson:
        lesson = CourseLesson(module_id=module.id, **fields)
        self.session.add(lesson)
        await self.session.flush()
        return lesson
