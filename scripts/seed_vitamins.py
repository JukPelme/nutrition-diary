"""
Add vitamins & minerals data to existing offline products.
Run after seed_products.py: python scripts/seed_vitamins.py
"""
import os
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import update, select
from app.models.product import Product

# Vitamins & minerals per 100g for key products
# Format: product_name -> {vitamins: {...}, minerals: {...}}
NUTRIENT_DATA = {
    "Куриная грудка": {
        "vitamins": {"vitamin_b3": 13.7, "vitamin_b6": 0.6, "vitamin_b12": 0.3, "vitamin_b5": 0.8},
        "minerals": {"phosphorus": 228, "potassium": 256, "magnesium": 29, "zinc": 0.7, "selenium": 27.6, "iron": 0.4}
    },
    "Говядина (вырезка)": {
        "vitamins": {"vitamin_b12": 2.6, "vitamin_b3": 5.4, "vitamin_b6": 0.4},
        "minerals": {"iron": 2.6, "zinc": 4.5, "phosphorus": 198, "potassium": 318, "selenium": 18.5, "magnesium": 21}
    },
    "Печень говяжья": {
        "vitamins": {"vitamin_a": 9442, "vitamin_b12": 59.3, "vitamin_b2": 2.8, "vitamin_b3": 13.2, "vitamin_b9": 290, "vitamin_c": 1.3, "vitamin_b6": 1.1},
        "minerals": {"iron": 6.5, "zinc": 4.0, "phosphorus": 387, "potassium": 313, "selenium": 39.7, "copper": 9.8}
    },
    "Лосось (сёмга)": {
        "vitamins": {"vitamin_d": 11.0, "vitamin_b12": 3.2, "vitamin_b3": 8.0, "vitamin_b6": 0.6, "vitamin_e": 1.8},
        "minerals": {"selenium": 36.5, "phosphorus": 252, "potassium": 363, "magnesium": 27, "zinc": 0.4}
    },
    "Треска": {
        "vitamins": {"vitamin_b12": 0.9, "vitamin_d": 0.9, "vitamin_b3": 2.1, "vitamin_b6": 0.2},
        "minerals": {"selenium": 33.1, "phosphorus": 203, "potassium": 413, "iodine": 110, "magnesium": 32}
    },
    "Яйцо куриное (целое)": {
        "vitamins": {"vitamin_a": 160, "vitamin_d": 2.0, "vitamin_b12": 0.9, "vitamin_b2": 0.5, "vitamin_b5": 1.5, "vitamin_k": 0.3, "vitamin_e": 1.1},
        "minerals": {"selenium": 30.7, "phosphorus": 198, "iron": 1.8, "zinc": 1.3, "potassium": 138, "calcium": 56}
    },
    "Молоко 3.2%": {
        "vitamins": {"vitamin_b12": 0.4, "vitamin_b2": 0.2, "vitamin_d": 0.1, "vitamin_a": 46},
        "minerals": {"calcium": 120, "phosphorus": 95, "potassium": 150, "magnesium": 14, "zinc": 0.4}
    },
    "Творог 5%": {
        "vitamins": {"vitamin_b12": 0.5, "vitamin_b2": 0.3, "vitamin_a": 50},
        "minerals": {"calcium": 164, "phosphorus": 220, "potassium": 112, "magnesium": 23, "selenium": 9.7, "zinc": 0.4}
    },
    "Сыр Российский": {
        "vitamins": {"vitamin_a": 262, "vitamin_b12": 1.5, "vitamin_b2": 0.3, "vitamin_k": 2.7},
        "minerals": {"calcium": 880, "phosphorus": 500, "sodium": 810, "zinc": 3.5, "selenium": 14.5}
    },
    "Гречка (сухая)": {
        "vitamins": {"vitamin_b1": 0.4, "vitamin_b2": 0.2, "vitamin_b3": 4.2, "vitamin_b6": 0.4, "vitamin_b9": 32},
        "minerals": {"magnesium": 200, "phosphorus": 298, "potassium": 380, "iron": 6.7, "zinc": 2.4, "manganese": 1.3}
    },
    "Овсянка (сухая)": {
        "vitamins": {"vitamin_b1": 0.8, "vitamin_b5": 1.3, "vitamin_b9": 56, "vitamin_b6": 0.1},
        "minerals": {"magnesium": 177, "phosphorus": 523, "iron": 4.7, "zinc": 4.0, "potassium": 429, "manganese": 4.9}
    },
    "Шпинат": {
        "vitamins": {"vitamin_a": 469, "vitamin_c": 28.1, "vitamin_k": 483, "vitamin_b9": 194, "vitamin_e": 2.0},
        "minerals": {"iron": 2.7, "magnesium": 79, "potassium": 558, "calcium": 99, "manganese": 0.9}
    },
    "Брокколи": {
        "vitamins": {"vitamin_c": 89.2, "vitamin_k": 102, "vitamin_a": 31, "vitamin_b9": 63, "vitamin_b6": 0.2},
        "minerals": {"potassium": 316, "phosphorus": 66, "calcium": 47, "magnesium": 21, "iron": 0.7}
    },
    "Банан": {
        "vitamins": {"vitamin_b6": 0.4, "vitamin_c": 8.7, "vitamin_b9": 20},
        "minerals": {"potassium": 358, "magnesium": 27, "phosphorus": 22, "manganese": 0.3}
    },
    "Апельсин": {
        "vitamins": {"vitamin_c": 53.2, "vitamin_b1": 0.1, "vitamin_b9": 30, "vitamin_a": 11},
        "minerals": {"potassium": 181, "calcium": 40, "magnesium": 10, "phosphorus": 14}
    },
    "Грецкий орех": {
        "vitamins": {"vitamin_b6": 0.5, "vitamin_b9": 98, "vitamin_e": 0.7, "vitamin_b1": 0.3},
        "minerals": {"magnesium": 158, "phosphorus": 346, "potassium": 441, "zinc": 3.1, "iron": 2.9, "manganese": 3.4}
    },
    "Миндаль": {
        "vitamins": {"vitamin_e": 25.6, "vitamin_b2": 1.1, "vitamin_b3": 3.6},
        "minerals": {"magnesium": 270, "phosphorus": 481, "calcium": 269, "iron": 3.7, "zinc": 3.1, "potassium": 733}
    },
    "Чечевица (сухая)": {
        "vitamins": {"vitamin_b9": 479, "vitamin_b1": 0.9, "vitamin_b6": 0.5, "vitamin_b5": 2.1},
        "minerals": {"iron": 6.5, "phosphorus": 281, "potassium": 677, "magnesium": 47, "zinc": 3.3}
    },
    "Картофель": {
        "vitamins": {"vitamin_c": 19.7, "vitamin_b6": 0.3, "vitamin_b3": 1.1, "vitamin_b9": 15},
        "minerals": {"potassium": 425, "phosphorus": 57, "magnesium": 23, "iron": 0.8}
    },
    "Морковь": {
        "vitamins": {"vitamin_a": 835, "vitamin_c": 5.9, "vitamin_k": 13.2, "vitamin_b6": 0.1},
        "minerals": {"potassium": 320, "calcium": 33, "phosphorus": 35, "magnesium": 12}
    },
    "Помидор": {
        "vitamins": {"vitamin_c": 14.0, "vitamin_a": 42, "vitamin_k": 7.9},
        "minerals": {"potassium": 237, "phosphorus": 24, "magnesium": 11}
    },
    "Индейка (грудка)": {
        "vitamins": {"vitamin_b3": 11.8, "vitamin_b6": 0.8, "vitamin_b12": 0.4},
        "minerals": {"selenium": 30.2, "phosphorus": 230, "potassium": 293, "zinc": 1.2, "magnesium": 29}
    },
    "Кефир 2.5%": {
        "vitamins": {"vitamin_b12": 0.4, "vitamin_b2": 0.2, "vitamin_a": 22},
        "minerals": {"calcium": 120, "phosphorus": 95, "potassium": 152, "magnesium": 14}
    },
    "Масло оливковое": {
        "vitamins": {"vitamin_e": 14.4, "vitamin_k": 60.2},
        "minerals": {"iron": 0.6, "calcium": 1, "potassium": 1}
    },
    "Яблоко": {
        "vitamins": {"vitamin_c": 4.6},
        "minerals": {"potassium": 107, "calcium": 6, "phosphorus": 11, "magnesium": 5}
    },
    "Рис белый (сухой)": {
        "vitamins": {"vitamin_b1": 0.1, "vitamin_b3": 1.6},
        "minerals": {"magnesium": 25, "phosphorus": 115, "potassium": 115, "zinc": 1.1, "iron": 0.8}
    },
    "Капуста белокочанная": {
        "vitamins": {"vitamin_c": 36.6, "vitamin_k": 76.0, "vitamin_b9": 43},
        "minerals": {"potassium": 170, "calcium": 40, "magnesium": 12, "phosphorus": 26}
    },
    "Креветки": {
        "vitamins": {"vitamin_b12": 1.1, "vitamin_b3": 2.6, "vitamin_e": 1.2},
        "minerals": {"selenium": 38.0, "phosphorus": 201, "zinc": 1.6, "iodine": 35, "iron": 2.4, "potassium": 259}
    },
    "Мёд": {
        "vitamins": {"vitamin_c": 0.5},
        "minerals": {"potassium": 52, "calcium": 6, "phosphorus": 4, "magnesium": 2, "iron": 0.4}
    },
    "Шоколад тёмный 70%": {
        "vitamins": {"vitamin_k": 7.3},
        "minerals": {"iron": 11.9, "magnesium": 228, "phosphorus": 308, "potassium": 715, "zinc": 3.3, "manganese": 1.9}
    },
}


async def update_nutrients(db_url=None):
    url = db_url or os.environ.get("DATABASE_URL", "postgresql+asyncpg://nutrition:nutrition@db:5432/nutrition_diary")
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    updated = 0
    async with session_factory() as session:
        for name, data in NUTRIENT_DATA.items():
            result = await session.execute(select(Product).where(Product.name == name))
            product = result.scalar_one_or_none()
            if product:
                stmt = update(Product).where(Product.id == product.id).values(
                    vitamins=data.get("vitamins"),
                    minerals=data.get("minerals"),
                )
                await session.execute(stmt)
                updated += 1

        await session.commit()

    await engine.dispose()
    print(f"Обновлено {updated} продуктов из {len(NUTRIENT_DATA)} (витамины + минералы)")


if __name__ == "__main__":
    asyncio.run(update_nutrients())
