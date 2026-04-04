"""
Extend conditions from 14 to 50+ ICD-11 diagnoses with dietary rules.
Run: docker-compose exec app python scripts/seed_conditions_extra.py
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.models.health import ICD11Condition as Condition

DB_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///nutrition_diary.db")

EXTRA_CONDITIONS = [
    # Cardiovascular
    {
        "code": "BA01", "name_en": "Atherosclerosis", "name_ru": "Атеросклероз",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"saturated_fat": 15, "cholesterol": 200, "sodium": 2000},
            "increase": {"fiber": 30, "omega_3": 2},
            "avoid": ["trans_fat", "processed_meat", "fried_food"],
            "prefer": ["fish", "olive_oil", "nuts", "vegetables", "whole_grains"]
        }
    },
    {
        "code": "BA03", "name_en": "Heart failure", "name_ru": "Сердечная недостаточность",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"sodium": 1500, "water_ml": 1500},
            "avoid": ["canned_food", "pickles", "salty_snacks"],
            "prefer": ["vegetables", "lean_protein", "whole_grains"]
        }
    },
    {
        "code": "BA20", "name_en": "Angina pectoris", "name_ru": "Стенокардия",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"saturated_fat": 15, "sodium": 2000},
            "increase": {"omega_3": 2, "fiber": 25},
            "avoid": ["trans_fat", "fast_food", "excessive_caffeine"],
            "prefer": ["fish", "olive_oil", "vegetables", "berries"]
        }
    },
    # Digestive
    {
        "code": "DA23", "name_en": "Gastric ulcer", "name_ru": "Язва желудка",
        "category": "Digestive",
        "dietary_rules": {
            "avoid": ["alcohol", "coffee", "spicy_food", "fried_food", "citrus"],
            "prefer": ["oats", "bananas", "cooked_vegetables", "lean_protein", "yogurt"]
        }
    },
    {
        "code": "DA25", "name_en": "Duodenal ulcer", "name_ru": "Язва двенадцатиперстной кишки",
        "category": "Digestive",
        "dietary_rules": {
            "avoid": ["alcohol", "coffee", "spicy_food", "fried_food"],
            "prefer": ["oats", "rice", "cooked_vegetables", "lean_protein"]
        }
    },
    {
        "code": "DA45", "name_en": "Irritable bowel syndrome", "name_ru": "Синдром раздражённого кишечника",
        "category": "Digestive",
        "dietary_rules": {
            "avoid": ["lactose", "gluten", "legumes", "cruciferous_vegetables", "artificial_sweeteners"],
            "prefer": ["rice", "bananas", "lean_protein", "cooked_vegetables"]
        }
    },
    {
        "code": "DA93", "name_en": "Pancreatitis", "name_ru": "Панкреатит",
        "category": "Digestive",
        "dietary_rules": {
            "restrict": {"fat": 30},
            "avoid": ["alcohol", "fried_food", "fast_food", "fatty_meat", "cream"],
            "prefer": ["lean_protein", "cooked_vegetables", "rice", "oats"]
        }
    },
    {
        "code": "DB30", "name_en": "Liver cirrhosis", "name_ru": "Цирроз печени",
        "category": "Digestive",
        "dietary_rules": {
            "restrict": {"sodium": 2000, "protein_per_kg": 1.2},
            "avoid": ["alcohol", "raw_seafood", "processed_food"],
            "prefer": ["lean_protein", "whole_grains", "vegetables", "fruits"]
        }
    },
    {
        "code": "DB33", "name_en": "Fatty liver disease", "name_ru": "Жировая болезнь печени",
        "category": "Digestive",
        "dietary_rules": {
            "restrict": {"sugar": 25, "saturated_fat": 15},
            "avoid": ["alcohol", "sugary_drinks", "fast_food", "refined_sugar"],
            "prefer": ["vegetables", "fish", "olive_oil", "whole_grains", "coffee"]
        }
    },
    {
        "code": "DA70", "name_en": "Hemorrhoids", "name_ru": "Геморрой",
        "category": "Digestive",
        "dietary_rules": {
            "increase": {"fiber": 30, "water_ml": 2500},
            "avoid": ["spicy_food", "alcohol", "excessive_caffeine"],
            "prefer": ["vegetables", "fruits", "whole_grains", "legumes"]
        }
    },
    # Endocrine
    {
        "code": "5A01", "name_en": "Hypothyroidism", "name_ru": "Гипотиреоз",
        "category": "Endocrine",
        "dietary_rules": {
            "increase": {"iodine": 150, "selenium": 55, "zinc": 11},
            "avoid": ["raw_cruciferous_excess", "soy_excess"],
            "prefer": ["seafood", "seaweed", "brazil_nuts", "eggs"]
        }
    },
    {
        "code": "5A02", "name_en": "Hyperthyroidism", "name_ru": "Гипертиреоз",
        "category": "Endocrine",
        "dietary_rules": {
            "increase": {"calcium": 1200, "vitamin_d": 20},
            "avoid": ["excessive_caffeine", "excessive_iodine"],
            "prefer": ["dairy", "leafy_greens", "lean_protein", "whole_grains"]
        }
    },
    {
        "code": "5B55", "name_en": "Metabolic syndrome", "name_ru": "Метаболический синдром",
        "category": "Endocrine",
        "dietary_rules": {
            "restrict": {"sugar": 25, "sodium": 2000, "saturated_fat": 15},
            "increase": {"fiber": 30, "omega_3": 2},
            "avoid": ["sugary_drinks", "refined_sugar", "processed_food", "trans_fat"],
            "prefer": ["vegetables", "fish", "nuts", "olive_oil", "whole_grains"]
        }
    },
    # Kidney
    {
        "code": "GB61", "name_en": "Chronic kidney disease stage 3", "name_ru": "ХБП 3 стадии",
        "category": "Kidney",
        "dietary_rules": {
            "restrict": {"protein_per_kg": 0.8, "sodium": 2000, "potassium": 2700, "phosphorus": 800},
            "avoid": ["processed_food", "dark_cola", "canned_food"],
            "prefer": ["low_fat_dairy", "white_rice", "apples", "cabbage"]
        }
    },
    {
        "code": "GB62", "name_en": "Chronic kidney disease stage 4-5", "name_ru": "ХБП 4-5 стадии",
        "category": "Kidney",
        "dietary_rules": {
            "restrict": {"protein_per_kg": 0.6, "sodium": 1500, "potassium": 2000, "phosphorus": 700},
            "avoid": ["bananas", "oranges", "potatoes", "processed_food", "nuts"],
            "prefer": ["white_rice", "apples", "cabbage", "berries"]
        }
    },
    # Musculoskeletal
    {
        "code": "FA00", "name_en": "Rheumatoid arthritis", "name_ru": "Ревматоидный артрит",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "increase": {"omega_3": 3, "vitamin_d": 20},
            "avoid": ["processed_food", "refined_sugar", "excessive_alcohol"],
            "prefer": ["fish", "olive_oil", "berries", "leafy_greens", "nuts"]
        }
    },
    {
        "code": "FA24", "name_en": "Osteoporosis", "name_ru": "Остеопороз",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "increase": {"calcium": 1200, "vitamin_d": 20, "vitamin_k": 120},
            "avoid": ["excessive_caffeine", "excessive_alcohol", "high_sodium"],
            "prefer": ["dairy", "sardines", "leafy_greens", "fortified_foods"]
        }
    },
    # Respiratory
    {
        "code": "CA20", "name_en": "Asthma", "name_ru": "Бронхиальная астма",
        "category": "Respiratory",
        "dietary_rules": {
            "increase": {"vitamin_c": 200, "vitamin_d": 20, "omega_3": 2},
            "avoid": ["sulfites", "processed_food"],
            "prefer": ["fruits", "vegetables", "fish", "nuts"]
        }
    },
    # Neurological
    {
        "code": "8A80", "name_en": "Migraine", "name_ru": "Мигрень",
        "category": "Neurological",
        "dietary_rules": {
            "increase": {"magnesium": 400},
            "avoid": ["aged_cheese", "red_wine", "chocolate", "processed_meat", "msg", "artificial_sweeteners"],
            "prefer": ["leafy_greens", "nuts", "seeds", "whole_grains"]
        }
    },
    # Allergies / Intolerances
    {
        "code": "4A80", "name_en": "Food allergy - peanuts", "name_ru": "Аллергия на арахис",
        "category": "Allergy",
        "dietary_rules": {
            "avoid": ["peanuts", "peanut_butter", "peanut_oil"],
            "prefer": ["almonds", "sunflower_seeds", "cashews"]
        }
    },
    {
        "code": "4A81", "name_en": "Food allergy - shellfish", "name_ru": "Аллергия на моллюсков",
        "category": "Allergy",
        "dietary_rules": {
            "avoid": ["shrimp", "crab", "lobster", "clams", "mussels", "oysters"],
            "prefer": ["fish", "lean_protein"]
        }
    },
    {
        "code": "4A82", "name_en": "Food allergy - eggs", "name_ru": "Аллергия на яйца",
        "category": "Allergy",
        "dietary_rules": {
            "avoid": ["eggs", "mayonnaise", "meringue", "egg_noodles"],
            "prefer": ["lean_protein", "legumes"]
        }
    },
    {
        "code": "4A83", "name_en": "Food allergy - milk", "name_ru": "Аллергия на молоко",
        "category": "Allergy",
        "dietary_rules": {
            "avoid": ["milk", "cheese", "butter", "cream", "yogurt", "ice_cream"],
            "increase": {"calcium": 1000},
            "prefer": ["plant_milk", "leafy_greens", "sardines", "fortified_foods"]
        }
    },
    {
        "code": "4A84", "name_en": "Food allergy - wheat", "name_ru": "Аллергия на пшеницу",
        "category": "Allergy",
        "dietary_rules": {
            "avoid": ["wheat", "bread", "pasta", "cookies", "flour"],
            "prefer": ["rice", "corn", "buckwheat", "quinoa", "oats"]
        }
    },
    # Mental health (diet-related)
    {
        "code": "6B80", "name_en": "Depression", "name_ru": "Депрессия",
        "category": "Mental",
        "dietary_rules": {
            "increase": {"omega_3": 2, "vitamin_d": 20, "folate": 400, "vitamin_b12": 2.4},
            "avoid": ["excessive_alcohol", "processed_food", "refined_sugar"],
            "prefer": ["fish", "nuts", "leafy_greens", "berries", "whole_grains", "fermented_foods"]
        }
    },
    # Skin
    {
        "code": "EA80", "name_en": "Acne vulgaris", "name_ru": "Акне",
        "category": "Skin",
        "dietary_rules": {
            "restrict": {"sugar": 25},
            "avoid": ["dairy", "refined_sugar", "fast_food", "chocolate"],
            "increase": {"zinc": 15, "omega_3": 2},
            "prefer": ["vegetables", "fish", "nuts", "berries"]
        }
    },
    {
        "code": "EA90", "name_en": "Psoriasis", "name_ru": "Псориаз",
        "category": "Skin",
        "dietary_rules": {
            "increase": {"omega_3": 3, "vitamin_d": 20},
            "avoid": ["alcohol", "red_meat", "processed_food", "refined_sugar"],
            "prefer": ["fish", "olive_oil", "vegetables", "fruits", "nuts"]
        }
    },
    # Oncology (supportive nutrition)
    {
        "code": "2E00", "name_en": "Cancer - supportive nutrition", "name_ru": "Онкология — нутритивная поддержка",
        "category": "Oncology",
        "dietary_rules": {
            "increase": {"protein_per_kg": 1.5, "vitamin_d": 40},
            "avoid": ["alcohol", "processed_meat", "excessive_sugar"],
            "prefer": ["lean_protein", "vegetables", "fruits", "whole_grains", "nuts"]
        }
    },
    # Pregnancy
    {
        "code": "JA00", "name_en": "Pregnancy - nutritional guidelines", "name_ru": "Беременность — рекомендации по питанию",
        "category": "Pregnancy",
        "dietary_rules": {
            "increase": {"folate": 600, "iron": 27, "calcium": 1000, "vitamin_d": 15, "omega_3": 1.4},
            "avoid": ["alcohol", "raw_fish", "raw_eggs", "soft_cheese", "excessive_caffeine", "liver"],
            "prefer": ["leafy_greens", "lean_protein", "dairy", "whole_grains", "fish"]
        }
    },
    # Elderly
    {
        "code": "MG20", "name_en": "Sarcopenia", "name_ru": "Саркопения",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "increase": {"protein_per_kg": 1.5, "vitamin_d": 20, "calcium": 1200},
            "prefer": ["lean_protein", "dairy", "eggs", "fish", "legumes"]
        }
    },
    # PCOD
    {
        "code": "GA30", "name_en": "Polycystic ovary syndrome", "name_ru": "Синдром поликистозных яичников",
        "category": "Endocrine",
        "dietary_rules": {
            "restrict": {"sugar": 25, "carbohydrates_percent": 40},
            "increase": {"fiber": 30, "omega_3": 2},
            "avoid": ["refined_sugar", "sugary_drinks", "white_bread", "processed_food"],
            "prefer": ["vegetables", "lean_protein", "whole_grains", "nuts", "berries"]
        }
    },
    # Eating disorders (supportive)
    {
        "code": "6B60", "name_en": "Anorexia nervosa - recovery nutrition", "name_ru": "Анорексия — восстановительное питание",
        "category": "Mental",
        "dietary_rules": {
            "increase": {"calcium": 1300, "vitamin_d": 20, "zinc": 12, "iron": 18},
            "prefer": ["dairy", "nuts", "whole_grains", "lean_protein", "eggs", "fruits"]
        }
    },
]


async def seed_extra():
    engine = create_async_engine(DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        added = 0
        for c in EXTRA_CONDITIONS:
            existing = await session.execute(
                select(Condition).where(Condition.code == c["code"]).limit(1)
            )
            if existing.scalars().first():
                continue

            condition = Condition(
                code=c["code"],
                name_en=c["name_en"],
                name_ru=c["name_ru"],
                category=c["category"],
                dietary_rules=c["dietary_rules"],
            )
            session.add(condition)
            added += 1

        await session.commit()
        print(f"Added {added} extra conditions (total now: 14 + {added})")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed_extra())
