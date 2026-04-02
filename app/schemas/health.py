from pydantic import BaseModel


class ConditionResponse(BaseModel):
    id: str
    code: str
    name_en: str
    name_ru: str | None
    category: str | None
    description: str | None
    dietary_rules: dict | None

    model_config = {"from_attributes": True}


class ConditionBrief(BaseModel):
    id: str
    code: str
    name_en: str
    name_ru: str | None
    category: str | None

    model_config = {"from_attributes": True}


class UserConditionAdd(BaseModel):
    condition_id: str
    severity: str | None = None  # mild, moderate, severe
    diagnosed_at: str | None = None
    notes: str | None = None


class UserConditionResponse(BaseModel):
    id: str
    condition: ConditionBrief
    severity: str | None
    diagnosed_at: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class DietaryRecommendation(BaseModel):
    restrict: dict  # nutrient -> max value
    increase: dict  # nutrient -> min value
    avoid: list[str]  # food categories to avoid
    prefer: list[str]  # recommended food categories
    calorie_adjustment: int  # kcal adjustment from base
    macro_ratio: dict | None  # target macro split
    conditions: list[str]  # which conditions drive each rule
