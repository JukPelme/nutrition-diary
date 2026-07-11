"""link auto-logged drinks to their source food diary entry

Adds water_entries.source_diary_entry_id so drinks logged from food (milk,
juice, ...) can be tied to the diary entry and removed with it.

Revision ID: 023
Revises: 022
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns("water_entries")}
    if "source_diary_entry_id" not in cols:
        op.add_column(
            "water_entries",
            sa.Column(
                "source_diary_entry_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("diary_entries.id", ondelete="CASCADE"),
                nullable=True,
            ),
        )
        op.create_index(
            "ix_water_entries_source_diary_entry_id",
            "water_entries",
            ["source_diary_entry_id"],
        )


def downgrade() -> None:
    op.drop_index("ix_water_entries_source_diary_entry_id", table_name="water_entries")
    op.drop_column("water_entries", "source_diary_entry_id")
