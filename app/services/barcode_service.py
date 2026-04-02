"""
Barcode lookup: first check local DB, then fallback to Open Food Facts API.
"""
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import Product


OFF_API = "https://world.openfoodfacts.org/api/v2/product"


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        v = float(val)
        return v if v >= 0 else None
    except (ValueError, TypeError):
        return None


def _parse_off_product(data: dict) -> dict | None:
    """Parse Open Food Facts API response into our product format."""
    product = data.get("product", {})
    name = product.get("product_name", "").strip()
    if not name:
        return None

    nutriments = product.get("nutriments", {})

    vitamins = {}
    vitamin_map = {
        "vitamin-a_100g": "vitamin_a", "vitamin-b1_100g": "vitamin_b1",
        "vitamin-b2_100g": "vitamin_b2", "vitamin-pp_100g": "vitamin_b3",
        "vitamin-b6_100g": "vitamin_b6", "vitamin-b9_100g": "vitamin_b9",
        "vitamin-b12_100g": "vitamin_b12", "vitamin-c_100g": "vitamin_c",
        "vitamin-d_100g": "vitamin_d", "vitamin-e_100g": "vitamin_e",
    }
    for off_key, our_key in vitamin_map.items():
        val = _safe_float(nutriments.get(off_key))
        if val is not None:
            vitamins[our_key] = val

    minerals = {}
    mineral_map = {
        "calcium_100g": "calcium", "iron_100g": "iron", "magnesium_100g": "magnesium",
        "phosphorus_100g": "phosphorus", "potassium_100g": "potassium",
        "sodium_100g": "sodium", "zinc_100g": "zinc", "selenium_100g": "selenium",
    }
    for off_key, our_key in mineral_map.items():
        val = _safe_float(nutriments.get(off_key))
        if val is not None:
            minerals[our_key] = val

    return {
        "name": name[:500],
        "brand": (product.get("brands") or "")[:255] or None,
        "barcode": str(data.get("code", ""))[:50],
        "category": (product.get("categories_tags", [""])[0] if product.get("categories_tags") else "")[:255] or None,
        "source": "openfoodfacts",
        "source_id": str(data.get("code", "")),
        "serving_size": 100.0,
        "serving_unit": "g",
        "calories": _safe_float(nutriments.get("energy-kcal_100g")),
        "protein": _safe_float(nutriments.get("proteins_100g")),
        "fat": _safe_float(nutriments.get("fat_100g")),
        "carbohydrates": _safe_float(nutriments.get("carbohydrates_100g")),
        "fiber": _safe_float(nutriments.get("fiber_100g")),
        "sugar": _safe_float(nutriments.get("sugars_100g")),
        "vitamins": vitamins if vitamins else None,
        "minerals": minerals if minerals else None,
        "image_url": product.get("image_url", "")[:500] or None,
        "is_verified": False,
    }


async def lookup_barcode(db: AsyncSession, barcode: str) -> Product | None:
    """Look up product by barcode. Check local DB first, then OFF API."""

    # 1. Check local DB
    result = await db.execute(select(Product).where(Product.barcode == barcode))
    product = result.scalar_one_or_none()
    if product:
        return product

    # 2. Fallback to Open Food Facts API
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{OFF_API}/{barcode}.json")
            if resp.status_code != 200:
                return None
            data = resp.json()
            if data.get("status") != 1:
                return None
    except Exception:
        return None

    parsed = _parse_off_product(data)
    if not parsed:
        return None

    # 3. Save to local DB for future lookups
    product = Product(**parsed)
    db.add(product)
    await db.flush()

    return product
