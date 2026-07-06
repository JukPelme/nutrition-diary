"""Weekly micronutrient deficiency analysis via Claude.

GET /recommendations/deficiencies?lang=ru → Claude reads last 14 days of diary,
computes rough macro/vitamin/mineral averages, and writes a short narrative:
  - 3-5 deficits (with food suggestions to fix)
  - 1-2 excesses (with caution)
"""
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.deps import get_current_user
from app.core.deps import ai_limit
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.product import Product

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


# RDA (rough adult), per day, used to compute % filled
RDA = {
    "vitamin_d": 15.0,   # mcg
    "vitamin_b12": 2.4,  # mcg
    "vitamin_c": 90.0,   # mg
    "iron": 18.0,        # mg
    "calcium": 1000.0,   # mg
    "magnesium": 400.0,  # mg
    "zinc": 11.0,        # mg
    "potassium": 3500.0, # mg
    "fiber": 30.0,       # g
}


def _system_prompt(lang: str) -> str:
    return {
        "ru": ("Ты — нутрициолог. На основе средних дневных нутриентов за 14 дней опиши КРАТКО (3-5 пунктов) "
               "главные дефициты с конкретными продуктами для их закрытия. 1-2 предостережения о перевыполнении. "
               "Не ставь диагнозы. Используй маркеры списка. Будь конкретен — называй продукты и порции."),
        "en": ("You are a nutritionist. Based on 14-day average nutrients, list 3-5 main deficits with concrete "
               "foods to fix them. 1-2 cautions about excesses. No diagnoses. Use bullet points."),
        "ja": ("あなたは栄養士です。14日間の平均栄養素から主な不足(3〜5項目)を、改善のための具体的な食品で簡潔に挙げて"
               "ください。過剰摂取への注意1〜2点。診断は禁止。箇条書きで。"),
    }.get(lang, "ru")


@router.get("/deficiencies", dependencies=[Depends(ai_limit("deficiency", 20, 3600))])
async def deficiencies(
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    days: int = Query(14, ge=7, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    since = date.today() - timedelta(days=days - 1)

    rows = (await db.execute(
        select(
            DiaryEntry.serving_amount,
            DiaryEntry.calories,
            DiaryEntry.protein,
            DiaryEntry.fat,
            DiaryEntry.carbohydrates,
            Product.fiber,
            Product.vitamins,
        )
        .join(Product, Product.id == DiaryEntry.product_id, isouter=True)
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= since)
    )).all()

    if not rows:
        raise HTTPException(404, "No diary entries in this period — log something first")

    # Aggregate: per-100g nutrients × serving/100
    totals = {
        "kcal": 0.0, "protein": 0.0, "fat": 0.0, "carb": 0.0, "fiber": 0.0,
        "vitamin_a": 0.0, "vitamin_c": 0.0, "vitamin_d": 0.0, "vitamin_e": 0.0,
        "vitamin_b1": 0.0, "vitamin_b2": 0.0, "vitamin_b6": 0.0, "vitamin_b12": 0.0,
        "calcium": 0.0, "iron": 0.0, "magnesium": 0.0, "zinc": 0.0,
        "potassium": 0.0, "sodium": 0.0,
    }
    for r in rows:
        serv = r.serving_amount or 0
        factor = serv / 100.0
        totals["kcal"] += r.calories or 0
        totals["protein"] += r.protein or 0
        totals["fat"] += r.fat or 0
        totals["carb"] += r.carbohydrates or 0
        if r.fiber is not None:
            totals["fiber"] += r.fiber * factor
        v_dict = r.vitamins or {}
        for k in ["vitamin_a","vitamin_c","vitamin_d","vitamin_e",
                  "vitamin_b1","vitamin_b2","vitamin_b6","vitamin_b12",
                  "calcium","iron","magnesium","zinc","potassium","sodium"]:
            v = v_dict.get(k) if isinstance(v_dict, dict) else None
            if v is not None:
                totals[k] += v * factor

    avg = {k: round(v / days, 2) for k, v in totals.items()}
    # Compute % of personal goal (fallback RDA)
    user_goals = (user.nutrient_goals or {}) if isinstance(user.nutrient_goals, dict) else {}
    effective = {**RDA, **{k: float(v) for k, v in user_goals.items() if isinstance(v, (int, float)) and v > 0}}
    rda_filled = {
        k: round((avg.get(k, 0) / v) * 100) if v else None
        for k, v in effective.items() if k in avg or k == "fiber"
    }

    sys_prompt = _system_prompt(lang)
    user_prompt = (
        f"USER goals: kcal={user.daily_calorie_goal or '?'}, "
        f"protein={user.daily_protein_goal or '?'}g, fat={user.daily_fat_goal or '?'}g, "
        f"carb={user.daily_carb_goal or '?'}g.\n"
        f"AVG DAILY nutrients over {days} days:\n"
        f"{json.dumps(avg, ensure_ascii=False)}\n\n"
        f"% of RDA filled:\n{json.dumps(rda_filled, ensure_ascii=False)}\n\n"
        f"DIETARY RESTRICTIONS: {user.dietary_restrictions or 'none'}\n\n"
        f"Write a short bulleted analysis."
    )

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 800,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Claude {r.status_code}: {r.text[:200]}")
            j = r.json()
            text = j["content"][0]["text"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Analysis failed: {e}")

    return {
        "days": days,
        "averages": avg,
        "rda_filled_percent": rda_filled,
        "analysis": text.strip(),
    }
