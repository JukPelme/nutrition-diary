from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.health import ConditionResponse, ConditionBrief, UserConditionAdd, UserConditionResponse
from app.services import health_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/conditions", response_model=list[ConditionBrief])
async def list_conditions(
    q: str | None = Query(None, description="Search by name or ICD code"),
    category: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search ICD-11 conditions."""
    return await health_service.get_conditions(db, query=q, category=category, limit=limit, offset=offset)


@router.get("/conditions/{code}", response_model=ConditionResponse)
async def get_condition_detail(
    code: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get condition details with dietary rules."""
    from sqlalchemy import select
    from app.models.health import ICD11Condition
    result = await db.execute(select(ICD11Condition).where(ICD11Condition.code == code))
    cond = result.scalar_one_or_none()
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condition not found")
    return cond


@router.get("/profile")
async def get_health_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get user's conditions and merged dietary recommendations."""
    conditions = await health_service.get_user_conditions(db, user.id)
    recommendations = await health_service.get_merged_recommendations(db, user.id)

    return {
        "conditions": [
            {
                "id": str(uc.id),
                "code": uc.condition.code,
                "name": uc.condition.name_ru or uc.condition.name_en,
                "severity": uc.severity,
            }
            for uc in conditions
        ],
        "recommendations": recommendations,
    }


@router.post("/profile/conditions", status_code=status.HTTP_201_CREATED)
async def add_condition(
    data: UserConditionAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a condition to user's health profile."""
    uc = await health_service.add_user_condition(
        db, user.id, UUID(data.condition_id),
        severity=data.severity, diagnosed_at=data.diagnosed_at, notes=data.notes,
    )
    return {
        "id": str(uc.id),
        "condition": {
            "code": uc.condition.code,
            "name": uc.condition.name_ru or uc.condition.name_en,
        },
        "severity": uc.severity,
    }


@router.delete("/profile/conditions/{condition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_condition(
    condition_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a condition from user's health profile."""
    removed = await health_service.remove_user_condition(db, condition_id, user.id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condition not found in profile")


# ---- Weight Goals & Metrics ----
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, desc
from app.models.device import HealthMetric


class WeightGoalUpdate(BaseModel):
    current_weight: float | None = None
    target_weight: float | None = None
    height: float | None = None


class MetricAdd(BaseModel):
    metric_type: str
    value: float
    unit: str = ""


@router.patch("/weight-goal")
async def update_weight_goal(
    data: WeightGoalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.current_weight is not None:
        user.current_weight = data.current_weight
    if data.target_weight is not None:
        user.target_weight = data.target_weight
    if data.height is not None:
        user.height = data.height
    await db.flush()

    # Auto-record weight metric if current_weight changed
    if data.current_weight is not None:
        metric = HealthMetric(
            user_id=user.id,
            provider="manual",
            metric_type="weight",
            value=data.current_weight,
            unit="kg",
            measured_at=datetime.now(timezone.utc),
        )
        db.add(metric)
        await db.flush()

    return {
        "current_weight": user.current_weight,
        "target_weight": user.target_weight,
        "height": user.height,
    }


@router.get("/weight-goal")
async def get_weight_goal(
    user: User = Depends(get_current_user),
):
    bmi = None
    if user.current_weight and user.height and user.height > 0:
        h_m = user.height / 100
        bmi = round(user.current_weight / (h_m * h_m), 1)

    return {
        "current_weight": user.current_weight,
        "target_weight": user.target_weight,
        "height": user.height,
        "bmi": bmi,
    }


@router.get("/metrics")
async def list_metrics(
    metric_type: str | None = Query(None, description="weight | glucose | blood_pressure | heart_rate | steps"),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(HealthMetric)
        .where(HealthMetric.user_id == user.id, HealthMetric.measured_at >= since)
        .order_by(desc(HealthMetric.measured_at))
        .limit(500)
    )
    if metric_type:
        stmt = stmt.where(HealthMetric.metric_type == metric_type)
    result = await db.execute(stmt)
    return [
        {
            "id": str(m.id),
            "metric_type": m.metric_type,
            "value": m.value,
            "unit": m.unit,
            "provider": m.provider,
            "measured_at": m.measured_at.isoformat() if m.measured_at else None,
        }
        for m in result.scalars().all()
    ]


@router.post("/metrics")
async def add_metric(
    data: MetricAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    units = {"weight": "kg", "glucose": "mmol/L", "blood_pressure": "mmHg", "heart_rate": "bpm", "steps": "steps"}
    metric = HealthMetric(
        user_id=user.id,
        provider="manual",
        metric_type=data.metric_type,
        value=data.value,
        unit=data.unit or units.get(data.metric_type, ""),
        measured_at=datetime.now(timezone.utc),
    )
    db.add(metric)
    await db.flush()
    return {"id": str(metric.id), "metric_type": metric.metric_type, "value": metric.value}


@router.get("/weight-history")
async def get_weight_history(
    days: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(HealthMetric)
        .where(
            HealthMetric.user_id == user.id,
            HealthMetric.metric_type == "weight",
            HealthMetric.measured_at >= since,
        )
        .order_by(HealthMetric.measured_at)
    )
    metrics = result.scalars().all()

    # Forecast
    forecast = None
    if len(metrics) >= 2 and user.target_weight:
        first = metrics[0]
        last = metrics[-1]
        first_at = first.measured_at
        last_at = last.measured_at
        if first_at.tzinfo is None:
            first_at = first_at.replace(tzinfo=timezone.utc)
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        days_elapsed = max(1, (last_at - first_at).days)
        rate = (last.value - first.value) / days_elapsed  # kg per day
        if rate != 0:
            remaining = user.target_weight - last.value
            days_to_goal = int(remaining / rate)
            if 0 < days_to_goal < 3650:
                forecast = {
                    "rate_per_week": round(rate * 7, 2),
                    "days_to_goal": days_to_goal,
                    "estimated_date": (last_at + timedelta(days=days_to_goal)).strftime("%Y-%m-%d"),
                }

    return {
        "data": [
            {"date": m.measured_at.strftime("%Y-%m-%d"), "weight": m.value}
            for m in metrics
        ],
        "target_weight": user.target_weight,
        "forecast": forecast,
    }
