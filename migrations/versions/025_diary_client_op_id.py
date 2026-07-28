"""idempotency key for offline diary writes

Adds diary_entries.client_op_id + UNIQUE(user_id, client_op_id) so a replayed
offline write (lost response, background sync, second tab) cannot create a
duplicate entry. NULLs are distinct, so existing rows are unaffected.

Revision ID: 025
Revises: 024
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "uq_diary_user_op"


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    cols = {c["name"] for c in insp.get_columns("diary_entries")}
    if "client_op_id" not in cols:
        op.add_column("diary_entries", sa.Column("client_op_id", sa.String(64), nullable=True))
    uqs = {u["name"] for u in insp.get_unique_constraints("diary_entries")}
    if CONSTRAINT not in uqs:
        op.create_unique_constraint(CONSTRAINT, "diary_entries", ["user_id", "client_op_id"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    uqs = {u["name"] for u in insp.get_unique_constraints("diary_entries")}
    if CONSTRAINT in uqs:
        op.drop_constraint(CONSTRAINT, "diary_entries", type_="unique")
    cols = {c["name"] for c in insp.get_columns("diary_entries")}
    if "client_op_id" in cols:
        op.drop_column("diary_entries", "client_op_id")
