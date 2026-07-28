"""composite index on diary_entries(user_id, entry_date)

The hottest query in the app (get_entries_by_date / get_recent_days) filters by
user_id AND entry_date. Two independent single-column indexes force Postgres to
pick one and filter the rest; a single composite index serves the pair directly.

Revision ID: 024
Revises: 023
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_diary_user_date"


def upgrade() -> None:
    bind = op.get_bind()
    existing = {ix["name"] for ix in inspect(bind).get_indexes("diary_entries")}
    if INDEX_NAME not in existing:
        op.create_index(INDEX_NAME, "diary_entries", ["user_id", "entry_date"])


def downgrade() -> None:
    bind = op.get_bind()
    existing = {ix["name"] for ix in inspect(bind).get_indexes("diary_entries")}
    if INDEX_NAME in existing:
        op.drop_index(INDEX_NAME, table_name="diary_entries")
