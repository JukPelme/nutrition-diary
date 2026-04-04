import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey, Index, func
from app.db.compat import UUIDType, JSONType
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class DeviceIntegration(Base):
    """Connected health devices / apps per user."""
    __tablename__ = "device_integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # apple_health, google_fit, fitbit, garmin, withings
    external_user_id: Mapped[str | None] = mapped_column(String(255))
    access_token: Mapped[str | None] = mapped_column(String(1000))
    refresh_token: Mapped[str | None] = mapped_column(String(1000))
    scopes: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(default=True)

    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user = relationship("User")


class HealthMetric(Base):
    """Health data points from devices (weight, glucose, blood pressure, etc.)."""
    __tablename__ = "health_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # source device/app
    metric_type: Mapped[str] = mapped_column(String(50), nullable=False)  # weight, glucose, blood_pressure, heart_rate, steps, sleep
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)  # kg, mg/dL, mmHg, bpm, steps, hours
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONType)  # extra data (systolic/diastolic for BP, etc.)

    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_health_metrics_user_type_date", "user_id", "metric_type", "measured_at"),
    )
