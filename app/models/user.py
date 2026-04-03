import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)

    # Profile settings
    daily_calorie_goal: Mapped[int | None] = mapped_column()
    daily_protein_goal: Mapped[float | None] = mapped_column()
    daily_fat_goal: Mapped[float | None] = mapped_column()
    daily_carb_goal: Mapped[float | None] = mapped_column()

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships — lazy="noload" to avoid circular loading, use explicit queries
    diary_entries = relationship("DiaryEntry", back_populates="user", lazy="noload")
    meals = relationship("Meal", back_populates="user", lazy="noload")
