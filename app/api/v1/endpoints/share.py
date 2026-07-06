from datetime import date
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry, Meal
from app.models.share import SharedDay

router = APIRouter(prefix="/share", tags=["share"])


@router.post("/day")
async def share_day(
    entry_date: date = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a persistent shareable link for a day's meals."""
    entries = (await db.execute(
        select(DiaryEntry).where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date == entry_date,
        )
    )).scalars().all()
    if not entries:
        raise HTTPException(404, "No entries for this date")

    meals_map = {
        m.id: m.name
        for m in (await db.execute(select(Meal).where(Meal.user_id == user.id))).scalars().all()
    }

    payload = {"date": str(entry_date), "user_name": user.full_name or "User", "meals": {}}
    for e in entries:
        meal_name = meals_map.get(e.meal_id, "Other")
        payload["meals"].setdefault(meal_name, []).append({
            "name": e.product_name,
            "weight": e.serving_amount,
            "calories": round(e.calories, 1),
            "protein": round(e.protein, 1),
            "fat": round(e.fat, 1),
            "carbs": round(e.carbohydrates, 1),
        })

    share_id = uuid4().hex[:8]
    db.add(SharedDay(share_id=share_id, user_id=user.id, payload=payload))
    await db.commit()
    return {"share_id": share_id}


@router.get("/view/{share_id}")
async def view_shared(share_id: str, db: AsyncSession = Depends(get_db)):
    """View a shared day (public, no auth)."""
    row = (await db.execute(
        select(SharedDay).where(SharedDay.share_id == share_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Link expired or not found")
    return row.payload
