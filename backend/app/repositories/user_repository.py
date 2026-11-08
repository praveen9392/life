"""Data access for users and refresh-token sessions."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import RefreshToken, User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id_query(self, user_id: uuid.UUID) -> User | None:
        """Fetch a user by primary key, or None if no such user exists."""
        return (
            await self.session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()

    async def get_by_email_query(self, email: str) -> User | None:
        """Fetch a user by (already-normalized) email address, or None."""
        return (
            await self.session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

    async def email_exists_query(self, email: str) -> bool:
        """True if a user with this email address is already registered."""
        return await self.get_by_email_query(email) is not None

    async def create_query(self, email: str, hashed_password: str, full_name: str | None) -> User:
        """Insert a new user row and flush so its ID is assigned."""
        user = User(email=email, hashed_password=hashed_password, full_name=full_name)
        self.session.add(user)
        await self.session.flush()
        return user

    async def create_refresh_token_query(
        self,
        user_id: uuid.UUID,
        token_hash: str,
        family_id: uuid.UUID,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
    ) -> RefreshToken:
        """Persist a new refresh-token row with its hash, family, expiry, and request metadata."""
        # `created_at` is set explicitly rather than relying on the column's
        # DB `server_default` - see the matching comment in
        # `NotificationRepository.create_notification_query` for why that default
        # is a frozen literal, not a live timestamp, in the initial migration.
        token = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            family_id=family_id,
            expires_at=expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
            created_at=datetime.now(UTC),
        )
        self.session.add(token)
        await self.session.flush()
        return token

    async def get_refresh_token_by_hash_query(self, token_hash: str) -> RefreshToken | None:
        """Fetch a refresh-token row by its hash, or None (caller checks revocation/expiry)."""
        return (
            await self.session.execute(
                select(RefreshToken).where(RefreshToken.token_hash == token_hash)
            )
        ).scalar_one_or_none()

    async def revoke_refresh_token_query(self, token_id: uuid.UUID) -> None:
        """Stamp `revoked_at` on the refresh token with this ID (unconditionally)."""
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id)
            .values(revoked_at=datetime.now(UTC))
        )

    async def revoke_refresh_token_if_active_query(self, token_id: uuid.UUID) -> bool:
        """Atomically revoke; False if another request already revoked it."""
        result = await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
            .returning(RefreshToken.id)
        )
        return result.scalar_one_or_none() is not None

    async def revoke_token_family_query(self, family_id: uuid.UUID) -> None:
        """Revoke every not-yet-revoked token in a family (token-reuse response)."""
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    async def revoke_all_for_user_query(self, user_id: uuid.UUID) -> None:
        """Revoke all of a user's active refresh tokens (logout-everywhere)."""
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    async def list_active_sessions_query(self, user_id: uuid.UUID) -> list[RefreshToken]:
        """List the user's non-revoked refresh tokens, newest first (session view)."""
        result = await self.session.execute(
            select(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .order_by(RefreshToken.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_expired_tokens_query(self, user_id: uuid.UUID) -> None:
        """Hard-delete the user's refresh tokens whose expiry has passed."""
        await self.session.execute(
            delete(RefreshToken).where(
                RefreshToken.user_id == user_id, RefreshToken.expires_at < datetime.now(UTC)
            )
        )
