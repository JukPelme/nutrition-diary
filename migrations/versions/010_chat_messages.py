"""Add chat_messages table for AI chat history

Revision ID: 010
Revises: 009
Create Date: 2026-06-28
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "010"
down_revision: Union[str, None] = "009"


def upgrade() -> None:
    bind = op.get_bind()
    if "chat_messages" not in set(inspect(bind).get_table_names()):
        op.create_table(
            "chat_messages",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
        op.create_index("ix_chat_user_created", "chat_messages", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_user_created", table_name="chat_messages")
    op.drop_table("chat_messages")
