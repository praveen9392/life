"""Health metric schemas. Values are user-recorded numbers only - the
platform stores them verbatim and never interprets them medically."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.utils.enums import HealthMetricType


class HealthMetricCreateRequest(BaseModel):
    metric_type: HealthMetricType
    value: float = Field(gt=0, le=1_000_000)
    unit: str = Field(min_length=1, max_length=20)
    recorded_at: datetime | None = None  # defaults to now (UTC) server-side
    note: str | None = Field(default=None, max_length=2000)


class HealthMetricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    metric_type: HealthMetricType
    value: float
    unit: str
    recorded_at: datetime
    note: str | None
    created_at: datetime
