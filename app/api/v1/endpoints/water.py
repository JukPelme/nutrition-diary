"""Water/drink intake tracking endpoints.

Goal: weight_kg * 30 ml by default (override per-user via daily_water_goal_ml).
"""
from uuid import UUID, uuid4
from datetime import datetime, date, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.water import WaterEntry
from app.schemas.water import WaterCreate, WaterEntryOut, WaterGoalUpdate, WaterGoalOut

router = APIRouter(prefix="/water", tags=["water"])


def _compute_goal(user: User) -> tuple[int, bool, float | None]:
    """Returns (goal_ml, is_auto, source_weight_kg)."""
    if user.daily_water_goal_ml:
        return user.daily_water_goal_ml, False, user.current_weight
    if user.current_weight:
        return int(user.current_weight * 30), True, user.current_weight
    return 2000, True, None  # fallback for unknown weight


@router.get("/goal", response_model=WaterGoalOut)
async def get_goal(user: User = Depends(get_current_user)):
    goal, is_auto, w = _compute_goal(user)
    return WaterGoalOut(daily_water_goal_ml=goal, is_auto=is_auto, source_weight_kg=w)


@router.patch("/goal", response_model=WaterGoalOut)
async def set_goal(
    data: WaterGoalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.daily_water_goal_ml = data.daily_water_goal_ml
    await db.flush()
    goal, is_auto, w = _compute_goal(user)
    return WaterGoalOut(daily_water_goal_ml=goal, is_auto=is_auto, source_weight_kg=w)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WaterEntryOut)
async def add_water(
    data: WaterCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = WaterEntry(
        id=uuid4(),
        user_id=user.id,
        amount_ml=data.amount_ml,
        drink_type=data.drink_type,
        drunk_at=data.drunk_at or datetime.now(timezone.utc),
        notes=data.notes,
    )
    db.add(entry)
    await db.flush()
    return entry


@router.get("/today")
async def water_today(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    rows = (await db.execute(
        select(WaterEntry)
        .where(WaterEntry.user_id == user.id, WaterEntry.drunk_at >= start, WaterEntry.drunk_at < end)
        .order_by(WaterEntry.drunk_at)
    )).scalars().all()
    total = sum(r.amount_ml for r in rows)
    goal, is_auto, w = _compute_goal(user)
    return {
        "date": today.isoformat(),
        "total_ml": total,
        "goal_ml": goal,
        "goal_is_auto": is_auto,
        "percent": round(total / goal * 100, 1) if goal else 0,
        "entries": [
            {"id": str(r.id), "amount_ml": r.amount_ml, "drink_type": r.drink_type,
             "drunk_at": r.drunk_at.isoformat(), "notes": r.notes}
            for r in rows
        ],
    }


@router.get("/history")
async def water_history(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(
            cast(WaterEntry.drunk_at, Date).label("d"),
            func.sum(WaterEntry.amount_ml).label("total"),
        )
        .where(WaterEntry.user_id == user.id, WaterEntry.drunk_at >= since)
        .group_by(cast(WaterEntry.drunk_at, Date))
        .order_by(cast(WaterEntry.drunk_at, Date))
    )).all()
    goal, _, _ = _compute_goal(user)
    return {
        "goal_ml": goal,
        "days": [{"date": r.d.isoformat(), "total_ml": int(r.total)} for r in rows],
    }


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_water(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = (await db.execute(
        select(WaterEntry).where(WaterEntry.id == entry_id, WaterEntry.user_id == user.id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Water entry not found")
    await db.delete(row)
    return None
