"""
Import products from USDA FoodData Central API.
Uses Foundation + SR Legacy datasets (clean, unbranded foods).

Usage:
    python scripts/import_usda.py                  # uses DEMO_KEY (30 req/hr)
    python scripts/import_usda.py --key YOUR_KEY   # your key (1000 req/hr)
"""
import os
import sys
import asyncio
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.models.product import Product

DB_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://nutrition:nutrition@db:5432/nutrition_db")

# USDA nutrient IDs
NUTRIENT_MAP = {
    1008: 'calories',      # Energy (kcal)
    1003: 'protein',       # Protein
    1004: 'fat',           # Total Fat
    1005: 'carbohydrates', # Carbohydrates
    1079: 'fiber',         # Fiber
    1063: 'sugar',         # Sugars
}

VITAMIN_MAP = {
    1106: 'vitamin_a',   # Vitamin A (RAE, mcg)
    1109: 'vitamin_e',   # Vitamin E (mg)
    1114: 'vitamin_d',   # Vitamin D (mcg)
    1162: 'vitamin_c',   # Vitamin C (mg)
    1165: 'vitamin_b1',  # Thiamin (mg)
    1166: 'vitamin_b2',  # Riboflavin (mg)
    1167: 'vitamin_b3',  # Niacin (mg)
    1170: 'vitamin_b5',  # Pantothenic acid (mg)
    1175: 'vitamin_b6',  # Vitamin B6 (mg)
    1177: 'vitamin_b9',  # Folate (mcg)
    1178: 'vitamin_b12', # Vitamin B12 (mcg)
    1185: 'vitamin_k',   # Vitamin K (mcg)
}

MINERAL_MAP = {
    1087: 'calcium',     # Calcium (mg)
    1089: 'iron',        # Iron (mg)
    1090: 'magnesium',   # Magnesium (mg)
    1091: 'phosphorus',  # Phosphorus (mg)
    1092: 'potassium',   # Potassium (mg)
    1093: 'sodium',      # Sodium (mg)
    1095: 'zinc',        # Zinc (mg)
    1103: 'selenium',    # Selenium (mcg)
}

# Search queries for common food categories
QUERIES = [
    ("chicken", "Мясо"),
    ("beef", "Мясо"),
    ("pork", "Мясо"),
    ("turkey", "Мясо"),
    ("salmon", "Рыба"),
    ("tuna", "Рыба"),
    ("cod", "Рыба"),
    ("shrimp", "Морепродукты"),
    ("milk", "Молочные"),
    ("cheese", "Молочные"),
    ("yogurt", "Молочные"),
    ("egg", "Яйца"),
    ("rice", "Крупы"),
    ("oats", "Крупы"),
    ("wheat", "Крупы"),
    ("bread", "Хлеб"),
    ("apple", "Фрукты"),
    ("banana", "Фрукты"),
    ("orange", "Фрукты"),
    ("grape", "Фрукты"),
    ("strawberry", "Фрукты"),
    ("mango", "Фрукты"),
    ("avocado", "Фрукты"),
    ("tomato", "Овощи"),
    ("potato", "Овощи"),
    ("carrot", "Овощи"),
    ("broccoli", "Овощи"),
    ("spinach", "Овощи"),
    ("onion", "Овощи"),
    ("pepper", "Овощи"),
    ("cabbage", "Овощи"),
    ("beans", "Бобовые"),
    ("lentils", "Бобовые"),
    ("peanut", "Орехи"),
    ("almond", "Орехи"),
    ("walnut", "Орехи"),
    ("olive oil", "Масла"),
    ("butter", "Масла"),
    ("sugar", "Сладкое"),
    ("honey", "Сладкое"),
    ("pasta", "Макароны"),
    ("soybean", "Бобовые"),
]


def parse_nutrients(food):
    """Extract nutrients from USDA food item."""
    nutrients = food.get('foodNutrients', [])
    result = {}
    vitamins = {}
    minerals = {}

    for n in nutrients:
        nid = n.get('nutrientId')
        amount = n.get('value', 0) or 0

        if nid in NUTRIENT_MAP:
            result[NUTRIENT_MAP[nid]] = round(amount, 2)
        elif nid in VITAMIN_MAP:
            if amount > 0:
                vitamins[VITAMIN_MAP[nid]] = round(amount, 3)
        elif nid in MINERAL_MAP:
            if amount > 0:
                minerals[MINERAL_MAP[nid]] = round(amount, 3)

    return result, vitamins, minerals


async def import_data(api_key: str, pages: int = 15, db_url: str = None):
    engine = create_async_engine(db_url or DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    total_added = 0
    total_skipped = 0
    seen_names = set()

    async with httpx.AsyncClient(timeout=30) as client:
        for query, category in QUERIES:
            try:
                # Use Foundation and SR Legacy data types for clean products
                resp = await client.get(
                    "https://api.nal.usda.gov/fdc/v1/foods/search",
                    params={
                        "api_key": api_key,
                        "query": query,
                        "dataType": "Foundation,SR Legacy",
                        "pageSize": 15,
                        "sortBy": "dataType.keyword",
                        "sortOrder": "asc",
                    }
                )
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"  [!] Error fetching '{query}': {e}")
                continue

            foods = data.get('foods', [])
            if not foods:
                print(f"  [-] '{query}': no results")
                continue

            async with Session() as session:
                for food in foods:
                    name = food.get('description', '').strip()
                    if not name or name in seen_names:
                        continue
                    seen_names.add(name)

                    # Check if exists
                    existing = await session.execute(
                        select(Product).where(Product.name == name).limit(1)
                    )
                    if existing.scalars().first():
                        total_skipped += 1
                        continue

                    macros, vitamins, minerals = parse_nutrients(food)

                    product = Product(
                        name=name,
                        brand="USDA",
                        category=category,
                        serving_size=100.0,
                        serving_unit="g",
                        calories=macros.get('calories', 0),
                        protein=macros.get('protein', 0),
                        fat=macros.get('fat', 0),
                        carbohydrates=macros.get('carbohydrates', 0),
                        fiber=macros.get('fiber'),
                        sugar=macros.get('sugar'),
                        vitamins=vitamins if vitamins else None,
                        minerals=minerals if minerals else None,
                        is_verified=True,
                        source="usda",
                    )
                    session.add(product)
                    total_added += 1

                await session.commit()

            print(f"  [+] '{query}' ({category}): {len(foods)} found")
            await asyncio.sleep(0.5)  # Rate limit

    await engine.dispose()
    print(f"\nDone! Added: {total_added}, Skipped (duplicates): {total_skipped}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", default="DEMO_KEY", help="USDA API key")
    args = parser.parse_args()
    print(f"Importing from USDA FoodData Central (key: {'custom' if args.key != 'DEMO_KEY' else 'DEMO_KEY'})...")
    asyncio.run(import_data(args.key))
