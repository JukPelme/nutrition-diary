"""Recipes — collection of ingredients, auto-computed KBJU per 100g and per serving.
Add to diary as a single entry: pick recipe + how many grams you ate.
"""
from uuid import UUID, uuid4
from datetime import date as _date
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.product import Product
from app.models.diary import DiaryEntry, Meal
from app.models.recipe import Recipe, RecipeIngredient

router = APIRouter(prefix="/recipes", tags=["recipes"])


class IngredientIn(BaseModel):
    product_id: UUID | None = None
    product_name: str
    amount_g: float = Field(gt=0, le=10000)


class RecipeIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    total_weight_g: float = Field(gt=0, le=20000, description="Готовый вес блюда (после готовки)")
    servings: int = Field(default=1, ge=1, le=50)
    ingredients: list[IngredientIn] = Field(min_length=1, max_length=50)


class AddToDiaryIn(BaseModel):
    entry_date: _date
    meal_id: UUID | None = None
    serving_amount: float = Field(gt=0, le=5000, description="Сколько грамм блюда съел")


async def _compute_macros(db: AsyncSession, ingredients: list[RecipeIngredient]) -> dict:
    """Sum per-100g macros of each ingredient × its grams / 100."""
    totals = {"calories": 0.0, "protein": 0.0, "fat": 0.0, "carbohydrates": 0.0}
    if not ingredients:
        return totals
    ids = [i.product_id for i in ingredients if i.product_id]
    products = {}
    if ids:
        rows = (await db.execute(select(Product).where(Product.id.in_(ids)))).scalars().all()
        products = {p.id: p for p in rows}
    for ing in ingredients:
        p = products.get(ing.product_id)
        if not p:
            continue
        factor = ing.amount_g / 100.0
        totals["calories"] += (p.calories or 0) * factor
        totals["protein"] += (p.protein or 0) * factor
        totals["fat"] += (p.fat or 0) * factor
        totals["carbohydrates"] += (p.carbohydrates or 0) * factor
    return totals


def _recipe_out(r: Recipe, macros: dict) -> dict:
    per_total = macros
    per_100g = {k: round(v / r.total_weight_g * 100, 1) if r.total_weight_g else 0 for k, v in macros.items()}
    return {
        "id": str(r.id),
        "name": r.name,
        "description": r.description,
        "total_weight_g": r.total_weight_g,
        "servings": r.servings,
        "ingredients": [
            {"id": str(i.id), "product_id": str(i.product_id) if i.product_id else None,
             "product_name": i.product_name, "amount_g": i.amount_g, "sort_order": i.sort_order}
            for i in sorted(r.ingredients, key=lambda x: x.sort_order)
        ],
        "macros_total": {k: round(v, 1) for k, v in per_total.items()},
        "macros_per_100g": per_100g,
        "macros_per_serving": {k: round(v / r.servings, 1) for k, v in per_total.items()},
    }


@router.post("", status_code=201)
async def create_recipe(
    data: RecipeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = Recipe(
        id=uuid4(), user_id=user.id,
        name=data.name, description=data.description,
        total_weight_g=data.total_weight_g, servings=data.servings,
    )
    db.add(r)
    await db.flush()
    for idx, ing in enumerate(data.ingredients):
        db.add(RecipeIngredient(
            id=uuid4(), recipe_id=r.id,
            product_id=ing.product_id, product_name=ing.product_name,
            amount_g=ing.amount_g, sort_order=idx,
        ))
    await db.commit()
    await db.refresh(r)
    macros = await _compute_macros(db, list(r.ingredients))
    return _recipe_out(r, macros)


@router.get("")
async def list_recipes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Recipe).where(Recipe.user_id == user.id).order_by(desc(Recipe.created_at))
    )).scalars().all()
    out = []
    for r in rows:
        macros = await _compute_macros(db, list(r.ingredients))
        out.append(_recipe_out(r, macros))
    return out


@router.get("/{recipe_id}")
async def get_recipe(
    recipe_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user.id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Recipe not found")
    macros = await _compute_macros(db, list(r.ingredients))
    return _recipe_out(r, macros)


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user.id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Recipe not found")
    await db.delete(r)
    await db.commit()


@router.post("/{recipe_id}/add-to-diary", status_code=201)
async def add_recipe_to_diary(
    recipe_id: UUID,
    data: AddToDiaryIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = (await db.execute(select(Recipe).where(Recipe.id == recipe_id, Recipe.user_id == user.id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Recipe not found")

    if data.meal_id:
        meal = (await db.execute(select(Meal).where(Meal.id == data.meal_id, Meal.user_id == user.id))).scalar_one_or_none()
        if not meal:
            raise HTTPException(400, "Meal not found")

    macros = await _compute_macros(db, list(r.ingredients))
    factor = data.serving_amount / r.total_weight_g if r.total_weight_g else 0
    entry = DiaryEntry(
        id=uuid4(), user_id=user.id, meal_id=data.meal_id, product_id=None,
        entry_date=data.entry_date,
        product_name=r.name,
        serving_amount=data.serving_amount,
        calories=macros["calories"] * factor,
        protein=macros["protein"] * factor,
        fat=macros["fat"] * factor,
        carbohydrates=macros["carbohydrates"] * factor,
    )
    db.add(entry)
    await db.commit()
    return {"id": str(entry.id), "added_kcal": round(entry.calories, 1)}


# ---- Import recipe from a URL via Claude ----
import json as _json
import httpx as _httpx
from app.core.config import settings as _settings


class ImportRecipeIn(BaseModel):
    url: str = Field(min_length=10, max_length=2000)
    lang: str = Field(default="ru", pattern="^(ru|en|ja)$")


@router.post("/import-url")
async def import_recipe_url(
    data: ImportRecipeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetch a recipe page, let Claude extract structured data, save as Recipe."""
    if not _settings.anthropic_api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    try:
        async with _httpx.AsyncClient(timeout=15, follow_redirects=True,
                                      headers={"User-Agent": "Mozilla/5.0 NutritionDiary/1.0"}) as cli:
            r = await cli.get(data.url)
            if r.status_code >= 400:
                # fallback: r.jina.ai proxy
                rj = await cli.get("https://r.jina.ai/" + data.url)
                if rj.status_code >= 400:
                    raise HTTPException(400, f"Cannot fetch URL ({r.status_code})")
                html = rj.text[:50000]
            else:
                html = r.text[:50000]
    except _httpx.HTTPError as e:
        raise HTTPException(400, f"Fetch failed: {e}")

    sys_prompt = (
        "Извлеки рецепт из HTML страницы. Верни ТОЛЬКО JSON, без markdown:\n"
        '{"name":"название блюда","servings":число_порций,"total_weight_g":общий_вес_готового_блюда_г,'
        '"ingredients":[{"name":"ингредиент","amount_g":число}]}\n'
        "Граммы оценивай реалистично (1 яйцо=60г, ст.л.=15г, стакан=200мл). "
        "Если рецепт не найден — верни {\"error\":\"no recipe found\"}."
    ) if data.lang == "ru" else (
        "Extract recipe from HTML. Return ONLY JSON:\n"
        '{"name":"dish name","servings":n,"total_weight_g":total_g,'
        '"ingredients":[{"name":"ingredient","amount_g":n}]}\n'
        "Estimate realistic grams. If no recipe: {\"error\":\"no recipe found\"}."
    )

    try:
        async with _httpx.AsyncClient(timeout=45) as cli:
            ar = await cli.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": _settings.anthropic_api_key,
                         "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 2000,
                    "system": sys_prompt,
                    "messages": [{"role": "user", "content": f"URL: {data.url}\n\nHTML:\n{html}"}],
                },
            )
            if ar.status_code >= 400:
                raise HTTPException(502, f"Claude {ar.status_code}: {ar.text[:200]}")
            text = ar.json()["content"][0]["text"].strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Claude call failed: {e}")

    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    try:
        parsed = _json.loads(text.strip())
    except Exception:
        raise HTTPException(502, f"Bad JSON from model: {text[:200]}")

    if parsed.get("error"):
        raise HTTPException(404, parsed["error"])

    name = (parsed.get("name") or "").strip()
    total_w = float(parsed.get("total_weight_g") or 0)
    servings = int(parsed.get("servings") or 1)
    ings = parsed.get("ingredients") or []
    if not name or not ings or total_w <= 0:
        raise HTTPException(422, "Recipe data incomplete")

    recipe = Recipe(id=uuid4(), user_id=user.id, name=name[:255],
                    total_weight_g=total_w, servings=servings)
    db.add(recipe)
    await db.flush()
    for i, ing in enumerate(ings[:50]):
        n = str(ing.get("name") or "").strip()[:500]
        g = float(ing.get("amount_g") or 0)
        if not n or g <= 0:
            continue
        prod = (await db.execute(select(Product).where(Product.name.ilike(f"%{n}%")).limit(1))).scalar_one_or_none()
        db.add(RecipeIngredient(id=uuid4(), recipe_id=recipe.id,
                                 product_id=prod.id if prod else None,
                                 product_name=prod.name if prod else n,
                                 amount_g=g, sort_order=i))
    await db.commit()
    return {"id": str(recipe.id), "name": recipe.name,
            "total_weight_g": recipe.total_weight_g, "servings": recipe.servings,
            "ingredient_count": len(ings)}


class FromFridgeIn(BaseModel):
    ingredients: list[str] = Field(min_length=1, max_length=30)
    lang: str = Field(default="ru", pattern="^(ru|en|ja)$")
    diet: str | None = Field(default=None, max_length=200, description="vegetarian/vegan/low-carb/etc")


@router.post("/from-fridge")
async def from_fridge(
    data: FromFridgeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Suggest 3-5 recipes the user can cook with given ingredients."""
    if not _settings.anthropic_api_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    sys_prompt = {
        "ru": ("Ты — повар. Предложи 3-5 реалистичных рецептов из указанных ингредиентов. "
               "Учитывай ограничения пользователя. Граммы реалистичные. "
               "Ответ строго JSON без markdown."),
        "en": ("You are a chef. Suggest 3-5 realistic recipes from the given ingredients. "
               "Respect dietary restrictions. JSON only."),
        "ja": ("あなたは料理人。指定の食材から3〜5つの現実的なレシピを提案。JSONのみ。"),
    }.get(data.lang, "ru")

    user_msg = {
        "fridge": data.ingredients,
        "dietary_restrictions": user.dietary_restrictions,
        "diet_preference": data.diet,
        "goal_type": user.goal_type,
    }
    schema_hint = (
        '{"recipes":[{"name":"...","why":"чем интересен (1 предложение)",'
        '"missing":["докуплено если нужно"],"items":[{"name":"...","grams":N}],'
        '"total_grams":N,"kcal_per_100g":N,"protein":N,"fat":N,"carb":N}]}'
    )

    try:
        async with _httpx.AsyncClient(timeout=45) as cli:
            ar = await cli.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": _settings.anthropic_api_key,
                         "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 2000,
                    "system": sys_prompt + "\n" + schema_hint,
                    "messages": [{"role": "user", "content": _json.dumps(user_msg, ensure_ascii=False)}],
                },
            )
            if ar.status_code >= 400:
                raise HTTPException(502, f"Claude {ar.status_code}")
            text = ar.json()["content"][0]["text"].strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Suggestion failed: {e}")

    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    try:
        parsed = _json.loads(text)
    except Exception:
        raise HTTPException(502, f"Bad JSON: {text[:200]}")
    return parsed
