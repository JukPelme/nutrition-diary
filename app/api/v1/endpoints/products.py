from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.services import product_service
from app.services.barcode_service import search_and_save_off
from app.core.deps import ai_limit

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductResponse])
async def list_products(
    q: str | None = Query(None, description="Search query (fuzzy)"),
    category: str | None = Query(None),
    barcode: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    products, total = await product_service.search_products(db, q=q, category=category, barcode=barcode, limit=limit, offset=offset)
    return products


@router.get("/search-online", response_model=list[ProductResponse],
            dependencies=[Depends(ai_limit("offsearch", 40, 3600))])
async def search_online(
    q: str = Query(..., min_length=2, description="Product name to look up on OpenFoodFacts"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Explicit web lookup for products not in our catalog. Queries
    OpenFoodFacts, saves new matches locally (source=openfoodfacts), and
    returns them — reuses the same fetch as the auto-fallback but on demand,
    so specific-brand searches aren't crowded out by weak local matches."""
    try:
        products = await search_and_save_off(db, q, limit=8)
    except Exception:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Online lookup is temporarily unavailable")
    return products


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = await product_service.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await product_service.create_product(db, data)


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = await product_service.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return await product_service.update_product(db, product, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    product = await product_service.get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    await product_service.delete_product(db, product)
