"""Add achievements + user_achievements tables

Revision ID: 015
Revises: 014
Create Date: 2026-06-29
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "015"
down_revision: Union[str, None] = "014"


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(inspect(bind).get_table_names())
    if "achievements" not in tables:
        op.create_table(
            "achievements",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("code", sa.String(64), unique=True, nullable=False),
            sa.Column("kind", sa.String(32), nullable=False),  # streak/count/feature/special
            sa.Column("name_ru", sa.String(255), nullable=False),
            sa.Column("name_en", sa.String(255), nullable=False),
            sa.Column("name_ja", sa.String(255), nullable=False),
            sa.Column("desc_ru", sa.Text(), nullable=False),
            sa.Column("desc_en", sa.Text(), nullable=False),
            sa.Column("desc_ja", sa.Text(), nullable=False),
            sa.Column("icon", sa.String(10), nullable=False),
            sa.Column("threshold", sa.Integer()),
            sa.Column("sort_order", sa.Integer(), server_default="0"),
        )
    if "user_achievements" not in tables:
        op.create_table(
            "user_achievements",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("achievement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
        )


def downgrade() -> None:
    op.drop_table("user_achievements")
    op.drop_table("achievements")
