import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.compat import UUIDType, server_now


class WaterEntry(Base):
    """Single drink intake (water, tea, coffee, juice, etc.)."""
    __tablename__ = "water_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_ml: Mapped[int] = mapped_column(Integer, nullable=False)
    drink_type: Mapped[str] = mapped_column(String(20), nullable=False, default="water")
    drunk_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    # Set when this drink was auto-logged from a food diary entry (milk, juice,
    # etc.). ON DELETE CASCADE: removing the food entry removes the linked water.
    source_diary_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType, ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())

    user = relationship("User")
