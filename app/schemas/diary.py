from __future__ import annotations
from datetime import date
from pydantic import BaseModel


class MealCreate(BaseModel):
    name: str
    icon: str | None = None
    sort_order: int = 0


class MealUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    sort_order: int | None = None


class MealResponse(BaseModel):
    id: str
    name: str
    icon: str | None
    sort_order: int
    is_default: bool

    model_config = {"from_attributes": True}


class DiaryEntryCreate(BaseModel):
    meal_id: str | None = None
    product_id: str | None = None
    entry_date: date
    product_name: str
    serving_amount: float  # grams
    calories: float = 0
    protein: float = 0
    fat: float = 0
    carbohydrates: float = 0


class DiaryEntryUpdate(BaseModel):
    meal_id: str | None = None
    serving_amount: float | None = None
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None


class DiaryEntryResponse(BaseModel):
    id: str
    meal_id: str | None
    product_id: str | None
    entry_date: date
    product_name: str
    serving_amount: float
    calories: float
    protein: float
    fat: float
    carbohydrates: float

    model_config = {"from_attributes": True}


class MealWithEntries(BaseModel):
    meal: MealResponse
    entries: list[DiaryEntryResponse]
    subtotal_calories: float
    subtotal_protein: float
    subtotal_fat: float
    subtotal_carbohydrates: float


class DailySummary(BaseModel):
    date: date
    total_calories: float
    total_protein: float
    total_fat: float
    total_carbohydrates: float
    entries_count: int
    meals: list[MealWithEntries] | None = None
