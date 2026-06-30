import uuid
from datetime import date, datetime
from sqlalchemy import String, Integer, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.db.compat import UUIDType


class DailyQuest(Base):
    __tablename__ = "daily_quests"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    quest_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    title_ru: Mapped[str] = mapped_column(String(255), nullable=False)
    title_en: Mapped[str] = mapped_column(String(255), nullable=False)
    title_ja: Mapped[str] = mapped_column(String(255), nullable=False)
    xp_reward: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("user_id", "quest_date", "code", name="uq_user_quest_day"),
    )
