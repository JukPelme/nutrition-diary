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



from fastapi import UploadFile, File, status as fa_status
from app.services.food_recognition_service import settings as _settings
import base64, httpx, re as _re


@router.post("/decode-image")
async def decode_barcode_image(
    file: UploadFile = File(..., description="Photo of a barcode"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fallback when phone camera fails the live scan: user uploads a photo,
    Claude Vision reads the barcode digits, then we look up the product."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Image required")
    img = await file.read()
    if len(img) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image too large (max 10MB)")

    api_key = _settings.anthropic_api_key
    if not api_key:
        raise HTTPException(503, "Image decoding requires ANTHROPIC_API_KEY")

    b64 = base64.b64encode(img).decode("utf-8")
    prompt = "На изображении штрихкод. Верни ТОЛЬКО его цифры одной строкой, без пробелов и пояснений. Если штрихкод не найден или не читается — верни одно слово NONE."
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 50,
                    "messages": [{"role": "user", "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": file.content_type, "data": b64}},
                        {"type": "text", "text": prompt},
                    ]}],
                },
            )
            if r.status_code >= 400:
                return {"barcode": None, "raw": None, "product": None,
                        "error": f"Vision API error: {r.status_code} {r.text[:150]}"}
            text = r.json()["content"][0]["text"].strip()
        except Exception as e:
            return {"barcode": None, "raw": None, "product": None, "error": f"Vision call failed: {e}"}
    digits = _re.sub(r"\D+", "", text)
    if not digits or len(digits) < 6:
        return {"barcode": None, "raw": text, "product": None}

    # Try to find product by exact match (existing /barcode/{code} logic reused)
    from app.models.product import Product
    from sqlalchemy import select as _select
    p = (await db.execute(_select(Product).where(Product.barcode == digits))).scalar_one_or_none()
    return {
        "barcode": digits,
        "raw": text,
        "product": (
            {"id": str(p.id), "name": p.name, "calories": p.calories, "protein": p.protein, "fat": p.fat, "carbohydrates": p.carbohydrates}
            if p else None
        ),
    }
