"""Shared FastAPI dependencies.

`get_current_user` is THE authentication dependency every protected route
depends on; it is what makes `current_user.id` the sole source of ownership
truth throughout the application (see ARCHITECTURE.md §2 "Authentication vs.
Authorization"). Client-supplied `user_id` values are never trusted.
"""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError
from app.core.logging import logger
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.utils.pagination import PaginationParams


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_session():
        yield session


def get_pagination(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    """Resolve the authenticated user from the httpOnly access-token cookie.

    Raises 401 before any handler code runs if the session is missing,
    expired, or tampered with. The returned `User` is a real database row,
    not just a trusted claim blob.
    """
    settings = get_settings()
    token = request.cookies.get(settings.access_cookie_name)
    if token is None:
        logger.warning("Missing access token")
        raise UnauthorizedError("Authentication required")

    user_id = decode_access_token(token)
    user = await UserRepository(db).get_by_id_query(user_id)
    if user is None or not user.is_active:
        logger.warning("Unknown or inactive user")
        raise UnauthorizedError("Authentication required")
    logger.debug(f"Authenticated user: {user.id}")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
