"""Authentication routes: register, login, refresh, logout, sessions.

Routes are thin: parse the request, delegate to `AuthService`, shape the
response. All business logic (and every security decision) lives in the
service layer.
"""

from fastapi import APIRouter, Request, Response

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.rate_limit import limiter
from app.schemas.auth import AuthResponse, LoginRequest, MessageResponse, RegisterRequest
from app.schemas.user import UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/register", response_model=AuthResponse, status_code=201)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    service = AuthService(db)
    user = await service.register(payload.email, payload.password, payload.full_name)
    _, raw_refresh = await service.login(
        payload.email, payload.password, user_agent=request.headers.get("user-agent"), ip_address=_client_ip(request)
    )
    service.set_auth_cookies(response, user.id, raw_refresh)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    service = AuthService(db)
    user, raw_refresh = await service.login(
        payload.email,
        payload.password,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    service.set_auth_cookies(response, user.id, raw_refresh)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/refresh", response_model=AuthResponse)
@limiter.limit("30/minute")
async def refresh(
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    service = AuthService(db)
    raw_token = request.cookies.get(get_settings().refresh_cookie_name)
    if raw_token is None:
        raise UnauthorizedError("Missing refresh token")
    user, new_raw_refresh = await service.refresh(
        raw_token,
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    service.set_auth_cookies(response, user.id, new_raw_refresh)
    return AuthResponse(user=UserResponse.model_validate(user))


@router.post("/logout", response_model=MessageResponse)
async def logout(
    request: Request,
    response: Response,
    db: DbSession,
) -> MessageResponse:
    service = AuthService(db)
    await service.logout(request.cookies.get(get_settings().refresh_cookie_name))
    service.clear_auth_cookies(response)
    return MessageResponse(message="Logged out")


@router.post("/logout-all", response_model=MessageResponse)
async def logout_all(
    response: Response,
    current_user: CurrentUser,
    db: DbSession,
) -> MessageResponse:
    service = AuthService(db)
    await service.logout_all(current_user)
    service.clear_auth_cookies(response)
    return MessageResponse(message="Logged out of all devices")
