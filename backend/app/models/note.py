"""Notes (markdown content) with full-text search support."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Computed, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, SoftDeleteMixin, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from app.models.tag import Tag


class Note(UUIDPkMixin, TimestampMixin, SoftDeleteMixin, OwnedMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_notes_user_id_directory_id", "user_id", "directory_id"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str | None] = mapped_column(String(100))
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Plain FK column (no ORM relationship): the owning folder is resolved
    # with a single query when needed, so there is no eager-loading concern.
    # NULL = unfiled; the folder's hard delete nulls this via ON DELETE SET NULL.
    directory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("note_directories.id", ondelete="SET NULL"), nullable=True
    )

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))", persisted=True),
        nullable=True,
    )

    tags: Mapped[list["Tag"]] = relationship(
        secondary="note_tags", primaryjoin="Note.id==NoteTag.note_id", secondaryjoin="Tag.id==NoteTag.tag_id"
    )
