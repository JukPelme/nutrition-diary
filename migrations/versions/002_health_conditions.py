"""Add ICD-11 conditions and user health profile

Revision ID: 002
Revises: 001
Create Date: 2026-04-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "icd11_conditions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(20), unique=True, nullable=False, index=True),
        sa.Column("name_en", sa.String(500), nullable=False),
        sa.Column("name_ru", sa.String(500)),
        sa.Column("category", sa.String(255), index=True),
        sa.Column("description", sa.Text()),
        sa.Column("dietary_rules", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "user_conditions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("condition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("icd11_conditions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("severity", sa.String(20)),
        sa.Column("diagnosed_at", sa.String(20)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "condition_id", name="uq_user_condition"),
    )


def downgrade() -> None:
    op.drop_table("user_conditions")
    op.drop_table("icd11_conditions")
