"""Rate limiting (slowapi). Applied per-route, most importantly on auth
endpoints (login/register/refresh/password-reset) to blunt brute-force and
credential-stuffing attempts. In-memory store for v1; documented upgrade
path to a Redis-backed store in ARCHITECTURE.md for multi-instance
deployments.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_settings.rate_limit_storage_uri,
    enabled=_settings.rate_limit_enabled,
)
