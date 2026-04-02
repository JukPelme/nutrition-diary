from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.product import Product
from app.services.nutrient_service import calculate_nutrients_for_serving, sum_nutrients, calculate_daily_percent

router = APIRouter(prefix="/nutrients", tags=["nutrients"])


@router.get("/daily")
async def get_daily_nutrients(
    entry_date: date = Query(..., description="Date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get full nutrient breakdown for a day: KBJU + vitamins + minerals with % daily value."""
    entries = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == entry_date)
    )
    entries = list(entries.scalars().all())

    all_nutrients = []
    for entry in entries:
        if entry.product_id:
            product = await db.execute(select(Product).where(Product.id == entry.product_id))
            product = product.scalar_one_or_none()
            if product:
                nutrients = calculate_nutrients_for_serving(product, entry.serving_amount)
                all_nutrients.append(nutrients)

    totals = sum_nutrients(all_nutrients)
    daily_percent = calculate_daily_percent(totals)

    # Macros
    macro_totals = {
        "calories": round(sum(e.calories or 0 for e in entries), 1),
        "protein": round(sum(e.protein or 0 for e in entries), 1),
        "fat": round(sum(e.fat or 0 for e in entries), 1),
        "carbohydrates": round(sum(e.carbohydrates or 0 for e in entries), 1),
    }

    return {
        "date": entry_date,
        "entries_count": len(entries),
        "macros": macro_totals,
        "nutrients": daily_percent,
    }
