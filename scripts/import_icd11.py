"""
Import ICD-11 conditions from WHO API + map dietary rules by category.

WHO ICD-11 API: https://icd.who.int/icdapi
Free access after registration at https://icd.who.int/icdapi/Account/Register

Usage:
    python scripts/import_icd11.py --client-id YOUR_ID --client-secret YOUR_SECRET

This imports ~17K conditions and assigns dietary rule templates based on category.
"""
import argparse
import asyncio
import time
from uuid import uuid4
import httpx

WHO_TOKEN_URL = "https://icdaccessmanagement.who.int/connect/token"
WHO_API_BASE = "https://id.who.int/icd/release/11/2024-01/mms"

# Dietary rule templates by ICD-11 chapter/category
# Applied automatically based on condition's category
CATEGORY_RULES = {
    "Endocrine": {
        "restrict": {"sugar": 30, "saturated_fat": 20},
        "increase": {"fiber": 25},
        "avoid": ["refined_sugar", "sugary_drinks"],
        "prefer": ["whole_grains", "vegetables", "lean_protein"],
    },
    "Cardiovascular": {
        "restrict": {"sodium": 2000, "saturated_fat": 15},
        "increase": {"potassium": 3500, "fiber": 30},
        "avoid": ["processed_food", "salty_snacks", "trans_fat"],
        "prefer": ["fish", "fruits", "vegetables", "olive_oil"],
    },
    "Digestive": {
        "restrict": {"fat": 50},
        "increase": {"fiber": 20},
        "avoid": ["spicy_food", "alcohol", "fried_food"],
        "prefer": ["cooked_vegetables", "lean_protein", "rice"],
    },
    "Renal": {
        "restrict": {"sodium": 2000, "potassium": 2000, "phosphorus": 800, "protein_per_kg": 0.8},
        "avoid": ["processed_food", "bananas", "oranges", "dark_cola"],
        "prefer": ["rice", "apples", "cabbage", "berries"],
    },
    "Respiratory": {
        "increase": {"vitamin_c": 100, "vitamin_d": 20, "omega_3": 2},
        "avoid": ["sulfites", "processed_food"],
        "prefer": ["fruits", "vegetables", "fish", "anti_inflammatory_foods"],
    },
    "Musculoskeletal": {
        "increase": {"calcium": 1200, "vitamin_d": 40, "omega_3": 2},
        "avoid": ["excessive_alcohol", "excessive_caffeine"],
        "prefer": ["dairy", "fish", "leafy_greens", "nuts"],
    },
    "Neoplasms": {
        "increase": {"fiber": 30, "vitamin_c": 100, "selenium": 55},
        "avoid": ["processed_meat", "alcohol", "charred_food"],
        "prefer": ["cruciferous_vegetables", "berries", "whole_grains", "green_tea"],
    },
    "Mental": {
        "increase": {"omega_3": 2, "vitamin_d": 20, "magnesium": 400, "vitamin_b12": 5},
        "avoid": ["excessive_caffeine", "alcohol", "refined_sugar"],
        "prefer": ["fish", "nuts", "whole_grains", "fermented_foods"],
    },
    "Neurological": {
        "increase": {"omega_3": 2, "vitamin_e": 15, "vitamin_b12": 5},
        "avoid": ["excessive_alcohol", "trans_fat"],
        "prefer": ["fish", "blueberries", "nuts", "leafy_greens"],
    },
    "Hematological": {
        "increase": {"iron": 27, "vitamin_c": 200, "vitamin_b12": 5, "folate": 600},
        "avoid": ["tea_with_meals", "coffee_with_meals"],
        "prefer": ["red_meat", "liver", "spinach", "legumes"],
    },
    "Hepatic": {
        "restrict": {"sodium": 2000, "sugar": 25},
        "increase": {"protein_per_kg": 1.2},
        "avoid": ["alcohol", "fried_food", "processed_food"],
        "prefer": ["coffee", "olive_oil", "fish", "vegetables"],
    },
    "Dermatological": {
        "increase": {"vitamin_a": 900, "vitamin_c": 90, "zinc": 11, "omega_3": 2},
        "avoid": ["dairy_excess", "refined_sugar", "alcohol"],
        "prefer": ["fish", "colorful_vegetables", "nuts", "seeds"],
    },
}

# ICD-11 chapter codes -> our category
CHAPTER_MAP = {
    "01": "Infectious",
    "02": "Neoplasms",
    "03": "Hematological",
    "04": "Immune",
    "05": "Endocrine",
    "06": "Mental",
    "07": "Sleep",
    "08": "Neurological",
    "09": "Ophthalmological",
    "10": "Otological",
    "11": "Cardiovascular",
    "12": "Respiratory",
    "13": "Digestive",
    "14": "Dermatological",
    "15": "Musculoskeletal",
    "16": "Genitourinary",
    "17": "Sexual",
    "18": "Pregnancy",
    "19": "Perinatal",
    "20": "Developmental",
    "21": "Symptoms",
    "22": "Injury",
    "23": "External",
    "24": "Factors",
    "25": "Traditional",
    "26": "Extension",
}


async def get_who_token(client_id: str, client_secret: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            WHO_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": "icdapi_access",
                "grant_type": "client_credentials",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def fetch_children(token: str, url: str) -> list[dict]:
    """Fetch child entities from WHO API."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Accept-Language": "en",
                "API-Version": "v2",
            },
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("child", [])


async def fetch_entity(token: str, url: str) -> dict | None:
    """Fetch a single ICD entity."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Accept-Language": "en",
                "API-Version": "v2",
            },
        )
        if resp.status_code != 200:
            return None
        return resp.json()


def extract_code(entity: dict) -> str | None:
    """Extract ICD-11 code from entity."""
    code = entity.get("code") or entity.get("codeRange")
    if code:
        return code.replace(".", "").strip()[:20]
    return None


def get_category_from_code(code: str) -> str | None:
    """Map ICD-11 code to our category."""
    if not code:
        return None
    # First 2 chars or chapter letter determines category
    for chapter_prefix, category in CHAPTER_MAP.items():
        if code.startswith(chapter_prefix):
            return category
    return None


def get_dietary_rules(category: str | None) -> dict | None:
    """Get dietary rule template for a category."""
    if not category:
        return None
    return CATEGORY_RULES.get(category)


async def import_icd11(client_id: str, client_secret: str, max_items: int = 20000, db_url: str | None = None):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy.dialects.postgresql import insert
    from app.models.health import ICD11Condition

    url = db_url or "postgresql+asyncpg://nutrition:nutrition@localhost:5432/nutrition_diary"
    engine = create_async_engine(url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    print("Getting WHO API token...")
    token = await get_who_token(client_id, client_secret)

    print("Fetching ICD-11 chapters...")
    chapters = await fetch_children(token, WHO_API_BASE)
    print(f"Found {len(chapters)} chapters")

    total = 0
    imported = 0
    batch = []
    start = time.time()

    for chapter_url in chapters:
        if total >= max_items:
            break

        chapter = await fetch_entity(token, chapter_url)
        if not chapter:
            continue

        # Get all blocks in this chapter
        children = chapter.get("child", [])
        for block_url in children:
            if total >= max_items:
                break

            block = await fetch_entity(token, block_url)
            if not block:
                continue

            # Get individual conditions
            conditions = block.get("child", [])
            for cond_url in conditions:
                if total >= max_items:
                    break

                entity = await fetch_entity(token, cond_url)
                if not entity:
                    continue

                code = extract_code(entity)
                title = entity.get("title", {})
                name_en = title.get("@value", "").strip() if isinstance(title, dict) else str(title).strip()

                if not code or not name_en or len(name_en) < 3:
                    continue

                category = get_category_from_code(code)
                rules = get_dietary_rules(category)

                batch.append({
                    "id": uuid4(),
                    "code": code,
                    "name_en": name_en[:500],
                    "name_ru": None,
                    "category": category,
                    "description": (entity.get("definition", {}).get("@value", "") if isinstance(entity.get("definition"), dict) else "")[:1000] or None,
                    "dietary_rules": rules,
                })
                total += 1

                if len(batch) >= 100:
                    async with session_factory() as session:
                        stmt = insert(ICD11Condition).values(batch).on_conflict_do_nothing(index_elements=["code"])
                        result = await session.execute(stmt)
                        await session.commit()
                        imported += result.rowcount

                    elapsed = time.time() - start
                    print(f"  Processed: {total} | Imported: {imported} | {elapsed:.0f}s")
                    batch = []

                # Rate limiting
                await asyncio.sleep(0.1)

            await asyncio.sleep(0.1)

    # Final batch
    if batch:
        async with session_factory() as session:
            stmt = insert(ICD11Condition).values(batch).on_conflict_do_nothing(index_elements=["code"])
            result = await session.execute(stmt)
            await session.commit()
            imported += result.rowcount

    await engine.dispose()
    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s")
    print(f"Total: {total} | Imported: {imported}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import ICD-11 from WHO API")
    parser.add_argument("--client-id", required=True, help="WHO API client ID")
    parser.add_argument("--client-secret", required=True, help="WHO API client secret")
    parser.add_argument("--max-items", type=int, default=20000)
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()

    asyncio.run(import_icd11(args.client_id, args.client_secret, args.max_items, args.db_url))
