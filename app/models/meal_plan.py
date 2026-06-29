import uuid
from datetime import date, datetime
from sqlalchemy import String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.db.compat import UUIDType, JSONType, server_now


class MealPlan(Base):
    __tablename__ = "meal_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    lang: Mapped[str] = mapped_column(String(5), nullable=False, default="ru", server_default="ru")
    model_used: Mapped[str | None] = mapped_column(String(64))
    plan_json: Mapped[dict] = mapped_column(JSONType, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now(), index=True)
