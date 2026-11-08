"""Tag repository - ownership-scoped."""

import uuid

from app.models.tag import Tag
from app.repositories.base import BaseRepository


class TagRepository(BaseRepository[Tag]):
    model = Tag

    async def list_for_user_query(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Tag]:
        """List the user's tags alphabetically, as one page."""
        query = self._base_query(user_id).order_by(Tag.name).offset(offset).limit(limit)
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def list_owned_by_ids_query(self, user_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> list[Tag]:
        """Return the subset of `tag_ids` that actually belong to `user_id` (silently drops
        ids that don't exist or belong to someone else)."""
        if not tag_ids:
            return []
        query = self._base_query(user_id).where(Tag.id.in_(tag_ids))
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)
