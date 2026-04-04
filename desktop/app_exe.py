"""
PyInstaller entry point for Nutrition Diary.
Handles resource paths for both dev and frozen (exe) modes.
"""
import os
import sys
import time
import threading
import webbrowser

def get_base_dir():
    """Get base directory — works both in dev and PyInstaller frozen mode."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_data_dir():
    """Get writable data directory (next to .exe or project root)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BASE_DIR = get_base_dir()
DATA_DIR = get_data_dir()

# Set environment
db_path = os.path.join(DATA_DIR, "nutrition_diary.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("SECRET_KEY", "desktop-local-key-change-me")

# Add base to path
sys.path.insert(0, BASE_DIR)
os.chdir(BASE_DIR)

HOST = "127.0.0.1"
PORT = 8000


def open_browser():
    time.sleep(2)
    webbrowser.open(f"http://{HOST}:{PORT}")


def seed_if_empty():
    import asyncio

    async def check_and_seed():
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
    print("  Nutrition Diary")
    print("=" * 50)
    print(f"  http://{HOST}:{PORT}")
    print("  Press Ctrl+C to stop")
    print("=" * 50)

    try:
        seed_if_empty()
    except Exception as e:
        print(f"Seed error (non-critical): {e}")

    threading.Thread(target=open_browser, daemon=True).start()

    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=HOST,
        port=PORT,
        log_level="info",
    )
