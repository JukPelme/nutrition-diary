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
os.chdir(project_root)

HOST = "127.0.0.1"
PORT = 8000


def open_browser():
    """Open browser after a short delay."""
    time.sleep(2)
    webbrowser.open(f"http://{HOST}:{PORT}")


def seed_if_empty():
    """Create tables and seed database with products if empty."""
    import asyncio

    async def check_and_seed():
        # Create tables first
        from app.db.session import create_tables
        await create_tables()
        print("Tables created.")

        from sqlalchemy.ext.asyncio import async_sessionmaker
        from app.db.session import engine
        from sqlalchemy import select, func as sa_func

        Session = async_sessionmaker(engine, expire_on_commit=False)

        async with Session() as session:
            from app.models.product import Product
            result = await session.execute(select(sa_func.count()).select_from(Product))
            count = result.scalar() or 0

        if count == 0:
            print("Database is empty, seeding products...")
            try:
                from scripts.seed_products import seed
                await seed(os.environ["DATABASE_URL"])
            except Exception as e:
                print(f"  seed_products: {e}")
            try:
                from scripts.seed_conditions import seed as seed_conditions
                await seed_conditions(os.environ["DATABASE_URL"])
            except Exception as e:
                print(f"  seed_conditions: {e}")
            try:
                from scripts.seed_vitamins import update_nutrients
                await update_nutrients(os.environ["DATABASE_URL"])
            except Exception as e:
                print(f"  seed_vitamins: {e}")
            print("Seeding complete!")
        else:
            print(f"Database has {count} products, skipping seed.")

    asyncio.run(check_and_seed())


if __name__ == "__main__":
    print("=" * 50)
    print("  Nutrition Diary — Desktop")
    print("=" * 50)
    print(f"  Starting at http://{HOST}:{PORT}")
    print("  Press Ctrl+C to stop")
    print("=" * 50)

    # Create tables + seed on first run
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
