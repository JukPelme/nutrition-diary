"""Initial schema: users, products, meals, diary_entries

Revision ID: 001
Revises: 
Create Date: 2026-04-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pg_trgm for fuzzy search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_superuser", sa.Boolean(), default=False),
        sa.Column("daily_calorie_goal", sa.Integer()),
        sa.Column("daily_protein_goal", sa.Float()),
        sa.Column("daily_fat_goal", sa.Float()),
        sa.Column("daily_carb_goal", sa.Float()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Products
    op.create_table(
        "products",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(500), nullable=False, index=True),
        sa.Column("brand", sa.String(255)),
        sa.Column("barcode", sa.String(50), unique=True, index=True),
        sa.Column("category", sa.String(255), index=True),
        sa.Column("source", sa.String(50), default="manual"),
        sa.Column("source_id", sa.String(255)),
        sa.Column("serving_size", sa.Float(), default=100.0),
        sa.Column("serving_unit", sa.String(20), default="g"),
        sa.Column("calories", sa.Float()),
        sa.Column("protein", sa.Float()),
        sa.Column("fat", sa.Float()),
        sa.Column("carbohydrates", sa.Float()),
        sa.Column("fiber", sa.Float()),
        sa.Column("sugar", sa.Float()),
        sa.Column("vitamins", postgresql.JSONB()),
        sa.Column("minerals", postgresql.JSONB()),
        sa.Column("description", sa.Text()),
        sa.Column("image_url", sa.String(500)),
        sa.Column("is_verified", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Trigram index for fuzzy product name search
    op.execute("CREATE INDEX ix_products_name_trgm ON products USING gin (name gin_trgm_ops)")

    # Meals (configurable per user)
    op.create_table(
        "meals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), default=0),
        sa.Column("icon", sa.String(10)),
        sa.Column("is_default", sa.Boolean(), default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_meal_user_name"),
    )

    # Diary entries
    op.create_table(
        "diary_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("meal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("meals.id", ondelete="SET NULL")),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL")),
        sa.Column("entry_date", sa.Date(), nullable=False, index=True),
        sa.Column("product_name", sa.String(500), nullable=False),
        sa.Column("serving_amount", sa.Float(), nullable=False),
        sa.Column("calories", sa.Float(), default=0),
        sa.Column("protein", sa.Float(), default=0),
        sa.Column("fat", sa.Float(), default=0),
        sa.Column("carbohydrates", sa.Float(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("diary_entries")
    op.drop_table("meals")
    op.drop_table("products")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
