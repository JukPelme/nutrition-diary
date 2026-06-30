"""XP / level / daily quests.

GET  /leveling/me             — current xp + level + xp to next
POST /leveling/quests/today   — get-or-generate 3 daily quests for today
POST /leveling/quests/{id}/check  — check if quest completed, award XP if done
"""
import random
from uuid import uuid4, UUID
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.water import WaterEntry
from app.models.health import MoodEntry
from app.models.quest import DailyQuest

router = APIRouter(prefix="/leveling", tags=["leveling"])


def xp_for_level(level: int) -> int:
    """Total XP needed to REACH level n (cumulative). Curve: level^2 * 100."""
    return level * level * 100


def level_from_xp(xp: int) -> tuple[int, int, int]:
    """Returns (level, xp_into_current_level, xp_needed_for_next_level_total)."""
    level = 1
    while xp_for_level(level + 1) <= xp:
        level += 1
    cur_floor = xp_for_level(level)
    next_floor = xp_for_level(level + 1)
    return level, xp - cur_floor, next_floor - cur_floor


@router.get("/me")
async def my_xp(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    level, into, span = level_from_xp(user.xp or 0)
    return {"xp": user.xp or 0, "level": level, "xp_into_level": into, "xp_to_next_level": span}


# Quest catalog (code → check function later applies)
QUESTS_CATALOG = [
    {
        "code": "log_3_meals",
        "titles": ("Запиши 3 приёма пищи сегодня", "Log 3 meals today", "今日3食を記録"),
        "xp": 25,
    },
    {
        "code": "drink_water_full",
        "titles": ("Достигни дневной нормы воды", "Reach your daily water goal", "1日の水分目標を達成"),
        "xp": 20,
    },
    {
        "code": "hit_protein_goal",
        "titles": ("Достигни цели по белку", "Hit your protein goal", "タンパク質目標を達成"),
        "xp": 30,
    },
    {
        "code": "try_new_product",
        "titles": ("Попробуй новый продукт", "Try a new product", "新しい食品を試す"),
        "xp": 25,
    },
    {
        "code": "log_mood",
        "titles": ("Запиши настроение", "Log your mood", "気分を記録"),
        "xp": 15,
    },
    {
        "code": "stay_in_calorie_band",
        "titles": ("Попади в калорийную норму (±10%)", "Hit calorie target (±10%)", "カロリー目標±10%以内"),
        "xp": 30,
    },
    {
        "code": "five_distinct_products",
        "titles": ("5 разных продуктов за день", "5 distinct products today", "1日に5種類の食品"),
        "xp": 20,
    },
]


@router.post("/quests/today")
async def quests_today(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    existing = (await db.execute(
        select(DailyQuest).where(DailyQuest.user_id == user.id, DailyQuest.quest_date == today)
    )).scalars().all()
    if not existing:
        # Generate 3 random unique quests
        picks = random.sample(QUESTS_CATALOG, 3)
        for spec in picks:
            db.add(DailyQuest(
                id=uuid4(), user_id=user.id, quest_date=today,
                code=spec["code"],
                title_ru=spec["titles"][0], title_en=spec["titles"][1], title_ja=spec["titles"][2],
                xp_reward=spec["xp"],
            ))
        await db.commit()
        existing = (await db.execute(
            select(DailyQuest).where(DailyQuest.user_id == user.id, DailyQuest.quest_date == today)
        )).scalars().all()
    return [
        {"id": str(q.id), "code": q.code,
         "title_ru": q.title_ru, "title_en": q.title_en, "title_ja": q.title_ja,
         "xp_reward": q.xp_reward, "completed_at": q.completed_at.isoformat() if q.completed_at else None}
        for q in existing
    ]


@router.post("/quests/{quest_id}/check")
async def check_quest(
    quest_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (await db.execute(select(DailyQuest).where(DailyQuest.id == quest_id, DailyQuest.user_id == user.id))).scalar_one_or_none()
    if not q:
        raise HTTPException(404, "Quest not found")
    if q.completed_at:
        return {"already_completed": True}

    today = date.today()
    done = False
    code = q.code

    if code == "log_3_meals":
        n = (await db.execute(
            select(func.count(distinct(DiaryEntry.meal_id))).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today
            )
        )).scalar() or 0
        done = n >= 3

    elif code == "drink_water_full":
        ml = (await db.execute(
            select(func.coalesce(func.sum(WaterEntry.amount_ml), 0)).where(
                WaterEntry.user_id == user.id,
                WaterEntry.drunk_at >= datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc),
            )
        )).scalar() or 0
        goal = user.daily_water_goal_ml or (int((user.current_weight or 70) * 30))
        done = ml >= goal

    elif code == "hit_protein_goal":
        p = (await db.execute(
            select(func.coalesce(func.sum(DiaryEntry.protein), 0)).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today
            )
        )).scalar() or 0
        done = (user.daily_protein_goal or 0) > 0 and p >= (user.daily_protein_goal * 0.95)

    elif code == "try_new_product":
        today_products = {r[0] for r in (await db.execute(
            select(distinct(DiaryEntry.product_name)).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today
            )
        )).all()}
        past_products = {r[0] for r in (await db.execute(
            select(distinct(DiaryEntry.product_name)).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date < today
            )
        )).all()}
        done = bool(today_products - past_products)

    elif code == "log_mood":
        n = (await db.execute(
            select(func.count(MoodEntry.id)).where(
                MoodEntry.user_id == user.id, MoodEntry.date == today
            )
        )).scalar() or 0
        done = n >= 1

    elif code == "stay_in_calorie_band":
        kcal = (await db.execute(
            select(func.coalesce(func.sum(DiaryEntry.calories), 0)).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today
            )
        )).scalar() or 0
        goal = user.daily_calorie_goal
        done = bool(goal) and (goal * 0.9) <= kcal <= (goal * 1.1)

    elif code == "five_distinct_products":
        n = (await db.execute(
            select(func.count(distinct(DiaryEntry.product_name))).where(
                DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today
            )
        )).scalar() or 0
        done = n >= 5

    if not done:
        return {"completed": False}

    q.completed_at = datetime.utcnow()
    user.xp = (user.xp or 0) + q.xp_reward
    level, into, span = level_from_xp(user.xp)
    level_up = level > (user.level or 1)
    user.level = level
    await db.commit()
    return {"completed": True, "xp_awarded": q.xp_reward, "xp": user.xp, "level": level, "level_up": level_up}


@router.post("/award-xp")
async def award_xp(
    amount: int = 10,
    reason: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Internal-ish: award arbitrary XP. Client calls after diary add, recipe create, etc."""
    if amount <= 0 or amount > 200:
        raise HTTPException(400, "Bad amount")
    user.xp = (user.xp or 0) + amount
    level, into, span = level_from_xp(user.xp)
    level_up = level > (user.level or 1)
    user.level = level
    await db.commit()
    return {"xp": user.xp, "level": level, "level_up": level_up}
