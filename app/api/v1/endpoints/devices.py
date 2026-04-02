from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.device import DeviceIntegration, HealthMetric

router = APIRouter(prefix="/devices", tags=["devices"])


# --- Schemas ---

class DeviceConnect(BaseModel):
    provider: str  # apple_health, google_fit, fitbit, garmin, withings
    access_token: str | None = None
    refresh_token: str | None = None
    external_user_id: str | None = None


class MetricCreate(BaseModel):
    provider: str
    metric_type: str  # weight, glucose, blood_pressure, heart_rate, steps, sleep
    value: float
    unit: str
    measured_at: datetime
    metadata: dict | None = None


class MetricBatch(BaseModel):
    metrics: list[MetricCreate]


# --- Endpoints ---

@router.get("")
async def list_integrations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List connected devices/apps."""
    result = await db.execute(
        select(DeviceIntegration).where(DeviceIntegration.user_id == user.id)
    )
    integrations = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "provider": i.provider,
            "is_active": i.is_active,
            "connected_at": i.connected_at,
            "last_sync_at": i.last_sync_at,
        }
        for i in integrations
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def connect_device(
    data: DeviceConnect,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Connect a health device/app."""
    integration = DeviceIntegration(
        user_id=user.id,
        provider=data.provider,
        access_token=data.access_token,
        refresh_token=data.refresh_token,
        external_user_id=data.external_user_id,
    )
    db.add(integration)
    await db.flush()
    return {"id": str(integration.id), "provider": data.provider, "status": "connected"}


@router.delete("/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_device(
    integration_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Disconnect a device."""
    result = await db.execute(
        select(DeviceIntegration).where(
            DeviceIntegration.id == integration_id,
            DeviceIntegration.user_id == user.id,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await db.delete(integration)
    await db.flush()


# --- Health Metrics ---

@router.post("/metrics", status_code=status.HTTP_201_CREATED)
async def push_metrics(
    data: MetricBatch,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Push health metrics from device (batch). Used by mobile app after syncing with Apple Health / Google Fit."""
    count = 0
    for m in data.metrics:
        metric = HealthMetric(
            user_id=user.id,
            provider=m.provider,
            metric_type=m.metric_type,
            value=m.value,
            unit=m.unit,
            metadata_=m.metadata,
            measured_at=m.measured_at,
        )
        db.add(metric)
        count += 1
    await db.flush()
    return {"imported": count}


@router.get("/metrics")
async def get_metrics(
    metric_type: str = Query(..., description="weight, glucose, blood_pressure, heart_rate, steps, sleep"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get health metrics for a type and date range."""
    stmt = select(HealthMetric).where(
        HealthMetric.user_id == user.id,
        HealthMetric.metric_type == metric_type,
    )
    if date_from:
        stmt = stmt.where(HealthMetric.measured_at >= date_from)
    if date_to:
        stmt = stmt.where(HealthMetric.measured_at <= date_to)

    stmt = stmt.order_by(HealthMetric.measured_at.desc()).limit(limit)
    result = await db.execute(stmt)

    return [
        {
            "id": str(m.id),
            "provider": m.provider,
            "metric_type": m.metric_type,
            "value": m.value,
            "unit": m.unit,
            "metadata": m.metadata_,
            "measured_at": m.measured_at,
        }
        for m in result.scalars().all()
    ]


@router.get("/metrics/latest")
async def get_latest_metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get latest value for each metric type."""
    from sqlalchemy import distinct, func

    # Get distinct metric types
    types_result = await db.execute(
        select(distinct(HealthMetric.metric_type)).where(HealthMetric.user_id == user.id)
    )
    metric_types = [row[0] for row in types_result.all()]

    latest = {}
    for mt in metric_types:
        result = await db.execute(
            select(HealthMetric)
            .where(HealthMetric.user_id == user.id, HealthMetric.metric_type == mt)
            .order_by(HealthMetric.measured_at.desc())
            .limit(1)
        )
        m = result.scalar_one_or_none()
        if m:
            latest[mt] = {
                "value": m.value,
                "unit": m.unit,
                "measured_at": m.measured_at,
                "provider": m.provider,
            }

    return latest
