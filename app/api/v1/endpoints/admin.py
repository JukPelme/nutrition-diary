"""Admin-only stats endpoints.

GET /admin/overview — users count, active 24h/7d/30d, total entries, AI cost
GET /admin/ai-usage?days=7 — daily AI cost & token breakdown
GET /admin/feature-usage — endpoints by call count
"""
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.ai_log import AIUsageLog
from app.models.security import LoginEvent

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: User):
    if not user.is_superuser:
        raise HTTPException(403, "Admin only")


@router.get("/overview")
async def overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_24h = (await db.execute(
        select(func.count(func.distinct(LoginEvent.user_id))).where(LoginEvent.created_at >= day_ago)
    )).scalar() or 0
    active_7d = (await db.execute(
        select(func.count(func.distinct(LoginEvent.user_id))).where(LoginEvent.created_at >= week_ago)
    )).scalar() or 0
    active_30d = (await db.execute(
        select(func.count(func.distinct(LoginEvent.user_id))).where(LoginEvent.created_at >= month_ago)
    )).scalar() or 0
    total_entries = (await db.execute(select(func.count(DiaryEntry.id)))).scalar() or 0

    ai_cost_24h = (await db.execute(
        select(func.coalesce(func.sum(AIUsageLog.cost_usd), 0)).where(AIUsageLog.created_at >= day_ago)
    )).scalar() or 0
    ai_cost_7d = (await db.execute(
        select(func.coalesce(func.sum(AIUsageLog.cost_usd), 0)).where(AIUsageLog.created_at >= week_ago)
    )).scalar() or 0
    ai_cost_30d = (await db.execute(
        select(func.coalesce(func.sum(AIUsageLog.cost_usd), 0)).where(AIUsageLog.created_at >= month_ago)
    )).scalar() or 0

    return {
        "users": {"total": total_users, "active_24h": active_24h, "active_7d": active_7d, "active_30d": active_30d},
        "diary": {"total_entries": total_entries},
        "ai_cost_usd": {"d1": round(float(ai_cost_24h), 4), "d7": round(float(ai_cost_7d), 4), "d30": round(float(ai_cost_30d), 4)},
    }


@router.get("/ai-usage")
async def ai_usage(
    days: int = 7,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    since = datetime.utcnow() - timedelta(days=days)
    rows = (await db.execute(
        select(
            AIUsageLog.endpoint, AIUsageLog.model,
            func.count(AIUsageLog.id),
            func.coalesce(func.sum(AIUsageLog.input_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0),
        )
        .where(AIUsageLog.created_at >= since)
        .group_by(AIUsageLog.endpoint, AIUsageLog.model)
        .order_by(desc(func.sum(AIUsageLog.cost_usd)))
    )).all()
    return {
        "days": days,
        "breakdown": [
            {"endpoint": r[0], "model": r[1], "calls": int(r[2]),
             "input_tokens": int(r[3]), "output_tokens": int(r[4]),
             "cost_usd": round(float(r[5]), 4)}
            for r in rows
        ],
    }


@router.get("/feature-usage")
async def feature_usage(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    since = datetime.utcnow() - timedelta(days=days)
    rows = (await db.execute(
        select(AIUsageLog.endpoint, func.count(AIUsageLog.id))
        .where(AIUsageLog.created_at >= since)
        .group_by(AIUsageLog.endpoint)
        .order_by(desc(func.count(AIUsageLog.id)))
    )).all()
    return {"days": days, "endpoints": [{"endpoint": r[0], "calls": int(r[1])} for r in rows]}
