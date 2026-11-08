"""Note directory schemas - flat folders for organizing notes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NoteDirectoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class NoteDirectoryUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class NoteDirectoryResponse(BaseModel):
    """`note_count` is derived (not an ORM column), so responses are built
    explicitly from (folder, count) pairs - `model_validate` on the bare ORM
    object would raise "field required" (see AGENTS.md learnings)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    note_count: int = 0
    created_at: datetime
    updated_at: datetime


class NoteDirectoryListResponse(BaseModel):
    items: list[NoteDirectoryResponse]
    unfiled_count: int
    total_count: int


class MoveNotesRequest(BaseModel):
    note_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class MoveNotesResponse(BaseModel):
    moved: int
