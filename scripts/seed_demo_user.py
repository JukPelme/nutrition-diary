"""One-shot demo user fixture: creates demo@nutrition-diary.app with
sample meals, mood and fasting data so the UI looks alive on first visit.

Idempotent: skipped if demo user already exists.
"""
import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEMO_EMAIL = "demo@nutrition-diary.app"
DEMO_PASSWORD = "Demo12345!"
DEMO_NAME = "Demo User"

# (search_substring, grams, meal_name)
PLAN = [
    ("Овсянка", 50, "Завтрак"),
    ("Творог 5%", 100, "Завтрак"),
    ("Яблоко", 150, "Перекус"),
    ("Куриная грудка", 150, "Обед"),
    ("Рис", 100, "Обед"),
    ("Авокадо", 80, "Обед"),
    ("Йогурт", 125, "Перекус"),
    ("Лосось", 120, "Ужин"),
    ("Брокколи", 150, "Ужин"),
]

DEFAULT_MEALS = [
    ("Завтрак", "🌅", 1),
    ("Перекус", "🍎", 2),
    ("Обед", "🍽", 3),
    ("Ужин", "🌙", 4),
]


async def main():
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.security import hash_password
    from app.models import User, Product, Meal, DiaryEntry
    from app.models.health import MoodEntry, FastingSession

    url = os.environ.get("DATABASE_URL")
    if url:
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    else:
        url = "sqlite+aiosqlite:///nutrition_diary.db"

    engine = create_async_engine(url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as s:
        existing = (await s.execute(select(User).where(User.email == DEMO_EMAIL))).scalar_one_or_none()
        if existing:
            print(f"[demo] {DEMO_EMAIL} already exists — skipping fixture")
            await engine.dispose()
            return

        user = User(
            id=uuid4(),
            email=DEMO_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name=DEMO_NAME,
        )
        s.add(user)
        await s.flush()

        meals = {}
        for mname, icon, order in DEFAULT_MEALS:
            m = Meal(id=uuid4(), user_id=user.id, name=mname, icon=icon, sort_order=order, is_default=True)
            s.add(m)
            meals[mname] = m
        await s.flush()

        today = date.today()
        yesterday = today - timedelta(days=1)

        added = 0
        for d in (yesterday, today):
            for query, grams, mname in PLAN:
                prod = (await s.execute(
                    select(Product).where(Product.name.ilike(f"%{query}%")).limit(1)
                )).scalar_one_or_none()
                if not prod:
                    continue
                factor = grams / 100.0
                entry = DiaryEntry(
                    id=uuid4(),
                    user_id=user.id,
                    meal_id=meals[mname].id,
                    product_id=prod.id,
                    entry_date=d,
                    product_name=prod.name,
                    serving_amount=grams,
                    calories=(prod.calories or 0) * factor,
                    protein=(prod.protein or 0) * factor,
                    fat=(prod.fat or 0) * factor,
                    carbohydrates=(prod.carbohydrates or 0) * factor,
                )
                s.add(entry)
                added += 1

        s.add(MoodEntry(
            id=uuid4(), user_id=user.id, date=today.isoformat(),
            mood=4, energy=4, sleep_hours=7.5, notes="Хорошо себя чувствую",
        ))

        now = datetime.now(timezone.utc)
        s.add(FastingSession(
            id=uuid4(), user_id=user.id, plan_type="16:8", fasting_hours=16,
            started_at=now - timedelta(hours=14), target_end=now + timedelta(hours=2),
            completed=None, notes="Текущий интервал",
        ))

        await s.commit()
        print(f"[demo] Created {DEMO_EMAIL} / {DEMO_PASSWORD} with {added} diary entries")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
