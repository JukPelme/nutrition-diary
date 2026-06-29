import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, Integer, BigInteger
from app.db.compat import UUIDType, JSONType, server_now, python_now
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)

    # Profile settings
    daily_calorie_goal: Mapped[int | None] = mapped_column()
    daily_protein_goal: Mapped[float | None] = mapped_column()
    daily_fat_goal: Mapped[float | None] = mapped_column()
    daily_carb_goal: Mapped[float | None] = mapped_column()
    daily_water_goal_ml: Mapped[int | None] = mapped_column()
    birth_year: Mapped[int | None] = mapped_column()
    sex: Mapped[str | None] = mapped_column(String(10))
    activity_level: Mapped[str | None] = mapped_column(String(20))
    goal_type: Mapped[str | None] = mapped_column(String(20))

    # Weight goals
    current_weight: Mapped[float | None] = mapped_column()  # kg
    target_weight: Mapped[float | None] = mapped_column()  # kg
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    preferred_language: Mapped[str | None] = mapped_column(String(5))
    telegram_user_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)
    height: Mapped[float | None] = mapped_column()  # cm

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now(), onupdate=python_now)

    # Relationships — lazy="noload" to avoid circular loading, use explicit queries
    diary_entries = relationship("DiaryEntry", back_populates="user", lazy="noload")
    meals = relationship("Meal", back_populates="user", lazy="noload")
