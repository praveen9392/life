"""Notification routes."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.schemas.search import NotificationListResponse, NotificationResponse
from app.services.notification_service import NotificationService

router = APIRouter(tags=["search", "notifications", "privacy"])


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    unread_only: bool = Query(default=False),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> NotificationListResponse:
    try:
        service = NotificationService(db)
        # Lazily generate due-soon reminders before listing (cron-ready design).
        await service.generate_due_notifications(current_user.id, current_user.timezone)
        notifications, unread_count = await service.list_for_user(
            current_user.id, unread_only=unread_only, offset=offset, limit=limit
        )
        return NotificationListResponse(
            items=[NotificationResponse.model_validate(n) for n in notifications],
            unread_count=unread_count,
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> NotificationResponse:
    try:
        notification = await NotificationService(db).mark_read(current_user.id, notification_id)
        return NotificationResponse.model_validate(notification)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/notifications/read-all", response_model=dict)
async def mark_all_notifications_read(current_user: CurrentUser, db: DbSession) -> dict:
    try:
        count = await NotificationService(db).mark_all_read(current_user.id)
        return {"marked_read": count}
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc
