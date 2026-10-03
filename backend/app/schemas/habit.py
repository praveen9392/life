"""Habit schemas."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.utils.enums import HabitFrequencyType, HabitLogStatus


class HabitFrequencyConfig(BaseModel):
    """Validated frequency_config shape (the one justified JSONB use)."""

    weekdays: list[int] | None = Field(default=None)
    every_n_days: int | None = Field(default=None, gt=0, le=365)

    @model_validator(mode="after")
    def _validate(self) -> "HabitFrequencyConfig":
        if self.weekdays is not None and (
            not self.weekdays or any(day < 0 or day > 6 for day in self.weekdays)
        ):
            raise ValueError("weekdays must be a non-empty list of 0 (Monday) through 6 (Sunday)")
        return self


class HabitCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=100)
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=20)
    frequency_type: HabitFrequencyType = HabitFrequencyType.DAILY
    frequency_config: HabitFrequencyConfig = Field(default_factory=HabitFrequencyConfig)
    target_count: int = Field(default=1, ge=1, le=50)
    start_date: date
    end_date: date | None = None
    reminder_time: time | None = None

    @model_validator(mode="after")
    def _validate_dates(self) -> "HabitCreateRequest":
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


class HabitUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    category: str | None = Field(default=None, max_length=100)
    icon: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=20)
    frequency_type: HabitFrequencyType | None = None
    frequency_config: HabitFrequencyConfig | None = None
    target_count: int | None = Field(default=None, ge=1, le=50)
    end_date: date | None = None
    reminder_time: time | None = None
    is_active: bool | None = None


class HabitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    category: str | None
    icon: str | None
    color: str | None
    frequency_type: HabitFrequencyType
    frequency_config: dict
    target_count: int
    start_date: date
    end_date: date | None
    reminder_time: time | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HabitLogRequest(BaseModel):
    """Upsert a habit log for one day (in the user's timezone)."""

    status: HabitLogStatus
    note: str | None = Field(default=None, max_length=2000)


class HabitLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    habit_id: uuid.UUID
    log_date: date
    status: HabitLogStatus
    note: str | None
