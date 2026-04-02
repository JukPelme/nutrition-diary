from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/range")
async def get_stats_range(
    date_from: date = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: date = Query(..., description="End date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get daily stats for a date range."""
    result = await db.execute(
        select(
            DiaryEntry.entry_date,
            func.sum(DiaryEntry.calories).label("calories"),
            func.sum(DiaryEntry.protein).label("protein"),
            func.sum(DiaryEntry.fat).label("fat"),
            func.sum(DiaryEntry.carbohydrates).label("carbs"),
            func.count(DiaryEntry.id).label("entries_count"),
        )
        .where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date >= date_from,
            DiaryEntry.entry_date <= date_to,
        )
        .group_by(DiaryEntry.entry_date)
        .order_by(DiaryEntry.entry_date)
    )

    days = []
    for row in result.all():
        days.append({
            "date": row.entry_date,
            "calories": round(row.calories or 0, 1),
            "protein": round(row.protein or 0, 1),
            "fat": round(row.fat or 0, 1),
            "carbohydrates": round(row.carbs or 0, 1),
            "entries_count": row.entries_count,
        })

    # Averages
    total_days = len(days) or 1
    avg = {
        "avg_calories": round(sum(d["calories"] for d in days) / total_days, 1),
        "avg_protein": round(sum(d["protein"] for d in days) / total_days, 1),
        "avg_fat": round(sum(d["fat"] for d in days) / total_days, 1),
        "avg_carbohydrates": round(sum(d["carbohydrates"] for d in days) / total_days, 1),
    }

    return {
        "date_from": date_from,
        "date_to": date_to,
        "total_days": total_days,
        "averages": avg,
        "days": days,
    }


@router.get("/week")
async def get_week_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Shortcut: stats for current week (Mon-Sun)."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    # Reuse range endpoint logic
    return await get_stats_range(date_from=monday, date_to=sunday, db=db, user=user)


@router.get("/month")
async def get_month_stats(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2030),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stats for a specific month."""
    first_day = date(year, month, 1)
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)

    return await get_stats_range(date_from=first_day, date_to=last_day, db=db, user=user)
