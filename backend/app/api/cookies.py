"""Auth cookie helpers (HTTP-layer concern, kept out of the service layer)."""

import uuid

from fastapi import Response

from app.core.config import get_settings
from app.core.security import create_access_token, generate_csrf_token

_SECONDS_PER_DAY = 24 * 60 * 60


def _set_cookie(response: Response, key: str, value: str, max_age: int, *, httponly: bool) -> None:
    settings = get_settings()
    response.set_cookie(
        key=key,
        value=value,
        max_age=max_age,
        secure=settings.cookie_secure,
        httponly=httponly,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain or None,
    )


def set_auth_cookies(response: Response, user_id: uuid.UUID, refresh_token: str) -> None:
    """Set the access/refresh (httpOnly) and CSRF (readable) cookies."""
    settings = get_settings()
    refresh_max_age = settings.refresh_token_expire_days * _SECONDS_PER_DAY
    _set_cookie(
        response,
        settings.access_cookie_name,
        create_access_token(user_id),
        settings.access_token_expire_minutes * 60,
        httponly=True,
    )
    _set_cookie(response, settings.refresh_cookie_name, refresh_token, refresh_max_age, httponly=True)
    _set_cookie(
        response, settings.csrf_cookie_name, generate_csrf_token(), refresh_max_age, httponly=False
    )


def clear_auth_cookies(response: Response) -> None:
    settings = get_settings()
    for name in (
        settings.access_cookie_name,
        settings.refresh_cookie_name,
        settings.csrf_cookie_name,
    ):
        response.delete_cookie(
            key=name, secure=settings.cookie_secure, domain=settings.cookie_domain or None
        )
