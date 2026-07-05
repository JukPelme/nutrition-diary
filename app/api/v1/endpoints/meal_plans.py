"""AI weekly meal plan generation via Claude Sonnet.

Endpoints:
  POST   /nutrition/meal-plan/generate       — build new 7-day plan
  GET    /nutrition/meal-plan/current        — currently active plan (today between start/end)
  GET    /nutrition/meal-plan/list           — recent plans
  POST   /nutrition/meal-plan/{id}/apply-day — push planned products into diary
  DELETE /nutrition/meal-plan/{id}           — remove a plan

Plan JSON shape:
  {
    "days": [
       {
         "date": "2026-06-29",
         "meals": [
            {"meal_type": "breakfast", "title": "...", "items": [
                {"name": "Овсянка геркулес", "grams": 60, "kcal": 220, "protein": 7, "fat": 4, "carbohydrates": 38}
            ]}
         ],
         "totals": {"kcal": 1820, "protein": 110, "fat": 60, "carbohydrates": 180}
       }
    ],
    "summary": "Free-text rationale, 2-3 sentences",
    "tips": ["...", "..."]
  }
"""
import json
from uuid import uuid4, UUID
from datetime import date, timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.meal_plan import MealPlan
from app.models.diary import DiaryEntry, Meal
from app.models.health import ICD11Condition, UserCondition
from app.models.product import Product

router = APIRouter(prefix="/nutrition/meal-plan", tags=["meal-plan"])


class GenerateIn(BaseModel):
    lang: str = Field(default="ru", pattern="^(ru|en|ja)$")
    days: int = Field(default=7, ge=1, le=14)
    start_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    avoid: list[str] = Field(default_factory=list)  # allergies / dislikes


class ApplyDayIn(BaseModel):
    target_date: date


def _system_prompt(lang: str) -> str:
    return {
        "ru": (
            "Ты — личный нутрициолог. Составь сбалансированный план питания строго в JSON. "
            "Учитывай возраст, пол, активность, цель пользователя, КБЖУ-цели и диагнозы. "
            "Каждый день — 3-5 приёмов пищи (breakfast, lunch, dinner, snack). "
            "Продукты — реальные, доступные в России (гречка, овсянка, курица, рыба, творог, овощи). "
            "Граммовка реалистичная. Не повторяй одни и те же продукты каждый день — варьируй."
        ),
        "en": (
            "You are a personal nutritionist. Build a balanced meal plan strictly as JSON. "
            "Respect the user's age, sex, activity, goal, macro targets, and medical conditions. "
            "Each day has 3-5 meals (breakfast, lunch, dinner, snack). "
            "Use common, accessible foods. Realistic gram weights. Vary across days, do not repeat."
        ),
        "ja": (
            "あなたは個人栄養士です。バランスの取れた食事計画を厳密にJSONで作成してください。"
            "ユーザーの年齢、性別、活動量、目標、マクロ目標、疾患を考慮してください。"
            "1日3〜5食(breakfast, lunch, dinner, snack)。"
            "現実的な分量で、日替わりに変化をつけてください。"
        ),
    }.get(lang, "ru")


def _output_schema_prompt() -> str:
    return (
        'Output ONLY raw JSON, no markdown, no fences. Schema:\n'
        '{"days":[{"date":"YYYY-MM-DD","meals":[{"meal_type":"breakfast|lunch|dinner|snack",'
        '"title":"short","items":[{"name":"product","grams":120,"kcal":250,"protein":15,"fat":8,"carbohydrates":30}]}],'
        '"totals":{"kcal":1900,"protein":120,"fat":65,"carbohydrates":190}}],'
        '"summary":"2-3 sentences why this plan suits the user","tips":["short actionable tip","..."]}'
    )


def _calc_target_macros(user: User) -> dict:
    """Return goal macros. If not set, fall back to a sensible default."""
    return {
        "kcal_goal": user.daily_calorie_goal or 2000,
        "protein_goal_g": user.daily_protein_goal or 100,
        "fat_goal_g": user.daily_fat_goal or 70,
        "carb_goal_g": user.daily_carb_goal or 220,
    }


async def _user_brief(db: AsyncSession, user: User) -> dict:
    conds = (await db.execute(
        select(ICD11Condition.name_ru, ICD11Condition.name_en, ICD11Condition.code).join(UserCondition)
        .where(UserCondition.user_id == user.id).limit(10)
    )).all()
    age = None
    if user.birth_year:
        age = date.today().year - user.birth_year
    return {
        "age": age,
        "sex": user.sex,
        "height_cm": user.height,
        "weight_kg": user.current_weight,
        "target_weight_kg": user.target_weight,
        "activity": user.activity_level,
        "goal_type": user.goal_type,
        "conditions": [{"name": c.name_ru or c.name_en, "code": c.code} for c in conds],
        **_calc_target_macros(user),
    }


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    return s.strip()


@router.post("/generate")
async def generate_plan(
    data: GenerateIn = Body(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "Meal plan requires ANTHROPIC_API_KEY")

    start = data.start_date or date.today()
    end = start + timedelta(days=data.days - 1)

    brief = await _user_brief(db, user)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(data.days)]

    # Merge dietary restrictions from profile with request
    avoid_list = list(data.avoid)
    if user.dietary_restrictions:
        for x in user.dietary_restrictions.split(','):
            x = x.strip()
            if x and x not in avoid_list:
                avoid_list.append(x)

    user_prompt = (
        f"USER:\n{json.dumps(brief, ensure_ascii=False)}\n\n"
        f"DATES: {dates}\n"
        f"AVOID: {avoid_list}\n"
        f"NOTES: {data.notes or '-'}\n\n"
        f"{_output_schema_prompt()}"
    )

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 6000,
                    "system": _system_prompt(data.lang),
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Claude {r.status_code}: {r.text[:300]}")
            j = r.json()
            raw = j["content"][0]["text"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Generation failed: {e}")

    try:
        plan = json.loads(_strip_fences(raw))
    except Exception as e:
        raise HTTPException(502, f"Bad JSON from model: {e} | head={raw[:200]}")

    if not isinstance(plan, dict) or "days" not in plan or not isinstance(plan["days"], list):
        raise HTTPException(502, "Plan missing 'days' array")

    mp = MealPlan(
        id=uuid4(),
        user_id=user.id,
        start_date=start,
        end_date=end,
        lang=data.lang,
        model_used="claude-sonnet-4-6",
        plan_json=plan,
        notes=data.notes,
    )
    db.add(mp)
    await db.commit()
    await db.refresh(mp)

    return {
        "id": str(mp.id),
        "start_date": mp.start_date.isoformat(),
        "end_date": mp.end_date.isoformat(),
        "lang": mp.lang,
        "model_used": mp.model_used,
        "plan": mp.plan_json,
        "created_at": mp.created_at.isoformat() if mp.created_at else None,
    }


@router.get("/current")
async def current_plan(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    mp = (await db.execute(
        select(MealPlan).where(
            MealPlan.user_id == user.id,
            MealPlan.start_date <= today,
            MealPlan.end_date >= today,
        ).order_by(desc(MealPlan.created_at)).limit(1)
    )).scalar_one_or_none()
    if not mp:
        return {"plan": None}
    return {
        "id": str(mp.id),
        "start_date": mp.start_date.isoformat(),
        "end_date": mp.end_date.isoformat(),
        "lang": mp.lang,
        "model_used": mp.model_used,
        "plan": mp.plan_json,
        "created_at": mp.created_at.isoformat() if mp.created_at else None,
    }


@router.get("/list")
async def list_plans(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(MealPlan).where(MealPlan.user_id == user.id)
        .order_by(desc(MealPlan.created_at)).limit(20)
    )).scalars().all()
    return [
        {
            "id": str(r.id),
            "start_date": r.start_date.isoformat(),
            "end_date": r.end_date.isoformat(),
            "lang": r.lang,
            "model_used": r.model_used,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/{plan_id}")
async def get_plan(
    plan_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mp = (await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
    )).scalar_one_or_none()
    if not mp:
        raise HTTPException(404, "Plan not found")
    return {
        "id": str(mp.id),
        "start_date": mp.start_date.isoformat(),
        "end_date": mp.end_date.isoformat(),
        "lang": mp.lang,
        "model_used": mp.model_used,
        "plan": mp.plan_json,
        "notes": mp.notes,
        "created_at": mp.created_at.isoformat() if mp.created_at else None,
    }


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mp = (await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
    )).scalar_one_or_none()
    if not mp:
        raise HTTPException(404, "Plan not found")
    await db.delete(mp)
    await db.commit()
    return {"deleted": True}


async def _find_or_resolve_product(db: AsyncSession, name: str) -> Product | None:
    """Try pg_trgm similarity, then fallback to ILIKE."""
    name_clean = (name or "").strip()
    if not name_clean:
        return None
    try:
        row = (await db.execute(
            select(Product).where(
                func.similarity(Product.name, name_clean) > 0.3
            ).order_by(desc(func.similarity(Product.name, name_clean))).limit(1)
        )).scalar_one_or_none()
        if row:
            return row
    except Exception:
        pass
    return (await db.execute(
        select(Product).where(Product.name.ilike(f"%{name_clean}%")).limit(1)
    )).scalar_one_or_none()


async def _get_or_create_meal(db: AsyncSession, user_id, name: str) -> Meal | None:
    row = (await db.execute(
        select(Meal).where(Meal.user_id == user_id, Meal.name.ilike(name)).limit(1)
    )).scalar_one_or_none()
    if row:
        return row
    icons = {"breakfast": "🥣", "lunch": "🍲", "dinner": "🍽️", "snack": "🍎"}
    icon = icons.get(name.lower(), "🍴")
    m = Meal(id=uuid4(), user_id=user_id, name=name.capitalize(), icon=icon, sort_order=0, is_default=False)
    db.add(m)
    await db.flush()
    return m


@router.post("/{plan_id}/apply-day")
async def apply_day(
    plan_id: UUID,
    data: ApplyDayIn = Body(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mp = (await db.execute(
        select(MealPlan).where(MealPlan.id == plan_id, MealPlan.user_id == user.id)
    )).scalar_one_or_none()
    if not mp:
        raise HTTPException(404, "Plan not found")

    target_iso = data.target_date.isoformat()
    day = next((d for d in (mp.plan_json or {}).get("days", []) if d.get("date") == target_iso), None)
    if not day:
        raise HTTPException(404, f"Day {target_iso} not in plan")

    created = 0
    for meal_block in day.get("meals", []) or []:
        mtype = (meal_block.get("meal_type") or "meal").lower()
        meal = await _get_or_create_meal(db, user.id, mtype)
        for it in meal_block.get("items", []) or []:
            name = it.get("name") or ""
            grams = float(it.get("grams") or 0)
            if not name or grams <= 0:
                continue
            prod = await _find_or_resolve_product(db, name)
            entry = DiaryEntry(
                id=uuid4(),
                user_id=user.id,
                meal_id=meal.id if meal else None,
                product_id=prod.id if prod else None,
                entry_date=data.target_date,
                product_name=prod.name if prod else name,
                serving_amount=grams,
                calories=float(it.get("kcal") or 0),
                protein=float(it.get("protein") or 0),
                fat=float(it.get("fat") or 0),
                carbohydrates=float(it.get("carbohydrates") or 0),
            )
            db.add(entry)
            created += 1

    await db.commit()
    return {"applied": created, "date": target_iso}
