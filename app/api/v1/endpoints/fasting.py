"""Intermittent fasting tracker API."""
from uuid import UUID
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.health import FastingSession

router = APIRouter(prefix="/fasting", tags=["fasting"])

PLANS = {
    "16:8": 16, "18:6": 18, "20:4": 20, "14:10": 14, "23:1": 23,
}


class FastingStart(BaseModel):
    plan_type: str = "16:8"
    custom_hours: float | None = None


class FastingResponse(BaseModel):
    id: UUID
    plan_type: str
    fasting_hours: float
    started_at: datetime
    target_end: datetime
    ended_at: datetime | None
    completed: bool | None
    notes: str | None
    elapsed_hours: float | None = None
    remaining_hours: float | None = None
    progress_percent: float | None = None

    class Config:
        from_attributes = True


def _enrich(session: FastingSession) -> dict:
    data = {
        "id": session.id,
        "plan_type": session.plan_type,
        "fasting_hours": session.fasting_hours,
        "started_at": session.started_at,
        "target_end": session.target_end,
        "ended_at": session.ended_at,
        "completed": session.completed,
        "notes": session.notes,
    }
    now = datetime.now(timezone.utc)
    ref_time = session.ended_at or now

    started = session.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    target = session.target_end
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    if ref_time.tzinfo is None:
        ref_time = ref_time.replace(tzinfo=timezone.utc)

    elapsed = (ref_time - started).total_seconds() / 3600
    remaining = max(0, (target - ref_time).total_seconds() / 3600)
    progress = min(100, (elapsed / session.fasting_hours) * 100) if session.fasting_hours > 0 else 0

    data["elapsed_hours"] = round(elapsed, 2)
    data["remaining_hours"] = round(remaining, 2)
    data["progress_percent"] = round(progress, 1)
    return data


@router.post("/start", response_model=FastingResponse)
async def start_fasting(
    body: FastingStart,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    active = await db.execute(
        select(FastingSession)
        .where(FastingSession.user_id == user.id, FastingSession.completed.is_(None))
    )
    if active.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already have an active fasting session")

    hours = PLANS.get(body.plan_type, body.custom_hours or 16)
    now = datetime.now(timezone.utc)

    session = FastingSession(
        user_id=user.id,
        plan_type=body.plan_type,
        fasting_hours=hours,
        started_at=now,
        target_end=now + timedelta(hours=hours),
    )
    db.add(session)
    await db.flush()
    return _enrich(session)


@router.post("/stop", response_model=FastingResponse)
async def stop_fasting(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FastingSession)
        .where(FastingSession.user_id == user.id, FastingSession.completed.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="No active fasting session")

    now = datetime.now(timezone.utc)
    session.ended_at = now

    target = session.target_end
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)

    session.completed = now >= target
    await db.flush()
    return _enrich(session)


@router.get("/current", response_model=FastingResponse | None)
async def get_current(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FastingSession)
        .where(FastingSession.user_id == user.id, FastingSession.completed.is_(None))
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    return _enrich(session)


@router.get("/history", response_model=list[FastingResponse])
async def get_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FastingSession)
        .where(FastingSession.user_id == user.id, FastingSession.completed.is_not(None))
        .order_by(desc(FastingSession.started_at))
        .limit(limit)
    )
    sessions = result.scalars().all()
    return [_enrich(s) for s in sessions]


@router.get("/stats")
async def get_fasting_stats(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(FastingSession)
        .where(
            FastingSession.user_id == user.id,
            FastingSession.completed.is_not(None),
            FastingSession.started_at >= since,
        )
    )
    sessions = result.scalars().all()

    if not sessions:
        return {"total_sessions": 0, "completed": 0, "avg_hours": 0, "longest_hours": 0, "streak": 0}

    completed = [s for s in sessions if s.completed]
    all_hours = []
    for s in sessions:
        ended = s.ended_at or s.target_end
        started = s.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if ended.tzinfo is None:
            ended = ended.replace(tzinfo=timezone.utc)
        all_hours.append((ended - started).total_seconds() / 3600)

    streak = 0
    if completed:
        dates = sorted(set(s.started_at.date() for s in completed), reverse=True)
        today = datetime.now(timezone.utc).date()
        for i, d in enumerate(dates):
            expected = today - timedelta(days=i)
            if d == expected:
                streak += 1
            else:
                break

    return {
        "total_sessions": len(sessions),
        "completed": len(completed),
        "completion_rate": round(len(completed) / len(sessions) * 100, 1),
        "avg_hours": round(sum(all_hours) / len(all_hours), 1),
        "longest_hours": round(max(all_hours), 1),
        "streak": streak,
    }
