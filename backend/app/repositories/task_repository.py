"""Task repository - ownership-scoped, with recurrence-aware queries."""

import uuid
from datetime import date
from typing import Any, Literal

from sqlalchemy import Select, delete, or_, select
from sqlalchemy.orm import selectinload

from app.models.tag import TaskTag
from app.models.task import Task
from app.repositories.base import BaseRepository
from app.utils.enums import TaskList, TaskPriority, TaskStatus

TaskSortField = Literal["due_date", "created_at", "priority"]
SortOrder = Literal["asc", "desc"]


class TaskRepository(BaseRepository[Task]):
    model = Task

    def _base_query(self, user_id: uuid.UUID) -> Select:
        # Templates are never part of normal listings (see the recurrence design).
        return (
            super()
            ._base_query(user_id)
            .where(Task.is_recurring_template.is_(False))
            .options(selectinload(Task.tags))
        )

    def _order_by_clause(
        self, sort: TaskSortField | None, order: SortOrder
    ) -> tuple[Any, ...]:
        """The default fixed ordering is preserved when `sort` is omitted
        (backward compatible); otherwise the caller's field/direction wins,
        with undated tasks always sorted after dated ones."""
        if sort is None:
            # `due_date IS NULL` sorts true->last, so dated tasks come first.
            return (Task.due_date.is_(None), Task.due_date, Task.created_at.desc())
        descending = order == "desc"
        column: Any
        if sort == "due_date":
            column = Task.due_date.desc() if descending else Task.due_date.asc()
            return (Task.due_date.is_(None), column)
        if sort == "priority":
            column = Task.priority.desc() if descending else Task.priority.asc()
            return (column, Task.created_at.desc())
        column = Task.created_at.desc() if descending else Task.created_at.asc()
        return (column,)

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        status: TaskStatus | None = None,
        task_list: TaskList | None = None,
        due_before: date | None = None,
        due_on: date | None = None,
        due_from: date | None = None,
        search: str | None = None,
        overdue_before: date | None = None,
        priority: TaskPriority | None = None,
        offset: int = 0,
        limit: int = 20,
        sort: TaskSortField | None = None,
        order: SortOrder = "desc",
    ) -> tuple[list[Task], int]:
        query = self._base_query(user_id)
        if status is not None:
            query = query.where(Task.status == status)
        if task_list is not None:
            query = query.where(Task.task_list == task_list)
        if priority is not None:
            query = query.where(Task.priority == priority)
        if search:
            pattern = f"%{search}%"
            query = query.where(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
        if overdue_before is not None:
            # "Overdue" is derived, not a stored status: unfinished work whose
            # due date has passed (the caller passes the user-local today).
            query = query.where(
                Task.due_date.is_not(None),
                Task.due_date < overdue_before,
                Task.status.in_([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]),
            )
        if due_on is not None:
            query = query.where(Task.due_date == due_on)
        else:
            if due_from is not None:
                query = query.where(Task.due_date.is_not(None), Task.due_date >= due_from)
            if due_before is not None:
                query = query.where(Task.due_date.is_not(None), Task.due_date <= due_before)
        query = query.order_by(*self._order_by_clause(sort, order))

        from sqlalchemy import func

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total

    async def set_tags(self, task_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> None:
        """Replace a task's tag associations with exactly `tag_ids`."""
        await self.session.execute(delete(TaskTag).where(TaskTag.task_id == task_id))
        for tag_id in tag_ids:
            self.session.add(TaskTag(task_id=task_id, tag_id=tag_id))
        await self.session.flush()

    async def list_overdue(self, user_id: uuid.UUID, today: date, *, limit: int = 20) -> list[Task]:
        query = (
            self._base_query(user_id)
            .where(
                Task.due_date.is_not(None),
                Task.due_date < today,
                Task.status.in_([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]),
            )
            .order_by(Task.due_date)
            .limit(limit)
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_template(self, template_id: uuid.UUID, user_id: uuid.UUID) -> Task | None:
        query = (
            select(Task)
            .where(
                Task.id == template_id,
                Task.user_id == user_id,
                Task.is_recurring_template.is_(True),
                Task.deleted_at.is_(None),
            )
            .options(selectinload(Task.tags))
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def find_active_occurrence(self, template_id: uuid.UUID, user_id: uuid.UUID) -> Task | None:
        query = (
            self._base_query(user_id)
            .where(
                Task.recurrence_template_id == template_id,
                Task.status.in_([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]),
            )
            .limit(1)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def count_completed_between(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> int:
        from sqlalchemy import func

        # Completed-today is computed from completed_at's user-local date in the
        # service layer; this helper counts completions recorded in a date range
        # by due_date for rate calculations (tasks without a due_date have no
        # date to bucket them into, so they are correctly excluded here - see
        # the `due_date` range filter below, which is the sole date predicate).
        query = select(func.count()).select_from(Task).where(
            Task.user_id == user_id,
            Task.is_recurring_template.is_(False),
            Task.status == TaskStatus.COMPLETED,
            Task.completed_at.is_not(None),
            Task.due_date >= start,
            Task.due_date <= end,
        )
        return (await self.session.execute(query)).scalar_one()

    async def count_due_between(self, user_id: uuid.UUID, start: date, end: date) -> int:
        from sqlalchemy import func

        query = select(func.count()).select_from(Task).where(
            Task.user_id == user_id,
            Task.is_recurring_template.is_(False),
            Task.due_date >= start,
            Task.due_date <= end,
        )
        return (await self.session.execute(query)).scalar_one()
