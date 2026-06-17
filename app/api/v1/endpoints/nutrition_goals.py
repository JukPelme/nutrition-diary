"""Auto-calculate daily KBJU goals from anthropometrics + activity + goal.

Formula: Mifflin-St Jeor BMR × activity factor → TDEE → adjust by goal_type.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light":     1.375,
    "moderate":  1.55,
    "high":      1.725,
    "extreme":   1.9,
}
GOAL_ADJUST = {
    "lose":     -0.18,   # 18% deficit
    "maintain":  0.0,
    "gain":      0.12,   # 12% surplus
}
# Macro split %: protein / fat / carbs of TDEE
GOAL_MACROS = {
    "lose":     (0.30, 0.27, 0.43),  # higher protein, moderate fat, lower carbs
    "maintain": (0.20, 0.27, 0.53),
    "gain":     (0.25, 0.25, 0.50),
}


def _missing_fields(user: User) -> list[str]:
    miss = []
    if not user.current_weight: miss.append("current_weight")
    if not user.height: miss.append("height")
    if not user.birth_year: miss.append("birth_year")
    if not user.sex: miss.append("sex")
    return miss


@router.get("/auto-goals")
async def auto_goals(user: User = Depends(get_current_user)):
    missing = _missing_fields(user)
    if missing:
        return {"ready": False, "missing": missing, "message": "Заполните рост, вес, год рождения и пол в Профиле"}

    age = date.today().year - user.birth_year
    if user.sex == "male":
        bmr = 10 * user.current_weight + 6.25 * user.height - 5 * age + 5
    elif user.sex == "female":
        bmr = 10 * user.current_weight + 6.25 * user.height - 5 * age - 161
    else:  # other / not specified — average of M & F
        bmr_m = 10 * user.current_weight + 6.25 * user.height - 5 * age + 5
        bmr_f = 10 * user.current_weight + 6.25 * user.height - 5 * age - 161
        bmr = (bmr_m + bmr_f) / 2

    activity = ACTIVITY_FACTORS.get(user.activity_level or "moderate", 1.55)
    tdee = bmr * activity

    goal = user.goal_type or "maintain"
    target_cal = tdee * (1 + GOAL_ADJUST.get(goal, 0))

    p_pct, f_pct, c_pct = GOAL_MACROS.get(goal, GOAL_MACROS["maintain"])
    protein_g = (target_cal * p_pct) / 4
    fat_g = (target_cal * f_pct) / 9
    carbs_g = (target_cal * c_pct) / 4

    return {
        "ready": True,
        "calories": round(target_cal),
        "protein": round(protein_g),
        "fat": round(fat_g),
        "carbs": round(carbs_g),
        "details": {
            "bmr": round(bmr),
            "tdee": round(tdee),
            "age": age,
            "activity_factor": activity,
            "goal_adjust": GOAL_ADJUST.get(goal, 0),
            "macro_split_pct": {"protein": p_pct, "fat": f_pct, "carbs": c_pct},
        },
    }
