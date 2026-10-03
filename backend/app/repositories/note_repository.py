"""Note repository - ownership-scoped."""

import uuid
from typing import Any, Literal

from sqlalchemy import Select, delete, func, select
from sqlalchemy.orm import selectinload

from app.models.note import Note
from app.models.tag import NoteTag
from app.repositories.base import BaseRepository

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
        """The default pinned-first ordering is preserved when `sort` is
        omitted (backward compatible)."""
        if sort is None:
            return (Note.is_pinned.desc(), Note.updated_at.desc())
        descending = order == "desc"
        column: Any = {
            "created_at": Note.created_at,
            "updated_at": Note.updated_at,
            "title": Note.title,
        }[sort]
        return (column.desc() if descending else column.asc(),)

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None = None,
        offset: int = 0,
        limit: int = 20,
        sort: NoteSortField | None = None,
        order: SortOrder = "desc",
    ) -> tuple[list[Note], int]:
        query = self._base_query(user_id)
        if search:
            query = query.where(Note.title.ilike(f"%{search}%"))
        query = query.order_by(*self._order_by_clause(sort, order))

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total

    async def count_recent(self, user_id: uuid.UUID, *, limit: int = 5) -> int:
        query = select(func.count()).select_from(self._base_query(user_id).limit(limit).subquery())
        return (await self.session.execute(query)).scalar_one()

    async def set_tags(self, note_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> None:
        """Replace a note's tag associations with exactly `tag_ids`."""
        await self.session.execute(delete(NoteTag).where(NoteTag.note_id == note_id))
        for tag_id in tag_ids:
            self.session.add(NoteTag(note_id=note_id, tag_id=tag_id))
        await self.session.flush()
