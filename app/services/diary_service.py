from datetime import date
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from app.models.diary import DiaryEntry, Meal
from app.models.water import WaterEntry
from app.services.fluid import detect_fluid, estimate_ml
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
    payload = data.model_dump(exclude={"add_to_water"})
    entry = DiaryEntry(user_id=user_id, **payload)
    db.add(entry)
    await db.flush()

    # Auto-log drinks (milk, juice, coffee, ...) toward the daily fluid goal.
    entry.water_added_ml = 0
    entry.water_entry_id = None
    if data.add_to_water:
        is_liquid, drink_type = detect_fluid(entry.product_name)
        ml = estimate_ml(entry.serving_amount)
        if is_liquid and ml > 0:
            water = WaterEntry(
                user_id=user_id,
                amount_ml=ml,
                drink_type=drink_type,
                drunk_at=datetime.now(timezone.utc),
                notes=f"Из еды: {entry.product_name}",
                source_diary_entry_id=entry.id,
            )
            db.add(water)
            await db.flush()
            entry.water_added_ml = ml
            entry.water_entry_id = water.id
    return entry


async def _linked_water(db: AsyncSession, entry_id: UUID) -> WaterEntry | None:
    res = await db.execute(
        select(WaterEntry).where(WaterEntry.source_diary_entry_id == entry_id)
    )
    return res.scalar_one_or_none()


async def get_entry(db: AsyncSession, entry_id: UUID, user_id: UUID) -> DiaryEntry | None:
    result = await db.execute(
        select(DiaryEntry).where(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_entry(db: AsyncSession, entry: DiaryEntry, data: DiaryEntryUpdate) -> DiaryEntry:
    changed = data.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(entry, field, value)
    await db.flush()
    entry.water_added_ml = 0
    entry.water_entry_id = None
    if "serving_amount" in changed:
        water = await _linked_water(db, entry.id)
        if water is not None:
            water.amount_ml = estimate_ml(entry.serving_amount)
            await db.flush()
            entry.water_added_ml = water.amount_ml
            entry.water_entry_id = water.id
    return entry


async def delete_entry(db: AsyncSession, entry: DiaryEntry) -> None:
    water = await _linked_water(db, entry.id)
    if water is not None:
        await db.delete(water)
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


async def get_recent_days(db: AsyncSession, user_id: UUID, days: int = 14) -> list[dict]:
    """Last N distinct days that have diary entries, grouped by date -> meals.

    Used by the History view so the user can browse past days and repeat a
    meal or a whole day. Bounded to N most-recent days with records (not a
    calendar window), so it works regardless of gaps or timezone.
    """
    days = max(1, min(days, 60))

    date_rows = await db.execute(
        select(DiaryEntry.entry_date)
        .where(DiaryEntry.user_id == user_id)
        .group_by(DiaryEntry.entry_date)
        .order_by(DiaryEntry.entry_date.desc())
        .limit(days)
    )
    dates = [r[0] for r in date_rows.all()]
    if not dates:
        return []

    result = await db.execute(
        select(DiaryEntry)
        .where(DiaryEntry.user_id == user_id, DiaryEntry.entry_date.in_(dates))
        .order_by(DiaryEntry.entry_date.desc(), DiaryEntry.created_at)
    )
    entries = list(result.scalars().all())

    meals = await get_user_meals(db, user_id)
    meal_map = {m.id: m for m in meals}

    by_date: dict = {}
    for e in entries:
        by_date.setdefault(e.entry_date, []).append(e)

    def _meal_sort(mid):
        m = meal_map.get(mid)
        return (0, m.sort_order) if m else (1, 0)

    out: list[dict] = []
    for d in dates:  # already sorted desc
        day_entries = by_date.get(d, [])
        groups: dict = {}
        for e in day_entries:
            groups.setdefault(e.meal_id, []).append(e)

        meal_blocks = []
        for mid in sorted(groups.keys(), key=_meal_sort):
            m = meal_map.get(mid)
            m_entries = groups[mid]
            meal_blocks.append({
                "meal_id": mid,
                "meal_name": m.name if m else None,
                "meal_icon": m.icon if m else None,
                "calories": round(sum(x.calories or 0 for x in m_entries), 1),
                "entries": m_entries,
            })

        out.append({
            "date": d,
            "total_calories": round(sum(x.calories or 0 for x in day_entries), 1),
            "total_protein": round(sum(x.protein or 0 for x in day_entries), 1),
            "total_fat": round(sum(x.fat or 0 for x in day_entries), 1),
            "total_carbohydrates": round(sum(x.carbohydrates or 0 for x in day_entries), 1),
            "entries_count": len(day_entries),
            "meals": meal_blocks,
        })
    return out
