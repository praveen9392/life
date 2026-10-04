"""Global search and notification schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

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


class NotificationListResponse(BaseModel):
    """The `/notifications` payload: one page plus the live unread count."""

    items: list[NotificationResponse]
    unread_count: int


class AccountDeleteRequest(BaseModel):
    """Re-auth proof required before irreversible account deletion - a
    stolen session cookie alone must not be able to wipe an account."""

    current_password: str = Field(min_length=1)
