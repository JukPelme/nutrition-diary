"""Add water_entries table

Revision ID: 006
Revises: 005
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    if "water_entries" not in existing:
        op.create_table(
            "water_entries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("amount_ml", sa.Integer(), nullable=False),
            sa.Column("drink_type", sa.String(20), nullable=False, server_default="water"),
            sa.Column("drunk_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_water_user_drunk", "water_entries", ["user_id", "drunk_at"])

    # daily_water_goal_ml on users (nullable; if null we compute from weight)
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "daily_water_goal_ml" not in cols:
        op.add_column("users", sa.Column("daily_water_goal_ml", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "daily_water_goal_ml")
    op.drop_index("ix_water_user_drunk", table_name="water_entries")
    op.drop_table("water_entries")
