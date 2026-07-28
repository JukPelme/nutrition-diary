"""User-timezone-aware 'today' / 'now'.

The app's "today" (streaks, daily quests, day summaries) must be the user's
local calendar day, not the server's UTC day. Falls back to UTC when the user
has no timezone set or the name is invalid.
"""
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo


def _zone(arg=None):
    """Resolve a User object / IANA string / None to a tzinfo (UTC fallback)."""
    tzname = arg
    if arg is not None and not isinstance(arg, str):
        tzname = getattr(arg, "timezone", None)
    if not tzname:
        return timezone.utc
    try:
        return ZoneInfo(tzname)
    except Exception:
        return timezone.utc


def user_zone(user_or_tz=None):
    """tzinfo for the user (UTC fallback) — for day-boundary datetimes."""
    return _zone(user_or_tz)


def user_now(user_or_tz=None) -> datetime:
    """Aware 'now' in the user's timezone (UTC if unset/invalid)."""
    return datetime.now(_zone(user_or_tz))


def user_today(user_or_tz=None) -> date:
    """The user's local calendar date (UTC if unset/invalid)."""
    return user_now(user_or_tz).date()
