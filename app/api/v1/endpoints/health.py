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


# ---- Body Composition Endpoint ----

def _bmi_category(bmi: float, activity_level: str | None) -> dict:
    """Return BMI category with activity-aware context."""
    if bmi < 16.0:
        cat, color, note_key = "severe_thin", "#e74c3c", None
    elif bmi < 17.0:
        cat, color, note_key = "moderate_thin", "#e67e22", None
    elif bmi < 18.5:
        cat, color, note_key = "mild_thin", "#f1c40f", None
    elif bmi < 25.0:
        cat, color, note_key = "normal", "#27ae60", None
    elif bmi < 30.0:
        cat, color, note_key = "overweight", "#f39c12", "muscle_mass"
    elif bmi < 35.0:
        cat, color, note_key = "obese1", "#e67e22", "muscle_mass"
    elif bmi < 40.0:
        cat, color, note_key = "obese2", "#e74c3c", None
    else:
        cat, color, note_key = "obese3", "#c0392b", None

    athlete = activity_level in ("high", "very_high", "extreme")
    show_muscle_note = athlete and note_key == "muscle_mass"
    return {"category": cat, "color": color, "athlete_note": show_muscle_note}


def _whtr_category(whtr: float) -> dict:
    """WHtR thresholds (Ashwell & Hsieh, 2005)."""
    if whtr < 0.40:
        return {"category": "underweight", "color": "#3498db", "risk": "low"}
    elif whtr < 0.50:
        return {"category": "healthy", "color": "#27ae60", "risk": "low"}
    elif whtr < 0.60:
        return {"category": "increased_risk", "color": "#f39c12", "risk": "moderate"}
    else:
        return {"category": "high_risk", "color": "#e74c3c", "risk": "high"}


def _ffmi_category(ffmi: float, sex: str | None) -> dict:
    """FFMI benchmarks differ by sex (Kouri et al., 1995)."""
    if sex == "female":
        if ffmi < 14:
            cat, color = "below_avg", "#e74c3c"
        elif ffmi < 17:
            cat, color = "average", "#f39c12"
        elif ffmi < 19:
            cat, color = "above_avg", "#27ae60"
        elif ffmi < 21:
            cat, color = "excellent", "#2ecc71"
        else:
            cat, color = "exceptional", "#9b59b6"
    else:  # male / unknown default to male thresholds
        if ffmi < 16:
            cat, color = "below_avg", "#e74c3c"
        elif ffmi < 18:
            cat, color = "average", "#f39c12"
        elif ffmi < 20:
            cat, color = "above_avg", "#27ae60"
        elif ffmi < 22:
            cat, color = "excellent", "#2ecc71"
        elif ffmi < 25:
            cat, color = "elite", "#3498db"
        else:
            cat, color = "exceptional", "#9b59b6"
    return {"category": cat, "color": color, "natural_ceiling": 25 if sex != "female" else 22}


def _body_fat_category(fat_pct: float, sex: str | None) -> dict:
    if sex == "female":
        if fat_pct < 14:
            cat, color = "essential", "#e74c3c"
        elif fat_pct < 21:
            cat, color = "athlete", "#3498db"
        elif fat_pct < 25:
            cat, color = "fitness", "#27ae60"
        elif fat_pct < 32:
            cat, color = "average", "#f39c12"
        else:
            cat, color = "obese", "#e74c3c"
    else:
        if fat_pct < 6:
            cat, color = "essential", "#e74c3c"
        elif fat_pct < 14:
            cat, color = "athlete", "#3498db"
        elif fat_pct < 18:
            cat, color = "fitness", "#27ae60"
        elif fat_pct < 25:
            cat, color = "average", "#f39c12"
        else:
            cat, color = "obese", "#e74c3c"
    return {"category": cat, "color": color}


@router.get("/body-composition")
async def get_body_composition(user: User = Depends(get_current_user)):
    """
    Full body composition: BMI (classic) + WHtR (preferred) + FFMI (if body_fat_pct provided).
    Activity-level-aware notes for high/extreme athletes.
    """
    w = user.current_weight
    h = user.height
    waist = user.waist_cm
    fat = user.body_fat_pct
    sex = getattr(user, "sex", None)
    activity = getattr(user, "activity_level", None)

    if not w or not h or h <= 0:
        return {"available": False, "reason": "no_weight_height"}

    h_m = h / 100.0

    # --- BMI ---
    bmi = round(w / (h_m ** 2), 1)
    bmi_info = _bmi_category(bmi, activity)

    # --- WHtR ---
    whtr_info = None
    whtr = None
    if waist and waist > 0:
        whtr = round(waist / h, 3)
        whtr_info = _whtr_category(whtr)

    # --- FFMI ---
    ffmi_info = None
    ffmi = None
    if fat is not None and 0 < fat < 70:
        ffm = w * (1.0 - fat / 100.0)  # fat-free mass, kg
        ffmi = round(ffm / (h_m ** 2), 1)
        # Normalized FFMI (optional, for height < 1.8m correction)
        ffmi_norm = round(ffmi + 6.1 * (1.8 - h_m), 1)
        ffmi_info = _ffmi_category(ffmi, sex)
        ffmi_info["ffmi"] = ffmi
        ffmi_info["ffmi_normalized"] = ffmi_norm

    # --- Body fat category ---
    fat_cat = None
    if fat is not None and 0 < fat < 70:
        fat_cat = _body_fat_category(fat, sex)
        fat_cat["pct"] = fat

    # --- Primary metric selection ---
    # WHtR is more accurate if available, otherwise fall back to BMI
    primary = "whtr" if whtr_info else "bmi"

    return {
        "available": True,
        "primary_metric": primary,
        "bmi": {
            "value": bmi,
            **bmi_info,
        },
        "whtr": {
            "value": whtr,
            **(whtr_info or {}),
        } if whtr_info else None,
        "ffmi": ffmi_info if ffmi_info else None,
        "body_fat": fat_cat,
        "inputs": {
            "weight_kg": w,
            "height_cm": h,
            "waist_cm": waist,
            "body_fat_pct": fat,
            "sex": sex,
            "activity_level": activity,
        },
    }
