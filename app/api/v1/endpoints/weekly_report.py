"""Weekly AI report via Claude — summary of the past 7 days.

GET /recommendations/weekly?lang=ru
Returns:
  - period dates
  - kbju averages, deltas vs prior week
  - weight delta, mood avg
  - top 5 frequent foods
  - Claude-written narrative (3-4 sentences)
"""
import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.health import MoodEntry
from app.models.device import HealthMetric

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


async def _period_stats(db: AsyncSession, user_id, start: date, end: date) -> dict:
    rows = (await db.execute(
        select(
            func.coalesce(func.sum(DiaryEntry.calories), 0),
            func.coalesce(func.sum(DiaryEntry.protein), 0),
            func.coalesce(func.sum(DiaryEntry.fat), 0),
            func.coalesce(func.sum(DiaryEntry.carbohydrates), 0),
            func.count(DiaryEntry.id),
        ).where(DiaryEntry.user_id == user_id,
                DiaryEntry.entry_date >= start,
                DiaryEntry.entry_date <= end)
    )).one()
    days = (end - start).days + 1
    n = days if days > 0 else 1
    return {
        "kcal_avg": round((rows[0] or 0) / n),
        "protein_avg": round((rows[1] or 0) / n, 1),
        "fat_avg": round((rows[2] or 0) / n, 1),
        "carb_avg": round((rows[3] or 0) / n, 1),
        "entry_count": int(rows[4] or 0),
        "days": days,
    }


@router.get("/weekly")
async def weekly_report(
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    this_week_start = today - timedelta(days=6)
    prev_week_end = this_week_start - timedelta(days=1)
    prev_week_start = prev_week_end - timedelta(days=6)

    this_w = await _period_stats(db, user.id, this_week_start, today)
    prev_w = await _period_stats(db, user.id, prev_week_start, prev_week_end)

    # Weight: first vs last in window
    weights = (await db.execute(
        select(HealthMetric.value, HealthMetric.measured_at)
        .where(HealthMetric.user_id == user.id, HealthMetric.metric_type == "weight",
               HealthMetric.measured_at >= this_week_start)
        .order_by(HealthMetric.measured_at)
    )).all()
    weight_delta = None
    if len(weights) >= 2:
        weight_delta = round(weights[-1][0] - weights[0][0], 1)

    # Mood avg
    mood_rows = (await db.execute(
        select(func.avg(MoodEntry.mood), func.avg(MoodEntry.energy))
        .where(MoodEntry.user_id == user.id, MoodEntry.date >= this_week_start)
    )).one()
    mood_avg = round(float(mood_rows[0]), 1) if mood_rows[0] else None
    energy_avg = round(float(mood_rows[1]), 1) if mood_rows[1] else None

    # Top frequent foods
    top = (await db.execute(
        select(DiaryEntry.product_name, func.count(DiaryEntry.id).label("n"))
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= this_week_start)
        .group_by(DiaryEntry.product_name)
        .order_by(desc("n")).limit(5)
    )).all()

    deltas = {
        "kcal": this_w["kcal_avg"] - prev_w["kcal_avg"],
        "protein": round(this_w["protein_avg"] - prev_w["protein_avg"], 1),
        "fat": round(this_w["fat_avg"] - prev_w["fat_avg"], 1),
        "carb": round(this_w["carb_avg"] - prev_w["carb_avg"], 1),
    }

    narrative = ""
    if settings.anthropic_api_key:
        sys_prompt = {
            "ru": "Ты — нутрициолог. Напиши очень короткий (3-4 предложения) отчёт за неделю на основе цифр. Похвали что улучшилось, мягко укажи что хуже. Никаких диагнозов. Без эмодзи кроме одного.",
            "en": "You are a nutritionist. Write a very short (3-4 sentences) weekly summary based on numbers. Praise improvements, gently note declines. No diagnoses. At most one emoji.",
            "ja": "あなたは栄養士です。数値に基づき非常に短い(3〜4文)週間サマリーを書いてください。改善点は称賛、悪化は優しく指摘。診断は禁止。絵文字は1つまで。",
        }.get(lang, "ru")
        ctx = {
            "this_week": this_w, "prev_week": prev_w, "deltas": deltas,
            "weight_delta_kg": weight_delta, "mood_avg": mood_avg, "energy_avg": energy_avg,
            "goal_kcal": user.daily_calorie_goal,
            "top_foods": [r.product_name for r in top],
            "dietary_restrictions": user.dietary_restrictions,
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 250,
                        "system": sys_prompt,
                        "messages": [{"role": "user", "content": json.dumps(ctx, ensure_ascii=False)}],
                    },
                )
                if r.status_code < 400:
                    narrative = r.json()["content"][0]["text"].strip()
        except Exception:
            pass

    return {
        "period": {"start": this_week_start.isoformat(), "end": today.isoformat()},
        "prev_period": {"start": prev_week_start.isoformat(), "end": prev_week_end.isoformat()},
        "this_week": this_w,
        "prev_week": prev_w,
        "deltas": deltas,
        "weight_delta_kg": weight_delta,
        "mood_avg": mood_avg,
        "energy_avg": energy_avg,
        "top_foods": [{"name": r.product_name, "times": int(r.n)} for r in top],
        "narrative": narrative,
    }


@router.get("/compare-periods")
async def compare_periods(
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    window_days: int = Query(30, ge=7, le=180),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """This X days vs previous X days — same shape as weekly but with custom window."""
    today = date.today()
    a_start = today - timedelta(days=window_days - 1)
    b_end = a_start - timedelta(days=1)
    b_start = b_end - timedelta(days=window_days - 1)

    a = await _period_stats(db, user.id, a_start, today)
    b = await _period_stats(db, user.id, b_start, b_end)

    return {
        "this_period": {"start": a_start.isoformat(), "end": today.isoformat(), **a},
        "prev_period": {"start": b_start.isoformat(), "end": b_end.isoformat(), **b},
        "deltas": {
            "kcal": a["kcal_avg"] - b["kcal_avg"],
            "protein": round(a["protein_avg"] - b["protein_avg"], 1),
            "fat": round(a["fat_avg"] - b["fat_avg"], 1),
            "carb": round(a["carb_avg"] - b["carb_avg"], 1),
            "entries": a["entry_count"] - b["entry_count"],
        },
    }
