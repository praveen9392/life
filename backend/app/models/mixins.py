"""Reusable declarative mixins shared by every model.

`OwnedMixin` is the structural piece that makes the ownership-enforcement
pattern possible: every owned table gets a NOT NULL, indexed, cascading
`user_id` foreign key with zero copy-paste.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declared_attr, mapped_column


class UUIDPkMixin:
    """A UUID primary key generated server-side via pgcrypto's gen_random_uuid()."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class TimestampMixin:
    """created_at/updated_at timestamps, always UTC, server-managed."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=text("now()"),
        nullable=False,
    )


class SoftDeleteMixin:
    """A nullable deleted_at column for user-facing trash/undo (not privacy deletion)."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OwnedMixin:
    """A required, cascading, indexed user_id foreign key for owned entities."""

    @declared_attr
    @classmethod
    def user_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
