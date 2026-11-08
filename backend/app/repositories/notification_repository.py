"""Notification repository - ownership-scoped."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update

from app.models.notification import Notification
from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    async def list_for_user_query(
        self,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Notification]:
        """List the user's notifications, newest first, optionally unread-only, as one page."""
        query = (
            self._base_query(user_id)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if unread_only:
            query = query.where(Notification.is_read.is_(False))
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def count_unread_query(self, user_id: uuid.UUID) -> int:
        """Count the user's unread notifications (badge count)."""
        query = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
        query_result = await self.session.execute(query)
        total_count = query_result.scalar_one()
        return int(total_count)

    async def mark_all_read_query(self, user_id: uuid.UUID) -> int:
        """Mark every unread notification read in one UPDATE, returning how many changed."""
        # One UPDATE covers every unread row - paging SELECTs + ORM writes
        # would need N round-trips and could still race new inserts.
        result = await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
        return result.rowcount

    async def create_notification_query(self, user_id: uuid.UUID, **fields: object) -> Notification:
        """Insert a notification with an explicit live `created_at` (the column's frozen
        server default is unreliable - see the comment below).
        """
        # `created_at` is set explicitly here rather than relying on the
        # column's DB `server_default` - see ARCHITECTURE.md / AGENTS.md:
        # the initial migration defines that default as the bare string
        # `'now()'` (not `sa.text('now()')`), which Postgres bakes in as a
        # FROZEN literal timestamp captured once at migration-apply time,
        # not a live per-row function call. Every row that relied on that
        # default therefore got the exact same (increasingly stale)
        # `created_at`, which silently broke the notification dedup window
        # check in `NotificationService.generate_due_notifications` (it
        # compares `created_at` against `now() - 20h`, which was never true
        # once real time moved more than 20h past the frozen default).
        # Setting it explicitly here is correct independent of that DB-level
        # bug and needs no migration change.
        notification = Notification(user_id=user_id, created_at=datetime.now(UTC), **fields)
        self.session.add(notification)
        await self.session.flush()
        return notification

    async def exists_recent_query(
        self, user_id: uuid.UUID, notification_type: object, since: object
    ) -> bool:
        """Dedup guard: has a notification of this type been created since `since`?"""
        query = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.type == notification_type,
            Notification.created_at >= since,
        )
        query_result = await self.session.execute(query)
        scalar_value = query_result.scalar_one()
        return scalar_value > 0
