"""Tag schemas - a small, shared label catalog reused by tasks and notes."""

import uuid

from pydantic import BaseModel, ConfigDict, Field


class TagCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class TagResponse(BaseModel):
    """`Tag` has no `created_at`/`updated_at` (no `TimestampMixin`) - it's a
    minimal label row, not an audited entity."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
