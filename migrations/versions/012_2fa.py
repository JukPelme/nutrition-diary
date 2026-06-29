"""Add TOTP 2FA fields

Revision ID: 012
Revises: 011
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "totp_secret" not in cols:
        op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    if "totp_enabled" not in cols:
        op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
