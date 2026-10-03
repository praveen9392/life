"""Global search and notification schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.utils.enums import NotificationType


class SearchResultItem(BaseModel):
    entity_type: str  # task | note | habit | goal | learning_item | course
    id: uuid.UUID
    title: str
    snippet: str | None = None


class SearchResponse(BaseModel):
    query: str
    results: dict[str, list[SearchResultItem]]
    total: int


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: NotificationType
    title: str
    body: str | None
    related_entity_type: str | None
    related_entity_id: uuid.UUID | None
    is_read: bool
    created_at: datetime
