"""
Calculate detailed nutrients (vitamins, minerals) for diary entries and daily totals.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import Product
from app.models.diary import DiaryEntry

# Daily recommended values (for % calculation)
DAILY_VALUES = {
    "vitamins": {
        "vitamin_a": 900,    # mcg
        "vitamin_b1": 1.2,   # mg
        "vitamin_b2": 1.3,   # mg
        "vitamin_b3": 16,    # mg
        "vitamin_b5": 5,     # mg
        "vitamin_b6": 1.7,   # mg
        "vitamin_b9": 400,   # mcg
        "vitamin_b12": 2.4,  # mcg
        "vitamin_c": 90,     # mg
        "vitamin_d": 20,     # mcg
        "vitamin_e": 15,     # mg
        "vitamin_k": 120,    # mcg
    },
    "minerals": {
        "calcium": 1000,     # mg
        "iron": 18,          # mg
        "magnesium": 400,    # mg
        "phosphorus": 1000,  # mg
        "potassium": 3500,   # mg
        "sodium": 2300,      # mg
        "zinc": 11,          # mg
        "selenium": 55,      # mcg
        "iodine": 150,       # mcg
    },
}


def calculate_nutrients_for_serving(product: Product, serving_grams: float) -> dict:
    """Calculate vitamins and minerals for a specific serving size."""
    factor = serving_grams / 100.0
    result = {"vitamins": {}, "minerals": {}}

    if product.vitamins:
        for key, val in product.vitamins.items():
            if val is not None:
                result["vitamins"][key] = round(val * factor, 3)

    if product.minerals:
        for key, val in product.minerals.items():
            if val is not None:
                result["minerals"][key] = round(val * factor, 3)

    return result


def sum_nutrients(entries_nutrients: list[dict]) -> dict:
    """Sum nutrients across multiple entries."""
    totals = {"vitamins": {}, "minerals": {}}

    for entry_nutr in entries_nutrients:
        for category in ("vitamins", "minerals"):
            for key, val in entry_nutr.get(category, {}).items():
                totals[category][key] = totals[category].get(key, 0) + val

    # Round totals
    for category in ("vitamins", "minerals"):
        for key in totals[category]:
            totals[category][key] = round(totals[category][key], 2)

    return totals


def calculate_daily_percent(totals: dict) -> dict:
    """Calculate % of daily recommended value."""
    result = {"vitamins": {}, "minerals": {}}

    for category in ("vitamins", "minerals"):
        for key, val in totals.get(category, {}).items():
            dv = DAILY_VALUES.get(category, {}).get(key)
            if dv and dv > 0:
                result[category][key] = {
                    "amount": val,
                    "daily_value": dv,
                    "percent": round((val / dv) * 100, 1),
                }

    return result
