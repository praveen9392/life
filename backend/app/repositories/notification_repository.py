"""Notification repository - ownership-scoped."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.models.notification import Notification
from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> list[Notification]:
        query = (
            self._base_query(user_id)
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        if unread_only:
            query = query.where(Notification.is_read.is_(False))
        return list((await self.session.execute(query)).scalars().all())

    async def count_unread(self, user_id: uuid.UUID) -> int:
        query = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id, Notification.is_read.is_(False)
        )
        return int((await self.session.execute(query)).scalar_one())

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        rows = await self.list_for_user(user_id, unread_only=True, limit=1000)
        for notification in rows:
            notification.is_read = True
        await self.session.flush()
        return len(rows)

    async def create_notification(self, user_id: uuid.UUID, **fields: object) -> Notification:
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

    async def exists_recent(
        self, user_id: uuid.UUID, notification_type: object, since: object
    ) -> bool:
        """Dedup guard: has a notification of this type been created since `since`?"""
        query = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id,
            Notification.type == notification_type,
            Notification.created_at >= since,
        )
        return (await self.session.execute(query)).scalar_one() > 0
