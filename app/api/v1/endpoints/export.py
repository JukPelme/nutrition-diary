"""Export diary data as CSV."""
import io
import csv
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/csv")
async def export_csv(
    days: int = Query(7, ge=1, le=365, description="Number of days to export"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_date = date.today() - timedelta(days=days - 1)

    result = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == current_user.id)
        .where(DiaryEntry.entry_date >= start_date)
        .order_by(DiaryEntry.entry_date, DiaryEntry.created_at)
    )
    entries = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Дата", "Продукт", "Порция (г)", "Калории", "Белки", "Жиры", "Углеводы"])

    for e in entries:
        writer.writerow([
            e.entry_date.isoformat(),
            e.product_name,
            round(e.serving_amount, 1),
            round(e.calories or 0, 1),
            round(e.protein or 0, 1),
            round(e.fat or 0, 1),
            round(e.carbohydrates or 0, 1),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=diary_{days}d.csv"}
    )
