"""Note directories - flat folders for organizing notes.

A directory is a lightweight, hard-deleted container: deleting a folder
soft-deletes (trashes) the notes it contained (see
`NoteDirectoryService.delete_directory`) rather than deleting them outright.
"""

from sqlalchemy import String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin


class NoteDirectory(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "note_directories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_note_directories_user_id_name"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
