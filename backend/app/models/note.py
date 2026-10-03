"""Notes (markdown content) with full-text search support."""

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Computed, Index, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, SoftDeleteMixin, TimestampMixin, UUIDPkMixin

if TYPE_CHECKING:
    from app.models.tag import Tag


class Note(UUIDPkMixin, TimestampMixin, SoftDeleteMixin, OwnedMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_search_vector", "search_vector", postgresql_using="gin"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str | None] = mapped_column(String(100))
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))", persisted=True),
        nullable=True,
    )

    tags: Mapped[list["Tag"]] = relationship(
        secondary="note_tags", primaryjoin="Note.id==NoteTag.note_id", secondaryjoin="Tag.id==NoteTag.tag_id"
    )
