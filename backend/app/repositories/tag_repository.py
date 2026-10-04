"""Tag repository - ownership-scoped."""

import uuid

from app.models.tag import Tag
from app.repositories.base import BaseRepository


class TagRepository(BaseRepository[Tag]):
    model = Tag

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Tag]:
        query = self._base_query(user_id).order_by(Tag.name).offset(offset).limit(limit)
        return list((await self.session.execute(query)).scalars().all())

    async def list_owned_by_ids(self, user_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> list[Tag]:
        """The subset of `tag_ids` that actually belong to `user_id` (silently
        drops ids that don't exist or belong to someone else)."""
        if not tag_ids:
            return []
        query = self._base_query(user_id).where(Tag.id.in_(tag_ids))
        return list((await self.session.execute(query)).scalars().all())
