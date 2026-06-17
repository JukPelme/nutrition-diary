"""Add anthropometric fields for auto-calculated nutrition goals

Revision ID: 007
Revises: 006
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "birth_year" not in cols:
        op.add_column("users", sa.Column("birth_year", sa.Integer(), nullable=True))
    if "sex" not in cols:
        op.add_column("users", sa.Column("sex", sa.String(10), nullable=True))
    if "activity_level" not in cols:
        op.add_column("users", sa.Column("activity_level", sa.String(20), nullable=True))
    if "goal_type" not in cols:
        op.add_column("users", sa.Column("goal_type", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "goal_type")
    op.drop_column("users", "activity_level")
    op.drop_column("users", "sex")
    op.drop_column("users", "birth_year")
