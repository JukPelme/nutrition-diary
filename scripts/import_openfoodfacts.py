"""
Import products from Open Food Facts CSV dump.

Usage:
    1. Download CSV: wget https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
    2. Gunzip: gunzip en.openfoodfacts.org.products.csv.gz
    3. Run: python scripts/import_openfoodfacts.py --file en.openfoodfacts.org.products.csv --batch-size 5000

The script processes in batches and can be resumed (skips existing barcodes).
"""
import argparse
import csv
import sys
import time
import asyncio
from uuid import uuid4

csv.field_size_limit(sys.maxsize)


# Nutrient mapping: OFF column -> our field
MACRO_MAP = {
    "energy-kcal_100g": "calories",
    "proteins_100g": "protein",
    "fat_100g": "fat",
    "carbohydrates_100g": "carbohydrates",
    "fiber_100g": "fiber",
    "sugars_100g": "sugar",
}

VITAMIN_MAP = {
    "vitamin-a_100g": "vitamin_a",
    "vitamin-b1_100g": "vitamin_b1",
    "vitamin-b2_100g": "vitamin_b2",
    "vitamin-pp_100g": "vitamin_b3",
    "pantothenic-acid_100g": "vitamin_b5",
    "vitamin-b6_100g": "vitamin_b6",
    "vitamin-b9_100g": "vitamin_b9",
    "vitamin-b12_100g": "vitamin_b12",
    "vitamin-c_100g": "vitamin_c",
    "vitamin-d_100g": "vitamin_d",
    "vitamin-e_100g": "vitamin_e",
    "vitamin-k_100g": "vitamin_k",
}

MINERAL_MAP = {
    "calcium_100g": "calcium",
    "iron_100g": "iron",
    "magnesium_100g": "magnesium",
    "phosphorus_100g": "phosphorus",
    "potassium_100g": "potassium",
    "sodium_100g": "sodium",
    "zinc_100g": "zinc",
    "selenium_100g": "selenium",
    "iodine_100g": "iodine",
}


def safe_float(val: str, max_val: float | None = None) -> float | None:
    if not val or val.strip() == "":
        return None
    try:
        v = float(val)
        if v < 0:
            return None
        if max_val is not None and v > max_val:
            return None
        return v
    except (ValueError, TypeError):
        return None


def validate_product(data: dict) -> bool:
    """Reject obviously bad data."""
    cal = data.get("calories")
    protein = data.get("protein") or 0
    fat = data.get("fat") or 0
    carbs = data.get("carbohydrates") or 0

    # Calories can't exceed 900 kcal/100g (pure fat = 900)
    if cal is not None and cal > 900:
        return False

    # Macros can't exceed 100g per 100g
    if protein > 100 or fat > 100 or carbs > 100:
        return False

    # Sum of macros can't exceed ~100g (with some tolerance for rounding)
    if (protein + fat + carbs) > 105:
        return False

    # Calorie sanity check: calculated vs declared (±50%)
    if cal and cal > 0:
        calculated = protein * 4 + fat * 9 + carbs * 4
        if calculated > 0:
            ratio = cal / calculated
            if ratio > 2.0 or ratio < 0.3:
                return False

    return True


def parse_row(row: dict) -> dict | None:
    name = row.get("product_name", "").strip()
    barcode = row.get("code", "").strip()

    if not name or len(name) < 2:
        return None
    if not barcode:
        return None

    # Macros
    macros = {}
    for off_col, our_field in MACRO_MAP.items():
        max_v = 900.0 if our_field == "calories" else 100.0
        val = safe_float(row.get(off_col, ""), max_val=max_v)
        if val is not None:
            macros[our_field] = val

    # Skip if no calorie data at all
    if "calories" not in macros:
        return None

    # Vitamins
    vitamins = {}
    for off_col, our_field in VITAMIN_MAP.items():
        val = safe_float(row.get(off_col, ""))
        if val is not None:
            vitamins[our_field] = val

    # Minerals
    minerals = {}
    for off_col, our_field in MINERAL_MAP.items():
        val = safe_float(row.get(off_col, ""))
        if val is not None:
            minerals[our_field] = val

    result = {
        "id": uuid4(),
        "name": name[:500],
        "brand": (row.get("brands", "") or "")[:255] or None,
        "barcode": barcode[:50],
        "category": (row.get("main_category_en", "") or "")[:255] or None,
        "source": "openfoodfacts",
        "source_id": barcode,
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
        "image_url": (row.get("image_url", "") or "")[:500] or None,
        "is_verified": False,
    }

    if not validate_product(result):
        return None

    return result


async def import_data(file_path: str, batch_size: int = 5000, db_url: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.dialects.postgresql import insert
    from app.models.product import Product

    url = db_url or "postgresql+asyncpg://nutrition:nutrition@localhost:5432/nutrition_diary"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    total = 0
    imported = 0
    skipped = 0
    batch = []
    start = time.time()

    print(f"Reading {file_path}...")

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")

        for row in reader:
            total += 1
            parsed = parse_row(row)
            if not parsed:
                skipped += 1
                continue

            batch.append(parsed)

            if len(batch) >= batch_size:
                async with session_factory() as session:
                    stmt = insert(Product).values(batch).on_conflict_do_nothing(index_elements=["barcode"])
                    result = await session.execute(stmt)
                    await session.commit()
                    imported += result.rowcount

                elapsed = time.time() - start
                rate = total / elapsed if elapsed > 0 else 0
                print(f"  Processed: {total:,} | Imported: {imported:,} | Skipped: {skipped:,} | {rate:.0f} rows/s")
                batch = []

        # Final batch
        if batch:
            async with session_factory() as session:
                stmt = insert(Product).values(batch).on_conflict_do_nothing(index_elements=["barcode"])
                result = await session.execute(stmt)
                await session.commit()
                imported += result.rowcount

    await engine.dispose()
    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s")
    print(f"Total rows: {total:,} | Imported: {imported:,} | Skipped: {skipped:,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Open Food Facts products")
    parser.add_argument("--file", required=True, help="Path to CSV file")
    parser.add_argument("--batch-size", type=int, default=5000)
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()

    asyncio.run(import_data(args.file, args.batch_size, args.db_url))
