"""Add push_subscriptions table

Revision ID: 013
Revises: 012
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "013"
down_revision: Union[str, None] = "012"


def upgrade() -> None:
    bind = op.get_bind()
    if "push_subscriptions" not in set(inspect(bind).get_table_names()):
        op.create_table(
            "push_subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("endpoint", sa.Text(), nullable=False),
            sa.Column("p256dh", sa.Text(), nullable=False),
            sa.Column("auth", sa.Text(), nullable=False),
            sa.Column("user_agent", sa.String(500)),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_index("ix_push_endpoint", "push_subscriptions", ["endpoint"], unique=True)

    # vapid_keys stored in meta-like single-row config table
    if "app_config" not in set(inspect(bind).get_table_names()):
        op.create_table(
            "app_config",
            sa.Column("key", sa.String(64), primary_key=True),
            sa.Column("value", sa.Text(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("app_config")
    op.drop_index("ix_push_endpoint", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
