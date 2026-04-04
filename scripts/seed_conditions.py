import os
"""
Seed ICD-11 conditions with dietary rules.
Covers major diagnostic categories relevant to nutrition.

Usage: python scripts/seed_conditions.py
"""
import asyncio
from uuid import uuid4

CONDITIONS = [
    # Diabetes
    {
        "code": "5A10",
        "name_en": "Type 1 diabetes mellitus",
        "name_ru": "Сахарный диабет 1 типа",
        "category": "Endocrine",
        "dietary_rules": {
            "restrict": {"sugar": 25, "carbohydrates_percent": 45},
            "increase": {"fiber": 30},
            "avoid": ["sugary_drinks", "refined_sugar", "white_bread"],
            "prefer": ["whole_grains", "legumes", "non_starchy_vegetables"],
            "macro_ratio": {"protein": 0.20, "fat": 0.35, "carbs": 0.45},
        },
    },
    {
        "code": "5A11",
        "name_en": "Type 2 diabetes mellitus",
        "name_ru": "Сахарный диабет 2 типа",
        "category": "Endocrine",
        "dietary_rules": {
            "restrict": {"sugar": 25, "carbohydrates_percent": 45, "saturated_fat": 20},
            "increase": {"fiber": 30},
            "avoid": ["sugary_drinks", "refined_sugar", "processed_food"],
            "prefer": ["whole_grains", "vegetables", "lean_protein", "nuts"],
            "calorie_adjustment": -500,
            "macro_ratio": {"protein": 0.20, "fat": 0.35, "carbs": 0.45},
        },
    },
    # Cardiovascular
    {
        "code": "BA00",
        "name_en": "Essential hypertension",
        "name_ru": "Гипертоническая болезнь",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"sodium": 1500, "saturated_fat": 15, "alcohol": 0},
            "increase": {"potassium": 4700, "magnesium": 400, "calcium": 1000, "fiber": 30},
            "avoid": ["processed_food", "canned_food", "pickles", "salty_snacks"],
            "prefer": ["fruits", "vegetables", "whole_grains", "low_fat_dairy", "fish"],
        },
    },
    {
        "code": "BA80",
        "name_en": "Atherosclerosis",
        "name_ru": "Атеросклероз",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"saturated_fat": 15, "trans_fat": 0, "cholesterol": 200, "sodium": 2000},
            "increase": {"fiber": 35, "omega_3": 2},
            "avoid": ["trans_fat", "fried_food", "processed_meat"],
            "prefer": ["fish", "olive_oil", "nuts", "oats", "legumes"],
        },
    },
    # Kidney
    {
        "code": "GB60",
        "name_en": "Chronic kidney disease",
        "name_ru": "Хроническая болезнь почек",
        "category": "Renal",
        "dietary_rules": {
            "restrict": {"protein_per_kg": 0.8, "sodium": 2000, "potassium": 2000, "phosphorus": 800},
            "avoid": ["processed_food", "canned_food", "dark_cola", "bananas", "oranges"],
            "prefer": ["rice", "white_bread", "apples", "berries", "cabbage"],
        },
    },
    # GI
    {
        "code": "DA22",
        "name_en": "Coeliac disease",
        "name_ru": "Целиакия",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {},
            "increase": {"iron": 18, "calcium": 1000, "vitamin_d": 20, "fiber": 25},
            "avoid": ["gluten", "wheat", "barley", "rye"],
            "prefer": ["rice", "corn", "quinoa", "buckwheat", "gluten_free"],
        },
    },
    {
        "code": "DA42",
        "name_en": "Crohn disease",
        "name_ru": "Болезнь Крона",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"fiber": 10},
            "increase": {"protein_per_kg": 1.2, "vitamin_b12": 5, "iron": 18, "calcium": 1200},
            "avoid": ["raw_vegetables", "nuts", "seeds", "popcorn", "high_fiber"],
            "prefer": ["cooked_vegetables", "lean_protein", "white_rice", "bananas"],
        },
    },
    # Obesity
    {
        "code": "5B81",
        "name_en": "Obesity",
        "name_ru": "Ожирение",
        "category": "Endocrine",
        "dietary_rules": {
            "restrict": {"sugar": 25, "saturated_fat": 20},
            "increase": {"fiber": 30, "protein_per_kg": 1.2},
            "avoid": ["sugary_drinks", "fast_food", "processed_food", "refined_sugar"],
            "prefer": ["vegetables", "lean_protein", "whole_grains", "water"],
            "calorie_adjustment": -500,
            "macro_ratio": {"protein": 0.30, "fat": 0.30, "carbs": 0.40},
        },
    },
    # Gout
    {
        "code": "FA20",
        "name_en": "Gout",
        "name_ru": "Подагра",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "restrict": {"purine": 200, "alcohol": 0, "fructose": 25},
            "increase": {"water_ml": 3000, "vitamin_c": 500},
            "avoid": ["organ_meat", "shellfish", "beer", "sugary_drinks", "red_meat"],
            "prefer": ["cherries", "low_fat_dairy", "vegetables", "water", "coffee"],
        },
    },
    # Iron deficiency anemia
    {
        "code": "3A00",
        "name_en": "Iron deficiency anaemia",
        "name_ru": "Железодефицитная анемия",
        "category": "Hematological",
        "dietary_rules": {
            "restrict": {},
            "increase": {"iron": 27, "vitamin_c": 200, "vitamin_b12": 5, "folate": 600},
            "avoid": ["tea_with_meals", "coffee_with_meals", "calcium_with_iron"],
            "prefer": ["red_meat", "liver", "spinach", "legumes", "fortified_cereals"],
        },
    },
    # Osteoporosis
    {
        "code": "FB83",
        "name_en": "Osteoporosis",
        "name_ru": "Остеопороз",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "restrict": {"sodium": 2000, "caffeine": 300},
            "increase": {"calcium": 1200, "vitamin_d": 50, "vitamin_k": 200, "magnesium": 400},
            "avoid": ["excessive_alcohol", "excessive_caffeine", "high_sodium"],
            "prefer": ["dairy", "sardines", "leafy_greens", "fortified_foods"],
        },
    },
    # Liver
    {
        "code": "DB92",
        "name_en": "Non-alcoholic fatty liver disease",
        "name_ru": "Неалкогольная жировая болезнь печени",
        "category": "Hepatic",
        "dietary_rules": {
            "restrict": {"sugar": 25, "saturated_fat": 15, "fructose": 20},
            "increase": {"fiber": 30, "omega_3": 2},
            "avoid": ["alcohol", "sugary_drinks", "fried_food", "processed_food"],
            "prefer": ["coffee", "olive_oil", "fish", "vegetables", "whole_grains"],
            "calorie_adjustment": -500,
        },
    },
    # Thyroid
    {
        "code": "5A00",
        "name_en": "Hypothyroidism",
        "name_ru": "Гипотиреоз",
        "category": "Endocrine",
        "dietary_rules": {
            "increase": {"iodine": 150, "selenium": 55, "zinc": 11},
            "avoid": ["raw_cruciferous_excess", "soy_excess"],
            "prefer": ["seafood", "seaweed", "brazil_nuts", "eggs", "dairy"],
        },
    },
    # Allergies / intolerances
    {
        "code": "DA94",
        "name_en": "Lactose intolerance",
        "name_ru": "Непереносимость лактозы",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "increase": {"calcium": 1000, "vitamin_d": 20},
            "avoid": ["milk", "ice_cream", "soft_cheese", "cream"],
            "prefer": ["lactose_free_dairy", "hard_cheese", "yogurt", "plant_milk", "leafy_greens"],
        },
    },
]


async def seed(db_url: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from scripts.db_helper import get_insert_func; insert = get_insert_func()
    from app.models.health import ICD11Condition

    url = db_url or os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///nutrition_diary.db")
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        for cond in CONDITIONS:
            cond["id"] = uuid4()
            stmt = (
                insert(ICD11Condition)
                .values(**cond)
                .on_conflict_do_update(
                    index_elements=["code"],
                    set_={"dietary_rules": cond["dietary_rules"], "name_ru": cond.get("name_ru")},
                )
            )
            await session.execute(stmt)
        await session.commit()

    await engine.dispose()
    print(f"Seeded {len(CONDITIONS)} conditions")


if __name__ == "__main__":
    asyncio.run(seed())
