"""Idempotent seed: runs seed_all only if products table is sparse.

Used in Docker CMD so the prod DB is auto-populated on first start,
but subsequent restarts skip the work.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _normalized_db_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def main():
    from sqlalchemy import select, func
    from app.db.session import async_session
    from app.models import Product

    async with async_session() as s:
        n = (await s.execute(select(func.count(Product.id)))).scalar() or 0

    if n >= 100:
        print(f"[seed_if_empty] Products table has {n} rows (>=100), skipping.")
        return

    print(f"[seed_if_empty] Only {n} products in DB — seeding offline products + ICD-11...")

    db_url = _normalized_db_url()

    from scripts.seed_products import seed as seed_products
    from scripts.seed_conditions import seed as seed_conditions
    from scripts.seed_vitamins import update_nutrients

    await seed_products(db_url)
    await seed_conditions(db_url)
    await update_nutrients(db_url)
    print("[seed_if_empty] Done.")


if __name__ == "__main__":
    asyncio.run(main())
