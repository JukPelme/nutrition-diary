"""user timezone (IANA) for local 'today'

Adds users.timezone so streaks / daily quests / day summaries use the user's
local calendar day instead of the server's UTC day. NULL → UTC.

Revision ID: 026
Revises: 025
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "timezone" not in cols:
        op.add_column("users", sa.Column("timezone", sa.String(64), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("users")}
    if "timezone" in cols:
        op.drop_column("users", "timezone")
