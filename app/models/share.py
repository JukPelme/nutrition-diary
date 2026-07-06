import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.db.compat import UUIDType, JSONType, server_now


class SharedDay(Base):
    """Public shareable snapshot of a day's meals (was in-memory, lost on
    restart and unreachable across workers)."""
    __tablename__ = "shared_days"

    share_id: Mapped[str] = mapped_column(String(16), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now(), index=True)
