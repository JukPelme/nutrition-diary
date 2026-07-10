from uuid import UUID
from sqlalchemy import select, func, or_, desc, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.db.compat import is_sqlite
from app.services.barcode_service import search_and_save_off


async def search_products(
    db: AsyncSession,
    q: str | None = None,
    category: str | None = None,
    barcode: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Product], int]:
    query = select(Product)
    count_query = select(func.count()).select_from(Product)

    if barcode:
        query = query.where(Product.barcode == barcode)
        count_query = count_query.where(Product.barcode == barcode)
    elif q:
        # Relevance score (both dialects): exact name match ranks above prefix,
        # prefix above substring, and anything only caught by fuzzy trigram last.
        # func.lower is unicode-aware on both PG (native) and SQLite (custom fn),
        # so Cyrillic is matched case-insensitively.
        ql = q.lower()
        name_l = func.lower(Product.name)
        like_esc = ql.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        relevance = case(
            (name_l == ql, 3),
            (name_l.like(f"{like_esc}%", escape="\\"), 2),
            (name_l.like(f"%{like_esc}%", escape="\\"), 1),
            else_=0,
        )
        if is_sqlite():
            # SQLite: custom contains_ci() for unicode case-insensitive containment.
            ci_filter = func.contains_ci(Product.name, q) == 1
            query = query.where(ci_filter).order_by(
                relevance.desc(),
                desc(Product.is_verified),
                Product.name,
            )
            count_query = count_query.where(ci_filter)
        else:
            # PostgreSQL: substring match OR fuzzy trigram (threshold raised
            # 0.1 -> 0.3 so weak, semantically-unrelated matches don't leak in).
            similarity = func.similarity(Product.name, q)
            match_filter = or_(
                Product.name.ilike(f"%{q}%"),
                similarity > 0.3,
            )
            query = query.where(match_filter).order_by(
                relevance.desc(),
                desc(Product.is_verified),
                similarity.desc(),
                Product.name,
            )
            count_query = count_query.where(match_filter)
    else:
        query = query.order_by(desc(Product.is_verified), Product.name)

    if category:
        query = query.where(Product.category == category)
        count_query = count_query.where(Product.category == category)

    total = (await db.execute(count_query)).scalar() or 0
    results = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

    # If few local results and there's a search query, try OpenFoodFacts
    if q and len(results) < limit and offset == 0:
        try:
            off_products = await search_and_save_off(db, q, limit=limit - len(results))
            if off_products:
                results = list(results) + off_products
                total += len(off_products)
        except Exception:
            pass  # OFF unavailable, return local results only

    return results, total


async def get_product(db: AsyncSession, product_id: UUID) -> Product | None:
    result = await db.execute(select(Product).where(Product.id == product_id))
    return result.scalar_one_or_none()


async def create_product(db: AsyncSession, data: ProductCreate) -> Product:
    product = Product(**data.model_dump(exclude_none=True))
    db.add(product)
    await db.flush()
    return product


async def update_product(db: AsyncSession, product: Product, data: ProductUpdate) -> Product:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await db.flush()
    return product


async def delete_product(db: AsyncSession, product: Product) -> None:
    await db.delete(product)
    await db.flush()
