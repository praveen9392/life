"""In-app notifications (see ARCHITECTURE.md "Notification Architecture")."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OwnedMixin, UUIDPkMixin
from app.utils.enums import NotificationType


class Notification(UUIDPkMixin, OwnedMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_is_read", "user_id", "is_read"),
    )

    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type_enum"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    related_entity_type: Mapped[str | None] = mapped_column(String(50))
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # NOTE: `server_default=text("now()")` (a real SQL function call) rather
    # than the bare string `"now()"` - the latter is a known Postgres/
    # SQLAlchemy footgun where the quoted literal gets frozen as a constant
    # at DDL-execution time instead of being evaluated per-row. The already-
    # applied initial migration still has the broken bare-string form (fixing
    # it there is a DB-migration change out of scope here); the application
    # layer compensates by always setting `created_at` explicitly on insert
    # (see `NotificationRepository.create_notification`), so this column-level
    # default is effectively just a fresh-database/future-migration safety net.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
