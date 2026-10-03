"""Note business logic."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.note import Note
from app.repositories.note_repository import NoteRepository, NoteSortField, SortOrder
from app.schemas.note import NoteCreateRequest, NoteUpdateRequest
from app.services.tag_service import TagService


class NoteService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.notes = NoteRepository(session)

    async def create_note(self, user_id: uuid.UUID, payload: NoteCreateRequest) -> Note:
        fields = payload.model_dump(exclude={"tag_ids"})
        note = await self.notes.create_owned(user_id, **fields)
        # Always resolve tags (empty list when none were sent) so the `tags`
        # relationship is loaded before serialization - lazy-loading it in
        # async context raises MissingGreenlet (see AGENTS.md learnings).
        await self._apply_tags(user_id, note, payload.tag_ids or [])
        return note

    async def _apply_tags(self, user_id: uuid.UUID, note: Note, tag_ids: list[uuid.UUID]) -> None:
        """Attach exactly `tag_ids` to `note`, dropping any id the caller
        doesn't own (see `TagService.resolve_owned_tag_ids`)."""
        owned_tags = await TagService(self.session).resolve_owned_tag_ids(user_id, tag_ids)
        await self.notes.set_tags(note.id, [tag.id for tag in owned_tags])
        await self.session.refresh(note, attribute_names=["tags"])

    async def get_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> Note:
        note = await self.notes.get_owned(note_id, user_id)
        if note is None:
            raise NotFoundError("Note not found")
        return note

    async def list_notes(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None,
        offset: int,
        limit: int,
        sort: NoteSortField | None = None,
        order: SortOrder = "desc",
    ) -> tuple[list[Note], int]:
        return await self.notes.list_for_user(
            user_id, search=search, offset=offset, limit=limit, sort=sort, order=order
        )

    async def update_note(
        self, user_id: uuid.UUID, note_id: uuid.UUID, payload: NoteUpdateRequest
    ) -> Note:
        note = await self.get_note(user_id, note_id)
        changes = payload.model_dump(exclude_unset=True)
        tag_ids = changes.pop("tag_ids", None)
        for key, value in changes.items():
            setattr(note, key, value)
        await self.session.flush()
        await self.session.refresh(note)
        if tag_ids is None:
            await self.session.refresh(note, attribute_names=["tags"])
        else:
            await self._apply_tags(user_id, note, tag_ids)
        return note

    async def delete_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> None:
        deleted = await self.notes.delete_owned(note_id, user_id)
        if not deleted:
            raise NotFoundError("Note not found")
