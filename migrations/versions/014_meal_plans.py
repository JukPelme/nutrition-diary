"""Add meal_plans table

Revision ID: 014
Revises: 013
Create Date: 2026-06-29
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "014"
down_revision: Union[str, None] = "013"


def upgrade() -> None:
    bind = op.get_bind()
    if "meal_plans" not in set(inspect(bind).get_table_names()):
        op.create_table(
            "meal_plans",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("lang", sa.String(5), nullable=False, server_default="ru"),
            sa.Column("model_used", sa.String(64)),
            sa.Column("plan_json", postgresql.JSONB(), nullable=False),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_meal_plans_user_dates", "meal_plans", ["user_id", "start_date"])


def downgrade() -> None:
    op.drop_index("ix_meal_plans_user_dates", table_name="meal_plans")
    op.drop_table("meal_plans")
