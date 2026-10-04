"""Global search, notifications, and privacy routes."""

import uuid

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import UnauthorizedError
from app.core.rate_limit import limiter
from app.core.security import verify_password
from app.schemas.search import (
    AccountDeleteRequest,
    NotificationListResponse,
    NotificationResponse,
    SearchResponse,
)
from app.services.notification_service import NotificationService
from app.services.privacy_service import PrivacyService
from app.services.search_service import SearchService

router = APIRouter(tags=["search", "notifications", "privacy"])


@router.get("/search", response_model=SearchResponse)
async def global_search(
    current_user: CurrentUser,
    db: DbSession,
    q: str = Query(min_length=1, max_length=200),
) -> SearchResponse:
    return await SearchService(db).search(current_user.id, q)


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    current_user: CurrentUser,
    db: DbSession,
    unread_only: bool = Query(default=False),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> NotificationListResponse:
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


@router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> NotificationResponse:
    notification = await NotificationService(db).mark_read(current_user.id, notification_id)
    return NotificationResponse.model_validate(notification)


@router.post("/notifications/read-all", response_model=dict)
async def mark_all_notifications_read(current_user: CurrentUser, db: DbSession) -> dict:
    count = await NotificationService(db).mark_all_read(current_user.id)
    return {"marked_read": count}


@router.get("/privacy/export")
@limiter.limit("10/minute")
async def export_data(request: Request, current_user: CurrentUser, db: DbSession) -> JSONResponse:
    """Full JSON export of everything the user owns."""
    data = await PrivacyService(db).export_user_data(current_user)
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=life-export.json"},
    )


@router.delete("/privacy/account", status_code=204)
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    payload: AccountDeleteRequest,
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
) -> None:
    """Permanently delete the account and all owned data, then clear the session.

    Requires the current password in the request body: deletion is
    irreversible, so a stolen session cookie alone must not be enough.
    """
    from app.services.auth_service import AuthService

    if not verify_password(payload.current_password, current_user.hashed_password):
        raise UnauthorizedError("Current password is incorrect")
    await PrivacyService(db).delete_account(current_user.id)
    AuthService(db).clear_auth_cookies(response)
