"""Note repository - ownership-scoped."""

import uuid
from typing import Any, Literal

from sqlalchemy import Select, delete, func, select, update
from sqlalchemy.orm import selectinload

from app.models.note import Note
from app.models.tag import NoteTag
from app.repositories.base import BaseRepository
from app.utils.sql import escape_like

NoteSortField = Literal["created_at", "updated_at", "title"]
SortOrder = Literal["asc", "desc"]


class NoteRepository(BaseRepository[Note]):
    model = Note

    def _base_query(self, user_id: uuid.UUID) -> Select:
        # Archived notes are excluded from the default listing (still reachable
        # via an explicit filter in the service layer if ever needed).
        return (
            super()
            ._base_query(user_id)
            .where(Note.is_archived.is_(False))
            .options(selectinload(Note.tags))
        )

    def _order_by_clause(self, sort: NoteSortField | None, order: SortOrder) -> tuple[Any, ...]:
        """Pinned notes always sort first; the default (no `sort`) ordering is
        pinned-first/updated-at, and explicit sorts keep the pinned prefix."""
        pinned_first = (Note.is_pinned.desc(),)
        if sort is None:
            return pinned_first + (Note.updated_at.desc(),)
        descending = order == "desc"
        column: Any = {
            "created_at": Note.created_at,
            "updated_at": Note.updated_at,
            "title": Note.title,
        }[sort]
        return pinned_first + (column.desc() if descending else column.asc(),)

    async def list_for_user_query(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None = None,
        offset: int = 0,
        limit: int = 20,
        sort: NoteSortField | None = None,
        order: SortOrder = "desc",
        directory_id: uuid.UUID | None = None,
        unfiled_only: bool = False,
    ) -> tuple[list[Note], int]:
        """Return (page, total) of the user's non-archived notes with tags, pinned first,
        filtered by title search / directory (or unfiled) and sorted per `sort`/`order`.
        """
        query = self._base_query(user_id)
        if search:
            query = query.where(Note.title.ilike(f"%{escape_like(search)}%", escape="\\"))
        if directory_id is not None:
            query = query.where(Note.directory_id == directory_id)
        elif unfiled_only:
            query = query.where(Note.directory_id.is_(None))
        query = query.order_by(*self._order_by_clause(sort, order))

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total

    async def move_notes_query(
        self, user_id: uuid.UUID, note_ids: list[uuid.UUID], directory_id: uuid.UUID | None
    ) -> int:
        """Move the owned, non-deleted notes in `note_ids` into `directory_id` (None = unfiled),
        returning how many were moved; foreign/missing ids are silently dropped by the
        ownership-scoped UPDATE."""
        result = await self.session.execute(
            update(Note)
            .where(
                Note.id.in_(note_ids),
                Note.user_id == user_id,
                Note.deleted_at.is_(None),
            )
            .values(directory_id=directory_id)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount

    async def count_recent_query(self, user_id: uuid.UUID, *, limit: int = 5) -> int:
        """Count how many of the user's `limit` most recent notes are non-archived (dashboard tile)."""
        query = select(func.count()).select_from(self._base_query(user_id).limit(limit).subquery())
        query_result = await self.session.execute(query)
        scalar_value = query_result.scalar_one()
        return scalar_value

    async def set_tags_query(self, note_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> None:
        """Replace a note's tag associations with exactly `tag_ids`."""
        await self.session.execute(delete(NoteTag).where(NoteTag.note_id == note_id))
        for tag_id in tag_ids:
            self.session.add(NoteTag(note_id=note_id, tag_id=tag_id))
        await self.session.flush()
