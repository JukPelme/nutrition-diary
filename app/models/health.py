import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey, Text, UniqueConstraint
from app.db.compat import UUIDType, JSONType, server_now
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ICD11Condition(Base):
    """ICD-11 diagnosis codes with dietary rules."""
    __tablename__ = "icd11_conditions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)  # e.g. "5A10" (Type 1 diabetes)
    name_en: Mapped[str] = mapped_column(String(500), nullable=False)
    name_ru: Mapped[str | None] = mapped_column(String(500))
    category: Mapped[str | None] = mapped_column(String(255), index=True)  # e.g. "Endocrine", "Cardiovascular"
    description: Mapped[str | None] = mapped_column(Text)

    # Dietary rules (JSONB for flexibility)
    # Structure:
    # {
    #   "restrict": {"sodium": 1500, "sugar": 25, ...},       — max mg/g per day
    #   "increase": {"fiber": 30, "potassium": 4700, ...},    — min mg/g per day
    #   "avoid": ["alcohol", "caffeine", ...],                 — categories to avoid
    #   "prefer": ["whole_grains", "leafy_greens", ...],       — recommended categories
    #   "calorie_adjustment": -500,                            — kcal adjustment
    #   "macro_ratio": {"protein": 0.3, "fat": 0.25, "carbs": 0.45}  — target ratio
    # }
    dietary_rules: Mapped[dict | None] = mapped_column(JSONType)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())


class UserCondition(Base):
    """Links users to their diagnosed conditions."""
    __tablename__ = "user_conditions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    condition_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("icd11_conditions.id", ondelete="CASCADE"), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(20))  # mild, moderate, severe
    diagnosed_at: Mapped[str | None] = mapped_column(String(20))  # date string
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())

    # Relationships
    user = relationship("User")
    condition = relationship("ICD11Condition")

    __table_args__ = (
        UniqueConstraint("user_id", "condition_id", name="uq_user_condition"),
    )


class FastingSession(Base):
    """Intermittent fasting session tracker."""
    __tablename__ = "fasting_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "16:8", "18:6", "20:4", "5:2", "custom"
    fasting_hours: Mapped[float] = mapped_column(Float, nullable=False)  # planned fasting duration
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    target_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # actual end (null = still active)
    completed: Mapped[bool | None] = mapped_column(default=None)  # True=completed, False=broken early, None=active
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())

    user = relationship("User")
