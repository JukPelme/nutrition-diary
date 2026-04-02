from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.diary import DiaryEntryCreate, DiaryEntryUpdate, DiaryEntryResponse
from app.services import diary_service

router = APIRouter(prefix="/diary", tags=["diary"])


@router.get("", response_model=list[DiaryEntryResponse])
async def get_diary_entries(
    entry_date: date = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await diary_service.get_entries_by_date(db, user.id, entry_date)


@router.get("/summary")
async def get_daily_summary(
    entry_date: date = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await diary_service.get_daily_summary(db, user.id, entry_date)


@router.post("", response_model=DiaryEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_diary_entry(
    data: DiaryEntryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await diary_service.create_entry(db, user.id, data)


@router.patch("/{entry_id}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_id: UUID,
    data: DiaryEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await diary_service.get_entry(db, entry_id, user.id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return await diary_service.update_entry(db, entry, data)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary_entry(
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await diary_service.get_entry(db, entry_id, user.id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    await diary_service.delete_entry(db, entry)
