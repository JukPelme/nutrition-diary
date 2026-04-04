import uuid
from datetime import datetime
from sqlalchemy import String, Float, DateTime, Text, Index
from app.db.compat import UUIDType, JSONType, server_now
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    
    # Identification
    name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    brand: Mapped[str | None] = mapped_column(String(255))
    barcode: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    category: Mapped[str | None] = mapped_column(String(255), index=True)
    
    # Source tracking
    source: Mapped[str] = mapped_column(String(50), default="manual")  # manual, openfoodfacts, usda, custom
    source_id: Mapped[str | None] = mapped_column(String(255))
    
    # Serving info
    serving_size: Mapped[float] = mapped_column(Float, default=100.0)  # grams
    serving_unit: Mapped[str] = mapped_column(String(20), default="g")
    
    # Core macros (per 100g)
    calories: Mapped[float | None] = mapped_column(Float)
    protein: Mapped[float | None] = mapped_column(Float)
    fat: Mapped[float | None] = mapped_column(Float)
    carbohydrates: Mapped[float | None] = mapped_column(Float)
    fiber: Mapped[float | None] = mapped_column(Float)
    sugar: Mapped[float | None] = mapped_column(Float)
    
    # Extended nutrients (JSONB for flexibility)
    # Structure: {"vitamin_a": 900, "vitamin_c": 45, "iron": 8, "calcium": 1000, ...}
    vitamins: Mapped[dict | None] = mapped_column(JSONType)
    minerals: Mapped[dict | None] = mapped_column(JSONType)
    
    # Additional info
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_verified: Mapped[bool] = mapped_column(default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=server_now(), onupdate=server_now())

    __table_args__ = (
        Index("ix_products_name_trgm", "name", postgresql_using="gin",
              postgresql_ops={"name": "gin_trgm_ops"}),
    )
