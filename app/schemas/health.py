from uuid import UUID
from pydantic import BaseModel


class ConditionResponse(BaseModel):
    id: UUID
    code: str
    name_en: str
    name_ru: str | None
    category: str | None
    description: str | None
    dietary_rules: dict | None

    model_config = {"from_attributes": True}


class ConditionBrief(BaseModel):
    id: UUID
    code: str
    name_en: str
    name_ru: str | None
    category: str | None

    model_config = {"from_attributes": True}


class UserConditionAdd(BaseModel):
    condition_id: str
    severity: str | None = None
    diagnosed_at: str | None = None
    notes: str | None = None


class UserConditionResponse(BaseModel):
    id: UUID
    condition: ConditionBrief
    severity: str | None
    diagnosed_at: str | None
    notes: str | None

    model_config = {"from_attributes": True}
