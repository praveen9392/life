"""Learning schemas: learning items, course tree, study sessions."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import CourseStatus, LearningItemStatus, LearningItemType, LessonStatus


class LearningItemCreateRequest(BaseModel):
    type: LearningItemType
    title: str = Field(min_length=1, max_length=200)


class LearningItemUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: LearningItemStatus | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)


class LearningItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: LearningItemType
    title: str
    status: LearningItemStatus
    progress_percent: int
    created_at: datetime


class CourseCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    provider: str | None = Field(default=None, max_length=150)
    start_date: date | None = None
    target_date: date | None = None


class CourseUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    provider: str | None = Field(default=None, max_length=150)
    status: CourseStatus | None = None
    start_date: date | None = None
    target_date: date | None = None


class CourseModuleCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    position: int = Field(default=0, ge=0)


class CourseLessonCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    position: int = Field(default=0, ge=0)
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60)


class CourseLessonUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: LessonStatus | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60)


class LessonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    position: int
    status: LessonStatus
    duration_minutes: int | None
    completed_at: datetime | None


class ModuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    position: int
    lessons: list[LessonResponse]


class CourseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    provider: str | None
    start_date: date | None
    target_date: date | None
    status: CourseStatus
    progress_percent: int  # computed: completed lessons / total lessons
    created_at: datetime


class CourseDetailResponse(CourseResponse):
    modules: list[ModuleResponse]


class LearningSessionCreateRequest(BaseModel):
    course_id: uuid.UUID | None = None
    learning_item_id: uuid.UUID | None = None
    topic: str | None = Field(default=None, max_length=200)
    duration_minutes: int = Field(gt=0, le=24 * 60)
    session_date: date
    notes: str | None = Field(default=None, max_length=5000)


class LearningSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_id: uuid.UUID | None
    learning_item_id: uuid.UUID | None
    topic: str | None
    duration_minutes: int
    session_date: date
    notes: str | None
    created_at: datetime
