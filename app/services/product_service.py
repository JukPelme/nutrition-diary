from uuid import UUID
from sqlalchemy import select, func, or_, desc, case
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


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
        # Use trigram similarity for fuzzy search
        similarity = func.similarity(Product.name, q)
        query = query.where(
            or_(
                Product.name.ilike(f"%{q}%"),
                similarity > 0.1,
            )
        ).order_by(
            # Verified products first (USDA, lab data)
            desc(Product.is_verified),
            # Then by relevance
            similarity.desc(),
        )
        count_query = count_query.where(
            or_(
                Product.name.ilike(f"%{q}%"),
                similarity > 0.1,
            )
        )
    else:
        # Default: verified first, then by name
        query = query.order_by(desc(Product.is_verified), Product.name)

    if category:
        query = query.where(Product.category == category)
        count_query = count_query.where(Product.category == category)

    total = (await db.execute(count_query)).scalar() or 0
    results = (await db.execute(query.offset(offset).limit(limit))).scalars().all()

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
