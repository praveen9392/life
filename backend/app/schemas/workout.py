"""Workout schemas: exercises (shared catalog + user-created), workouts,
sessions, and the sets inside a session."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExerciseCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    muscle_group: str | None = Field(default=None, max_length=100)
    equipment: str | None = Field(default=None, max_length=100)


class ExerciseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None  # NULL = shared catalog entry
    name: str
    muscle_group: str | None
    equipment: str | None


class WorkoutCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)


class WorkoutUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)


class WorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime


class WorkoutSetInput(BaseModel):
    exercise_id: uuid.UUID
    set_number: int = Field(ge=1, le=100)
    reps: int | None = Field(default=None, ge=1, le=10_000)
    weight: float | None = Field(default=None, ge=0, le=10_000)
    weight_unit: str | None = Field(default=None, max_length=10)
    duration_seconds: int | None = Field(default=None, ge=0, le=24 * 3600)


class WorkoutSetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    exercise_id: uuid.UUID
    set_number: int
    reps: int | None
    weight: float | None
    weight_unit: str | None
    duration_seconds: int | None


class WorkoutSessionCreateRequest(BaseModel):
    workout_id: uuid.UUID | None = None
    performed_at: datetime | None = None  # defaults to now (UTC) server-side
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    notes: str | None = Field(default=None, max_length=5000)
    sets: list[WorkoutSetInput] = Field(default_factory=list, max_length=500)


class WorkoutSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workout_id: uuid.UUID | None
    performed_at: datetime
    duration_minutes: int | None
    notes: str | None
    sets: list[WorkoutSetResponse]
    created_at: datetime
