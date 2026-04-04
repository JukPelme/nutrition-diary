"""
Remove duplicate products. Keeps offline (manual) over USDA/OFF.
Run: docker-compose exec app python scripts/dedup_products.py
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select, delete, func
from app.models.product import Product

DB_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///nutrition_diary.db")

# Source priority: lower = keep
SOURCE_PRIORITY = {"manual": 0, "offline": 0, "openfoodfacts": 1, "usda": 2, "custom": 3}


async def dedup():
    engine = create_async_engine(DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        # Find duplicate names
        result = await session.execute(
            select(Product.name, func.count(Product.id))
            .group_by(Product.name)
            .having(func.count(Product.id) > 1)
        )
        dupes = result.all()
        print(f"Found {len(dupes)} duplicate product names")

        removed = 0
        for name, count in dupes:
            # Get all products with this name
            result = await session.execute(
                select(Product).where(Product.name == name).order_by(Product.created_at)
            )
            products = result.scalars().all()

            # Sort by priority (keep best source)
            products.sort(key=lambda p: SOURCE_PRIORITY.get(p.source or "custom", 99))

            # Keep first, delete rest
            keep = products[0]
            for p in products[1:]:
                await session.delete(p)
                removed += 1

        await session.commit()
        print(f"Removed {removed} duplicate products")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(dedup())
