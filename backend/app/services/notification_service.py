"""Notification service: in-app notifications plus lazy on-demand generation.

Architecture (see ARCHITECTURE.md "Notification Architecture"): a dedicated
service owns notification creation so a background scheduler can later call
`generate_due_notifications` on a cron without touching the API layer. For
now the API calls it lazily on read, which keeps the notification tray
useful with zero infrastructure.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.notification import Notification
from app.repositories.notification_repository import NotificationRepository
from app.repositories.task_repository import TaskRepository
from app.utils.datetime import today_for_user
from app.utils.enums import NotificationType

_DEDUP_WINDOW = timedelta(hours=20)


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.notifications = NotificationRepository(session)
        self.tasks = TaskRepository(session)

    async def list_for_user(
        self,
        user_id: uuid.UUID,
        *,
        unread_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[Notification], int]:
        notifications = await self.notifications.list_for_user(
            user_id, unread_only=unread_only, offset=offset, limit=limit
        )
        unread_count = await self.notifications.count_unread(user_id)
        return notifications, unread_count

    async def mark_read(self, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification:
        notification = await self.notifications.get_owned(notification_id, user_id)
        if notification is None:
            raise NotFoundError("Notification not found")
        notification.is_read = True
        await self.session.flush()
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        return await self.notifications.mark_all_read(user_id)

    async def generate_due_notifications(
        self, user_id: uuid.UUID, user_timezone: str
    ) -> list[Notification]:
        """Create task-due-soon reminders, deduplicated per window.

        Called lazily on notification reads today; designed to be invoked
        from a future cron/worker without changes.
        """
        today = today_for_user(user_timezone)
        upcoming, _ = await self.tasks.list_for_user(
            user_id,
            status=None,
            task_list=None,
            due_before=today + timedelta(days=1),
            limit=50,
        )
        due = [
            task
            for task in upcoming
            if task.due_date is not None
            and task.due_date <= today + timedelta(days=1)
            and task.status.value in ("pending", "in_progress")
        ]
        if not due:
            return []

        created: list[Notification] = []
        if await self.notifications.exists_recent(
            user_id, NotificationType.TASK_DUE_SOON, datetime.now(UTC) - _DEDUP_WINDOW
        ):
            return created

        overdue_count = sum(1 for task in due if task.due_date is not None and task.due_date < today)
        due_soon_count = len(due) - overdue_count
        parts = []
        if overdue_count:
            parts.append(f"{overdue_count} overdue")
        if due_soon_count:
            parts.append(f"{due_soon_count} due soon")
        notification = await self.notifications.create_notification(
            user_id,
            type=NotificationType.TASK_DUE_SOON,
            title="Tasks need attention",
            body=f"You have {', '.join(parts)} task{'s' if len(due) != 1 else ''}.",
            related_entity_type="task",
        )
        created.append(notification)
        return created
