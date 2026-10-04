"""Profile/settings business logic (kept separate from feature modules)."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserUpdateRequest


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)

    async def update_profile(self, user: User, changes: UserUpdateRequest) -> User:
        """Apply a profile update. Only whitelisted fields from the request
        schema are ever touched (mass-assignment safe by construction)."""
        data = changes.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(user, key, value)
        await self.session.flush()
        return user

    async def list_sessions(self, user: User, current_token_hash: str | None) -> list[dict]:
        """Active sessions for the Profile -> Security view.

        `current_token_hash` is the SHA-256 of the refresh token presented by
        the caller (refresh tokens are stored only as hashes), letting the
        list flag which row is *this* device's session.
        """
        sessions = await self.users.list_active_sessions(user.id)
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

    async def revoke_session(self, user: User, session_id: uuid.UUID) -> None:
        """Revoke one of the user's own sessions (ownership-checked)."""
        sessions = await self.users.list_active_sessions(user.id)
        target = next((token for token in sessions if token.id == session_id), None)
        if target is None:
            # Sessions belong to the user; a foreign session_id is simply "not found".
            raise NotFoundError("Session not found")
        await self.users.revoke_refresh_token(target.id)
