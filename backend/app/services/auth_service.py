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

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, ServiceError, UnauthorizedError
from app.core.logging import logger
from app.core.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
    verify_password_dummy,
)
from app.models.user import User
from app.repositories.user_repository import UserRepository


class AuthService:
    """Authentication business logic: registration, login, refresh-token
    rotation, logout, and password change."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.users = UserRepository(session)

    async def register(
        self, email: str, password: str, full_name: str | None
    ) -> User:
        """Register a new user account.

        Args:
            email: Email address; normalized to lowercase before the
                uniqueness check.
            password: Plaintext password; stored only as a hash.
            full_name: Optional display name.

        Returns:
            User: The created user.

        Raises:
            ConflictError: If an account with this email already exists.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info("Starting user registration")
            normalized_email = email.strip().lower()
            logger.debug("Checking email uniqueness")
            if await self.users.email_exists_query(normalized_email):
                logger.warning("register_rejected_duplicate_email")
                raise ConflictError("An account with this email already exists")
            logger.debug("Creating user row")
            async with self.session.begin_nested():
                user = await self.users.create_query(normalized_email, hash_password(password), full_name)
            logger.info("user_registered")
            return user
        except IntegrityError as exc:
            logger.warning("register_rejected_duplicate_email")
            raise ConflictError("An account with this email already exists") from exc
        except ConflictError:
            logger.error("Registration failed: email already registered")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while registering the user: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while registering the user: {exc}")
            raise ServiceError("Unexpected error while registering the user") from exc

    async def login(
        self, email: str, password: str, *, user_agent: str | None, ip_address: str | None
    ) -> tuple[User, str]:
        """Verify credentials and issue a new refresh-token family.

        Args:
            email: Email address (normalized to lowercase for the lookup).
            password: Plaintext password verified against the stored hash.
            user_agent: Caller's User-Agent header, stored on the session row.
            ip_address: Caller's IP address, stored on the session row.

        Returns:
            tuple[User, str]: The authenticated user and the raw refresh token.

        Raises:
            UnauthorizedError: If the credentials are invalid or the account
                is disabled.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info("Starting user login")
            user = await self.users.get_by_email_query(email.strip().lower())
            if user is None:
                verify_password_dummy(password)  # equalize timing with the wrong-password path
            if user is None or not verify_password(password, user.hashed_password):
                # Same message for "no such user" and "wrong password" - never
                # confirm which one failed (see the two-user isolation checklist).
                logger.warning("login_failed")
                raise UnauthorizedError("Invalid email or password")
            if not user.is_active:
                logger.debug(f"login_rejected_disabled_account | user_id={user.id}")
                raise UnauthorizedError("This account is disabled")

            raw_token = await self._issue_refresh_token(user, user_agent=user_agent, ip_address=ip_address)
            logger.info(f"user_logged_in | user_id={user.id}")
            return user, raw_token
        except UnauthorizedError:
            logger.error("Login failed: invalid credentials or disabled account")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while logging the user in: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while logging the user in: {exc}")
            raise ServiceError("Unexpected error while logging the user in") from exc

    async def refresh(
        self, raw_token: str, *, user_agent: str | None, ip_address: str | None
    ) -> tuple[User, str]:
        """Rotate a refresh token, issuing a new one in the same family.

        Presenting a token that was already rotated out is treated as token
        theft: the entire family is revoked and the caller must
        re-authenticate.

        Args:
            raw_token: Opaque refresh token presented by the client.
            user_agent: Caller's User-Agent header, stored on the new token row.
            ip_address: Caller's IP address, stored on the new token row.

        Returns:
            tuple[User, str]: The session's user and the new raw refresh token.

        Raises:
            UnauthorizedError: If the token is unknown, expired, reused, or
                its user is missing/inactive.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info("Starting session refresh")
            token_hash = hash_refresh_token(raw_token)
            logger.debug("Fetching refresh token by hash")
            stored = await self.users.get_refresh_token_by_hash_query(token_hash)

            if stored is None:
                logger.warning("refresh_rejected_unknown_token")
                raise UnauthorizedError("Invalid session")

            if stored.revoked_at is not None:
                # Reuse of a rotated-out token -> assume the family is compromised.
                await self.users.revoke_token_family_query(stored.family_id)
                logger.warning(f"refresh_token_reuse_detected | user_id={stored.user_id}")
                raise UnauthorizedError("Session revoked, please log in again")

            if stored.expires_at < datetime.now(UTC):
                logger.warning("refresh_rejected_expired_token")
                raise UnauthorizedError("Session expired, please log in again")

            logger.debug(f"Fetching user | user_id={stored.user_id}")
            user = await self.users.get_by_id_query(stored.user_id)
            if user is None or not user.is_active:
                logger.warning("refresh_rejected_invalid_session")
                raise UnauthorizedError("Invalid session")

            # Refresh is the only guaranteed periodic touchpoint per session, so
            # it doubles as the cleanup hook: one indexed DELETE drops this user's
            # already-expired token rows instead of letting them accumulate.
            logger.debug(f"Deleting expired tokens | user_id={user.id}")
            await self.users.delete_expired_tokens_query(user.id)

            logger.debug(f"Revoking refresh token | token_id={stored.id}")
            if not await self.users.revoke_refresh_token_if_active_query(stored.id):
                # Lost a concurrent rotation race: same as reuse of a rotated token.
                await self.users.revoke_token_family_query(stored.family_id)
                logger.warning(f"refresh_token_reuse_detected | user_id={stored.user_id}")
                raise UnauthorizedError("Session revoked, please log in again")
            new_raw_token = await self._issue_refresh_token(
                user,
                user_agent=user_agent,
                ip_address=ip_address,
                family_id=stored.family_id,
            )
            logger.info(f"session_refreshed | user_id={user.id}")
            return user, new_raw_token
        except UnauthorizedError:
            logger.error("Session refresh failed: refresh token rejected")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while refreshing the session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while refreshing the session: {exc}")
            raise ServiceError("Unexpected error while refreshing the session") from exc

    async def logout(self, raw_token: str | None) -> None:
        """Revoke the presented refresh token, if any.

        Args:
            raw_token: Refresh token to revoke, or None (no-op).

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info("Starting session logout")
            if raw_token is None:
                logger.debug("logout called without a session token; nothing to revoke")
                return
            logger.debug("Fetching refresh token by hash")
            stored = await self.users.get_refresh_token_by_hash_query(hash_refresh_token(raw_token))
            if stored is not None and stored.revoked_at is None:
                logger.debug(f"Revoking refresh token | token_id={stored.id}")
                await self.users.revoke_refresh_token_query(stored.id)
                logger.info(f"session_logged_out | user_id={stored.user_id}")
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while logging the user out: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while logging the user out: {exc}")
            raise ServiceError("Unexpected error while logging the user out") from exc

    async def logout_all(self, user: User) -> None:
        """Revoke every active refresh token belonging to the user.

        Args:
            user: Authenticated user whose sessions are all revoked.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting session revocation | user_id={user.id}")
            await self.users.revoke_all_for_user_query(user.id)
            logger.info(f"all_sessions_revoked | user_id={user.id}")
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while revoking all sessions: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while revoking all sessions: {exc}")
            raise ServiceError("Unexpected error while revoking all sessions") from exc

    async def change_password(self, user: User, current_password: str, new_password: str) -> None:
        """Change the password and revoke every session (all devices must re-login).

        Args:
            user: Authenticated user changing their password.
            current_password: Plaintext password verified against the stored hash.
            new_password: Replacement password; stored only as a hash.

        Raises:
            UnauthorizedError: If the current password is incorrect.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting password change | user_id={user.id}")
            if not verify_password(current_password, user.hashed_password):
                logger.warning(f"password_change_rejected_wrong_password | user_id={user.id}")
                raise UnauthorizedError("Current password is incorrect")
            user.hashed_password = hash_password(new_password)
            logger.debug(f"Revoking all sessions | user_id={user.id}")
            await self.users.revoke_all_for_user_query(user.id)
            logger.info(f"password_changed | user_id={user.id}")
        except UnauthorizedError:
            logger.error(f"Password change failed: current password incorrect | user_id={user.id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while changing the password: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while changing the password: {exc}")
            raise ServiceError("Unexpected error while changing the password") from exc

    async def _issue_refresh_token(
        self,
        user: User,
        *,
        user_agent: str | None,
        ip_address: str | None,
        family_id: uuid.UUID | None = None,
    ) -> str:
        """Persist a new refresh-token row and return the raw token.

        Args:
            user: User the token belongs to.
            user_agent: Caller's User-Agent header, stored on the token row.
            ip_address: Caller's IP address, stored on the token row.
            family_id: Token family to join; a new family is created when
                omitted.

        Returns:
            str: The raw (unhashed) refresh token to hand to the client.
        """
        logger.debug(f"Starting _issue_refresh_token | user_id={user.id}")
        settings = get_settings()
        raw_token = generate_refresh_token()
        expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
        await self.users.create_refresh_token_query(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            family_id=family_id or uuid.uuid4(),
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        logger.debug(f"Refresh token issued | user_id={user.id}")
        return raw_token
