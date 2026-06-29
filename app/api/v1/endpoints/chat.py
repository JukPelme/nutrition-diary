"""AI chat with diary context — Claude answers questions about the user's nutrition.

Sends to Claude:
  - system prompt (nutritionist persona)
  - structured context (profile, today, last 7 days, frequent foods, conditions)
  - last N messages of dialog
Returns assistant reply and persists both turns.
"""
from uuid import uuid4
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.health import MoodEntry, FastingSession, ICD11Condition, UserCondition
from app.models.water import WaterEntry
from app.models.chat import ChatMessage

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_HISTORY = 16  # messages of dialog passed back to Claude


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    lang: str = Field(default="ru", pattern="^(ru|en|ja)$")


class ChatOut(BaseModel):
    reply: str
    tokens_used: int | None = None


async def _build_context(db: AsyncSession, user: User) -> dict:
    today = date.today()
    week_ago = today - timedelta(days=7)

    # Last 7 days totals per day
    daily = (await db.execute(
        select(
            DiaryEntry.entry_date.label("d"),
            func.sum(DiaryEntry.calories).label("cal"),
            func.sum(DiaryEntry.protein).label("prot"),
            func.sum(DiaryEntry.fat).label("fat"),
            func.sum(DiaryEntry.carbohydrates).label("carb"),
        ).where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= week_ago)
         .group_by(DiaryEntry.entry_date)
         .order_by(DiaryEntry.entry_date)
    )).all()

    # Top frequent products in last 7 days
    top = (await db.execute(
        select(DiaryEntry.product_name, func.count(DiaryEntry.id).label("n"))
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= week_ago)
        .group_by(DiaryEntry.product_name)
        .order_by(desc("n")).limit(8)
    )).all()

    # Today entries (for "what did I eat today?" questions)
    today_entries = (await db.execute(
        select(DiaryEntry.product_name, DiaryEntry.serving_amount, DiaryEntry.calories, DiaryEntry.protein, DiaryEntry.fat, DiaryEntry.carbohydrates)
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today)
        .order_by(DiaryEntry.created_at)
    )).all()

    # Today water
    water_today = (await db.execute(
        select(func.sum(WaterEntry.amount_ml))
        .where(WaterEntry.user_id == user.id,
               WaterEntry.drunk_at >= datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc))
    )).scalar() or 0

    # Latest mood (yesterday or today)
    mood = (await db.execute(
        select(MoodEntry).where(MoodEntry.user_id == user.id)
        .order_by(desc(MoodEntry.date)).limit(3)
    )).scalars().all()

    # Active fasting session
    fasting = (await db.execute(
        select(FastingSession).where(FastingSession.user_id == user.id, FastingSession.completed.is_(None))
        .order_by(desc(FastingSession.started_at)).limit(1)
    )).scalar_one_or_none()

    # User conditions
    conds = (await db.execute(
        select(ICD11Condition.name_ru, ICD11Condition.name_en, ICD11Condition.code).join(UserCondition)
        .where(UserCondition.user_id == user.id).limit(10)
    )).all()

    # Water goal
    if user.daily_water_goal_ml:
        water_goal = user.daily_water_goal_ml
    elif user.current_weight:
        water_goal = int(user.current_weight * 30)
    else:
        water_goal = 2000

    return {
        "profile": {
            "name": user.full_name,
            "weight_kg": user.current_weight,
            "target_weight_kg": user.target_weight,
            "height_cm": user.height,
            "birth_year": user.birth_year,
            "sex": user.sex,
            "activity": user.activity_level,
            "goal_type": user.goal_type,
            "calorie_goal": user.daily_calorie_goal,
            "protein_goal": user.daily_protein_goal,
            "fat_goal": user.daily_fat_goal,
            "carb_goal": user.daily_carb_goal,
            "water_goal_ml": water_goal,
        },
        "today": {
            "date": today.isoformat(),
            "water_ml": int(water_today),
            "entries": [
                {"product": r.product_name, "g": r.serving_amount, "kcal": round(r.calories or 0), "p": round(r.protein or 0, 1), "f": round(r.fat or 0, 1), "c": round(r.carbohydrates or 0, 1)}
                for r in today_entries
            ],
        },
        "last_7_days_per_day": [
            {"date": r.d.isoformat(), "kcal": round(r.cal or 0), "p": round(r.prot or 0, 1), "f": round(r.fat or 0, 1), "c": round(r.carb or 0, 1)}
            for r in daily
        ],
        "frequent_products_last_week": [{"name": r.product_name, "times": r.n} for r in top],
        "recent_mood": [{"date": m.date, "mood": m.mood, "energy": m.energy, "sleep_h": m.sleep_hours} for m in mood],
        "active_fasting": (
            {"plan": fasting.plan_type, "hours_target": fasting.fasting_hours,
             "started_at": fasting.started_at.isoformat(),
             "target_end": fasting.target_end.isoformat()} if fasting else None
        ),
        "conditions": [{"name": c.name_ru or c.name_en, "code": c.code} for c in conds],
    }


def _system_prompt(lang: str) -> str:
    return {
        "ru": ("Ты — личный нутрициолог пользователя в дневнике питания. Отвечай дружелюбно, по делу, "
               "коротко (1-4 предложения), на русском. Используй данные из CONTEXT JSON: текущие цели, "
               "сегодняшний рацион, тренды недели, диагнозы. Можешь считать КБЖУ, советовать продукты "
               "и тренды. Никогда не ставь медицинские диагнозы — при серьёзных вопросах напомни про врача."),
        "en": ("You are the user's personal nutritionist in a food diary app. Reply warmly and concretely, "
               "in short messages (1-4 sentences), in English. Use data from CONTEXT JSON: goals, today's "
               "diet, weekly trends, conditions. You may compute macros, suggest foods, point out trends. "
               "Never diagnose — for serious questions refer to a doctor."),
        "ja": ("あなたは食事日記アプリのユーザーの個人栄養士です。日本語で温かく具体的に、短く(1〜4文)"
               "返答してください。CONTEXT JSONのデータ(目標、今日の食事、週のトレンド、疾患)を使って"
               "ください。マクロ計算、食品提案、傾向の指摘ができます。診断は絶対にせず、深刻な質問には"
               "医師への相談を勧めてください。"),
    }.get(lang, "ru")


@router.post("", response_model=ChatOut)
async def chat_send(
    data: ChatIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "Chat requires ANTHROPIC_API_KEY")

    # Save user message
    user_msg = ChatMessage(id=uuid4(), user_id=user.id, role="user", content=data.message)
    db.add(user_msg)
    await db.flush()

    # Build dialog history
    history_rows = (await db.execute(
        select(ChatMessage).where(ChatMessage.user_id == user.id)
        .order_by(desc(ChatMessage.created_at)).limit(MAX_HISTORY)
    )).scalars().all()
    history_rows = list(reversed(history_rows))
    messages = [{"role": m.role, "content": m.content} for m in history_rows]

    ctx = await _build_context(db, user)
    sys_prompt = _system_prompt(data.lang) + "\n\nCONTEXT:\n" + str(ctx)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 600,
                    "system": sys_prompt,
                    "messages": messages,
                },
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Claude {r.status_code}: {r.text[:200]}")
            j = r.json()
            reply = j["content"][0]["text"].strip()
            tokens = (j.get("usage") or {}).get("output_tokens")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Chat call failed: {e}")

    asst = ChatMessage(id=uuid4(), user_id=user.id, role="assistant", content=reply)
    db.add(asst)
    await db.commit()
    return ChatOut(reply=reply, tokens_used=tokens)


@router.get("/history")
async def chat_history(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(ChatMessage).where(ChatMessage.user_id == user.id)
        .order_by(desc(ChatMessage.created_at)).limit(limit)
    )).scalars().all()
    return [
        {"id": str(m.id), "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()}
        for m in reversed(rows)
    ]


@router.delete("/clear")
async def chat_clear(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(ChatMessage.__table__.delete().where(ChatMessage.user_id == user.id))
    await db.commit()
    return {"cleared": True}
