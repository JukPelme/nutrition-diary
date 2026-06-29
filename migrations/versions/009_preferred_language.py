"""Add preferred_language and telegram_user_id to users

Revision ID: 009
Revises: 008
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "preferred_language" not in cols:
        op.add_column("users", sa.Column("preferred_language", sa.String(5), nullable=True))
    if "telegram_user_id" not in cols:
        op.add_column("users", sa.Column("telegram_user_id", sa.BigInteger(), nullable=True))
        op.create_index("ix_users_telegram_user_id", "users", ["telegram_user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_telegram_user_id", table_name="users")
    op.drop_column("users", "telegram_user_id")
    op.drop_column("users", "preferred_language")
