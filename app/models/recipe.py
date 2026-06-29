import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.compat import UUIDType, server_now


class Recipe(Base):
    __tablename__ = "recipes"
    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    total_weight_g: Mapped[float] = mapped_column(Float, nullable=False)
    servings: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())
    ingredients = relationship("RecipeIngredient", cascade="all, delete-orphan", lazy="selectin")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"
    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUIDType, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(500), nullable=False)
    amount_g: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
