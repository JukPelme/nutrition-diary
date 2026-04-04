"""
Data sync: export/import user data as JSON for backup or cross-device transfer.
"""
from datetime import date
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry, Meal
from app.models.health import UserCondition

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/export")
async def export_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export all user data as JSON."""
    # Meals
    result = await db.execute(select(Meal).where(Meal.user_id == user.id))
    meals = [{
        "name": m.name, "icon": m.icon, "sort_order": m.sort_order, "is_default": m.is_default,
    } for m in result.scalars().all()]

    # Diary entries
    result = await db.execute(
        select(DiaryEntry).where(DiaryEntry.user_id == user.id).order_by(DiaryEntry.entry_date)
    )
    entries = [{
        "entry_date": str(e.entry_date),
        "meal_name": next((m["name"] for m in meals if True), ""),  # will match by meal_id below
        "product_name": e.product_name,
        "serving_amount": e.serving_amount,
        "calories": e.calories,
        "protein": e.protein,
        "fat": e.fat,
        "carbohydrates": e.carbohydrates,
    } for e in result.scalars().all()]

    # Get meal names for entries
    result2 = await db.execute(select(Meal).where(Meal.user_id == user.id))
    meal_map = {str(m.id): m.name for m in result2.scalars().all()}

    result3 = await db.execute(
        select(DiaryEntry).where(DiaryEntry.user_id == user.id).order_by(DiaryEntry.entry_date)
    )
    entries = [{
        "entry_date": str(e.entry_date),
        "meal_name": meal_map.get(str(e.meal_id), ""),
        "product_name": e.product_name,
        "serving_amount": e.serving_amount,
        "calories": e.calories,
        "protein": e.protein,
        "fat": e.fat,
        "carbohydrates": e.carbohydrates,
    } for e in result3.scalars().all()]

    return {
        "version": 1,
        "user": {
            "email": user.email,
            "full_name": user.full_name,
            "daily_calorie_goal": user.daily_calorie_goal,
            "daily_protein_goal": user.daily_protein_goal,
            "daily_fat_goal": user.daily_fat_goal,
            "daily_carb_goal": user.daily_carb_goal,
        },
        "meals": meals,
        "entries": entries,
        "entries_count": len(entries),
    }


@router.post("/import")
async def import_data(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Import user data from JSON backup."""
    import json
    content = await file.read()
    data = json.loads(content)

    if data.get("version") != 1:
        return {"error": "Unsupported format version"}

    imported = 0

    # Import meals if missing
    result = await db.execute(select(Meal).where(Meal.user_id == user.id))
    existing_meals = {m.name: m for m in result.scalars().all()}

    for meal_data in data.get("meals", []):
        if meal_data["name"] not in existing_meals:
            m = Meal(user_id=user.id, **meal_data)
            db.add(m)

    await db.flush()

    # Refresh meal map
    result = await db.execute(select(Meal).where(Meal.user_id == user.id))
    meal_map = {m.name: m.id for m in result.scalars().all()}

    # Import entries
    for entry_data in data.get("entries", []):
        meal_name = entry_data.pop("meal_name", "")
        entry = DiaryEntry(
            user_id=user.id,
            meal_id=meal_map.get(meal_name),
            entry_date=entry_data["entry_date"],
            product_name=entry_data["product_name"],
            serving_amount=entry_data["serving_amount"],
            calories=entry_data.get("calories", 0),
            protein=entry_data.get("protein", 0),
            fat=entry_data.get("fat", 0),
            carbohydrates=entry_data.get("carbohydrates", 0),
        )
        db.add(entry)
        imported += 1

    await db.flush()

    return {"status": "ok", "imported_entries": imported}
