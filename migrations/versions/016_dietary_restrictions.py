"""Add users.dietary_restrictions (free text) and users.seasonal_hints_enabled

Revision ID: 016
Revises: 015
Create Date: 2026-06-29
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "016"
down_revision: Union[str, None] = "015"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "dietary_restrictions" not in cols:
        op.add_column("users", sa.Column("dietary_restrictions", sa.Text(), nullable=True))
    if "seasonal_hints_enabled" not in cols:
        op.add_column("users", sa.Column("seasonal_hints_enabled", sa.Boolean(), server_default="true", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "seasonal_hints_enabled")
    op.drop_column("users", "dietary_restrictions")
