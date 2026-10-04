"""Profile/settings routes (kept separate from feature modules)."""

import uuid

from fastapi import APIRouter, File, Request, Response, UploadFile

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import hash_refresh_token
from app.schemas.auth import MessageResponse
from app.schemas.user import PasswordChangeRequest, SessionResponse, UserResponse, UserUpdateRequest
from app.services.auth_service import AuthService
from app.services.onboarding_service import OnboardingService
from app.services.storage_service import StorageService
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    service = UserService(db)
    user = await service.update_profile(current_user, payload)
    return UserResponse.model_validate(user)


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> UserResponse:
    """Upload a profile picture to S3-compatible storage (validated, size-capped)."""
    storage = StorageService()
    content_type = file.content_type or "application/octet-stream"
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    url = storage.upload_avatar(current_user.id, file.file, content_type, size)
    current_user.avatar_url = url
    await db.flush()
    return UserResponse.model_validate(current_user)


@router.post("/me/onboarding", response_model=UserResponse)
async def complete_onboarding(
    current_user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    """Mark onboarding as completed (idempotent)."""
    service = OnboardingService(db)
    user = await service.complete_onboarding(current_user)
    return UserResponse.model_validate(user)


@router.post("/me/password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    payload: PasswordChangeRequest,
    current_user: CurrentUser,
    response: Response,
    db: DbSession,
) -> MessageResponse:
    service = AuthService(db)
    await service.change_password(current_user, payload.current_password, payload.new_password)
    service.clear_auth_cookies(response)
    return MessageResponse(message="Password changed, please log in again")


@router.get("/me/sessions", response_model=list[SessionResponse])
async def list_my_sessions(
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> list[SessionResponse]:
    service = UserService(db)
    raw_token = request.cookies.get(get_settings().refresh_cookie_name)
    current_token_hash = hash_refresh_token(raw_token) if raw_token else None
    sessions = await service.list_sessions(current_user, current_token_hash=current_token_hash)
    return [SessionResponse(**session) for session in sessions]


@router.delete("/me/sessions/{session_id}", response_model=MessageResponse)
async def revoke_my_session(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> MessageResponse:
    service = UserService(db)
    await service.revoke_session(current_user, session_id)
    return MessageResponse(message="Session revoked")
