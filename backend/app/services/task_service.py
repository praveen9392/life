"""Task business logic, including the template+generated-occurrence
recurrence design (see ARCHITECTURE.md "Recurring Tasks & Habits").

Key behaviors:
- Creating a task with a recurrence_rule creates a hidden TEMPLATE plus its
  first generated occurrence.
- Completing/skipping the active occurrence generates the next one (at most
  one future occurrence ever exists per series).
- Editing an occurrence affects only that row; editing the template affects
  future generations.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError, ValidationError
from app.core.logging import logger
from app.models.task import Task
from app.repositories.task_repository import SortOrder, TaskRepository, TaskSortField
from app.schemas.task import RecurrenceRule, TaskCreateRequest, TaskUpdateRequest
from app.services.tag_service import TagService
from app.utils.datetime import today_for_user
from app.utils.enums import RecurrenceFrequency, TaskPriority, TaskStatus
from app.utils.enums import TaskList as TaskListEnum
from app.utils.recurrence import next_task_occurrence_date


class TaskService:
    """Task CRUD plus the template/occurrence recurrence machinery."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.tasks = TaskRepository(session)

    async def create_task(
        self,
        user_id: uuid.UUID,
        payload: TaskCreateRequest,
        user_timezone: str = "UTC",
    ) -> Task:
        """Create a task for the user, expanding a recurrence rule when present.

        With a `recurrence_rule` a hidden TEMPLATE row plus its first
        generated occurrence are created; otherwise a single one-off task
        is created.

        Args:
            user_id: Owner of the task.
            payload: Task fields plus optional `recurrence_rule` and
                `tag_ids` (unowned ids dropped).
            user_timezone: IANA timezone used to date the first occurrence
                when the payload has no due_date (default "UTC").

        Returns:
            Task: The created (occurrence) task with its `tags` relationship
            loaded.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task creation | user_id={user_id}")
            fields = payload.model_dump(exclude={"recurrence_rule", "tag_ids"})
            # The API field is `list`; the ORM attribute is `task_list`.
            if "list" in fields:
                fields["task_list"] = fields.pop("list")
            if payload.recurrence_rule is None:
                logger.debug(f"Creating task | user_id={user_id}")
                task = await self.tasks.create_owned_query(user_id, **fields)
            else:
                # Recurring: create the template (hidden) + first occurrence.
                logger.debug(
                    f"Recurring task: creating template plus first occurrence | user_id={user_id}"
                )
                template = await self.tasks.create_owned_query(
                    user_id,
                    title=payload.title,
                    description=payload.description,
                    priority=payload.priority,
                    task_list=payload.list,
                    due_date=payload.due_date,
                    due_time=payload.due_time,
                    estimated_duration_minutes=payload.estimated_duration_minutes,
                    is_recurring_template=True,
                    recurrence_rule=payload.recurrence_rule.model_dump(mode="json"),
                )
                first_due = payload.due_date or today_for_user(user_timezone)
                task = await self.tasks.create_owned_query(
                    user_id,
                    title=payload.title,
                    description=payload.description,
                    priority=payload.priority,
                    task_list=payload.list,
                    due_date=first_due,
                    due_time=payload.due_time,
                    estimated_duration_minutes=payload.estimated_duration_minutes,
                    recurrence_template_id=template.id,
                )
            # Always resolve tags (empty list when none were sent) so the `tags`
            # relationship is loaded before serialization - a bare created ORM
            # object has it unloaded, and lazy-loading in async context raises
            # MissingGreenlet (see AGENTS.md "Phase 8-11 learnings").
            await self._apply_tags(user_id, task, payload.tag_ids or [])
            logger.info(f"Task created with id: {task.id}")
            return task
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the task: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the task: {exc}")
            raise ServiceError("Unexpected error while creating the task") from exc

    async def _apply_tags(self, user_id: uuid.UUID, task: Task, tag_ids: list[uuid.UUID]) -> None:
        """Attach exactly `tag_ids` to `task`, dropping unowned ids.

        Args:
            user_id: Owner the tags must belong to.
            task: Task to tag; refreshed with its `tags` relationship loaded.
            tag_ids: Tag primary keys to attach (unowned ids silently
                dropped).
        """
        logger.debug(
            f"Starting _apply_tags | user_id={user_id} task_id={task.id} tag_count={len(tag_ids)}"
        )
        owned_tags = await TagService(self.session).resolve_owned_tag_ids(user_id, tag_ids)
        await self.tasks.set_tags_query(task.id, [tag.id for tag in owned_tags])
        await self.session.refresh(task, attribute_names=["tags"])
        logger.debug(f"Task tags applied | task_id={task.id} tag_count={len(owned_tags)}")

    async def get_task(self, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
        """Fetch one task owned by the user.

        Args:
            user_id: Owner the task must belong to.
            task_id: Primary key of the task.

        Returns:
            Task: The owned task.

        Raises:
            NotFoundError: If the task does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task retrieval | user_id={user_id} task_id={task_id}")
            task = await self.tasks.get_owned_query(task_id, user_id)
            if task is None:
                logger.warning(f"Task not found with id: {task_id}")
                raise NotFoundError("Task not found")
            logger.debug(f"Task retrieval completed | user_id={user_id} task_id={task_id}")
            return task
        except NotFoundError:
            logger.error(f"Task fetch failed: task not found | task_id={task_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the task: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the task: {exc}")
            raise ServiceError("Unexpected error while fetching the task") from exc

    async def list_tasks(
        self,
        user_id: uuid.UUID,
        *,
        status: TaskStatus | None,
        task_list: str | None,
        due_before: date | None,
        due_on: date | None = None,
        due_from: date | None = None,
        search: str | None = None,
        overdue: bool = False,
        priority: TaskPriority | None = None,
        offset: int,
        limit: int,
        sort: TaskSortField | None = None,
        order: SortOrder = "desc",
        user_timezone: str = "UTC",
    ) -> tuple[list[Task], int]:
        """List the user's tasks, filtered/sorted and paginated.

        Args:
            user_id: Owner of the tasks.
            status: Optional status filter.
            task_list: Optional list name (Today/Upcoming/Later), validated
            against the TaskList enum.
            due_before: Optional upper bound (inclusive) on due_date.
            due_on: Optional exact due_date filter.
            due_from: Optional lower bound (inclusive) on due_date.
            search: Optional case-insensitive title/description filter.
            overdue: When True, restrict to tasks overdue as of the caller's
            local today (default False).
            priority: Optional priority filter.
            offset: Number of records to skip for pagination.
            limit: Maximum number of records to return.
            sort: Optional sort field (repository default ordering when None).
            order: Sort direction, "asc" or "desc" (default "desc").
            user_timezone: IANA timezone used to compute the overdue boundary
            (default "UTC").

        Returns:
            tuple[list[Task], int]: The matching tasks and the total count
            before pagination.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task listing | user_id={user_id}")
            parsed_list = TaskListEnum(task_list) if task_list else None
            tasks_and_total = await self.tasks.list_for_user_query(
                user_id,
                status=status,
                task_list=parsed_list,
                due_before=due_before,
                due_on=due_on,
                due_from=due_from,
                search=search,
                # "Overdue" is relative to the caller's local today, so the
                # boundary is computed server-side from the user's timezone.
                overdue_before=today_for_user(user_timezone) if overdue else None,
                priority=priority,
                offset=offset,
                limit=limit,
                sort=sort,
                order=order,
            )
            tasks, _total = tasks_and_total
            logger.info(f"Successfully retrieved {len(tasks)} tasks")
            return tasks, _total
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the tasks: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the tasks: {exc}")
            raise ServiceError("Unexpected error while listing the tasks") from exc

    async def update_task(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        payload: TaskUpdateRequest,
        user_timezone: str = "UTC",
    ) -> Task:
        """Partially update a task, generating the next occurrence when needed.

        Completing or cancelling a recurring occurrence generates the next
        one (at most one future occurrence exists per series); setting
        status to COMPLETED stamps `completed_at`, any other status clears
        it.

        Args:
            user_id: Owner the task must belong to.
            task_id: Primary key of the task.
            payload: Fields to change; a `tag_ids` list replaces the task's
            tags (unowned ids dropped).
            user_timezone: IANA timezone used to date the next occurrence
            (default "UTC").

        Returns:
            Task: The refreshed task with its `tags` relationship loaded.

        Raises:
            NotFoundError: If the task does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task update | user_id={user_id} task_id={task_id}")
            task = await self.get_task(user_id, task_id)
            changes = payload.model_dump(exclude_unset=True)
            tag_ids = changes.pop("tag_ids", None)
            if "list" in changes:
                changes["task_list"] = changes.pop("list")

            if task.recurrence_template_id is not None and "status" in changes:
                new_status = changes["status"]
                if new_status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
                    logger.debug(
                        f"Occurrence completed or cancelled; generating next occurrence | task_id={task_id}"
                    )
                    await self._generate_next_occurrence(task, user_timezone)
            if "status" in changes and changes["status"] == TaskStatus.COMPLETED:
                task.completed_at = datetime.now(UTC)
            elif "status" in changes and changes["status"] != TaskStatus.COMPLETED:
                task.completed_at = None

            logger.debug(f"Applying task update | task_id={task_id}")
            for key, value in changes.items():
                setattr(task, key, value)
            await self.session.flush()
            await self.session.refresh(task)
            if tag_ids is None:
                await self.session.refresh(task, attribute_names=["tags"])
            else:
                await self._apply_tags(user_id, task, tag_ids)
            logger.info(f"Task updated | id={task_id}")
            return task
        except NotFoundError:
            logger.error(f"Task update failed: task not found | task_id={task_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the task: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the task: {exc}")
            raise ServiceError("Unexpected error while updating the task") from exc

    async def delete_task(self, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
        """Soft-delete (trash) a task owned by the user.

        Args:
            user_id: Owner the task must belong to.
            task_id: Primary key of the task.

        Raises:
            NotFoundError: If the task does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task deletion | user_id={user_id} task_id={task_id}")
            deleted = await self.tasks.delete_owned_query(task_id, user_id)
            if not deleted:
                logger.warning(f"Task not found with id: {task_id}")
                raise NotFoundError("Task not found")
            logger.info(f"Task deleted | id={task_id}")
        except NotFoundError:
            logger.error(f"Task delete failed: task not found | task_id={task_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the task: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the task: {exc}")
            raise ServiceError("Unexpected error while deleting the task") from exc

    async def _generate_next_occurrence(
        self, occurrence: Task, user_timezone: str = "UTC"
    ) -> None:
        """Generate the next occurrence when the current one completes/skips.

        No-op when the caller isn't an occurrence, the template is gone or
        cancelled, or a future occurrence already exists (never duplicate a
        series).

        Args:
            occurrence: The completing/cancelled occurrence task.
            user_timezone: IANA timezone used to date the next occurrence
            when the occurrence has no due_date (default "UTC").
        """
        if occurrence.recurrence_template_id is None:
            return
        logger.debug(
            f"Starting _generate_next_occurrence | task_id={occurrence.id} "
            f"template_id={occurrence.recurrence_template_id}"
        )
        template = await self.tasks.get_template_query(occurrence.recurrence_template_id, occurrence.user_id)
        if (
            template is None
            or template.status == TaskStatus.CANCELLED
            or template.recurrence_rule is None
        ):
            logger.debug(
                f"Recurrence ended: template missing or cancelled | template_id={occurrence.recurrence_template_id}"
            )
            return  # Recurrence ended (template deleted or cancelled).

        rule = RecurrenceRule.model_validate(template.recurrence_rule)
        base_date = occurrence.due_date or today_for_user(user_timezone)
        next_due = next_task_occurrence_date(
            frequency=rule.frequency,
            weekdays=rule.weekdays,
            from_date=base_date,
        )
        logger.debug(f"Checking for existing future occurrence | template_id={template.id}")
        existing = await self.tasks.find_active_occurrence_query(template.id, occurrence.user_id)
        if existing is not None and existing.id != occurrence.id:
            logger.debug(
                f"Future occurrence already exists; skipping generation | template_id={template.id}"
            )
            return  # A future occurrence already exists - never duplicate.
        await self.tasks.create_owned_query(
            occurrence.user_id,
            title=template.title,
            description=template.description,
            priority=template.priority,
            task_list=template.task_list,
            due_date=next_due,
            due_time=template.due_time,
            estimated_duration_minutes=template.estimated_duration_minutes,
            recurrence_template_id=template.id,
        )
        logger.debug(f"Next occurrence generated | template_id={template.id} due_date={next_due}")

    async def update_template(
        self, user_id: uuid.UUID, template_id: uuid.UUID, payload: TaskUpdateRequest
    ) -> Task:
        """Edit "this and following occurrences" by updating the template row.

        Args:
            user_id: Owner the template must belong to.
            template_id: Primary key of the template task.
            payload: Fields to change; `status` is ignored (excluded), a
            weekly recurrence rule requires at least one weekday, and a
            `tag_ids` list replaces the template's tags.

        Returns:
            Task: The refreshed template with its `tags` relationship loaded.

        Raises:
            NotFoundError: If the template does not exist or belongs to another user.
            ValidationError: If a weekly recurrence rule has no weekdays.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting task template update | user_id={user_id} template_id={template_id}")
            template = await self.tasks.get_template_query(template_id, user_id)
            if template is None:
                logger.warning(f"Task template not found with id: {template_id}")
                raise NotFoundError("Task not found")
            if (
                payload.recurrence_rule is not None
                and payload.recurrence_rule.frequency == RecurrenceFrequency.WEEKLY
                and not payload.recurrence_rule.weekdays
            ):
                logger.debug(
                    f"Rejecting template update: weekly recurrence without weekdays | template_id={template_id}"
                )
                raise ValidationError("Weekly recurrence requires at least one weekday")
            changes = payload.model_dump(exclude_unset=True, exclude={"status"})
            tag_ids = changes.pop("tag_ids", None)
            if "list" in changes:
                changes["task_list"] = changes.pop("list")
            logger.debug(f"Applying task template update | template_id={template_id}")
            for key, value in changes.items():
                setattr(template, key, value)
            await self.session.flush()
            await self.session.refresh(template)
            if tag_ids is None:
                await self.session.refresh(template, attribute_names=["tags"])
            else:
                await self._apply_tags(user_id, template, tag_ids)
            logger.info(f"Task template updated | id={template_id}")
            return template
        except (NotFoundError, ValidationError):
            logger.error(
                f"Task template update failed: template not found or weekly "
                f"recurrence without weekdays | template_id={template_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the task template: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the task template: {exc}")
            raise ServiceError("Unexpected error while updating the task template") from exc
