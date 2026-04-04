"""
AI-powered dietary recommendations based on diary + health conditions.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.health import ICD11Condition, UserCondition

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("")
async def get_recommendations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate personalized recommendations based on recent diet and health."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    # Get week averages
    result = await db.execute(
        select(
            func.avg(DiaryEntry.calories).label("avg_cal"),
            func.avg(DiaryEntry.protein).label("avg_prot"),
            func.avg(DiaryEntry.fat).label("avg_fat"),
            func.avg(DiaryEntry.carbohydrates).label("avg_carb"),
            func.count(DiaryEntry.id).label("total_entries"),
        ).where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date >= week_ago,
        )
    )
    row = result.one()
    avg_cal = float(row.avg_cal or 0)
    avg_prot = float(row.avg_prot or 0)
    avg_fat = float(row.avg_fat or 0)
    avg_carb = float(row.avg_carb or 0)
    total_entries = row.total_entries or 0

    # Get user conditions
    result = await db.execute(
        select(ICD11Condition).join(UserCondition).where(
            UserCondition.user_id == user.id
        )
    )
    conditions = result.scalars().all()

    # Get frequent products
    result = await db.execute(
        select(
            DiaryEntry.product_name,
            func.count(DiaryEntry.id).label("cnt"),
        ).where(
            DiaryEntry.user_id == user.id,
            DiaryEntry.entry_date >= week_ago,
        ).group_by(DiaryEntry.product_name)
        .order_by(func.count(DiaryEntry.id).desc())
        .limit(5)
    )
    top_products = [{"name": r.product_name, "count": r.cnt} for r in result.all()]

    # Generate recommendations
    recs = []
    goals = {
        "calories": user.daily_calorie_goal or 2000,
        "protein": user.daily_protein_goal or 120,
        "fat": user.daily_fat_goal or 65,
        "carbs": user.daily_carb_goal or 250,
    }

    if total_entries == 0:
        recs.append({
            "type": "info",
            "icon": "📝",
            "title": "Начните вести дневник",
            "text": "Добавьте записи за несколько дней, чтобы получить персональные рекомендации.",
        })
        return {"recommendations": recs, "stats": {}, "top_products": []}

    # Calorie analysis
    cal_ratio = avg_cal / goals["calories"] if goals["calories"] else 1
    if cal_ratio < 0.7:
        recs.append({
            "type": "warning",
            "icon": "⚠️",
            "title": "Мало калорий",
            "text": f"Среднее {int(avg_cal)} ккал — это {int(cal_ratio*100)}% от цели ({goals['calories']}). Добавьте перекусы: орехи, авокадо, банан.",
        })
    elif cal_ratio > 1.2:
        recs.append({
            "type": "warning",
            "icon": "📈",
            "title": "Превышение калорий",
            "text": f"Среднее {int(avg_cal)} ккал — {int(cal_ratio*100)}% от цели. Уменьшите порции или замените калорийные продукты.",
        })

    # Protein analysis
    prot_ratio = avg_prot / goals["protein"] if goals["protein"] else 1
    if prot_ratio < 0.7:
        recs.append({
            "type": "tip",
            "icon": "🥩",
            "title": "Не хватает белка",
            "text": f"Среднее {int(avg_prot)}г белка — {int(prot_ratio*100)}% от цели ({goals['protein']}г). Попробуйте: творог, курица, яйца, рыба, бобовые.",
        })

    # Fat analysis
    fat_ratio = avg_fat / goals["fat"] if goals["fat"] else 1
    if fat_ratio > 1.3:
        recs.append({
            "type": "tip",
            "icon": "🫒",
            "title": "Много жиров",
            "text": f"Среднее {int(avg_fat)}г — {int(fat_ratio*100)}% от цели ({goals['fat']}г). Ограничьте жареное, выбирайте нежирные способы готовки.",
        })

    # Carbs analysis
    carb_ratio = avg_carb / goals["carbs"] if goals["carbs"] else 1
    if carb_ratio < 0.6:
        recs.append({
            "type": "tip",
            "icon": "🍞",
            "title": "Мало углеводов",
            "text": f"Среднее {int(avg_carb)}г — {int(carb_ratio*100)}% от цели ({goals['carbs']}г). Добавьте крупы, фрукты, цельнозерновой хлеб.",
        })

    # Condition-based recommendations
    for cond in conditions:
        dietary = cond.dietary_recommendations or {}
        restrict = dietary.get("restrict", [])
        increase = dietary.get("increase", [])
        if restrict:
            recs.append({
                "type": "health",
                "icon": "🏥",
                "title": f"{cond.name} — ограничить",
                "text": ", ".join(restrict[:5]),
            })
        if increase:
            recs.append({
                "type": "health",
                "icon": "💚",
                "title": f"{cond.name} — увеличить",
                "text": ", ".join(increase[:5]),
            })

    # Variety check
    if len(top_products) <= 3 and total_entries > 10:
        recs.append({
            "type": "tip",
            "icon": "🌈",
            "title": "Разнообразьте рацион",
            "text": "Вы едите в основном одни и те же продукты. Попробуйте новые овощи, фрукты, крупы.",
        })

    # If all is good
    if not recs:
        recs.append({
            "type": "success",
            "icon": "✅",
            "title": "Отличный баланс!",
            "text": "Ваш рацион сбалансирован и соответствует целям. Продолжайте в том же духе!",
        })

    return {
        "recommendations": recs,
        "stats": {
            "avg_calories": round(avg_cal, 1),
            "avg_protein": round(avg_prot, 1),
            "avg_fat": round(avg_fat, 1),
            "avg_carbs": round(avg_carb, 1),
            "days_tracked": total_entries,
        },
        "top_products": top_products,
    }
