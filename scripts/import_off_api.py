import os
"""
Import products from Open Food Facts API (no CSV download needed).
Fetches popular categories relevant to Russian market.

Usage: python scripts/import_off_api.py [--pages 5]
"""
import argparse
import asyncio
import time
from uuid import uuid4
import httpx

OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"

CATEGORIES = [
    "dairy", "meats", "cereals", "breads", "beverages",
    "snacks", "frozen-foods", "canned-foods", "sauces",
    "chocolates", "cheeses", "yogurts", "milks",
    "pastas", "rice", "oils", "nuts", "fruits",
    "vegetables", "fish", "eggs", "honey",
    "tea", "coffee", "juices", "water",
    "baby-foods", "breakfast-cereals", "biscuits",
]


def safe_float(val, max_val=None):
    if val is None or val == "":
        return None
    try:
        v = float(val)
        if v < 0:
            return None
        if max_val and v > max_val:
            return None
        return round(v, 2)
    except (ValueError, TypeError):
        return None


def parse_off_product(p: dict) -> dict | None:
    name = (p.get("product_name") or "").strip()
    if not name or len(name) < 2:
        return None

    barcode = (p.get("code") or "").strip()
    if not barcode:
        return None

    n = p.get("nutriments", {})
    cal = safe_float(n.get("energy-kcal_100g"), 900)
    if cal is None:
        return None

    protein = safe_float(n.get("proteins_100g"), 100)
    fat = safe_float(n.get("fat_100g"), 100)
    carbs = safe_float(n.get("carbohydrates_100g"), 100)

    # Basic validation
    prot_v = protein or 0
    fat_v = fat or 0
    carbs_v = carbs or 0
    if (prot_v + fat_v + carbs_v) > 105:
        return None

    vitamins = {}
    for key, field in [
        ("vitamin-a_100g", "vitamin_a"), ("vitamin-c_100g", "vitamin_c"),
        ("vitamin-d_100g", "vitamin_d"), ("vitamin-e_100g", "vitamin_e"),
    ]:
        v = safe_float(n.get(key))
        if v:
            vitamins[field] = v

    minerals = {}
    for key, field in [
        ("calcium_100g", "calcium"), ("iron_100g", "iron"),
        ("magnesium_100g", "magnesium"), ("sodium_100g", "sodium"),
        ("potassium_100g", "potassium"),
    ]:
        v = safe_float(n.get(key))
        if v:
            minerals[field] = v

    return {
        "id": uuid4(),
        "name": name[:500],
        "brand": (p.get("brands") or "")[:255] or None,
        "barcode": barcode[:50],
        "category": (p.get("categories_tags", [None])[0] or "")[:255].replace("en:", "") or None,
        "source": "openfoodfacts",
        "source_id": barcode,
        "serving_size": 100.0,
        "serving_unit": "g",
        "calories": cal,
        "protein": protein,
        "fat": fat,
        "carbohydrates": carbs,
        "fiber": safe_float(n.get("fiber_100g"), 100),
        "sugar": safe_float(n.get("sugars_100g"), 100),
        "vitamins": vitamins if vitamins else None,
        "minerals": minerals if minerals else None,
        "image_url": (p.get("image_url") or "")[:500] or None,
        "is_verified": False,
    }


async def import_data(pages: int = 5, db_url: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.dialects.postgresql import insert
    from app.models.product import Product

    url = db_url or os.environ.get("DATABASE_URL", "postgresql+asyncpg://nutrition:nutrition@db:5432/nutrition_diary")
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    total_fetched = 0
    total_imported = 0
    start = time.time()

    async with httpx.AsyncClient(timeout=30) as client:
        for cat in CATEGORIES:
            print(f"\n--- {cat} ---")
            for page in range(1, pages + 1):
                params = {
                    "action": "process",
                    "tagtype_0": "categories",
                    "tag_contains_0": "contains",
                    "tag_0": cat,
                    "page_size": 100,
                    "page": page,
                    "json": 1,
                    "fields": "code,product_name,brands,nutriments,categories_tags,image_url",
                }
                try:
                    resp = await client.get(OFF_SEARCH, params=params)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as e:
                    print(f"  Error: {e}")
                    break

                products = data.get("products", [])
                if not products:
                    break

                batch = []
                for p in products:
                    parsed = parse_off_product(p)
                    if parsed:
                        batch.append(parsed)

                total_fetched += len(products)

                if batch:
                    async with session_factory() as session:
                        stmt = insert(Product).values(batch).on_conflict_do_nothing(index_elements=["barcode"])
                        result = await session.execute(stmt)
                        await session.commit()
                        total_imported += result.rowcount

                elapsed = time.time() - start
                print(f"  Page {page}: +{len(batch)} parsed | Total: {total_imported} imported | {elapsed:.0f}s")

                await asyncio.sleep(0.3)  # rate limit

    await engine.dispose()
    elapsed = time.time() - start
    print(f"\nГотово за {elapsed:.1f}с")
    print(f"Получено: {total_fetched} | Импортировано: {total_imported}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=5, help="Pages per category (100 products/page)")
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()
    asyncio.run(import_data(args.pages, args.db_url))
