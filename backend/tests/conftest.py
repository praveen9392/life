"""Shared pytest fixtures.

Tests always run against the dedicated `life_test` database (never `life`),
selected here by overriding `DATABASE_URL` from `TEST_DATABASE_URL` *before*
any `app.*` module is imported (see AGENTS.md for why the env var must be set
this early). Each test runs inside a rolled-back SAVEPOINT so `db_session`
looks like a fresh, isolated database to every test even though the
connection/transaction is reused for speed.
"""

import os
from collections.abc import AsyncIterator

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
_test_db_url = os.environ.get("TEST_DATABASE_URL")
if _test_db_url:
    os.environ["DATABASE_URL"] = _test_db_url

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool  # noqa: E402

import app.models  # noqa: E402,F401 (populate Base.metadata)
from app.api.deps import get_db  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """A database session whose changes are always rolled back after the test.

    A fresh engine (NullPool - no cross-test connection pooling) is created
    per test rather than reusing the app's module-level singleton engine,
    because pytest-asyncio gives each test its own event loop by default and
    asyncpg connections cannot be reused across event loops ("Event loop is
    closed" / "attached to a different loop" errors otherwise).
    """
    test_engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    async with test_engine.connect() as connection:
        await connection.begin()
        test_session_factory = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with test_session_factory() as session:
            yield session
        await connection.rollback()
    await test_engine.dispose()


@pytest_asyncio.fixture
async def api_client(db_session: AsyncSession) -> AsyncIterator[httpx.AsyncClient]:
    """An httpx client talking to the real ASGI app, with the DB dependency
    overridden to the test session (so API tests hit the rolled-back
    transaction, exactly like every other test).

    Two test-infra workarounds live here:
    - `ASGITransport` does not persist Set-Cookie headers into the client's
      cookie jar, so auth cookies are captured manually after each response.
    - The in-memory rate limiter is reset before every test so one test's
      request volume can't trip the limits of the next.
    """
    from app.core.rate_limit import limiter

    limiter.reset()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    cookie_jar = httpx.Cookies()

    class CookieCapturingTransport(httpx.ASGITransport):
        """Persists Set-Cookie headers into the client's cookie jar, which
        httpx's ASGITransport does not do by itself."""

        def __init__(self, jar: httpx.Cookies):
            super().__init__(app=app)
            self._jar = jar

        async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
            response = await super().handle_async_request(request)
            for cookie_header in response.headers.get_list("set-cookie"):
                self._jar.extract_cookies(
                    httpx.Response(
                        status_code=response.status_code,
                        headers=[("set-cookie", cookie_header)],
                        request=request,
                    )
                )
            return response

    async with httpx.AsyncClient(
        transport=CookieCapturingTransport(cookie_jar), base_url="http://test", cookies=cookie_jar
    ) as client:
        yield client
    app.dependency_overrides.clear()


async def register_and_login(
    client: httpx.AsyncClient, db_session: AsyncSession, email: str, password: str = "correct-horse-battery"
) -> User:
    """Register + login via the real API, returning the created User row."""
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": email.split("@")[0]},
    )
    assert register_response.status_code == 201, register_response.text
    # If a session already exists (e.g. registering while logged in), the CSRF
    # middleware requires the header - exactly what the real frontend sends.
    login_response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}, headers=csrf_headers(client)
    )
    assert login_response.status_code == 200, login_response.text

    from app.repositories.user_repository import UserRepository

    user = await UserRepository(db_session).get_by_email_query(email)
    assert user is not None
    return user


def csrf_headers(client: httpx.AsyncClient) -> dict[str, str]:
    """The X-CSRF-Token header value matching the client's CSRF cookie."""
    token = client.cookies.get("csrf_token")
    return {"X-CSRF-Token": token} if token else {}


@pytest_asyncio.fixture
async def user_a(api_client: httpx.AsyncClient, db_session: AsyncSession) -> User:
    return await register_and_login(api_client, db_session, "user-a@example.com")


@pytest_asyncio.fixture
async def user_b(api_client: httpx.AsyncClient, db_session: AsyncSession) -> User:
    return await register_and_login(api_client, db_session, "user-b@example.com")
