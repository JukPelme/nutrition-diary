"""Add fasting sessions and mood entries

Revision ID: 004
Revises: 003
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())

    if "fasting_sessions" not in existing:
        op.create_table(
            "fasting_sessions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("plan_type", sa.String(20), nullable=False),
            sa.Column("fasting_hours", sa.Float(), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("target_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("ended_at", sa.DateTime(timezone=True)),
            sa.Column("completed", sa.Boolean()),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "mood_entries" not in existing:
        op.create_table(
            "mood_entries",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("date", sa.String(10), nullable=False),
            sa.Column("mood", sa.Integer(), nullable=False),
            sa.Column("energy", sa.Integer()),
            sa.Column("sleep_hours", sa.Float()),
            sa.Column("notes", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "date", name="uq_mood_user_date"),
        )


def downgrade() -> None:
    op.drop_table("mood_entries")
    op.drop_table("fasting_sessions")
