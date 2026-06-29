"""Add recipes + recipe_ingredients tables

Revision ID: 011
Revises: 010
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    if "recipes" not in existing:
        op.create_table(
            "recipes",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text()),
            sa.Column("total_weight_g", sa.Float(), nullable=False),  # cooked weight, for per-100g math
            sa.Column("servings", sa.Integer(), default=1),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "recipe_ingredients" not in existing:
        op.create_table(
            "recipe_ingredients",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
            sa.Column("product_name", sa.String(500), nullable=False),
            sa.Column("amount_g", sa.Float(), nullable=False),
            sa.Column("sort_order", sa.Integer(), default=0),
        )


def downgrade() -> None:
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")
