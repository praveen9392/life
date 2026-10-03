"""User-facing Pydantic schemas.

Response schemas are explicit whitelists (never the ORM model serialized
directly), so internal-only columns like `hashed_password` structurally
cannot leak (see ARCHITECTURE.md "API Contracts"). Create/update schemas
never accept identity/ownership/audit fields, preventing mass assignment.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.utils.enums import ThemePreference


class NotificationPreferences(BaseModel):
    """Per-event-type switches; v1 only uses the in-app channel."""

    task_due_soon: bool = True
    habit_reminder: bool = True
    learning_reminder: bool = True
    workout_reminder: bool = True
    goal_deadline_approaching: bool = True


class UserResponse(BaseModel):
    """The safe, public shape of a user - what the frontend may ever see."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    avatar_url: str | None
    timezone: str
    theme_preference: ThemePreference
    notification_preferences: NotificationPreferences
    onboarding_completed_at: datetime | None
    created_at: datetime


class UserUpdateRequest(BaseModel):
    """Profile/settings updates. Server-controlled fields are not accepted."""

    full_name: str | None = Field(default=None, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)
    theme_preference: ThemePreference | None = None
    notification_preferences: NotificationPreferences | None = None

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=128)


class SessionResponse(BaseModel):
    """One active refresh-token session, shown on Profile -> Security."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    user_agent: str | None
    ip_address: str | None
    is_current: bool = False
