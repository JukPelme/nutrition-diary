"""Streaks + achievements endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.gamification import (
    get_streak,
    check_and_award,
    get_user_achievements,
)

router = APIRouter(prefix="/gamification", tags=["gamification"])


@router.get("/streak")
async def streak(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_streak(db, user)


@router.get("/achievements")
async def achievements(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_user_achievements(db, user)


@router.post("/check")
async def check(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    new_codes = await check_and_award(db, user)
    return {"new": new_codes}


from pydantic import BaseModel, Field
from app.services.gamification import award_feature_use


class AwardIn(BaseModel):
    feature: str = Field(pattern="^(photo|barcode|voice)$")


@router.post("/award")
async def award(
    data: AwardIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    code = await award_feature_use(db, user, data.feature)
    return {"new": [code] if code else []}

