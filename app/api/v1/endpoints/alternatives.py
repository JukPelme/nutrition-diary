"""Suggest product alternatives via Claude.

GET /products/{product_id}/alternatives?lang=ru&goal=protein
  goal ∈ {protein, less_carbs, less_fat, more_fiber, similar, vegan}
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
from uuid import UUID

from app.core.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.models.product import Product

router = APIRouter(prefix="/products", tags=["alternatives"])


@router.get("/{product_id}/alternatives")
async def alternatives(
    product_id: UUID,
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    goal: str = Query("similar", pattern="^(protein|less_carbs|less_fat|more_fiber|similar|vegan)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    api_key = settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    p = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Product not found")

    sys_prompt = {
        "ru": "Ты — нутрициолог. Предложи 3 реальные замены продукту с учётом цели. Ответ строго JSON.",
        "en": "You are a nutritionist. Suggest 3 real product alternatives matching the goal. JSON only.",
        "ja": "あなたは栄養士です。目標に合った代替食品を3つ提案してください。JSONのみで返答。",
    }.get(lang, "ru")

    goal_hint = {
        "protein": "more protein per 100g",
        "less_carbs": "lower carbs",
        "less_fat": "lower fat",
        "more_fiber": "more fiber",
        "similar": "similar macros, different food group",
        "vegan": "vegan / plant-based alternative",
    }[goal]

    user_prompt = (
        f"Product: {p.name} ({p.calories or 0} kcal/100g, P{p.protein or 0}, F{p.fat or 0}, C{p.carbohydrates or 0})\n"
        f"Goal: {goal_hint}\n"
        f"DIETARY RESTRICTIONS: {user.dietary_restrictions or 'none'}\n\n"
        'Return ONLY JSON: {"alternatives":[{"name":"...","reason":"short why this swap works","kcal":N,"protein":P,"fat":F,"carb":C}], "explanation":"1-2 sentences"}'
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 600,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            if r.status_code >= 400:
                raise HTTPException(502, f"Claude {r.status_code}: {r.text[:200]}")
            text = r.json()["content"][0]["text"].strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
                if text.endswith("```"): text = text.rsplit("```", 1)[0]
            data = json.loads(text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Alternatives failed: {e}")

    return {
        "for_product": {"id": str(p.id), "name": p.name},
        "goal": goal,
        "alternatives": data.get("alternatives") or [],
        "explanation": data.get("explanation") or "",
    }
