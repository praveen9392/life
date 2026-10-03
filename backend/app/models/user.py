"""User identity, sessions, and per-user preferences."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPkMixin
from app.utils.enums import ThemePreference

DEFAULT_NOTIFICATION_PREFERENCES: dict[str, bool] = {
    "task_due_soon": True,
    "habit_reminder": True,
    "learning_reminder": True,
    "workout_reminder": True,
    "goal_deadline_approaching": True,
}


class User(UUIDPkMixin, TimestampMixin, Base):
    """A registered account. All personal data cascades from this table."""

    __tablename__ = "users"
    __table_args__ = (
        Index("uq_users_email_lower", text("lower(email)"), unique=True),
    )

    # Uniqueness is enforced case-insensitively via a functional index on
    # lower(email) added in the initial migration (not a plain unique=True
    # here), since the app always normalizes to lowercase before storing but
    # the database is the last line of defense against that invariant.
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    theme_preference: Mapped[ThemePreference] = mapped_column(
        Enum(ThemePreference, name="theme_preference_enum", native_enum=True),
        nullable=False,
        default=ThemePreference.SYSTEM,
    )
    notification_preferences: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: dict(DEFAULT_NOTIFICATION_PREFERENCES)
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(UUIDPkMixin, Base):
    """A hashed, rotatable refresh token. Reuse of a rotated-out token revokes its family."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # See the matching NOTE in `app/models/notification.py` re: `text("now()")`
    # vs. the bare string `"now()"` - the application layer sets `created_at`
    # explicitly on insert (`UserRepository.create_refresh_token`) so this is
    # a fresh-database/future-migration safety net, not the source of truth.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    user_agent: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(64))

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")
