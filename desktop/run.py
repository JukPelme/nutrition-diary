"""
Desktop launcher for Nutrition Diary.
Starts FastAPI server with SQLite and opens browser.

Usage: python desktop/run.py
"""
import os
import sys
import time
import threading
import webbrowser

# Set environment for desktop mode
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///nutrition_diary.db")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("SECRET_KEY", "desktop-local-key-change-me")

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

HOST = "127.0.0.1"
PORT = 8000


def open_browser():
    """Open browser after a short delay."""
    time.sleep(2)
    webbrowser.open(f"http://{HOST}:{PORT}")


def seed_if_empty():
    """Seed database with products if empty."""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select, func

    async def check_and_seed():
        db_url = os.environ["DATABASE_URL"]
        engine = create_async_engine(db_url)
        Session = async_sessionmaker(engine, expire_on_commit=False)

        async with Session() as session:
            # Import after path is set
            from app.models.product import Product
            result = await session.execute(select(func.count()).select_from(Product))
            count = result.scalar() or 0

        await engine.dispose()

        if count == 0:
            print("Database is empty, seeding products...")
            from scripts.seed_products import seed
            await seed(db_url)
            from scripts.seed_conditions import seed as seed_conditions
            await seed_conditions(db_url)
            from scripts.seed_vitamins import update_nutrients
            await update_nutrients(db_url)
            print("Seeding complete!")
        else:
            print(f"Database has {count} products, skipping seed.")

    asyncio.run(check_and_seed())


if __name__ == "__main__":
    print("=" * 50)
    print("  Дневник питания — Desktop")
    print("=" * 50)
    print(f"  Запускаю на http://{HOST}:{PORT}")
    print("  Нажмите Ctrl+C для остановки")
    print("=" * 50)

    # Seed on first run
    try:
        seed_if_empty()
    except Exception as e:
        print(f"Seed error (non-critical): {e}")

    # Open browser in background
    threading.Thread(target=open_browser, daemon=True).start()

    # Start server
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        log_level="info",
    )
