from datetime import date
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry, Meal

router = APIRouter(prefix="/share", tags=["share"])

# In-memory store for shared links (simple approach, resets on restart)
# For production, store in DB
_shared_data = {}


@router.post("/day")
async def share_day(
    entry_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a shareable link for a day\'s meals."""
    result = await db.execute(
        select(DiaryEntry).where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date == entry_date,
        )
    )
    entries = result.scalars().all()
    if not entries:
        raise HTTPException(404, "No entries for this date")

    # Get meals
    meal_result = await db.execute(
        select(Meal).where(Meal.user_id == user.id)
    )
    meals_map = {m.id: m.name for m in meal_result.scalars().all()}

    share_id = uuid4().hex[:8]
    _shared_data[share_id] = {
        "date": str(entry_date),
        "user_name": user.full_name or "User",
        "meals": {},
    }

    for e in entries:
        meal_name = meals_map.get(e.meal_id, "Other")
        if meal_name not in _shared_data[share_id]["meals"]:
            _shared_data[share_id]["meals"][meal_name] = []
        _shared_data[share_id]["meals"][meal_name].append({
            "name": e.product_name,
            "weight": e.serving_amount,
            "calories": round(e.calories, 1),
            "protein": round(e.protein, 1),
            "fat": round(e.fat, 1),
            "carbs": round(e.carbohydrates, 1),
        })

    return {"share_id": share_id}


@router.get("/view/{share_id}")
async def view_shared(share_id: str):
    """View a shared day (public, no auth)."""
    data = _shared_data.get(share_id)
    if not data:
        raise HTTPException(404, "Link expired or not found")
    return data
