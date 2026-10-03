"""Authentication request/response schemas."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.user import UserResponse


class RegisterRequest(BaseModel):
    """Registration input. Password policy is enforced here (backend is the
    source of truth for validation; the frontend only mirrors it for UX)."""

    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str | None = Field(default=None, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AuthResponse(BaseModel):
    """Login/register response. Tokens travel as httpOnly cookies, never in
    the body (see ARCHITECTURE.md "Authn/Authz Security")."""

    model_config = ConfigDict(from_attributes=True)

    user: UserResponse


class MessageResponse(BaseModel):
    message: str
