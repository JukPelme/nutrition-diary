from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.food_recognition_service import recognize_food

router = APIRouter(prefix="/food-scan", tags=["food-scan"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("")
async def scan_food_photo(
    file: UploadFile = File(..., description="Food photo (JPEG, PNG, WebP)"),
    _: User = Depends(get_current_user),
):
    """
    Upload a food photo and get AI-powered recognition with estimated KBJU.
    
    Returns identified foods with nutritional estimates.
    The mobile app can then let the user confirm/adjust and add to diary.
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported image type: {file.content_type}. Use JPEG, PNG, or WebP.",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image too large. Max 10MB.",
        )

    result = await recognize_food(image_bytes, file.content_type)

    return {
        "provider": result.get("provider"),
        "foods": result.get("foods", []),
        "total_calories": result.get("total_calories", 0),
        "description": result.get("description", ""),
        "error": result.get("error"),
    }
