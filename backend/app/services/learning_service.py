"""Learning business logic: items, course tree, sessions.

Course progress is derived, never stored: completed lessons / total lessons
(the canonical rule lives in progress_rules). Lesson completion sets
`completed_at` and can auto-advance the course's status.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError, ValidationError
from app.core.logging import logger
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
    """Compute the course's derived progress percent from its lesson tree.

    Args:
        course: Course whose `modules` (and their lessons) are eager-loaded.

    Returns:
        int: Completed lessons as a percentage of total lessons (0-100).
    """
    lessons = [lesson for module in course.modules for lesson in module.lessons]
    completed = sum(1 for lesson in lessons if lesson.status == LessonStatus.COMPLETED)
    return learning_progress_percent(completed, len(lessons))


class LearningService:
    """Learning item, course tree, and study session business logic."""

    def __init__(self, session: AsyncSession):
        """Wire the service (and its repositories) to the request's session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.items = LearningItemRepository(session)
        self.courses = CourseRepository(session)
        self.sessions = LearningSessionRepository(session)

    # Learning items

    async def create_item(
        self, user_id: uuid.UUID, payload: LearningItemCreateRequest
    ) -> LearningItem:
        """Create a learning item for the user.

        Args:
            user_id: Owner of the item.
            payload: Field values for the new item.

        Returns:
            LearningItem: The created item.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting learning item creation | user_id={user_id}")
            created_item = await self.items.create_owned_query(user_id, **payload.model_dump())
            logger.info(f"Learning item created with id: {created_item.id}")
            return created_item
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the learning item: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the learning item: {exc}")
            raise ServiceError("Unexpected error while creating the learning item") from exc

    async def list_items(self, user_id: uuid.UUID) -> list[LearningItem]:
        """List the user's learning items (capped at 200 by the repository).

        Args:
            user_id: Owner of the items.

        Returns:
            list[LearningItem]: The user's learning items (the repository's
            total count is discarded).

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting learning item listing | user_id={user_id}")
            items, _ = await self.items.list_owned_query(user_id, limit=200)
            logger.info(f"Successfully retrieved {len(items)} learning items")
            return items
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the learning items: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the learning items: {exc}")
            raise ServiceError("Unexpected error while listing the learning items") from exc

    async def update_item(
        self, user_id: uuid.UUID, item_id: uuid.UUID, payload: LearningItemUpdateRequest
    ) -> LearningItem:
        """Partially update an owned learning item.

        Args:
            user_id: Owner the item must belong to.
            item_id: Primary key of the item.
            payload: Fields to change; unset fields are ignored.

        Returns:
            LearningItem: The updated item.

        Raises:
            NotFoundError: If the item does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting learning item update | user_id={user_id} item_id={item_id}")
            item = await self.items.update_owned_query(
                item_id, user_id, **payload.model_dump(exclude_unset=True)
            )
            if item is None:
                logger.warning(f"Learning item not found with id: {item_id}")
                raise NotFoundError("Learning item not found")
            logger.info(f"Learning item updated | id={item_id}")
            return item
        except NotFoundError:
            logger.error(f"Learning item update failed: item not found | item_id={item_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the learning item: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the learning item: {exc}")
            raise ServiceError("Unexpected error while updating the learning item") from exc

    async def delete_item(self, user_id: uuid.UUID, item_id: uuid.UUID) -> None:
        """Delete a learning item owned by the user.

        Args:
            user_id: Owner the item must belong to.
            item_id: Primary key of the item.

        Raises:
            NotFoundError: If the item does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting learning item deletion | user_id={user_id} item_id={item_id}")
            deleted = await self.items.delete_owned_query(item_id, user_id)
            if not deleted:
                logger.warning(f"Learning item not found with id: {item_id}")
                raise NotFoundError("Learning item not found")
            logger.info(f"Learning item deleted | id={item_id}")
        except NotFoundError:
            logger.error(f"Learning item delete failed: item not found | item_id={item_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the learning item: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the learning item: {exc}")
            raise ServiceError("Unexpected error while deleting the learning item") from exc

    # Courses

    async def create_course(self, user_id: uuid.UUID, payload: CourseCreateRequest) -> Course:
        """Create a course for the user.

        Args:
            user_id: Owner of the course.
            payload: Field values; `target_date` must not precede
                `start_date` when both are given.

        Returns:
            Course: The created course.

        Raises:
            ValidationError: If `target_date` is before `start_date`.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course creation | user_id={user_id}")
            if payload.start_date and payload.target_date and payload.target_date < payload.start_date:
                logger.debug(
                    f"Rejecting course create: target_date {payload.target_date} is before start_date {payload.start_date}"
                )
                raise ValidationError("target_date cannot be before start_date")
            logger.debug(f"Creating course | user_id={user_id}")
            created_course = await self.courses.create_owned_query(user_id, **payload.model_dump())
            logger.info(f"Course created with id: {created_course.id}")
            return created_course
        except ValidationError:
            logger.error(f"Course creation failed: target_date before start_date | user_id={user_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the course: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the course: {exc}")
            raise ServiceError("Unexpected error while creating the course") from exc

    async def list_courses(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Course]:
        """List the user's courses, paginated.

        Args:
            user_id: Owner of the courses.
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 100).

        Returns:
            list[Course]: The user's courses in the requested window.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course listing | user_id={user_id}")
            user_courses = await self.courses.list_for_user_query(user_id, offset=offset, limit=limit)
            logger.info(f"Successfully retrieved {len(user_courses)} courses")
            return user_courses
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the courses: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the courses: {exc}")
            raise ServiceError("Unexpected error while listing the courses") from exc

    async def get_course_tree(self, user_id: uuid.UUID, course_id: uuid.UUID) -> Course:
        """Fetch one owned course with its full module/lesson tree.

        Args:
            user_id: Owner the course must belong to.
            course_id: Primary key of the course.

        Returns:
            Course: The owned course with modules and lessons eager-loaded.

        Raises:
            NotFoundError: If the course does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course tree retrieval | user_id={user_id} course_id={course_id}")
            course = await self.courses.get_owned_with_tree_query(course_id, user_id)
            if course is None:
                logger.warning(f"Course not found with id: {course_id}")
                raise NotFoundError("Course not found")
            logger.debug(f"Course tree retrieval completed | user_id={user_id} course_id={course_id}")
            return course
        except NotFoundError:
            logger.error(f"Course tree fetch failed: course not found | course_id={course_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the course tree: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the course tree: {exc}")
            raise ServiceError("Unexpected error while fetching the course tree") from exc

    async def update_course(
        self, user_id: uuid.UUID, course_id: uuid.UUID, payload: CourseUpdateRequest
    ) -> Course:
        """Partially update an owned course.

        Args:
            user_id: Owner the course must belong to.
            course_id: Primary key of the course.
            payload: Fields to change; the effective start/target date pair
                is validated, so a partial update may supply only one of the
                two dates.

        Returns:
            Course: The refreshed course.

        Raises:
            ValidationError: If the effective `target_date` precedes
                `start_date`.
            NotFoundError: If the course does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course update | user_id={user_id} course_id={course_id}")
            course = await self.courses.get_owned_query(course_id, user_id)
            if course is None:
                logger.warning(f"Course not found with id: {course_id}")
                raise NotFoundError("Course not found")
            changes = payload.model_dump(exclude_unset=True)
            # Validate the EFFECTIVE pair: a partial update may change only one
            # of the dates, so the other side comes from the stored course.
            start_date = changes.get("start_date", course.start_date)
            target_date = changes.get("target_date", course.target_date)
            if start_date and target_date and target_date < start_date:
                logger.debug(
                    f"Rejecting course update: target_date {target_date} is before start_date {start_date}"
                )
                raise ValidationError("target_date cannot be before start_date")
            logger.debug(f"Applying course update | course_id={course_id}")
            for key, value in changes.items():
                setattr(course, key, value)
            await self.session.flush()
            await self.session.refresh(course)
            logger.info(f"Course updated | id={course_id}")
            return course
        except (NotFoundError, ValidationError):
            logger.error(
                f"Course update failed: course not found or target_date before "
                f"start_date | course_id={course_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the course: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the course: {exc}")
            raise ServiceError("Unexpected error while updating the course") from exc

    async def delete_course(self, user_id: uuid.UUID, course_id: uuid.UUID) -> None:
        """Delete a course owned by the user.

        Args:
            user_id: Owner the course must belong to.
            course_id: Primary key of the course.

        Raises:
            NotFoundError: If the course does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course deletion | user_id={user_id} course_id={course_id}")
            deleted = await self.courses.delete_owned_query(course_id, user_id)
            if not deleted:
                logger.warning(f"Course not found with id: {course_id}")
                raise NotFoundError("Course not found")
            logger.info(f"Course deleted | id={course_id}")
        except NotFoundError:
            logger.error(f"Course delete failed: course not found | course_id={course_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the course: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the course: {exc}")
            raise ServiceError("Unexpected error while deleting the course") from exc

    # Modules & lessons

    async def add_module(
        self, user_id: uuid.UUID, course_id: uuid.UUID, payload: CourseModuleCreateRequest
    ):
        """Add a module to an owned course.

        Args:
            user_id: Owner the course must belong to.
            course_id: Primary key of the course.
            payload: Field values for the new module.

        Returns:
            CourseModule: The created module.

        Raises:
            NotFoundError: If the course does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting module creation | user_id={user_id} course_id={course_id}")
            course = await self.get_course(user_id, course_id)
            logger.debug(f"Creating module | user_id={user_id} course_id={course_id}")
            created_module = await self.courses.create_module_query(course, **payload.model_dump())
            logger.info(f"Module created with id: {created_module.id}")
            return created_module
        except NotFoundError:
            logger.error(f"Module creation failed: course not found | course_id={course_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while adding the module: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while adding the module: {exc}")
            raise ServiceError("Unexpected error while adding the module") from exc

    async def add_lesson(
        self, user_id: uuid.UUID, module_id: uuid.UUID, payload: CourseLessonCreateRequest
    ) -> CourseLesson:
        """Add a lesson to an owned module.

        Args:
            user_id: Owner the module (through its course) must belong to.
            module_id: Primary key of the module.
            payload: Field values for the new lesson.

        Returns:
            CourseLesson: The created lesson.

        Raises:
            NotFoundError: If the module does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting lesson creation | user_id={user_id} module_id={module_id}")
            module = await self.courses.get_owned_module_query(module_id, user_id)
            if module is None:
                logger.warning(f"Module not found with id: {module_id}")
                raise NotFoundError("Module not found")
            logger.debug(f"Creating lesson | user_id={user_id} module_id={module_id}")
            created_lesson = await self.courses.create_lesson_query(module, **payload.model_dump())
            logger.info(f"Lesson created with id: {created_lesson.id}")
            return created_lesson
        except NotFoundError:
            logger.error(f"Lesson creation failed: module not found | module_id={module_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while adding the lesson: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while adding the lesson: {exc}")
            raise ServiceError("Unexpected error while adding the lesson") from exc

    async def update_lesson(
        self, user_id: uuid.UUID, lesson_id: uuid.UUID, payload: CourseLessonUpdateRequest
    ) -> CourseLesson:
        """Partially update an owned lesson and re-sync its course's status.

        Args:
            user_id: Owner the lesson (through its course) must belong to.
            lesson_id: Primary key of the lesson.
            payload: Fields to change; setting status to COMPLETED stamps
                `completed_at`, changing it to anything else clears the stamp.

        Returns:
            CourseLesson: The updated lesson.

        Raises:
            NotFoundError: If the lesson does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting lesson update | user_id={user_id} lesson_id={lesson_id}")
            lesson = await self.courses.get_owned_lesson_query(lesson_id, user_id)
            if lesson is None:
                logger.warning(f"Lesson not found with id: {lesson_id}")
                raise NotFoundError("Lesson not found")
            changes = payload.model_dump(exclude_unset=True)
            if changes.get("status") == LessonStatus.COMPLETED:
                logger.debug(f"Lesson completed; stamping completed_at | lesson_id={lesson_id}")
                lesson.completed_at = datetime.now(UTC)
            elif "status" in changes:
                logger.debug(f"Lesson reopened; clearing completed_at | lesson_id={lesson_id}")
                lesson.completed_at = None
            logger.debug(f"Applying lesson update | lesson_id={lesson_id}")
            for key, value in changes.items():
                setattr(lesson, key, value)
            await self.session.flush()
            await self._sync_course_status(user_id, lesson.module_id)
            logger.info(f"Lesson updated | id={lesson_id}")
            return lesson
        except NotFoundError:
            logger.error(f"Lesson update failed: lesson not found | lesson_id={lesson_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the lesson: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the lesson: {exc}")
            raise ServiceError("Unexpected error while updating the lesson") from exc

    async def get_course(self, user_id: uuid.UUID, course_id: uuid.UUID) -> Course:
        """Fetch one course owned by the user.

        Args:
            user_id: Owner the course must belong to.
            course_id: Primary key of the course.

        Returns:
            Course: The owned course (without the module tree; use
            `get_course_tree` when lessons/modules are needed).

        Raises:
            NotFoundError: If the course does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting course retrieval | user_id={user_id} course_id={course_id}")
            course = await self.courses.get_owned_query(course_id, user_id)
            if course is None:
                logger.warning(f"Course not found with id: {course_id}")
                raise NotFoundError("Course not found")
            logger.debug(f"Course retrieval completed | user_id={user_id} course_id={course_id}")
            return course
        except NotFoundError:
            logger.error(f"Course fetch failed: course not found | course_id={course_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the course: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the course: {exc}")
            raise ServiceError("Unexpected error while fetching the course") from exc

    async def _sync_course_status(self, user_id: uuid.UUID, module_id: uuid.UUID) -> None:
        """Auto-derive the course status from its lesson completion.

        Args:
            user_id: Owner the course must belong to.
            module_id: Any module of the course; used only to locate it.
        """
        from app.models.learning import CourseModule

        logger.debug(f"Starting _sync_course_status | user_id={user_id} module_id={module_id}")
        module = await self.session.get(CourseModule, module_id)
        if module is None:
            logger.debug(f"Module not found; skipping course status sync | module_id={module_id}")
            return
        logger.debug(f"Fetching course tree | user_id={user_id} course_id={module.course_id}")
        course = await self.courses.get_owned_with_tree_query(module.course_id, user_id)
        if course is None:
            logger.debug(
                f"Course not found; skipping course status sync | course_id={module.course_id}"
            )
            return
        progress = course_progress(course)
        if progress == 100:
            course.status = CourseStatus.COMPLETED
        elif progress > 0 and course.status == CourseStatus.NOT_STARTED:
            course.status = CourseStatus.IN_PROGRESS
        await self.session.flush()
        logger.debug(
            f"Course status synced | course_id={course.id} progress={progress} status={course.status}"
        )

    # Study sessions

    async def log_session(
        self, user_id: uuid.UUID, payload: LearningSessionCreateRequest
    ) -> LearningSession:
        """Record a study session, validating referenced course/item ownership.

        Args:
            user_id: Owner of the session.
            payload: Session fields; `course_id` and `learning_item_id` are
                each optional but must be owned by the user when present.

        Returns:
            LearningSession: The created session.

        Raises:
            NotFoundError: If the referenced course or learning item does not
                exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting study session creation | user_id={user_id}")
            if payload.course_id is not None:
                await self.get_course(user_id, payload.course_id)
            if payload.learning_item_id is not None:
                logger.debug(
                    f"Fetching learning item | user_id={user_id} "
                    f"learning_item_id={payload.learning_item_id}"
                )
                item = await self.items.get_owned_query(payload.learning_item_id, user_id)
                if item is None:
                    logger.warning(f"Learning item not found with id: {payload.learning_item_id}")
                    raise NotFoundError("Learning item not found")
            logger.debug(f"Creating study session | user_id={user_id}")
            created_session = await self.sessions.create_owned_query(user_id, **payload.model_dump())
            logger.info(f"Study session created with id: {created_session.id}")
            return created_session
        except NotFoundError:
            logger.error(
                f"Study session creation failed: course or learning item not "
                f"found | user_id={user_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while logging the study session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while logging the study session: {exc}")
            raise ServiceError("Unexpected error while logging the study session") from exc

    async def list_sessions(
        self, user_id: uuid.UUID, *, since: date | None, offset: int, limit: int
    ) -> tuple[list[LearningSession], int]:
        """List the user's study sessions, paginated.

        Args:
            user_id: Owner of the sessions.
            since: Optional lower bound (inclusive) on session_date.
            offset: Number of records to skip for pagination.
            limit: Maximum number of records to return.

        Returns:
            tuple[list[LearningSession], int]: The matching sessions and the
            total count before pagination.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting study session listing | user_id={user_id}")
            sessions_and_total = await self.sessions.list_for_user_query(
                user_id, since=since, offset=offset, limit=limit
            )
            sessions, _total = sessions_and_total
            logger.info(f"Successfully retrieved {len(sessions)} study sessions")
            return sessions, _total
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the study sessions: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the study sessions: {exc}")
            raise ServiceError("Unexpected error while listing the study sessions") from exc

    async def delete_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
        """Delete a study session owned by the user.

        Args:
            user_id: Owner the session must belong to.
            session_id: Primary key of the session.

        Raises:
            NotFoundError: If the session does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting study session deletion | user_id={user_id} session_id={session_id}")
            deleted = await self.sessions.delete_owned_query(session_id, user_id)
            if not deleted:
                logger.warning(f"Learning session not found with id: {session_id}")
                raise NotFoundError("Learning session not found")
            logger.info(f"Study session deleted | id={session_id}")
        except NotFoundError:
            logger.error(
                f"Study session delete failed: session not found | session_id={session_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the study session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the study session: {exc}")
            raise ServiceError("Unexpected error while deleting the study session") from exc
