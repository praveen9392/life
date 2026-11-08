"""Notification service: in-app notifications plus lazy on-demand generation.

Architecture (see ARCHITECTURE.md "Notification Architecture"): a dedicated
service owns notification creation so a background scheduler can later call
`generate_due_notifications` on a cron without touching the API layer. For
now the API calls it lazily on read, which keeps the notification tray
useful with zero infrastructure.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError
from app.core.logging import logger
from app.models.notification import Notification
from app.repositories.notification_repository import NotificationRepository
from app.repositories.task_repository import TaskRepository
from app.utils.datetime import today_for_user
from app.utils.enums import NotificationType, TaskStatus

_DEDUP_WINDOW = timedelta(hours=20)


class NotificationService:
    """In-app notification reads plus lazy due-task reminder generation."""

    def __init__(self, session: AsyncSession):
        """Wire the service (and its repositories) to the request's session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
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
        """List the user's notifications, paginated, with the unread count.

        Args:
            user_id: Owner of the notifications.
            unread_only: When True, return only unread notifications
                (default False).
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 50).

        Returns:
            tuple[list[Notification], int]: The notifications in the window
            and the total number of unread notifications.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting notification listing | user_id={user_id}")
            notifications = await self.notifications.list_for_user_query(
                user_id, unread_only=unread_only, offset=offset, limit=limit
            )
            unread_count = await self.notifications.count_unread_query(user_id)
            logger.info(f"Successfully retrieved {len(notifications)} notifications")
            return notifications, unread_count
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the notifications: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the notifications: {exc}")
            raise ServiceError("Unexpected error while listing the notifications") from exc

    async def mark_read(self, user_id: uuid.UUID, notification_id: uuid.UUID) -> Notification:
        """Mark one owned notification as read.

        Args:
            user_id: Owner the notification must belong to.
            notification_id: Primary key of the notification.

        Returns:
            Notification: The updated notification.

        Raises:
            NotFoundError: If the notification does not exist or belongs to
                another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting notification mark-read | user_id={user_id} notification_id={notification_id}")
            notification = await self.notifications.get_owned_query(notification_id, user_id)
            if notification is None:
                logger.warning(f"Notification not found with id: {notification_id}")
                raise NotFoundError("Notification not found")
            notification.is_read = True
            await self.session.flush()
            logger.info(f"Notification marked read | id={notification_id}")
            return notification
        except NotFoundError:
            logger.error(
                f"Marking notification read failed: not found | notification_id={notification_id} user_id={user_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while marking the notification read: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while marking the notification read: {exc}")
            raise ServiceError("Unexpected error while marking the notification read") from exc

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        """Mark every unread notification of the user as read.

        Args:
            user_id: Owner of the notifications.

        Returns:
            int: Number of notifications marked read.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting mark-all-read | user_id={user_id}")
            marked_count = await self.notifications.mark_all_read_query(user_id)
            logger.info(f"Marked {marked_count} notifications read for user {user_id}")
            return marked_count
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while marking all notifications read: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while marking all notifications read: {exc}")
            raise ServiceError("Unexpected error while marking all notifications read") from exc

    async def generate_due_notifications(
        self, user_id: uuid.UUID, user_timezone: str
    ) -> list[Notification]:
        """Create the task-due-soon reminder, deduplicated per window.

        Called lazily on notification reads today; designed to be invoked
        from a future cron/worker without changes.

        Args:
            user_id: Owner of the tasks and notification.
            user_timezone: IANA timezone used to resolve "today" for the
                due-date math.

        Returns:
            list[Notification]: The created notification, or an empty list
            when nothing is due or the dedup window suppresses it.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting due notification generation | user_id={user_id}")
            today = today_for_user(user_timezone)
            logger.debug(f"Fetching upcoming tasks | user_id={user_id}")
            upcoming, _ = await self.tasks.list_for_user_query(
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
                and task.status in (TaskStatus.PENDING, TaskStatus.IN_PROGRESS)
            ]
            if not due:
                logger.debug(f"No due tasks for user {user_id}; nothing to generate")
                return []

            created: list[Notification] = []
            logger.debug(f"Checking notification dedup window | user_id={user_id}")
            if await self.notifications.exists_recent_query(
                user_id, NotificationType.TASK_DUE_SOON, datetime.now(UTC) - _DEDUP_WINDOW
            ):
                logger.debug(
                    f"Notification suppressed by dedup window | "
                    f"type={NotificationType.TASK_DUE_SOON.value} user_id={user_id}"
                )
                return created

            overdue_count = sum(1 for task in due if task.due_date is not None and task.due_date < today)
            due_soon_count = len(due) - overdue_count
            parts = []
            if overdue_count:
                parts.append(f"{overdue_count} overdue")
            if due_soon_count:
                parts.append(f"{due_soon_count} due soon")
            logger.debug(
                f"Creating notification | type={NotificationType.TASK_DUE_SOON.value} user_id={user_id}"
            )
            notification = await self.notifications.create_notification_query(
                user_id,
                type=NotificationType.TASK_DUE_SOON,
                title="Tasks need attention",
                body=f"You have {', '.join(parts)} task{'s' if len(due) != 1 else ''}.",
                related_entity_type="task",
            )
            created.append(notification)
            logger.info(
                f"Notification created | type={NotificationType.TASK_DUE_SOON.value} user_id={user_id}"
            )
            return created
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while generating due notifications: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while generating due notifications: {exc}")
            raise ServiceError("Unexpected error while generating due notifications") from exc
