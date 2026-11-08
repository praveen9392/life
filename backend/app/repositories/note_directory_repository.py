"""Note directory repository - ownership-scoped."""

import uuid

from sqlalchemy import and_, func, select

from app.models.note import Note
from app.models.note_directory import NoteDirectory
from app.repositories.base import BaseRepository


class NoteDirectoryRepository(BaseRepository[NoteDirectory]):
    model = NoteDirectory

    async def list_with_counts_query(
        self, user_id: uuid.UUID
    ) -> tuple[list[tuple[NoteDirectory, int]], int, int]:
        """Every owned folder paired with its live note count, plus the user's unfiled and
        total note counts; the note-side filters live in the ON clause so empty folders
        still appear (a WHERE would turn the outer join into an inner one).
        """
        query = (
            select(NoteDirectory, func.count(Note.id).label("note_count"))
            .outerjoin(
                Note,
                and_(
                    Note.directory_id == NoteDirectory.id,
                    Note.user_id == user_id,
                    Note.deleted_at.is_(None),
                    Note.is_archived.is_(False),
                ),
            )
            .where(NoteDirectory.user_id == user_id)
            .group_by(NoteDirectory.id)
            .order_by(NoteDirectory.name)
        )
        rows = (await self.session.execute(query)).all()
        folders_with_counts = [(row[0], row[1]) for row in rows]

        unfiled_count = (
            await self.session.execute(
                select(func.count())
                .select_from(Note)
                .where(
                    Note.user_id == user_id,
                    Note.deleted_at.is_(None),
                    Note.is_archived.is_(False),
                    Note.directory_id.is_(None),
                )
            )
        ).scalar_one()
        total_count = (
            await self.session.execute(
                select(func.count())
                .select_from(Note)
                .where(
                    Note.user_id == user_id,
                    Note.deleted_at.is_(None),
                    Note.is_archived.is_(False),
                )
            )
        ).scalar_one()
        return folders_with_counts, unfiled_count, total_count

    async def count_notes_query(self, user_id: uuid.UUID, directory_id: uuid.UUID) -> int:
        """Live (non-deleted, non-archived) note count for one owned folder - used to rebuild
        that folder's response after a rename."""
        query = select(func.count()).select_from(Note).where(
            Note.directory_id == directory_id,
            Note.user_id == user_id,
            Note.deleted_at.is_(None),
            Note.is_archived.is_(False),
        )
        query_result = await self.session.execute(query)
        scalar_value = query_result.scalar_one()
        return scalar_value
