from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import ProductResponse
from app.services.barcode_service import lookup_barcode

router = APIRouter(prefix="/barcode", tags=["barcode"])


@router.get("/{barcode}", response_model=ProductResponse)
async def scan_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Scan barcode: checks local DB, then Open Food Facts API."""
    product = await lookup_barcode(db, barcode)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found for this barcode",
        )
    return product
