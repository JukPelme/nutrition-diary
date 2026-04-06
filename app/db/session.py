from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event
from app.core.config import settings
from app.db.compat import is_sqlite

connect_args = {}
if is_sqlite():
    connect_args["check_same_thread"] = False

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args=connect_args,
)

# Enable foreign key enforcement for SQLite
if is_sqlite():
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
        # Override built-in lower() with Python's unicode-aware version
        # Fixes case-insensitive search for Cyrillic (SQLite only handles ASCII)
        dbapi_conn.create_function("lower", 1, lambda s: s.lower() if s else s)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_tables():
    """Create all tables (used for SQLite desktop mode)."""
    from app.db.base import Base
    import app.models.user
    import app.models.product
    import app.models.diary
    import app.models.health
    import app.models.device
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
