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
    # ============ NEW CONDITIONS ============

    # GI — additional
    {
        "code": "DA23",
        "name_en": "Gastric ulcer",
        "name_ru": "Язва желудка",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"saturated_fat": 20},
            "avoid": ["alcohol", "coffee", "spicy_food", "citrus", "fried_food", "raw_vegetables"],
            "prefer": ["oatmeal", "bananas", "boiled_vegetables", "lean_meat", "low_fat_dairy"],
        },
    },
    {
        "code": "DA42",
        "name_en": "Gastritis",
        "name_ru": "Гастрит",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "avoid": ["alcohol", "coffee", "spicy_food", "fried_food", "smoked_food", "pickles"],
            "prefer": ["porridge", "steamed_vegetables", "lean_meat", "low_fat_dairy", "bananas"],
        },
    },
    {
        "code": "DA60",
        "name_en": "Irritable bowel syndrome",
        "name_ru": "Синдром раздражённого кишечника (СРК)",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"fiber": 20},
            "avoid": ["lactose", "fructose_excess", "beans", "cabbage", "carbonated_drinks", "artificial_sweeteners"],
            "prefer": ["rice", "oats", "bananas", "potatoes", "lean_meat", "low_fodmap_vegetables"],
        },
    },
    {
        "code": "DA74",
        "name_en": "Ulcerative colitis",
        "name_ru": "Язвенный колит",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"fiber": 15},
            "increase": {"protein_per_kg": 1.2, "iron": 18, "calcium": 1000, "vitamin_d": 20},
            "avoid": ["raw_vegetables", "nuts", "seeds", "spicy_food", "alcohol", "caffeine"],
            "prefer": ["white_rice", "boiled_fish", "eggs", "bananas", "applesauce"],
        },
    },
    {
        "code": "DC30",
        "name_en": "Acute pancreatitis",
        "name_ru": "Панкреатит",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"fat": 30, "sugar": 25},
            "avoid": ["alcohol", "fried_food", "fatty_meat", "cream", "butter", "fast_food"],
            "prefer": ["steamed_vegetables", "lean_chicken", "white_fish", "rice", "oatmeal"],
            "macro_ratio": {"protein": 0.25, "fat": 0.20, "carbs": 0.55},
        },
    },
    {
        "code": "DC11",
        "name_en": "Cholecystitis",
        "name_ru": "Холецистит",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "restrict": {"fat": 40, "cholesterol": 200},
            "avoid": ["fried_food", "fatty_meat", "egg_yolks", "chocolate", "alcohol", "spicy_food"],
            "prefer": ["boiled_vegetables", "lean_meat", "low_fat_dairy", "whole_grains", "vegetable_soups"],
        },
    },
    {
        "code": "DB91",
        "name_en": "Gastroesophageal reflux disease",
        "name_ru": "ГЭРБ (рефлюксная болезнь)",
        "category": "Gastrointestinal",
        "dietary_rules": {
            "avoid": ["coffee", "chocolate", "citrus", "tomatoes", "spicy_food", "alcohol", "mint", "carbonated_drinks"],
            "prefer": ["oatmeal", "ginger", "bananas", "melons", "lean_meat", "rice"],
        },
    },
    {
        "code": "DA93",
        "name_en": "Food allergy to gluten",
        "name_ru": "Непереносимость глютена",
        "category": "Allergic",
        "dietary_rules": {
            "avoid": ["wheat", "rye", "barley", "regular_oats", "beer", "regular_bread", "pasta", "cookies"],
            "prefer": ["rice", "buckwheat", "corn", "quinoa", "potatoes", "gluten_free_oats"],
        },
    },

    # Allergies
    {
        "code": "4A84",
        "name_en": "Food allergy to peanuts and tree nuts",
        "name_ru": "Аллергия на орехи",
        "category": "Allergic",
        "dietary_rules": {
            "avoid": ["peanuts", "almonds", "cashews", "walnuts", "hazelnuts", "pistachios", "nut_butter", "marzipan"],
            "prefer": ["seeds", "coconut", "sunflower_butter"],
        },
    },
    {
        "code": "4A85",
        "name_en": "Food allergy to shellfish and fish",
        "name_ru": "Аллергия на морепродукты и рыбу",
        "category": "Allergic",
        "dietary_rules": {
            "increase": {"omega_3": 2},
            "avoid": ["fish", "shrimp", "crab", "lobster", "mussels", "oysters", "squid", "fish_sauce"],
            "prefer": ["flaxseed", "chia_seeds", "walnuts", "algae_oil_supplements"],
        },
    },
    {
        "code": "4A86",
        "name_en": "Food allergy to eggs",
        "name_ru": "Аллергия на яйца",
        "category": "Allergic",
        "dietary_rules": {
            "avoid": ["eggs", "mayonnaise", "meringue", "egg_noodles", "some_baked_goods"],
            "prefer": ["lean_meat", "legumes", "tofu", "dairy"],
        },
    },
    {
        "code": "4A87",
        "name_en": "Food allergy to milk protein",
        "name_ru": "Аллергия на белок коровьего молока",
        "category": "Allergic",
        "dietary_rules": {
            "increase": {"calcium": 1000, "vitamin_d": 20},
            "avoid": ["milk", "cheese", "butter", "cream", "yogurt", "ice_cream", "casein", "whey"],
            "prefer": ["soy_milk", "oat_milk", "almond_milk", "coconut_yogurt", "leafy_greens"],
        },
    },
    {
        "code": "4A88",
        "name_en": "Food allergy to soy",
        "name_ru": "Аллергия на сою",
        "category": "Allergic",
        "dietary_rules": {
            "avoid": ["soy_sauce", "tofu", "tempeh", "edamame", "soy_milk", "soy_lecithin"],
            "prefer": ["meat", "dairy", "eggs", "rice", "potatoes", "oat_milk"],
        },
    },

    # Cardiovascular — additional
    {
        "code": "BD10",
        "name_en": "Heart failure",
        "name_ru": "Сердечная недостаточность",
        "category": "Cardiovascular",
        "dietary_rules": {
            "restrict": {"sodium": 1500, "fluid_ml": 1500},
            "increase": {"potassium": 4700, "magnesium": 400},
            "avoid": ["salt", "canned_food", "processed_meat", "pickles"],
            "prefer": ["fresh_vegetables", "fruits", "lean_protein", "whole_grains"],
        },
    },
    {
        "code": "BA01",
        "name_en": "Hypotension",
        "name_ru": "Гипотония (пониженное давление)",
        "category": "Cardiovascular",
        "dietary_rules": {
            "increase": {"sodium": 3000, "fluid_ml": 2500, "iron": 18, "vitamin_b12": 2.4},
            "prefer": ["salted_foods", "coffee", "green_tea", "meat", "eggs", "beets", "pomegranate"],
        },
    },

    # Metabolic
    {
        "code": "5B70",
        "name_en": "Vitamin D deficiency",
        "name_ru": "Дефицит витамина D",
        "category": "Metabolic",
        "dietary_rules": {
            "increase": {"vitamin_d": 50, "calcium": 1000},
            "prefer": ["fatty_fish", "egg_yolks", "fortified_milk", "mushrooms", "cod_liver_oil"],
        },
    },
    {
        "code": "5B51",
        "name_en": "Vitamin B12 deficiency",
        "name_ru": "Дефицит витамина B12",
        "category": "Metabolic",
        "dietary_rules": {
            "increase": {"vitamin_b12": 10},
            "prefer": ["liver", "beef", "sardines", "eggs", "fortified_cereals", "nutritional_yeast"],
        },
    },
    {
        "code": "5C70",
        "name_en": "Hypercholesterolaemia",
        "name_ru": "Повышенный холестерин",
        "category": "Metabolic",
        "dietary_rules": {
            "restrict": {"saturated_fat": 15, "trans_fat": 0, "cholesterol": 200},
            "increase": {"fiber": 30, "omega_3": 2},
            "avoid": ["fried_food", "processed_meat", "full_fat_dairy", "trans_fat"],
            "prefer": ["oats", "beans", "olive_oil", "nuts", "fish", "avocado"],
        },
    },
    {
        "code": "5A42",
        "name_en": "Hyperthyroidism",
        "name_ru": "Гипертиреоз",
        "category": "Endocrine",
        "dietary_rules": {
            "increase": {"calcium": 1200, "vitamin_d": 20, "calories": 500},
            "restrict": {"iodine": 150},
            "avoid": ["iodized_salt", "seaweed", "excess_caffeine"],
            "prefer": ["cruciferous_vegetables", "dairy", "lean_protein", "whole_grains"],
        },
    },
    {
        "code": "5B80",
        "name_en": "Phenylketonuria",
        "name_ru": "Фенилкетонурия (ФКУ)",
        "category": "Metabolic",
        "dietary_rules": {
            "restrict": {"protein_per_kg": 0.5},
            "avoid": ["meat", "fish", "eggs", "dairy", "nuts", "aspartame", "beans"],
            "prefer": ["fruits", "vegetables", "special_low_protein_flour", "rice", "potatoes"],
        },
    },

    # Renal — additional
    {
        "code": "GB61",
        "name_en": "Kidney stones (urolithiasis)",
        "name_ru": "Мочекаменная болезнь",
        "category": "Renal",
        "dietary_rules": {
            "restrict": {"sodium": 2000, "oxalate": 50},
            "increase": {"fluid_ml": 3000, "calcium": 1000, "citrate": 1},
            "avoid": ["spinach", "rhubarb", "excess_salt", "excess_animal_protein", "colas"],
            "prefer": ["water", "lemon_water", "dairy", "fruits", "vegetables"],
        },
    },

    # Respiratory
    {
        "code": "CA20",
        "name_en": "Asthma",
        "name_ru": "Бронхиальная астма",
        "category": "Respiratory",
        "dietary_rules": {
            "increase": {"vitamin_d": 20, "omega_3": 2, "magnesium": 400},
            "avoid": ["sulfites", "processed_food", "beer_wine"],
            "prefer": ["fruits", "vegetables", "fish", "ginger", "turmeric"],
        },
    },

    # Mental health / Neurological
    {
        "code": "6A70",
        "name_en": "Depressive disorder",
        "name_ru": "Депрессия",
        "category": "Mental",
        "dietary_rules": {
            "increase": {"omega_3": 2, "vitamin_d": 20, "magnesium": 400, "zinc": 11, "vitamin_b12": 2.4},
            "avoid": ["alcohol", "excess_sugar", "processed_food", "trans_fat"],
            "prefer": ["fatty_fish", "nuts", "dark_leafy_greens", "berries", "whole_grains", "fermented_food"],
        },
    },
    {
        "code": "8A00",
        "name_en": "Migraine",
        "name_ru": "Мигрень",
        "category": "Neurological",
        "dietary_rules": {
            "increase": {"magnesium": 500, "riboflavin": 400},
            "avoid": ["aged_cheese", "red_wine", "chocolate", "msg", "nitrates", "artificial_sweeteners", "caffeine_excess"],
            "prefer": ["fresh_vegetables", "rice", "chicken", "fish", "ginger_tea"],
        },
    },
    {
        "code": "6A05",
        "name_en": "Autism spectrum disorder",
        "name_ru": "Расстройства аутистического спектра",
        "category": "Neurological",
        "dietary_rules": {
            "increase": {"omega_3": 2, "vitamin_d": 20, "magnesium": 400, "zinc": 11},
            "avoid": ["artificial_colors", "artificial_flavors", "excess_sugar"],
            "prefer": ["whole_foods", "fruits", "vegetables", "lean_protein", "probiotic_foods"],
        },
    },

    # Musculoskeletal
    {
        "code": "FA24",
        "name_en": "Rheumatoid arthritis",
        "name_ru": "Ревматоидный артрит",
        "category": "Musculoskeletal",
        "dietary_rules": {
            "increase": {"omega_3": 3, "vitamin_d": 20, "calcium": 1000},
            "avoid": ["processed_food", "excess_sugar", "red_meat", "fried_food", "alcohol"],
            "prefer": ["fatty_fish", "olive_oil", "berries", "leafy_greens", "turmeric", "ginger"],
        },
    },

    # Skin
    {
        "code": "EA80",
        "name_en": "Acne vulgaris",
        "name_ru": "Акне (угревая болезнь)",
        "category": "Dermatological",
        "dietary_rules": {
            "restrict": {"sugar": 25},
            "avoid": ["dairy_excess", "refined_carbs", "fast_food", "chocolate_excess", "whey_protein"],
            "prefer": ["vegetables", "fruits", "fish", "zinc_rich_foods", "green_tea", "probiotics"],
        },
    },
    {
        "code": "EA90",
        "name_en": "Psoriasis",
        "name_ru": "Псориаз",
        "category": "Dermatological",
        "dietary_rules": {
            "increase": {"omega_3": 3, "vitamin_d": 20},
            "avoid": ["alcohol", "red_meat", "processed_food", "nightshade_vegetables", "gluten"],
            "prefer": ["fatty_fish", "olive_oil", "colorful_vegetables", "berries", "turmeric"],
        },
    },

    # Oncology support
    {
        "code": "2E00",
        "name_en": "Malnutrition during cancer treatment",
        "name_ru": "Нутритивная поддержка при онкологии",
        "category": "Oncology",
        "dietary_rules": {
            "increase": {"protein_per_kg": 1.5, "calories": 500},
            "avoid": ["raw_fish", "raw_eggs", "unpasteurized_dairy", "alcohol"],
            "prefer": ["high_calorie_foods", "protein_shakes", "eggs", "avocado", "nuts", "olive_oil"],
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
