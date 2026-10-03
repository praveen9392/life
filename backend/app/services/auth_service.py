"""Authentication business logic.

Security model (see ARCHITECTURE.md "Authn/Authz Security"):
- Access token: short-lived JWT, httpOnly cookie.
- Refresh token: opaque, high-entropy; stored ONLY as a SHA-256 hash; rotated
  on every use; reuse of a rotated-out token is treated as theft and revokes
  the whole token family, forcing re-login on every device.
- CSRF: double-submit cookie, set alongside the auth cookies.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    generate_csrf_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.user import User
from app.repositories.user_repository import UserRepository

logger = get_logger(__name__)


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)

    async def register(
        self, email: str, password: str, full_name: str | None
    ) -> User:
        """Create a new account. Email is normalized to lowercase."""
        normalized_email = email.strip().lower()
        if await self.users.email_exists(normalized_email):
            raise ConflictError("An account with this email already exists")
        user = await self.users.create(normalized_email, hash_password(password), full_name)
        logger.info("user_registered", user_id=str(user.id))
        return user

    async def login(
        self, email: str, password: str, *, user_agent: str | None, ip_address: str | None
    ) -> tuple[User, str]:
        """Verify credentials and issue a new refresh-token family."""
        user = await self.users.get_by_email(email.strip().lower())
        if user is None or not verify_password(password, user.hashed_password):
            # Same message for "no such user" and "wrong password" - never
            # confirm which one failed (see the two-user isolation checklist).
            raise UnauthorizedError("Invalid email or password")
        if not user.is_active:
            raise UnauthorizedError("This account is disabled")

        raw_token = await self._issue_refresh_token(user, user_agent=user_agent, ip_address=ip_address)
        logger.info("user_logged_in", user_id=str(user.id))
        return user, raw_token

    async def refresh(
        self, raw_token: str, *, user_agent: str | None, ip_address: str | None
    ) -> tuple[User, str]:
        """Rotate a refresh token, issuing a new one in the same family.

        Presenting a token that was already rotated out is treated as token
        theft: the entire family is revoked and the caller must re-authenticate.
        """
        token_hash = hash_refresh_token(raw_token)
        stored = await self.users.get_refresh_token_by_hash(token_hash)

        if stored is None:
            raise UnauthorizedError("Invalid session")

        if stored.revoked_at is not None:
            # Reuse of a rotated-out token -> assume the family is compromised.
            await self.users.revoke_token_family(stored.family_id)
            logger.warning("refresh_token_reuse_detected", user_id=str(stored.user_id))
            raise UnauthorizedError("Session revoked, please log in again")

        if stored.expires_at < datetime.now(UTC):
            raise UnauthorizedError("Session expired, please log in again")

        user = await self.users.get_by_id(stored.user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError("Invalid session")

        await self.users.revoke_refresh_token(stored.id)
        new_raw_token = await self._issue_refresh_token(
            user,
            user_agent=user_agent,
            ip_address=ip_address,
            family_id=stored.family_id,
        )
        return user, new_raw_token

    async def logout(self, raw_token: str | None) -> None:
        if raw_token is None:
            return
        stored = await self.users.get_refresh_token_by_hash(hash_refresh_token(raw_token))
        if stored is not None and stored.revoked_at is None:
            await self.users.revoke_refresh_token(stored.id)

    async def logout_all(self, user: User) -> None:
        await self.users.revoke_all_for_user(user.id)

    async def change_password(self, user: User, current_password: str, new_password: str) -> None:
        """Change the password and revoke every session (all devices must re-login)."""
        if not verify_password(current_password, user.hashed_password):
            raise UnauthorizedError("Current password is incorrect")
        user.hashed_password = hash_password(new_password)
        await self.users.revoke_all_for_user(user.id)
        logger.info("password_changed", user_id=str(user.id))

    async def _issue_refresh_token(
        self,
        user: User,
        *,
        user_agent: str | None,
        ip_address: str | None,
        family_id: uuid.UUID | None = None,
    ) -> str:
        settings = get_settings()
        raw_token = generate_refresh_token()
        expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
        await self.users.create_refresh_token(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            family_id=family_id or uuid.uuid4(),
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return raw_token

    def set_auth_cookies(self, response: Response, user_id: uuid.UUID, refresh_token: str) -> None:
        """Set the access/refresh (httpOnly) and CSRF (readable) cookies."""
        settings = get_settings()
        access_token = create_access_token(user_id)
        response.set_cookie(
            key=settings.access_cookie_name,
            value=access_token,
            max_age=settings.access_token_expire_minutes * 60,
            secure=settings.cookie_secure,
            httponly=True,
            samesite=settings.cookie_samesite,
            domain=settings.cookie_domain or None,
        )
        response.set_cookie(
            key=settings.refresh_cookie_name,
            value=refresh_token,
            max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
            secure=settings.cookie_secure,
            httponly=True,
            samesite=settings.cookie_samesite,
            domain=settings.cookie_domain or None,
        )
        response.set_cookie(
            key=settings.csrf_cookie_name,
            value=generate_csrf_token(),
            max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
            secure=settings.cookie_secure,
            httponly=False,
            samesite=settings.cookie_samesite,
            domain=settings.cookie_domain or None,
        )

    def clear_auth_cookies(self, response: Response) -> None:
        settings = get_settings()
        for name in (
            settings.access_cookie_name,
            settings.refresh_cookie_name,
            settings.csrf_cookie_name,
        ):
            response.delete_cookie(
                key=name, secure=settings.cookie_secure, domain=settings.cookie_domain or None
            )
