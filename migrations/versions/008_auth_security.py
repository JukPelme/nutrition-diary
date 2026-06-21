"""Auth security: login_events audit log + account lockout fields

Revision ID: 008
Revises: 007
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(inspect(bind).get_table_names())
    if "login_events" not in existing:
        op.create_table(
            "login_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("identifier", sa.String(255), nullable=False),  # email or username from request
            sa.Column("ip", sa.String(45)),
            sa.Column("user_agent", sa.String(500)),
            sa.Column("status", sa.String(20), nullable=False),  # success | failed | locked
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )
        op.create_index("ix_login_events_user_created", "login_events", ["user_id", "created_at"])

    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "failed_login_count" not in cols:
        op.add_column("users", sa.Column("failed_login_count", sa.Integer(), server_default="0", nullable=False))
    if "locked_until" not in cols:
        op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "locked_until")
    op.drop_column("users", "failed_login_count")
    op.drop_index("ix_login_events_user_created", table_name="login_events")
    op.drop_table("login_events")
