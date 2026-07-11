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


def coverage_stats(entries_nutrients: list[dict]) -> dict:
    """For each nutrient, how many logged product-entries actually carried a
    value for it. Lets the UI say 'based on N of M foods' instead of pretending
    a missing value is zero."""
    total = len(entries_nutrients)
    cov = {"vitamins": {}, "minerals": {}}
    for category in ("vitamins", "minerals"):
        for entry_nutr in entries_nutrients:
            for key in entry_nutr.get(category, {}):
                cov[category][key] = cov[category].get(key, 0) + 1
    return {"total_products": total, "covered": cov}


def calculate_daily_percent(totals: dict, entries_nutrients: list[dict] | None = None) -> dict:
    """Calculate % of daily recommended value, annotated with data coverage.

    coverage (covered/total_products) tells the client how complete the data is
    so it never shows a confident '% of norm' built from mostly-missing values.
    A missing nutrient is EXCLUDED from the sum (never coerced to 0)."""
    cov = coverage_stats(entries_nutrients or [])
    total_products = cov["total_products"]
    result = {"vitamins": {}, "minerals": {}}

    for category in ("vitamins", "minerals"):
        for key, val in totals.get(category, {}).items():
            dv = DAILY_VALUES.get(category, {}).get(key)
            if dv and dv > 0:
                covered = cov["covered"].get(category, {}).get(key, 0)
                result[category][key] = {
                    "amount": val,
                    "daily_value": dv,
                    "percent": round((val / dv) * 100, 1),
                    "covered": covered,
                    "total_products": total_products,
                    "complete": total_products > 0 and covered >= total_products,
                }

    return result
