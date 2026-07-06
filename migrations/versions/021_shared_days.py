"""shared_days table (persist public share links)

Revision ID: 021
Revises: 020
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "shared_days" not in inspect(bind).get_table_names():
        op.create_table(
            "shared_days",
            sa.Column("share_id", sa.String(16), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("payload", postgresql.JSONB(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )


def downgrade() -> None:
    op.drop_table("shared_days")
