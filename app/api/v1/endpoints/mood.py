"""Mood diary — track mood & energy, correlate with nutrition."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import MoodEntry
from app.models.diary import DiaryEntry

router = APIRouter(prefix="/mood", tags=["mood"])

MOOD_ICONS = {1: "😫", 2: "😔", 3: "😐", 4: "🙂", 5: "😄"}


class MoodAdd(BaseModel):
    date: str
    mood: int  # 1-5
    energy: int | None = None  # 1-5
    sleep_hours: float | None = None
    notes: str | None = None


@router.post("")
async def save_mood(
    data: MoodAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Upsert
    result = await db.execute(
        select(MoodEntry).where(MoodEntry.user_id == user.id, MoodEntry.date == data.date)
    )
    entry = result.scalar_one_or_none()
    if entry:
        entry.mood = data.mood
        entry.energy = data.energy
        entry.sleep_hours = data.sleep_hours
        entry.notes = data.notes
    else:
        entry = MoodEntry(user_id=user.id, **data.model_dump())
        db.add(entry)
    await db.flush()
    return {"id": str(entry.id), "mood": entry.mood, "energy": entry.energy}


@router.get("")
async def get_mood(
    date: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MoodEntry).where(MoodEntry.user_id == user.id, MoodEntry.date == date)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return None
    return {
        "mood": entry.mood, "energy": entry.energy,
        "sleep_hours": entry.sleep_hours, "notes": entry.notes,
    }


@router.get("/history")
async def mood_history(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    result = await db.execute(
        select(MoodEntry)
        .where(MoodEntry.user_id == user.id, MoodEntry.date >= since)
        .order_by(MoodEntry.date)
    )
    entries = result.scalars().all()
    return [
        {"date": e.date, "mood": e.mood, "energy": e.energy, "sleep_hours": e.sleep_hours}
        for e in entries
    ]


@router.get("/correlation")
async def mood_nutrition_correlation(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Correlate mood with nutrition data."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    # Get mood entries
    moods = await db.execute(
        select(MoodEntry).where(MoodEntry.user_id == user.id, MoodEntry.date >= since)
    )
    mood_map = {e.date: e for e in moods.scalars().all()}
    if not mood_map:
        return {"message": "Недостаточно данных", "data": []}

    # Get diary entries for those dates (mood.date is str, DiaryEntry.entry_date is date)
    from datetime import date as _date_cls
    mood_dates = [_date_cls.fromisoformat(k) for k in mood_map.keys()]
    diary = await db.execute(
        select(DiaryEntry).where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date.in_(mood_dates),
        )
    )
    entries = diary.scalars().all()

    # Aggregate nutrition per date
    daily_nutrition = {}
    for e in entries:
        d = e.entry_date.strftime("%Y-%m-%d") if hasattr(e.entry_date, "strftime") else str(e.entry_date)
        if d not in daily_nutrition:
            daily_nutrition[d] = {"calories": 0, "protein": 0, "fat": 0, "carbs": 0}
        daily_nutrition[d]["calories"] += e.calories or 0
        daily_nutrition[d]["protein"] += e.protein or 0
        daily_nutrition[d]["fat"] += e.fat or 0
        daily_nutrition[d]["carbs"] += e.carbohydrates or 0

    # Build correlation data
    data = []
    for date, mood_entry in mood_map.items():
        nut = daily_nutrition.get(date, {})
        data.append({
            "date": date,
            "mood": mood_entry.mood,
            "energy": mood_entry.energy,
            "sleep_hours": mood_entry.sleep_hours,
            "calories": round(nut.get("calories", 0)),
            "protein": round(nut.get("protein", 0)),
        })

    # Simple insights
    good_days = [d for d in data if d["mood"] >= 4 and d["calories"] > 0]
    bad_days = [d for d in data if d["mood"] <= 2 and d["calories"] > 0]

    insights = {}
    if good_days:
        insights["good_mood_avg_cal"] = round(sum(d["calories"] for d in good_days) / len(good_days))
        insights["good_mood_avg_protein"] = round(sum(d["protein"] for d in good_days) / len(good_days))
    if bad_days:
        insights["bad_mood_avg_cal"] = round(sum(d["calories"] for d in bad_days) / len(bad_days))
        insights["bad_mood_avg_protein"] = round(sum(d["protein"] for d in bad_days) / len(bad_days))

    return {"data": data, "insights": insights}
