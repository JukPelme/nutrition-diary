from uuid import UUID
from pydantic import BaseModel


class ProductCreate(BaseModel):
    name: str
    brand: str | None = None
    barcode: str | None = None
    category: str | None = None
    serving_size: float = 100.0
    serving_unit: str = "g"
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None
    fiber: float | None = None
    sugar: float | None = None
    vitamins: dict | None = None
    minerals: dict | None = None
    description: str | None = None
    image_url: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    barcode: str | None = None
    category: str | None = None
    serving_size: float | None = None
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None
    fiber: float | None = None
    sugar: float | None = None
    vitamins: dict | None = None
    minerals: dict | None = None


class ProductResponse(BaseModel):
    id: UUID
    name: str
    brand: str | None
    barcode: str | None
    category: str | None
    source: str
    serving_size: float
    serving_unit: str
    calories: float | None
    protein: float | None
    fat: float | None
    carbohydrates: float | None
    fiber: float | None
    sugar: float | None
    vitamins: dict | None
    minerals: dict | None
    image_url: str | None
    is_verified: bool

    model_config = {"from_attributes": True}
