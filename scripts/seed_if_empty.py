"""Idempotent seed runner used in Docker CMD.

Sequence on each start:
  1. Base offline seed (products + ICD-11 + vitamins) — only if products < 100.
  2. Extended seed via Open Food Facts API — if EXTENDED_SEED=1 and we haven't done it yet.
  3. Demo user fixture — if DEMO_USER=1 and demo user doesn't exist yet.

After EXTENDED_SEED finishes successfully, you should clear the env var in Railway.
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


async def base_seed_if_needed():
    from sqlalchemy import select, func
    from app.db.session import async_session
    from app.models import Product

    async with async_session() as s:
        n = (await s.execute(select(func.count(Product.id)))).scalar() or 0
    if n >= 100:
        print(f"[seed] base: skipping ({n} products already)")
        return

    print(f"[seed] base: only {n} products — running offline seed...")
    db_url = _normalized_db_url()
    from scripts.seed_products import seed as seed_products
    from scripts.seed_conditions import seed as seed_conditions
    from scripts.seed_vitamins import update_nutrients
    await seed_products(db_url)
    await seed_conditions(db_url)
    await update_nutrients(db_url)
    print("[seed] base: done")


async def extended_seed_if_requested():
    if os.environ.get("EXTENDED_SEED") != "1":
        return
    # Pre-flight: skip if we already have a lot of products (rerun safety)
    from sqlalchemy import select, func
    from app.db.session import async_session
    from app.models import Product
    async with async_session() as s:
        n = (await s.execute(select(func.count(Product.id)))).scalar() or 0
    if n >= 1500:
        print(f"[seed] extended: skipping (already {n} products)")
        return

    pages = int(os.environ.get("EXTENDED_SEED_PAGES", "2"))
    print(f"[seed] extended: fetching {pages} pages per category from Open Food Facts...")
    # dedup_products reads DATABASE_URL directly; normalize it in env
    norm = _normalized_db_url()
    if norm:
        os.environ["DATABASE_URL"] = norm

    from scripts.import_off_api import import_data as import_off
    await import_off(pages, norm)
    print("[seed] extended: OFF import done, running dedup...")
    from scripts.dedup_products import dedup
    await dedup()
    print("[seed] extended: done")


async def demo_user_if_requested():
    if os.environ.get("DEMO_USER") != "1":
        return
    print("[seed] demo: creating demo fixture if missing...")
    from scripts.seed_demo_user import main as demo_main
    await demo_main()


async def usda_seed_if_requested():
    if os.environ.get("USDA_SEED") != "1":
        return
    api_key = os.environ.get("USDA_API_KEY")
    if not api_key:
        print("[seed] usda: USDA_API_KEY missing — skipping")
        return
    # Skip if already done
    from sqlalchemy import select, func
    from app.db.session import async_session
    from app.models import Product
    async with async_session() as s:
        n_usda = (await s.execute(select(func.count(Product.id)).where(Product.source == "usda"))).scalar() or 0
    if n_usda >= 200:
        print(f"[seed] usda: skipping ({n_usda} USDA products already)")
        return

    pages = int(os.environ.get("USDA_SEED_PAGES", "15"))
    print(f"[seed] usda: importing {pages} pages per query from FoodData Central...")
    norm = _normalized_db_url()
    if norm:
        os.environ["DATABASE_URL"] = norm
    from scripts.import_usda import import_data as import_usda
    await import_usda(api_key, pages, norm)
    print("[seed] usda: import done, running dedup...")
    from scripts.dedup_products import dedup
    await dedup()
    print("[seed] usda: done")


async def main():
    await base_seed_if_needed()
    await extended_seed_if_requested()
    await usda_seed_if_requested()
    await demo_user_if_requested()


if __name__ == "__main__":
    asyncio.run(main())
