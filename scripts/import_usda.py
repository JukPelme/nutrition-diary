import os
"""
Import products from USDA FoodData Central API.

Usage:
    python scripts/import_usda.py --api-key YOUR_KEY --pages 50

Get free API key at: https://fdc.nal.usda.gov/api-key-signup.html

Imports Foundation + SR Legacy datasets (~7K high-quality entries with full nutrient profiles).
All USDA products are marked as is_verified=True.
"""
import argparse
import asyncio
import time
from uuid import uuid4
import httpx

USDA_BASE = "https://api.nal.usda.gov/fdc/v1"

# USDA nutrient IDs -> our fields
NUTRIENT_MAP = {
    # Macros
    1008: ("macro", "calories"),      # Energy (kcal)
    1003: ("macro", "protein"),       # Protein
    1004: ("macro", "fat"),           # Total fat
    1005: ("macro", "carbohydrates"), # Carbohydrates
    1079: ("macro", "fiber"),         # Fiber
    2000: ("macro", "sugar"),         # Total sugars
    # Vitamins
    1106: ("vitamin", "vitamin_a"),   # Vitamin A (RAE, mcg)
    1165: ("vitamin", "vitamin_b1"),  # Thiamin (mg)
    1166: ("vitamin", "vitamin_b2"),  # Riboflavin (mg)
    1167: ("vitamin", "vitamin_b3"),  # Niacin (mg)
    1170: ("vitamin", "vitamin_b5"),  # Pantothenic acid (mg)
    1175: ("vitamin", "vitamin_b6"),  # Vitamin B-6 (mg)
    1177: ("vitamin", "vitamin_b9"),  # Folate (mcg)
    1178: ("vitamin", "vitamin_b12"), # Vitamin B-12 (mcg)
    1162: ("vitamin", "vitamin_c"),   # Vitamin C (mg)
    1114: ("vitamin", "vitamin_d"),   # Vitamin D (mcg)
    1109: ("vitamin", "vitamin_e"),   # Vitamin E (mg)
    1185: ("vitamin", "vitamin_k"),   # Vitamin K (mcg)
    # Minerals
    1087: ("mineral", "calcium"),     # Calcium (mg)
    1089: ("mineral", "iron"),        # Iron (mg)
    1090: ("mineral", "magnesium"),   # Magnesium (mg)
    1091: ("mineral", "phosphorus"),  # Phosphorus (mg)
    1092: ("mineral", "potassium"),   # Potassium (mg)
    1093: ("mineral", "sodium"),      # Sodium (mg)
    1095: ("mineral", "zinc"),        # Zinc (mg)
    1103: ("mineral", "selenium"),    # Selenium (mcg)
    1100: ("mineral", "iodine"),      # Iodine (mcg)
}


def parse_usda_food(food: dict) -> dict | None:
    desc = food.get("description", "").strip()
    if not desc or len(desc) < 2:
        return None

    fdc_id = str(food.get("fdcId", ""))

    macros = {}
    vitamins = {}
    minerals = {}

    for nutrient in food.get("foodNutrients", []):
        nid = nutrient.get("nutrient", {}).get("id") or nutrient.get("nutrientId")
        amount = nutrient.get("amount")

        if nid not in NUTRIENT_MAP or amount is None:
            continue

        category, field = NUTRIENT_MAP[nid]
        try:
            val = float(amount)
            if val < 0:
                continue
        except (ValueError, TypeError):
            continue

        if category == "macro":
            macros[field] = val
        elif category == "vitamin":
            vitamins[field] = val
        elif category == "mineral":
            minerals[field] = val

    if "calories" not in macros:
        return None

    return {
        "id": uuid4(),
        "name": desc[:500],
        "brand": (food.get("brandName") or food.get("brandOwner") or "")[:255] or None,
        "barcode": (food.get("gtinUpc") or "")[:50] or None,
        "category": (food.get("foodCategory", {}).get("description") or food.get("foodCategory") or "")[:255] if isinstance(food.get("foodCategory"), (str, dict)) else None,
        "source": "usda",
        "source_id": fdc_id,
        "serving_size": 100.0,
        "serving_unit": "g",
        "calories": macros.get("calories"),
        "protein": macros.get("protein"),
        "fat": macros.get("fat"),
        "carbohydrates": macros.get("carbohydrates"),
        "fiber": macros.get("fiber"),
        "sugar": macros.get("sugar"),
        "vitamins": vitamins if vitamins else None,
        "minerals": minerals if minerals else None,
        "image_url": None,
        "is_verified": True,
    }


async def import_data(api_key: str, pages: int = 50, page_size: int = 200, db_url: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.dialects.postgresql import insert
    from app.models.product import Product

    url = db_url or os.environ.get("DATABASE_URL", "postgresql+asyncpg://nutrition:nutrition@db:5432/nutrition_diary")
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    total_fetched = 0
    total_imported = 0
    start = time.time()

    # Import from Foundation and SR Legacy (best quality)
    data_types = ["Foundation", "SR Legacy"]

    async with httpx.AsyncClient(timeout=30) as client:
        for dtype in data_types:
            print(f"\n--- Importing {dtype} ---")

            for page in range(1, pages + 1):
                params = {
                    "api_key": api_key,
                    "dataType": [dtype],
                    "pageSize": page_size,
                    "pageNumber": page,
                }

                try:
                    resp = await client.get(f"{USDA_BASE}/foods/search", params=params)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as e:
                    print(f"  Error on page {page}: {e}")
                    break

                foods = data.get("foods", [])
                if not foods:
                    print(f"  No more data at page {page}")
                    break

                batch = []
                for food in foods:
                    parsed = parse_usda_food(food)
                    if parsed:
                        batch.append(parsed)

                total_fetched += len(foods)

                if batch:
                    async with session_factory() as session:
                        stmt = insert(Product).values(batch).on_conflict_do_nothing(index_elements=["barcode"])
                        # For products without barcode, use source_id
                        result = await session.execute(stmt)
                        await session.commit()
                        total_imported += result.rowcount

                elapsed = time.time() - start
                print(f"  Page {page}: fetched {len(foods)}, parsed {len(batch)} | Total: {total_fetched} fetched, {total_imported} imported | {elapsed:.0f}s")

                # Rate limiting (USDA allows 1000 req/hour for free)
                await asyncio.sleep(0.5)

    await engine.dispose()
    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s")
    print(f"Total fetched: {total_fetched} | Imported: {total_imported}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import USDA FoodData Central products")
    parser.add_argument("--api-key", required=True, help="USDA API key")
    parser.add_argument("--pages", type=int, default=50, help="Pages per dataset")
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()

    asyncio.run(import_data(args.api_key, args.pages, args.db_url))
