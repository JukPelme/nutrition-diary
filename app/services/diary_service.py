from datetime import date
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.diary import DiaryEntry, Meal
from app.schemas.diary import DiaryEntryCreate, DiaryEntryUpdate


async def get_entries_by_date(db: AsyncSession, user_id: UUID, entry_date: date) -> list[DiaryEntry]:
    result = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == user_id, DiaryEntry.entry_date == entry_date)
        .order_by(DiaryEntry.created_at)
    )
    return list(result.scalars().all())


async def get_daily_summary(db: AsyncSession, user_id: UUID, entry_date: date) -> dict:
    entries = await get_entries_by_date(db, user_id, entry_date)

    total = {"calories": 0.0, "protein": 0.0, "fat": 0.0, "carbohydrates": 0.0}
    for e in entries:
        total["calories"] += e.calories or 0
        total["protein"] += e.protein or 0
        total["fat"] += e.fat or 0
        total["carbohydrates"] += e.carbohydrates or 0

    return {
        "date": entry_date,
        "total_calories": round(total["calories"], 1),
        "total_protein": round(total["protein"], 1),
        "total_fat": round(total["fat"], 1),
        "total_carbohydrates": round(total["carbohydrates"], 1),
        "entries_count": len(entries),
        "entries": entries,
    }


async def create_entry(db: AsyncSession, user_id: UUID, data: DiaryEntryCreate) -> DiaryEntry:
    entry = DiaryEntry(
        user_id=user_id,
        **data.model_dump(),
    )
    db.add(entry)
    await db.flush()
    return entry


async def get_entry(db: AsyncSession, entry_id: UUID, user_id: UUID) -> DiaryEntry | None:
    result = await db.execute(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_entry(db: AsyncSession, entry: DiaryEntry, data: DiaryEntryUpdate) -> DiaryEntry:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    await db.flush()
    return entry


async def delete_entry(db: AsyncSession, entry: DiaryEntry) -> None:
    await db.delete(entry)
    await db.flush()


# Meals
async def get_user_meals(db: AsyncSession, user_id: UUID) -> list[Meal]:
    result = await db.execute(
        select(Meal).where(Meal.user_id == user_id).order_by(Meal.sort_order)
    )
    return list(result.scalars().all())


async def create_meal(db: AsyncSession, user_id: UUID, name: str, icon: str | None = None, sort_order: int = 0) -> Meal:
    meal = Meal(user_id=user_id, name=name, icon=icon, sort_order=sort_order)
    db.add(meal)
    await db.flush()
    return meal
