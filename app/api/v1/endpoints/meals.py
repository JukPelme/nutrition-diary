from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.diary import MealCreate, MealUpdate, MealResponse
from app.services import diary_service

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("", response_model=list[MealResponse])
async def list_meals(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await diary_service.get_user_meals(db, user.id)


@router.post("", response_model=MealResponse, status_code=status.HTTP_201_CREATED)
async def create_meal(
    data: MealCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await diary_service.create_meal(db, user.id, name=data.name, icon=data.icon, sort_order=data.sort_order)
