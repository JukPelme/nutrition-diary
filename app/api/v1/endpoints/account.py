"""Account management — delete + export-all (GDPR).

DELETE /account     — hard delete current user + all their data (cascade)
GET    /account/export  — ZIP with JSON snapshots of every table for this user
"""
import io
import json
import zipfile
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry, Meal
from app.models.water import WaterEntry
from app.models.health import MoodEntry, FastingSession, UserCondition
from app.models.device import HealthMetric
from app.models.chat import ChatMessage
from app.models.recipe import Recipe, RecipeIngredient
from app.models.meal_plan import MealPlan
from app.models.achievement import UserAchievement
from app.models.security import LoginEvent

router = APIRouter(prefix="/account", tags=["account"])


_SENSITIVE_COLS = {"hashed_password", "totp_secret"}


def _to_jsonable(rows):
    out = []
    for r in rows:
        d = {}
        for col in r.__table__.columns:
            if col.name in _SENSITIVE_COLS:
                continue
            v = getattr(r, col.name)
            if hasattr(v, "isoformat"):
                v = v.isoformat()
            elif isinstance(v, (bytes, bytearray)):
                v = v.decode("utf-8", errors="ignore")
            d[col.name] = str(v) if hasattr(v, "hex") and not isinstance(v, (int, float, bool, str, type(None))) else v
        out.append(d)
    return out


@router.get("/export")
async def export_all(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return ZIP with all user data."""
    tables = {
        "user.json": [user],
        "diary_entries.json": (await db.execute(select(DiaryEntry).where(DiaryEntry.user_id == user.id))).scalars().all(),
        "meals.json": (await db.execute(select(Meal).where(Meal.user_id == user.id))).scalars().all(),
        "water_entries.json": (await db.execute(select(WaterEntry).where(WaterEntry.user_id == user.id))).scalars().all(),
        "mood_entries.json": (await db.execute(select(MoodEntry).where(MoodEntry.user_id == user.id))).scalars().all(),
        "fasting_sessions.json": (await db.execute(select(FastingSession).where(FastingSession.user_id == user.id))).scalars().all(),
        "user_conditions.json": (await db.execute(select(UserCondition).where(UserCondition.user_id == user.id))).scalars().all(),
        "health_metrics.json": (await db.execute(select(HealthMetric).where(HealthMetric.user_id == user.id))).scalars().all(),
        "chat_messages.json": (await db.execute(select(ChatMessage).where(ChatMessage.user_id == user.id))).scalars().all(),
        "recipes.json": (await db.execute(select(Recipe).where(Recipe.user_id == user.id))).scalars().all(),
        "meal_plans.json": (await db.execute(select(MealPlan).where(MealPlan.user_id == user.id))).scalars().all(),
        "user_achievements.json": (await db.execute(select(UserAchievement).where(UserAchievement.user_id == user.id))).scalars().all(),
        "login_events.json": (await db.execute(select(LoginEvent).where(LoginEvent.user_id == user.id))).scalars().all(),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows in tables.items():
            try:
                data = _to_jsonable(rows)
            except Exception as e:
                data = {"_error": str(e)}
            zf.writestr(name, json.dumps(data, ensure_ascii=False, indent=2, default=str))
        # Add a README
        zf.writestr("README.txt", f"Nutrition Diary export\nUser: {user.email}\nGenerated: {datetime.utcnow().isoformat()}Z\n")

    buf.seek(0)
    filename = f"nutrition-diary-{user.email.replace('@', '_at_')}-{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("")
async def delete_account(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hard delete: ON DELETE CASCADE handles related rows."""
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return {"deleted": True}
