"""Cross-database insert helper."""
import os


def get_insert_func():
    """Return dialect-specific insert function with on_conflict_do_nothing."""
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url.startswith("sqlite"):
        from sqlalchemy.dialects.sqlite import insert
    else:
        from sqlalchemy.dialects.postgresql import insert
    return insert


def get_db_url(fallback=None):
    """Get DATABASE_URL from env with fallback."""
    return os.environ.get("DATABASE_URL", fallback or "sqlite+aiosqlite:///nutrition_diary.db")
