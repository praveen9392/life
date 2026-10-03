"""Learning business logic: items, course tree, sessions.

Course progress is derived, never stored: completed lessons / total lessons
(the canonical rule lives in progress_rules). Lesson completion sets
`completed_at` and can auto-advance the course's status.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.learning import Course, CourseLesson, LearningItem, LearningSession
from app.repositories.learning_repository import (
    CourseRepository,
    LearningItemRepository,
    LearningSessionRepository,
)
from app.schemas.learning import (
    CourseCreateRequest,
    CourseLessonCreateRequest,
    CourseLessonUpdateRequest,
    CourseModuleCreateRequest,
    CourseUpdateRequest,
    LearningItemCreateRequest,
    LearningItemUpdateRequest,
    LearningSessionCreateRequest,
)
from app.services.progress_rules import learning_progress_percent
from app.utils.enums import CourseStatus, LessonStatus


def course_progress(course: Course) -> int:
    """completed_lessons / total_lessons across the whole course."""
    lessons = [lesson for module in course.modules for lesson in module.lessons]
    completed = sum(1 for lesson in lessons if lesson.status == LessonStatus.COMPLETED)
    return learning_progress_percent(completed, len(lessons))


class LearningService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.items = LearningItemRepository(session)
        self.courses = CourseRepository(session)
        self.sessions = LearningSessionRepository(session)

    # -- Learning items ----------------------------------------------------

    async def create_item(
        self, user_id: uuid.UUID, payload: LearningItemCreateRequest
    ) -> LearningItem:
        return await self.items.create_owned(user_id, **payload.model_dump())

    async def list_items(self, user_id: uuid.UUID) -> list[LearningItem]:
        items, _ = await self.items.list_owned(user_id, limit=200)
        return items

    async def update_item(
        self, user_id: uuid.UUID, item_id: uuid.UUID, payload: LearningItemUpdateRequest
    ) -> LearningItem:
        item = await self.items.update_owned(
            item_id, user_id, **payload.model_dump(exclude_unset=True)
        )
        if item is None:
            raise NotFoundError("Learning item not found")
        return item

    async def delete_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        deleted = await self.items.delete_owned(item_id, user_id)
        if not deleted:
            raise NotFoundError("Learning item not found")

    # -- Courses ------------------------------------------------------------

    async def create_course(self, user_id: uuid.UUID, payload: CourseCreateRequest) -> Course:
        if payload.start_date and payload.target_date and payload.target_date < payload.start_date:
            raise ValidationError("target_date cannot be before start_date")
        return await self.courses.create_owned(user_id, **payload.model_dump())

    async def list_courses(self, user_id: uuid.UUID) -> list[Course]:
        return await self.courses.list_for_user(user_id)

    async def get_course_tree(self, user_id: uuid.UUID, course_id: uuid.UUID) -> Course:
        course = await self.courses.get_owned_with_tree(course_id, user_id)
        if course is None:
            raise NotFoundError("Course not found")
        return course

    async def update_course(
        self, user_id: uuid.UUID, course_id: uuid.UUID, payload: CourseUpdateRequest
    ) -> Course:
        course = await self.courses.update_owned(
            course_id, user_id, **payload.model_dump(exclude_unset=True)
        )
        if course is None:
            raise NotFoundError("Course not found")
        return course

    async def delete_course(self, user_id: uuid.UUID, course_id: uuid.UUID) -> None:
        deleted = await self.courses.delete_owned(course_id, user_id)
        if not deleted:
            raise NotFoundError("Course not found")

    # -- Modules & lessons ---------------------------------------------------

    async def add_module(
        self, user_id: uuid.UUID, course_id: uuid.UUID, payload: CourseModuleCreateRequest
    ):
        course = await self.get_course(user_id, course_id)
        return await self.courses.create_module(course, **payload.model_dump())

    async def add_lesson(
        self, user_id: uuid.UUID, module_id: uuid.UUID, payload: CourseLessonCreateRequest
    ) -> CourseLesson:
        module = await self.courses.get_owned_module(module_id, user_id)
        if module is None:
            raise NotFoundError("Module not found")
        return await self.courses.create_lesson(module, **payload.model_dump())

    async def update_lesson(
        self, user_id: uuid.UUID, lesson_id: uuid.UUID, payload: CourseLessonUpdateRequest
    ) -> CourseLesson:
        lesson = await self.courses.get_owned_lesson(lesson_id, user_id)
        if lesson is None:
            raise NotFoundError("Lesson not found")
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("status") == LessonStatus.COMPLETED:
            lesson.completed_at = datetime.now(UTC)
        elif "status" in changes:
            lesson.completed_at = None
        for key, value in changes.items():
            setattr(lesson, key, value)
        await self.session.flush()
        await self._sync_course_status(user_id, lesson.module_id)
        return lesson

    async def get_course(self, user_id: uuid.UUID, course_id: uuid.UUID) -> Course:
        course = await self.courses.get_owned(course_id, user_id)
        if course is None:
            raise NotFoundError("Course not found")
        return course

    async def _sync_course_status(self, user_id: uuid.UUID, module_id: uuid.UUID) -> None:
        """Auto-derive course status from lesson completion."""
        from app.models.learning import CourseModule

        module = await self.session.get(CourseModule, module_id)
        if module is None:
            return
        course = await self.courses.get_owned_with_tree(module.course_id, user_id)
        if course is None:
            return
        progress = course_progress(course)
        if progress == 100:
            course.status = CourseStatus.COMPLETED
        elif progress > 0 and course.status == CourseStatus.NOT_STARTED:
            course.status = CourseStatus.IN_PROGRESS
        await self.session.flush()

    # -- Study sessions -------------------------------------------------------

    async def log_session(
        self, user_id: uuid.UUID, payload: LearningSessionCreateRequest
    ) -> LearningSession:
        if payload.course_id is not None:
            await self.get_course(user_id, payload.course_id)
        if payload.learning_item_id is not None:
            item = await self.items.get_owned(payload.learning_item_id, user_id)
            if item is None:
                raise NotFoundError("Learning item not found")
        return await self.sessions.create_owned(user_id, **payload.model_dump())

    async def list_sessions(
        self, user_id: uuid.UUID, *, since: date | None, offset: int, limit: int
    ) -> tuple[list[LearningSession], int]:
        return await self.sessions.list_for_user(
            user_id, since=since, offset=offset, limit=limit
        )

    async def delete_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
        deleted = await self.sessions.delete_owned(session_id, user_id)
        if not deleted:
            raise NotFoundError("Learning session not found")
