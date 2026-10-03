"""Task schemas. Create/update schemas are explicit whitelists (mass
assignment safe); recurrence rules are a discriminated shape, not a free dict.

Several models below have a field literally named `list` (the API contract).
That field name shadows the `list` builtin inside the class body, so any
list-typed annotation or `default_factory=list` in the same class must go
through the module-level aliases defined just below (see AGENTS.md
"don't name a column `list`").
"""

import uuid
from datetime import date, datetime, time

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

from app.schemas.tag import TagResponse
from app.utils.enums import RecurrenceFrequency, TaskList, TaskPriority, TaskStatus

# Module-level aliases: `list` is the builtin here (class-body shadowing
# doesn't apply at module scope), so these stay safe to use inside classes
# that own a field named `list`.
TagIdList = list[uuid.UUID]
TagResponses = list[TagResponse]


def _no_tags() -> TagResponses:
    return []


class RecurrenceRule(BaseModel):
    """Validated recurrence shape (see ARCHITECTURE.md "Recurring Tasks")."""

    frequency: RecurrenceFrequency
    weekdays: list[int] | None = Field(default=None, min_length=0, max_length=7)

    @model_validator(mode="after")
    def _validate_weekdays(self) -> "RecurrenceRule":
        if self.weekdays is not None:
            if any(day < 0 or day > 6 for day in self.weekdays):
                raise ValueError("weekdays must be integers 0 (Monday) through 6 (Sunday)")
            if self.frequency != RecurrenceFrequency.WEEKLY:
                raise ValueError("weekdays is only valid for weekly recurrence")
        return self


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: TaskPriority = TaskPriority.MEDIUM
    list: TaskList = TaskList.LATER
    due_date: date | None = None
    due_time: time | None = None
    estimated_duration_minutes: int | None = Field(default=None, gt=0, le=24 * 60)
    recurrence_rule: RecurrenceRule | None = None
    # Ownership of each id is validated server-side (see `TagService`);
    # ids that don't belong to the caller are silently dropped, not 404'd
    # (don't leak existence of other users' tags).
    tag_ids: TagIdList | None = None


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    list: TaskList | None = None
    due_date: date | None = None
    due_time: time | None = None
    estimated_duration_minutes: int | None = Field(default=None, gt=0, le=24 * 60)
    # Present on both create/update (templates included) - see
    # `TaskService.update_template`'s regression test for why this needs to
    # actually exist on this schema (it previously didn't, which crashed
    # `PATCH /tasks/templates/{id}` with an AttributeError any time it ran).
    recurrence_rule: RecurrenceRule | None = None
    # Omit entirely to leave tags untouched; pass `[]` to clear all tags.
    tag_ids: TagIdList | None = None


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    priority: TaskPriority
    status: TaskStatus
    # The ORM attribute is `task_list` (the db column is `list`); validate
    # from either, serialize as `list` for the API contract.
    list: TaskList = Field(validation_alias=AliasChoices("task_list", "list"))
    due_date: date | None
    due_time: time | None
    estimated_duration_minutes: int | None
    is_recurring_template: bool
    recurrence_rule: dict | None
    recurrence_template_id: uuid.UUID | None
    completed_at: datetime | None
    tags: TagResponses = Field(default_factory=_no_tags)
    created_at: datetime
    updated_at: datetime
