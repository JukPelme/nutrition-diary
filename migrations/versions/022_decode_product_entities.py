"""decode HTML entities in existing product names/brands/categories

Crowdsourced OpenFoodFacts products were saved with raw HTML entities
(e.g. 'Макароны ... &quot;Добродея&quot;'), which display broken and corrupt
the inline onclick JSON on the client. Backfill: decode entities + strip tags.

Revision ID: 022
Revises: 021
"""
import html
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _clean(v):
    if not isinstance(v, str):
        return v
    v = html.unescape(v)
    v = v.replace("<", "").replace(">", "")
    return " ".join(v.split()).strip()


def upgrade() -> None:
    bind = op.get_bind()
    products = sa.table(
        "products",
        sa.column("id"),
        sa.column("name", sa.String),
        sa.column("brand", sa.String),
        sa.column("category", sa.String),
    )
    rows = bind.execute(
        sa.select(products.c.id, products.c.name, products.c.brand, products.c.category).where(
            sa.or_(
                products.c.name.like("%&%;%"),
                products.c.name.like("%<%"),
                products.c.name.like("%>%"),
                products.c.brand.like("%&%;%"),
                products.c.category.like("%&%;%"),
            )
        )
    ).fetchall()

    for row in rows:
        new = {
            "name": _clean(row.name),
            "brand": _clean(row.brand),
            "category": _clean(row.category),
        }
        if (new["name"], new["brand"], new["category"]) == (row.name, row.brand, row.category):
            continue
        bind.execute(products.update().where(products.c.id == row.id).values(**new))


def downgrade() -> None:
    # Irreversible: original entity-encoded strings are not recoverable.
    pass
