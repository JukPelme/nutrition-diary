"""
Rule-based dietary recommendations from diary + ICD-11 health conditions.
No external API required.
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.health import ICD11Condition, UserCondition

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
REC_TEMPLATES = {
    "low_cal":    {
        "ru": ("⚠️", "Мало калорий", "Среднее {avg} ккал — это {pct}% от цели ({goal}). Добавьте перекусы: орехи, авокадо, банан."),
        "en": ("⚠️", "Low calories",  "Average {avg} kcal — {pct}% of goal ({goal}). Add snacks: nuts, avocado, banana."),
        "ja": ("⚠️", "カロリー不足", "平均 {avg} kcal — 目標({goal})の{pct}%。間食を追加: ナッツ、アボカド、バナナ。"),
    },
    "high_cal":   {
        "ru": ("⚠️", "Превышение калорий", "Среднее {avg} ккал — это {pct}% от цели ({goal}). Снизьте порции или замените жирное на белковое."),
        "en": ("⚠️", "Calorie excess",     "Average {avg} kcal — {pct}% of goal ({goal}). Reduce portions or swap fats for proteins."),
        "ja": ("⚠️", "カロリー超過",       "平均 {avg} kcal — 目標({goal})の{pct}%。量を減らすか、脂質をタンパク質に置き換えましょう。"),
    },
    "low_protein": {
        "ru": ("🥩", "Мало белка",   "Среднее {avg}г — {pct}% от цели ({goal}г). Добавьте курицу, рыбу, творог, бобовые."),
        "en": ("🥩", "Low protein",  "Average {avg}g — {pct}% of goal ({goal}g). Add chicken, fish, cottage cheese, legumes."),
        "ja": ("🥩", "タンパク質不足", "平均 {avg}g — 目標({goal}g)の{pct}%。鶏肉、魚、カッテージチーズ、豆類を追加。"),
    },
    "high_fat":   {
        "ru": ("🥑", "Много жиров",   "Среднее {avg}г — {pct}% от цели ({goal}г). Уменьшите масло, сыр, орехи в порциях."),
        "en": ("🥑", "High fat",      "Average {avg}g — {pct}% of goal ({goal}g). Reduce oils, cheese, nuts in portions."),
        "ja": ("🥑", "脂質過多",      "平均 {avg}g — 目標({goal}g)の{pct}%。油、チーズ、ナッツの量を減らしましょう。"),
    },
    "low_carbs":  {
        "ru": ("🍞", "Мало углеводов", "Среднее {avg}г — {pct}% от цели ({goal}г). Добавьте крупы, фрукты, цельнозерновой хлеб."),
        "en": ("🍞", "Low carbs",      "Average {avg}g — {pct}% of goal ({goal}g). Add grains, fruits, whole-grain bread."),
        "ja": ("🍞", "炭水化物不足",   "平均 {avg}g — 目標({goal}g)の{pct}%。穀物、果物、全粒粉パンを追加。"),
    },
    "variety":    {
        "ru": ("🌈", "Разнообразьте рацион", "Вы едите в основном одни и те же продукты. Попробуйте новые овощи, фрукты, крупы."),
        "en": ("🌈", "Diversify your diet",  "You're eating the same foods repeatedly. Try new vegetables, fruits, grains."),
        "ja": ("🌈", "食事のバリエーション", "同じ食品ばかりです。新しい野菜、果物、穀物を試してみましょう。"),
    },
    "success":    {
        "ru": ("✅", "Отличный баланс!", "Ваш рацион сбалансирован и соответствует целям. Продолжайте в том же духе!"),
        "en": ("✅", "Great balance!",  "Your diet is well-balanced and on target. Keep it up!"),
        "ja": ("✅", "素晴らしいバランス!", "食事は目標通りバランスが取れています。この調子で!"),
    },
    "no_data":    {
        "ru": ("📝", "Начните вести дневник", "За эту неделю нет записей. Добавьте сегодняшние приёмы пищи, и я подскажу что улучшить."),
        "en": ("📝", "Start your diary",      "No entries this week. Log today's meals and I'll suggest improvements."),
        "ja": ("📝", "日記を始めましょう",     "今週の記録がありません。今日の食事を記録すると改善案を提案します。"),
    },
    "cond_restrict": {
        "ru": ("🏥", "{name} — ограничить", "{items}"),
        "en": ("🏥", "{name} — limit",      "{items}"),
        "ja": ("🏥", "{name} — 制限",        "{items}"),
    },
    "cond_increase": {
        "ru": ("💚", "{name} — увеличить", "{items}"),
        "en": ("💚", "{name} — increase",  "{items}"),
        "ja": ("💚", "{name} — 増やす",    "{items}"),
    },
}


def _rec(kind: str, lang: str, **kwargs):
    icon, title, text = REC_TEMPLATES[kind].get(lang, REC_TEMPLATES[kind]["ru"])
    return {"type": "tip", "icon": icon, "title": title.format(**kwargs), "text": text.format(**kwargs)}




@router.get("")
async def get_recommendations(
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate personalized recommendations based on recent diet and health."""
    today = date.today()
    week_ago = today - timedelta(days=7)

    # Daily totals first, then average across tracked days (correct daily KBJU)
    daily_sub = (
        select(
            DiaryEntry.entry_date.label("d"),
            func.sum(DiaryEntry.calories).label("cal"),
            func.sum(DiaryEntry.protein).label("prot"),
            func.sum(DiaryEntry.fat).label("fat"),
            func.sum(DiaryEntry.carbohydrates).label("carb"),
        )
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= week_ago)
        .group_by(DiaryEntry.entry_date)
        .subquery()
    )
    row = (await db.execute(
        select(
            func.avg(daily_sub.c.cal),
            func.avg(daily_sub.c.prot),
            func.avg(daily_sub.c.fat),
            func.avg(daily_sub.c.carb),
            func.count(daily_sub.c.d),
        )
    )).one()
    avg_cal = float(row[0] or 0)
    avg_prot = float(row[1] or 0)
    avg_fat = float(row[2] or 0)
    avg_carb = float(row[3] or 0)
    days_tracked = int(row[4] or 0)
    total_entries = days_tracked  # kept name for downstream code

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
        recs.append(_rec("no_data", lang))
        return {"recommendations": recs, "stats": {"avg_calories": 0, "avg_protein": 0, "avg_fat": 0, "avg_carbs": 0, "days_tracked": 0}, "top_products": [], "ai_summary": None}
    # legacy block remained — keep dummy False to skip
    if False:
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
        recs.append(_rec("low_cal", lang, avg=int(avg_cal), pct=int(cal_ratio*100), goal=goals["calories"]))
    elif cal_ratio > 1.2:
        recs.append(_rec("high_cal", lang, avg=int(avg_cal), pct=int(cal_ratio*100), goal=goals["calories"]))

    # Protein
    prot_ratio = avg_prot / goals["protein"] if goals["protein"] else 1
    if prot_ratio < 0.7:
        recs.append(_rec("low_protein", lang, avg=int(avg_prot), pct=int(prot_ratio*100), goal=goals["protein"]))

    # Fat
    fat_ratio = avg_fat / goals["fat"] if goals["fat"] else 1
    if fat_ratio > 1.3:
        recs.append(_rec("high_fat", lang, avg=int(avg_fat), pct=int(fat_ratio*100), goal=goals["fat"]))

    # Carbs
    carb_ratio = avg_carb / goals["carbs"] if goals["carbs"] else 1
    if carb_ratio < 0.6:
        recs.append(_rec("low_carbs", lang, avg=int(avg_carb), pct=int(carb_ratio*100), goal=goals["carbs"]))

    # Condition-based (free-text from DB, names usually in source language)
    for cond in conditions:
        dietary = cond.dietary_recommendations or {}
        restrict = dietary.get("restrict", [])
        increase = dietary.get("increase", [])
        if restrict:
            recs.append(_rec("cond_restrict", lang, name=cond.name, items=", ".join(restrict[:5])))
        if increase:
            recs.append(_rec("cond_increase", lang, name=cond.name, items=", ".join(increase[:5])))

    # Variety
    if len(top_products) <= 3 and total_entries > 10:
        recs.append(_rec("variety", lang))

    # If all is good
    if not recs:
        recs.append(_rec("success", lang))

    ai_summary = await _maybe_claude_summary(
        lang=lang,
        recs=recs,
        stats={"avg_cal": avg_cal, "avg_prot": avg_prot, "avg_fat": avg_fat, "avg_carb": avg_carb, "days": days_tracked},
        goals=goals,
        conditions=[c.name for c in conditions],
        top_products=[p["name"] for p in top_products],
    )

    return {
        "recommendations": recs,
        "stats": {
            "avg_calories": round(avg_cal, 1),
            "avg_protein": round(avg_prot, 1),
            "avg_fat": round(avg_fat, 1),
            "avg_carbs": round(avg_carb, 1),
            "days_tracked": days_tracked,
        },
        "top_products": top_products,
        "ai_summary": ai_summary,
    }


async def _maybe_claude_summary(lang, recs, stats, goals, conditions, top_products):
    """If ANTHROPIC_API_KEY is set, ask Claude for a personal 2-3 sentence summary.
    Returns None if no key or call fails — endpoint still works without AI.
    """
    from app.core.config import settings
    api_key = settings.anthropic_api_key
    if not api_key or stats["days"] == 0:
        return None
    import httpx
    summary_input = {
        "stats_per_day": {
            "calories": round(stats["avg_cal"]),
            "protein_g": round(stats["avg_prot"]),
            "fat_g": round(stats["avg_fat"]),
            "carbs_g": round(stats["avg_carb"]),
            "days_tracked": stats["days"],
        },
        "goals": goals,
        "conditions": conditions,
        "frequent_products": top_products[:5],
        "rule_based_flags": [r["title"] for r in recs],
    }
    prompts = {
        "ru": "Ты — нутрициолог. На основе данных дневника питания дай короткое (2-3 предложения) персональное саммари по-русски: что в целом хорошо, что подтянуть, один конкретный совет на эту неделю. Без воды, без приветствий, без списков — связный текст. Данные: {data}",
        "en": "You are a nutritionist. Based on this food diary data, give a short (2-3 sentences) personal English summary: what's good, what to improve, one concrete tip for this week. No fluff, no greetings, no lists — connected prose. Data: {data}",
        "ja": "あなたは栄養士です。食事日記のデータに基づき、日本語で短く(2〜3文)個人的なサマリーを書いてください: 全体的に良い点、改善点、今週の具体的なアドバイスを1つ。冗長な表現や挨拶、箇条書きは不要 — 連続した文章で。データ: {data}",
    }
    prompt = prompts.get(lang, prompts["ru"]).format(data=summary_input)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 350,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            r.raise_for_status()
            return r.json()["content"][0]["text"].strip()
    except Exception:
        return None

