import uuid
from datetime import date, datetime
from sqlalchemy import String, Float, Date, DateTime, ForeignKey, Integer, UniqueConstraint, Index
from app.db.compat import UUIDType, JSONType, server_now, python_now
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Meal(Base):
    """Configurable meal types per user (breakfast, lunch, dinner, snacks, custom)."""
    __tablename__ = "meals"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # "Завтрак", "Обед", etc.
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    icon: Mapped[str | None] = mapped_column(String(10))  # emoji
    is_default: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())

    # Relationships
    user = relationship("User", back_populates="meals")
    # Never eager/lazy-load the full history on GET /meals. Load entries explicitly
    # (by date) where needed; passive_deletes relies on the DB SET NULL on meal_id.
    entries = relationship("DiaryEntry", back_populates="meal", lazy="raise", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_meal_user_name"),
    )


class DiaryEntry(Base):
    """Single food entry in the diary."""
    __tablename__ = "diary_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    meal_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("meals.id", ondelete="SET NULL"), nullable=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)

    # Entry data
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)  # denormalized for history
    serving_amount: Mapped[float] = mapped_column(Float, nullable=False)  # in grams
    
    # Calculated KBJU at time of entry (denormalized)
    calories: Mapped[float] = mapped_column(Float, default=0)
    protein: Mapped[float] = mapped_column(Float, default=0)
    fat: Mapped[float] = mapped_column(Float, default=0)
    carbohydrates: Mapped[float] = mapped_column(Float, default=0)

    # Client-generated idempotency key: the same queued offline write can be
    # replayed (lost response, background sync, second tab) — dedupe on it.
    client_op_id: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now(), onupdate=python_now)

    # Relationships
    user = relationship("User", back_populates="diary_entries")
    meal = relationship("Meal", back_populates="entries")
    product = relationship("Product")

    __table_args__ = (
        # Hottest query filters user_id + entry_date together (get_entries_by_date,
        # get_recent_days). One composite index beats two single-column ones.
        Index("ix_diary_user_date", "user_id", "entry_date"),
        # Idempotency: a replayed offline write must not create a duplicate.
        # NULLs are distinct, so pre-existing rows without an op id don't clash.
        UniqueConstraint("user_id", "client_op_id", name="uq_diary_user_op"),
    )

    # Transient (not persisted) — set by diary_service.create_entry so the API
    # can tell the client how much water was auto-logged and let it be undone.
    water_added_ml: int = 0
    water_entry_id = None
