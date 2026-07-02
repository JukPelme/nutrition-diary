"""Add users.waist_cm + users.body_fat_pct

Revision ID: 020
Revises: 019
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "020"
down_revision: Union[str, None] = "019"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "waist_cm" not in cols:
        op.add_column("users", sa.Column("waist_cm", sa.Float(), nullable=True))
    if "body_fat_pct" not in cols:
        op.add_column("users", sa.Column("body_fat_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "body_fat_pct")
    op.drop_column("users", "waist_cm")
