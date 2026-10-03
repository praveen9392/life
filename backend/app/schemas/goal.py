"""Goal and milestone schemas."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import GoalProgressMode, GoalStatus


class GoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, max_length=100)
    target_date: date | None = None
    progress_mode: GoalProgressMode = GoalProgressMode.MANUAL


class GoalUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str | None = Field(default=None, max_length=100)
    target_date: date | None = None
    status: GoalStatus | None = None
    progress_mode: GoalProgressMode | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)


class MilestoneCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    target_date: date | None = None


class MilestoneUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    target_date: date | None = None
    is_completed: bool | None = None


class MilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    target_date: date | None
    is_completed: bool
    completed_at: datetime | None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    category: str | None
    target_date: date | None
    status: GoalStatus
    progress_mode: GoalProgressMode
    progress_percent: int
    milestones: list[MilestoneResponse]
    created_at: datetime
