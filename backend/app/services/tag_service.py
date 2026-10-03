"""Tag business logic: a small, shared label catalog reused by tasks/notes."""

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError
from app.models.tag import Tag
from app.repositories.tag_repository import TagRepository
from app.schemas.tag import TagCreateRequest


class TagService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.tags = TagRepository(session)

    async def list_tags(self, user_id: uuid.UUID) -> list[Tag]:
        return await self.tags.list_for_user(user_id)

    async def create_tag(self, user_id: uuid.UUID, payload: TagCreateRequest) -> Tag:
        """Create a tag, surfacing the `uq_tags_user_name` unique constraint
        as a 409 CONFLICT rather than a raw database error."""
        tag = Tag(user_id=user_id, name=payload.name.strip())
        self.session.add(tag)
        try:
            # A SAVEPOINT scopes the rollback to just this insert, so a
            # duplicate name doesn't abort the rest of the caller's request
            # transaction (e.g. when creating a task alongside a new tag).
            async with self.session.begin_nested():
                await self.session.flush()
        except IntegrityError as exc:
            raise ConflictError("A tag with this name already exists") from exc
        return tag

    async def resolve_owned_tag_ids(
        self, user_id: uuid.UUID, tag_ids: list[uuid.UUID] | None
    ) -> list[Tag]:
        """Validate that each id belongs to `user_id`; ids that don't (either
        nonexistent or owned by someone else) are silently dropped rather
        than raising, matching the "don't leak existence" pattern used
        elsewhere (see ARCHITECTURE.md)."""
        if not tag_ids:
            return []
        return await self.tags.list_owned_by_ids(user_id, tag_ids)
