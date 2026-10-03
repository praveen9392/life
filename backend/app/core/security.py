"""Password hashing (Argon2id), JWT encode/decode, and CSRF token helpers.

- Passwords are hashed with argon2-cffi's Argon2id variant (never stored or
  logged in plaintext).
- Access tokens are short-lived JWTs; refresh tokens are opaque random
  secrets stored ONLY as hashes in the database (see services/auth_service).
- CSRF tokens are random secrets; the double-submit-cookie comparison itself
  lives in core/middleware.py.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError

_password_hasher = PasswordHasher()

SUB_CLAIM = "sub"
TOKEN_TYPE_CLAIM = "token_type"
ACCESS_TOKEN_TYPE = "access"


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return _password_hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Constant-time verification of a plaintext password against its hash."""
    try:
        return _password_hasher.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: uuid.UUID) -> str:
    """Create a short-lived, signed JWT identifying `user_id`."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        SUB_CLAIM: str(user_id),
        TOKEN_TYPE_CLAIM: ACCESS_TOKEN_TYPE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID:
    """Validate a JWT and return the user ID it identifies.

    Raises UnauthorizedError for expired, tampered, or wrong-type tokens.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Session expired, please log in again") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid session token") from exc

    if payload.get(TOKEN_TYPE_CLAIM) != ACCESS_TOKEN_TYPE:
        raise UnauthorizedError("Invalid session token")
    try:
        return uuid.UUID(payload[SUB_CLAIM])
    except (KeyError, ValueError) as exc:
        raise UnauthorizedError("Invalid session token") from exc


def generate_refresh_token() -> str:
    """A high-entropy opaque refresh token. Only its hash is ever stored."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    """Hash a raw refresh token for storage/lookup (never store the raw value).

    Shared by `AuthService` (issuing/rotating/revoking tokens) and the
    session-listing routes (identifying which stored session corresponds to
    the caller's own refresh-token cookie, so `SessionResponse.is_current`
    can be computed correctly).
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()


def generate_csrf_token() -> str:
    """A high-entropy CSRF token for the double-submit-cookie pattern."""
    return secrets.token_urlsafe(32)
