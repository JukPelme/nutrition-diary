"""Add user xp/level columns + daily_quests table.

Revision ID: 018
Revises: 017
Create Date: 2026-06-30
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "018"
down_revision: Union[str, None] = "017"


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "xp" not in cols:
        op.add_column("users", sa.Column("xp", sa.Integer(), server_default="0", nullable=False))
    if "level" not in cols:
        op.add_column("users", sa.Column("level", sa.Integer(), server_default="1", nullable=False))

    tables = set(inspect(bind).get_table_names())
    if "daily_quests" not in tables:
        op.create_table(
            "daily_quests",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("quest_date", sa.Date(), nullable=False, index=True),
            sa.Column("code", sa.String(64), nullable=False),  # e.g. "try_new_product", "hit_protein", "drink_water"
            sa.Column("title_ru", sa.String(255), nullable=False),
            sa.Column("title_en", sa.String(255), nullable=False),
            sa.Column("title_ja", sa.String(255), nullable=False),
            sa.Column("xp_reward", sa.Integer(), nullable=False, server_default="20"),
            sa.Column("completed_at", sa.DateTime(timezone=True)),
            sa.UniqueConstraint("user_id", "quest_date", "code", name="uq_user_quest_day"),
        )


def downgrade() -> None:
    op.drop_table("daily_quests")
    op.drop_column("users", "level")
    op.drop_column("users", "xp")
