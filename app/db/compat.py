"""
Database compatibility layer.
Supports both PostgreSQL (Docker) and SQLite (Desktop).
"""
import uuid
from sqlalchemy import String, JSON, TypeDecorator, text, func
from app.core.config import settings


def is_sqlite() -> bool:
    return settings.database_url.startswith("sqlite")


class GUID(TypeDecorator):
    """Platform-independent UUID type.
    Uses PostgreSQL UUID type when available, otherwise CHAR(36) for SQLite.
    """
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if isinstance(value, uuid.UUID):
                return str(value)
            return str(uuid.UUID(value))
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return uuid.UUID(value)
        return value


# Use native JSONB for PostgreSQL, JSON for SQLite
if not is_sqlite():
    try:
        from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
        UUIDType = PG_UUID(as_uuid=True)
        JSONType = JSONB
    except ImportError:
        UUIDType = GUID()
        JSONType = JSON
else:
    UUIDType = GUID()
    JSONType = JSON


def server_now():
    """Return server-side NOW() compatible with current DB."""
    if is_sqlite():
        return text("(datetime('now'))")
    return func.now()


def python_now():
    """Python-side datetime for onupdate (works with any DB)."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)
