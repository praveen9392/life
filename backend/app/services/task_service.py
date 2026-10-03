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

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.task import Task
from app.repositories.task_repository import SortOrder, TaskRepository, TaskSortField
from app.schemas.task import RecurrenceRule, TaskCreateRequest, TaskUpdateRequest
from app.services.tag_service import TagService
from app.utils.enums import RecurrenceFrequency, TaskPriority, TaskStatus
from app.utils.recurrence import next_task_occurrence_date


class TaskService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.tasks = TaskRepository(session)

    async def create_task(self, user_id: uuid.UUID, payload: TaskCreateRequest) -> Task:
        fields = payload.model_dump(exclude={"recurrence_rule", "tag_ids"})
        # The API field is `list`; the ORM attribute is `task_list`.
        if "list" in fields:
            fields["task_list"] = fields.pop("list")
        if payload.recurrence_rule is None:
            task = await self.tasks.create_owned(user_id, **fields)
        else:
            # Recurring: create the template (hidden) + first occurrence.
            template = await self.tasks.create_owned(
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
            first_due = payload.due_date or date.today()
            task = await self.tasks.create_owned(
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
        return task

    async def _apply_tags(self, user_id: uuid.UUID, task: Task, tag_ids: list[uuid.UUID]) -> None:
        """Attach exactly `tag_ids` to `task`, dropping any id the caller
        doesn't own (see `TagService.resolve_owned_tag_ids`)."""
        owned_tags = await TagService(self.session).resolve_owned_tag_ids(user_id, tag_ids)
        await self.tasks.set_tags(task.id, [tag.id for tag in owned_tags])
        await self.session.refresh(task, attribute_names=["tags"])

    async def get_task(self, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
        task = await self.tasks.get_owned(task_id, user_id)
        if task is None:
            raise NotFoundError("Task not found")
        return task

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
        from app.utils.datetime import today_for_user
        from app.utils.enums import TaskList as TaskListEnum

        parsed_list = TaskListEnum(task_list) if task_list else None
        return await self.tasks.list_for_user(
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

    async def update_task(
        self, user_id: uuid.UUID, task_id: uuid.UUID, payload: TaskUpdateRequest
    ) -> Task:
        task = await self.get_task(user_id, task_id)
        changes = payload.model_dump(exclude_unset=True)
        tag_ids = changes.pop("tag_ids", None)
        if "list" in changes:
            changes["task_list"] = changes.pop("list")

        if task.recurrence_template_id is not None and "status" in changes:
            new_status = changes["status"]
            if new_status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
                await self._generate_next_occurrence(task)
        if "status" in changes and changes["status"] == TaskStatus.COMPLETED:
            task.completed_at = datetime.now(UTC)
        elif "status" in changes and changes["status"] != TaskStatus.COMPLETED:
            task.completed_at = None

        for key, value in changes.items():
            setattr(task, key, value)
        await self.session.flush()
        await self.session.refresh(task)
        if tag_ids is None:
            await self.session.refresh(task, attribute_names=["tags"])
        else:
            await self._apply_tags(user_id, task, tag_ids)
        return task

    async def delete_task(self, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
        deleted = await self.tasks.delete_owned(task_id, user_id)
        if not deleted:
            raise NotFoundError("Task not found")

    async def _generate_next_occurrence(self, occurrence: Task) -> None:
        """Generate the next occurrence when the current one completes/skips."""
        if occurrence.recurrence_template_id is None:
            return
        template = await self.tasks.get_template(occurrence.recurrence_template_id, occurrence.user_id)
        if (
            template is None
            or template.status == TaskStatus.CANCELLED
            or template.recurrence_rule is None
        ):
            return  # Recurrence ended (template deleted or cancelled).

        rule = RecurrenceRule.model_validate(template.recurrence_rule)
        base_date = occurrence.due_date or date.today()
        next_due = next_task_occurrence_date(
            frequency=rule.frequency,
            weekdays=rule.weekdays,
            from_date=base_date,
        )
        existing = await self.tasks.find_active_occurrence(template.id, occurrence.user_id)
        if existing is not None and existing.id != occurrence.id:
            return  # A future occurrence already exists - never duplicate.
        await self.tasks.create_owned(
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

    async def update_template(
        self, user_id: uuid.UUID, template_id: uuid.UUID, payload: TaskUpdateRequest
    ) -> Task:
        """Edit 'this and following occurrences' = edit the template row."""
        template = await self.tasks.get_template(template_id, user_id)
        if template is None:
            raise NotFoundError("Task not found")
        if (
            payload.recurrence_rule is not None
            and payload.recurrence_rule.frequency == RecurrenceFrequency.WEEKLY
            and not payload.recurrence_rule.weekdays
        ):
            raise ValidationError("Weekly recurrence requires at least one weekday")
        changes = payload.model_dump(exclude_unset=True, exclude={"status"})
        tag_ids = changes.pop("tag_ids", None)
        if "list" in changes:
            changes["task_list"] = changes.pop("list")
        for key, value in changes.items():
            setattr(template, key, value)
        await self.session.flush()
        await self.session.refresh(template)
        if tag_ids is None:
            await self.session.refresh(template, attribute_names=["tags"])
        else:
            await self._apply_tags(user_id, template, tag_ids)
        return template
