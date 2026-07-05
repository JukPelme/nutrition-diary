"""Shared test fixtures.

Runs the app against a throwaway SQLite database so no Postgres is needed.
Environment must be set BEFORE any app module is imported, because
db/compat.py picks UUID/JSON column types from settings.database_url at
import time.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_nutrition.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-000000000000000000000000")
os.environ.setdefault("DEBUG", "false")

import pytest
import pytest_asyncio
import httpx

# Import all models so Base.metadata knows every table before create_all.
import app.models.user          # noqa: F401
import app.models.product       # noqa: F401
import app.models.diary         # noqa: F401
import app.models.health        # noqa: F401
import app.models.device        # noqa: F401
import app.models.achievement   # noqa: F401
import app.models.ai_log        # noqa: F401
import app.models.chat          # noqa: F401
import app.models.meal_plan     # noqa: F401
import app.models.push          # noqa: F401
import app.models.quest         # noqa: F401
import app.models.recipe        # noqa: F401
import app.models.security      # noqa: F401
import app.models.water         # noqa: F401

from app.db.base import Base
from app.db.session import engine
from app.main import app


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_schema():
    """Create all tables once for the test session, drop them afterwards."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    try:
        os.remove("test_nutrition.db")
    except OSError:
        pass


@pytest_asyncio.fixture
async def client():
    """Async HTTP client bound to the ASGI app (no network)."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


_user_counter = {"n": 0}


@pytest_asyncio.fixture
async def auth_client(client):
    """A client already registered + logged in, returning (client, token, email)."""
    _user_counter["n"] += 1
    n = _user_counter["n"]
    email = f"test{n}@example.com"
    password = "Test12345!"
    reg = await client.post("/api/v1/auth/register", json={
        "email": email, "password": password, "full_name": f"Test {n}",
    })
    assert reg.status_code in (200, 201), reg.text
    token = reg.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client, token, email
