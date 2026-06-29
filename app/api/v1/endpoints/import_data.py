"""Universal CSV importer for diary entries.
Accepts a CSV with at least: date, product_name, grams.
Optionally: meal_name, calories, protein, fat, carbohydrates.
If KBJU columns are absent — tries to look up product in our DB.
"""
import csv
import io
from uuid import uuid4
from datetime import date as _date, datetime as _dt
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.product import Product
from app.models.diary import DiaryEntry, Meal

router = APIRouter(prefix="/import", tags=["import"])


def _parse_date(s: str) -> _date | None:
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"):
        try:
            return _dt.strptime(s, fmt).date()
        except Exception:
            continue
    return None


def _f(v) -> float | None:
    try:
        return float(str(v).replace(",", ".").strip())
    except Exception:
        return None


@router.post("/csv")
async def import_csv(
    file: UploadFile = File(..., description="CSV file with diary entries"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(400, "Need CSV/TSV file")
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 5MB)")

    # Decode UTF-8 with BOM fallback
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1251", errors="replace")

    # Detect delimiter
    sample = text[:1024]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    if not reader.fieldnames:
        raise HTTPException(400, "Empty CSV header")

    # Normalize header names (lowercase, strip)
    headers = {h.lower().strip(): h for h in reader.fieldnames}

    def col(*names):
        for n in names:
            if n in headers:
                return headers[n]
        return None

    c_date = col("date", "дата", "entry_date", "day")
    c_name = col("product", "product_name", "name", "продукт", "name (g)", "food", "item")
    c_grams = col("grams", "amount", "amount_g", "serving", "serving_amount", "грамм", "вес", "вес (г)")
    c_meal = col("meal", "meal_name", "meal_type", "приём", "приём пищи", "category")
    c_cal = col("calories", "kcal", "energy", "калории", "ккал")
    c_prot = col("protein", "proteins", "белки", "б")
    c_fat = col("fat", "fats", "жиры", "ж")
    c_carb = col("carbohydrates", "carbs", "углеводы", "у")

    if not c_date or not c_name:
        raise HTTPException(400, f"CSV must have 'date' and 'product' columns. Found: {list(headers.keys())}")

    # Cache meals: lookup by name (or auto-create default)
    user_meals = (await db.execute(select(Meal).where(Meal.user_id == user.id))).scalars().all()
    meal_by_name = {m.name.lower(): m for m in user_meals}
    default_meal = next((m for m in user_meals if m.is_default), user_meals[0] if user_meals else None)

    imported = 0
    skipped = 0
    errors: list[str] = []
    rows = list(reader)
    if len(rows) > 5000:
        raise HTTPException(400, "Too many rows (max 5000)")

    # Optional product lookup if KBJU missing
    product_cache: dict[str, Product] = {}

    for i, row in enumerate(rows, 1):
        d = _parse_date(row.get(c_date, ""))
        name = (row.get(c_name) or "").strip()
        grams = _f(row.get(c_grams)) if c_grams else None
        if not d or not name:
            skipped += 1
            continue
        if not grams or grams <= 0:
            grams = 100.0

        cal = _f(row.get(c_cal)) if c_cal else None
        prot = _f(row.get(c_prot)) if c_prot else None
        fat = _f(row.get(c_fat)) if c_fat else None
        carb = _f(row.get(c_carb)) if c_carb else None

        if cal is None or prot is None:
            key = name.lower()
            p = product_cache.get(key)
            if p is None:
                p = (await db.execute(select(Product).where(Product.name.ilike(name)).limit(1))).scalar_one_or_none()
                product_cache[key] = p
            if p:
                factor = grams / 100.0
                cal = cal or (p.calories or 0) * factor
                prot = prot or (p.protein or 0) * factor
                fat = fat or (p.fat or 0) * factor
                carb = carb or (p.carbohydrates or 0) * factor

        meal_id = None
        meal_name = (row.get(c_meal) or "").strip() if c_meal else ""
        if meal_name:
            m = meal_by_name.get(meal_name.lower())
            if not m:
                m = Meal(id=uuid4(), user_id=user.id, name=meal_name[:100], is_default=False, sort_order=99)
                db.add(m)
                await db.flush()
                meal_by_name[meal_name.lower()] = m
            meal_id = m.id
        elif default_meal:
            meal_id = default_meal.id

        db.add(DiaryEntry(
            id=uuid4(), user_id=user.id, meal_id=meal_id, product_id=None,
            entry_date=d, product_name=name[:500], serving_amount=grams,
            calories=cal or 0, protein=prot or 0, fat=fat or 0, carbohydrates=carb or 0,
        ))
        imported += 1

    await db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "total_rows": len(rows),
        "errors": errors[:10],
    }


@router.get("/template.csv")
async def csv_template():
    """Return a sample CSV that users can use as a starting point."""
    from fastapi.responses import Response
    sample = (
        "date,meal,product_name,grams,calories,protein,fat,carbohydrates\n"
        "2026-06-28,Завтрак,Овсянка на воде,50,44,1.6,0.8,9.0\n"
        "2026-06-28,Обед,Куриная грудка,150,165,31,3.6,0\n"
        "2026-06-28,Ужин,Лосось,120,170,21,9,0\n"
    )
    return Response(content=sample, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="nutrition_diary_template.csv"'})
