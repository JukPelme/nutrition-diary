"""
Telegram bot webhook endpoint.
Bot sends food entries via this API.
"""
import hmac
from datetime import date
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from app.db.session import engine
from app.models.user import User
from app.models.diary import DiaryEntry, Meal
from app.core.config import settings

router = APIRouter(prefix="/bot", tags=["bot"])

_DEFAULT_BOT_TOKEN = "change-me-bot-token"


def _verify_bot_token(x_bot_token: str):
    # An unset/default BOT_TOKEN must never authenticate anyone (was a live
    # auth bypass: default token let anyone read/write any user by email).
    if settings.bot_token == _DEFAULT_BOT_TOKEN:
        raise HTTPException(503, "Bot integration is not configured")
    if not hmac.compare_digest(x_bot_token or "", settings.bot_token):
        raise HTTPException(403, "Invalid bot token")


class BotFoodEntry(BaseModel):
    user_email: str
    product_name: str
    serving_amount: float = 100
    calories: float = 0
    protein: float = 0
    fat: float = 0
    carbohydrates: float = 0
    meal_name: str = "Перекус"


@router.post("/add-food")
async def bot_add_food(data: BotFoodEntry, x_bot_token: str = Header(...)):
    """Add food entry from Telegram bot."""
    _verify_bot_token(x_bot_token)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        # Find user
        result = await db.execute(select(User).where(User.email == data.user_email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")

        # Find meal
        result = await db.execute(
            select(Meal).where(Meal.user_id == user.id, Meal.name == data.meal_name)
        )
        meal = result.scalar_one_or_none()

        entry = DiaryEntry(
            user_id=user.id,
            meal_id=meal.id if meal else None,
            entry_date=date.today(),
            product_name=data.product_name,
            serving_amount=data.serving_amount,
            calories=data.calories,
            protein=data.protein,
            fat=data.fat,
            carbohydrates=data.carbohydrates,
        )
        db.add(entry)
        await db.commit()

    return {"status": "ok", "product": data.product_name}


@router.get("/summary")
async def bot_summary(email: str, x_bot_token: str = Header(...)):
    """Get today\'s summary for Telegram bot."""
    _verify_bot_token(x_bot_token)

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(404, "User not found")

        result = await db.execute(
            select(DiaryEntry).where(
                DiaryEntry.user_id == user.id,
                DiaryEntry.entry_date == date.today(),
            )
        )
        entries = result.scalars().all()

    total_cal = sum(e.calories for e in entries)
    total_p = sum(e.protein for e in entries)
    total_f = sum(e.fat for e in entries)
    total_c = sum(e.carbohydrates for e in entries)

    return {
        "date": str(date.today()),
        "entries_count": len(entries),
        "calories": round(total_cal, 1),
        "protein": round(total_p, 1),
        "fat": round(total_f, 1),
        "carbohydrates": round(total_c, 1),
        "goal": user.daily_calorie_goal or 2000,
    }
