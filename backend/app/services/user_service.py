"""Profile/settings business logic (kept separate from feature modules)."""

import uuid

from fastapi import UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError, ValidationError
from app.core.logging import logger
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserUpdateRequest
from app.services.storage_service import (
    StorageNotConfiguredError,
    StorageService,
    StorageUploadError,
)


class UserService:
    """Profile/settings and avatar business logic."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.users = UserRepository(session)

    async def update_profile(self, user: User, changes: UserUpdateRequest) -> User:
        """Apply a profile update; only whitelisted schema fields are touched.

        Mass-assignment safe by construction: the request schema defines the
        only fields that can ever be set.

        Args:
            user: Authenticated user to update in place.
            changes: Fields to change (unset fields ignored).

        Returns:
            User: The updated user.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting profile update | user_id={user.id}")
            data = changes.model_dump(exclude_unset=True)
            for key, value in data.items():
                setattr(user, key, value)
            await self.session.flush()
            logger.info(f"Profile updated | user_id={user.id}")
            return user
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the profile: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the profile: {exc}")
            raise ServiceError("Unexpected error while updating the profile") from exc

    async def upload_avatar(self, user: User, file: UploadFile) -> User:
        """Store an uploaded avatar and point the user's `avatar_url` at it.

        Args:
            user: Authenticated user whose avatar is replaced.
            file: Uploaded file; sized here, then handed to the storage
            service.

        Returns:
            User: The updated user.

        Raises:
            StorageNotConfiguredError: If no S3 backend is configured.
            StorageUploadError: If the upload itself fails.
            ValidationError: If the content type or size is unsupported.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting avatar upload | user_id={user.id}")
            content_type = file.content_type or "application/octet-stream"
            file.file.seek(0, 2)
            size = file.file.tell()
            file.file.seek(0)
            logger.debug(f"Uploading avatar file to storage | user_id={user.id}")
            user.avatar_url = await StorageService().upload_avatar_async(
                user.id, file.file, content_type, size
            )
            await self.session.flush()
            logger.info(f"Avatar uploaded | user_id={user.id}")
            return user
        except (StorageNotConfiguredError, StorageUploadError, ValidationError):
            logger.error(f"Avatar upload failed: storage or validation error | user_id={user.id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while uploading the avatar: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while uploading the avatar: {exc}")
            raise ServiceError("Unexpected error while uploading the avatar") from exc

    async def list_sessions(self, user: User, current_token_hash: str | None) -> list[dict]:
        """List the user's active sessions for the Profile -> Security view.

        `current_token_hash` is the SHA-256 of the refresh token presented by
        the caller (refresh tokens are stored only as hashes), letting the
        list flag which row is *this* device's session.

        Args:
            user: Authenticated user whose sessions are listed.
            current_token_hash: Hash of the caller's refresh token, or None.

        Returns:
            list[dict]: One dictionary per active session with id,
            created_at, expires_at, user_agent, ip_address, and the
            `is_current` flag.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting session listing | user_id={user.id}")
            sessions = await self.users.list_active_sessions_query(user.id)
            logger.info(f"Successfully retrieved {len(sessions)} sessions")
            return [
                {
                    "id": token.id,
                    "created_at": token.created_at,
                    "expires_at": token.expires_at,
                    "user_agent": token.user_agent,
                    "ip_address": token.ip_address,
                    "is_current": current_token_hash is not None
                    and token.token_hash == current_token_hash,
                }
                for token in sessions
            ]
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the sessions: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the sessions: {exc}")
            raise ServiceError("Unexpected error while listing the sessions") from exc

    async def revoke_session(self, user: User, session_id: uuid.UUID) -> None:
        """Revoke one of the user's own sessions (ownership-checked).

        Args:
            user: Authenticated user who owns the session.
            session_id: Primary key of the session to revoke.

        Raises:
            NotFoundError: If no active session with this id belongs to the user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting session revocation | user_id={user.id} session_id={session_id}")
            sessions = await self.users.list_active_sessions_query(user.id)
            target = next((token for token in sessions if token.id == session_id), None)
            if target is None:
                # Sessions belong to the user; a foreign session_id is simply "not found".
                logger.warning(f"Session not found with id: {session_id}")
                raise NotFoundError("Session not found")
            logger.debug(f"Revoking session | session_id={session_id}")
            await self.users.revoke_refresh_token_query(target.id)
            logger.info(f"Session revoked | id={session_id}")
        except NotFoundError:
            logger.error(
                f"Session revocation failed: session not found | session_id={session_id} user_id={user.id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while revoking the session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while revoking the session: {exc}")
            raise ServiceError("Unexpected error while revoking the session") from exc
