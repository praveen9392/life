"""Note schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.tag import TagResponse


class NoteCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=100_000)
    category: str | None = Field(default=None, max_length=100)
    is_pinned: bool = False
    # Ownership of the folder is validated server-side (see `NoteService`);
    # a foreign/nonexistent folder id 404s rather than being silently dropped.
    directory_id: uuid.UUID | None = None
    # Ownership of each id is validated server-side (see `TagService`); ids
    # that don't belong to the caller are silently dropped, not 404'd.
    tag_ids: list[uuid.UUID] | None = None


class NoteUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=100_000)
    category: str | None = Field(default=None, max_length=100)
    is_pinned: bool | None = None
    is_archived: bool | None = None
    # Omit to leave the note's folder untouched; pass `null` to move it to
    # unfiled. Ownership of a non-null id is validated server-side.
    directory_id: uuid.UUID | None = None
    # Omit entirely to leave tags untouched; pass `[]` to clear all tags.
    tag_ids: list[uuid.UUID] | None = None


class NoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    content: str
    category: str | None
    is_pinned: bool
    is_archived: bool
    directory_id: uuid.UUID | None
    tags: list[TagResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
