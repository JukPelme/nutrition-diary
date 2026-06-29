"""Add users.nutrient_goals (JSON)

Revision ID: 017
Revises: 016
Create Date: 2026-06-29
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "017"
down_revision: Union[str, None] = "016"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "nutrient_goals" not in cols:
        op.add_column("users", sa.Column("nutrient_goals", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "nutrient_goals")
