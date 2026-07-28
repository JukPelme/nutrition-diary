"""User timezone: helper correctness + PATCH round-trip + validation.

The app's "today" (streaks, quests, day summary) must be the user's local
calendar day. timeutil is the single source of truth; endpoints call it.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.core.timeutil import user_today, user_now, user_zone


def test_utc_fallback_when_unset_or_invalid():
    assert user_today(None) == datetime.now(timezone.utc).date()
    assert user_today("Not/ARealZone") == datetime.now(timezone.utc).date()
    assert user_zone(None) == timezone.utc
    assert user_zone("bogus") == timezone.utc


def test_today_matches_zone():
    for tz in ("Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Honolulu"):
        assert user_today(tz) == datetime.now(ZoneInfo(tz)).date()


def test_accepts_user_like_object():
    class U:
        timezone = "Asia/Tokyo"
    assert user_today(U()) == datetime.now(ZoneInfo("Asia/Tokyo")).date()
    assert user_now(U()).tzinfo == ZoneInfo("Asia/Tokyo")


async def test_timezone_patch_roundtrip(auth_client):
    client, _, _ = auth_client
    r = await client.patch("/api/v1/auth/me", json={"timezone": "Asia/Tokyo"})
    assert r.status_code == 200, r.text
    me = await client.get("/api/v1/auth/me")
    assert me.json()["timezone"] == "Asia/Tokyo"


async def test_invalid_timezone_rejected(auth_client):
    client, _, _ = auth_client
    r = await client.patch("/api/v1/auth/me", json={"timezone": "Mars/Phobos"})
    assert r.status_code == 400


async def test_today_endpoints_work_with_tz_set(auth_client):
    # Regression: the ~25 endpoints that now call user_today(user) must not
    # NameError/crash when a timezone is set. Exercise a couple of them.
    client, _, _ = auth_client
    await client.patch("/api/v1/auth/me", json={"timezone": "Asia/Tokyo"})
    assert (await client.get("/api/v1/water/today")).status_code == 200
    assert (await client.get("/api/v1/fasting/stats")).status_code == 200
