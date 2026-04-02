from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.health import ConditionResponse, ConditionBrief, UserConditionAdd, UserConditionResponse
from app.services import health_service

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/conditions", response_model=list[ConditionBrief])
async def list_conditions(
    q: str | None = Query(None, description="Search by name or ICD code"),
    category: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search ICD-11 conditions."""
    return await health_service.get_conditions(db, query=q, category=category, limit=limit, offset=offset)


@router.get("/conditions/{code}", response_model=ConditionResponse)
async def get_condition_detail(
    code: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Get condition details with dietary rules."""
    from sqlalchemy import select
    from app.models.health import ICD11Condition
    result = await db.execute(select(ICD11Condition).where(ICD11Condition.code == code))
    cond = result.scalar_one_or_none()
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condition not found")
    return cond


@router.get("/profile")
async def get_health_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get user's conditions and merged dietary recommendations."""
    conditions = await health_service.get_user_conditions(db, user.id)
    recommendations = await health_service.get_merged_recommendations(db, user.id)

    return {
        "conditions": [
            {
                "id": str(uc.id),
                "code": uc.condition.code,
                "name": uc.condition.name_ru or uc.condition.name_en,
                "severity": uc.severity,
            }
            for uc in conditions
        ],
        "recommendations": recommendations,
    }


@router.post("/profile/conditions", status_code=status.HTTP_201_CREATED)
async def add_condition(
    data: UserConditionAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a condition to user's health profile."""
    uc = await health_service.add_user_condition(
        db, user.id, UUID(data.condition_id),
        severity=data.severity, diagnosed_at=data.diagnosed_at, notes=data.notes,
    )
    return {
        "id": str(uc.id),
        "condition": {
            "code": uc.condition.code,
            "name": uc.condition.name_ru or uc.condition.name_en,
        },
        "severity": uc.severity,
    }


@router.delete("/profile/conditions/{condition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_condition(
    condition_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a condition from user's health profile."""
    removed = await health_service.remove_user_condition(db, condition_id, user.id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condition not found in profile")
