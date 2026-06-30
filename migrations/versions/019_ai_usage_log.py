"""Add ai_usage_log + ai_cache tables.

Revision ID: 019
Revises: 018
Create Date: 2026-06-30
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "019"
down_revision: Union[str, None] = "018"


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "ai_usage_log" not in tables:
        op.create_table(
            "ai_usage_log",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("endpoint", sa.String(128), nullable=False, index=True),
            sa.Column("model", sa.String(64), nullable=False),
            sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
    if "ai_cache" not in tables:
        op.create_table(
            "ai_cache",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("cache_key", sa.String(128), unique=True, nullable=False, index=True),
            sa.Column("endpoint", sa.String(64), nullable=False),
            sa.Column("response_json", postgresql.JSONB(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table("ai_cache")
    op.drop_table("ai_usage_log")
