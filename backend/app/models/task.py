"""Tasks, including the template+generated-occurrence recurrence design.

See ARCHITECTURE.md "Recurring Tasks & Habits": a recurring task is a
template row (`is_recurring_template=True`) with a `recurrence_rule`; at most
one generated occurrence (`recurrence_template_id` pointing back) exists at a
time. Editing the template affects future generations; editing a generated
occurrence affects only that row.
"""

import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Computed,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, SoftDeleteMixin, TimestampMixin, UUIDPkMixin
from app.utils.enums import TaskList, TaskPriority, TaskStatus

if TYPE_CHECKING:
    from app.models.tag import Tag


class Task(UUIDPkMixin, TimestampMixin, SoftDeleteMixin, OwnedMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_tasks_user_status_due_date", "user_id", "status", "due_date"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority_enum"), nullable=False, default=TaskPriority.MEDIUM
    )
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status_enum"), nullable=False, default=TaskStatus.PENDING
    )
    # Python attribute is `task_list` (bare `list` would shadow the builtin
    # within this class body, breaking the `list[...]` generic used below);
    # the underlying database column is still named `list` per the schema.
    task_list: Mapped[TaskList] = mapped_column(
        "list", Enum(TaskList, name="task_list_enum"), nullable=False, default=TaskList.LATER
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    due_time: Mapped[time | None] = mapped_column(Time)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer)

    is_recurring_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recurrence_rule: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    recurrence_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))", persisted=True),
        nullable=True,
    )

    tags: Mapped[list["Tag"]] = relationship(
        secondary="task_tags", primaryjoin="Task.id==TaskTag.task_id", secondaryjoin="Tag.id==TaskTag.tag_id"
    )
