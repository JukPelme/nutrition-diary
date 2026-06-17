from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


DRINK_TYPES = {"water", "tea", "coffee", "juice", "milk", "other"}


class WaterCreate(BaseModel):
    amount_ml: int = Field(ge=10, le=5000)
    drink_type: str = Field(default="water", pattern="^(water|tea|coffee|juice|milk|other)$")
    drunk_at: datetime | None = None
    notes: str | None = None


class WaterEntryOut(BaseModel):
    id: UUID
    amount_ml: int
    drink_type: str
    drunk_at: datetime
    notes: str | None
    model_config = {"from_attributes": True}


class WaterGoalUpdate(BaseModel):
    daily_water_goal_ml: int | None = Field(default=None, ge=200, le=10000)


class WaterGoalOut(BaseModel):
    daily_water_goal_ml: int
    is_auto: bool  # True if computed from weight, False if user override
    source_weight_kg: float | None
