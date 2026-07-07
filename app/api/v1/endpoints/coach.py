"""AI-coach daily tip via Claude.

GET /recommendations/coach-tip?lang=ru
Claude looks at:
  - today's diary (what's logged so far)
  - profile goals
  - user_conditions
  - dietary_restrictions
  - hour of day
Returns 1-2 sentence actionable tip.
"""
import json
from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.deps import get_current_user
from app.core.deps import ai_limit
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.water import WaterEntry
from app.models.health import ICD11Condition, UserCondition

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/coach-tip", dependencies=[Depends(ai_limit("coach", 30, 3600))])
async def coach_tip(
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    today = date.today()
    totals = (await db.execute(
        select(
            func.coalesce(func.sum(DiaryEntry.calories), 0),
            func.coalesce(func.sum(DiaryEntry.protein), 0),
            func.coalesce(func.sum(DiaryEntry.fat), 0),
            func.coalesce(func.sum(DiaryEntry.carbohydrates), 0),
        ).where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today)
    )).one()

    water_ml = (await db.execute(
        select(func.coalesce(func.sum(WaterEntry.amount_ml), 0))
        .where(WaterEntry.user_id == user.id,
               WaterEntry.drunk_at >= datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc))
    )).scalar() or 0

    conds = (await db.execute(
        select(ICD11Condition.name_ru, ICD11Condition.name_en).join(UserCondition)
        .where(UserCondition.user_id == user.id).limit(5)
    )).all()

    water_goal = user.daily_water_goal_ml or (int(user.current_weight * 30) if user.current_weight else 2000)
    ctx = {
        "hour_of_day": datetime.now().hour,
        "today_kcal": int(totals[0] or 0),
        "today_protein_g": round(float(totals[1] or 0), 1),
        "today_fat_g": round(float(totals[2] or 0), 1),
        "today_carb_g": round(float(totals[3] or 0), 1),
        "today_water_ml": int(water_ml),
        "goal_kcal": user.daily_calorie_goal,
        "goal_protein_g": user.daily_protein_goal,
        "goal_fat_g": user.daily_fat_goal,
        "goal_carb_g": user.daily_carb_goal,
        "goal_water_ml": water_goal,
        "conditions": [c[0] or c[1] for c in conds],
        "dietary_restrictions": user.dietary_restrictions,
        "goal_type": user.goal_type,
    }
    sys_prompt = {
        "ru": "Ты — личный AI-нутрициолог. Дай 1-2 предложения конкретного действенного совета на текущий момент. Без диагнозов. Без воды. Никаких эмодзи, кроме максимум одного.",
        "en": "You are an AI nutrition coach. Give 1-2 sentences of concrete actionable advice for right now. No diagnoses. At most one emoji.",
        "ja": "あなたはAI栄養コーチです。今この瞬間の具体的で実行可能なアドバイスを1〜2文で。診断禁止。絵文字は最大1つ。",
    }.get(lang, "ru")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 150,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": json.dumps(ctx, ensure_ascii=False)}],
                },
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Claude {r.status_code}: {r.text[:200]}")
            text = r.json()["content"][0]["text"].strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Coach failed: {e}")

    return {"tip": text, "context": ctx}
