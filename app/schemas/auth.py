from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, AliasChoices


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    username: str | None = None


class UserLogin(BaseModel):
    # Accepts either "login" or "email" in request body
    login: str = Field(validation_alias=AliasChoices("login", "email"))
    password: str
    totp_code: str | None = None
    model_config = {"populate_by_name": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str | None = None
    full_name: str | None
    is_active: bool
    daily_calorie_goal: int | None
    daily_protein_goal: float | None
    daily_fat_goal: float | None
    daily_carb_goal: float | None
    current_weight: float | None = None
    target_weight: float | None = None
    height: float | None = None
    birth_year: int | None = None
    sex: str | None = None
    activity_level: str | None = None
    goal_type: str | None = None
    preferred_language: str | None = None
    totp_enabled: bool = False
    dietary_restrictions: str | None = None
    seasonal_hints_enabled: bool = True
    nutrient_goals: dict | None = None
    waist_cm: float | None = None
    body_fat_pct: float | None = None
    is_superuser: bool = False

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    username: str | None = None
    preferred_language: str | None = None
    birth_year: int | None = None
    sex: str | None = None
    activity_level: str | None = None
    goal_type: str | None = None
    daily_calorie_goal: int | None = None
    daily_protein_goal: float | None = None
    daily_fat_goal: float | None = None
    daily_carb_goal: float | None = None
    current_weight: float | None = None
    target_weight: float | None = None
    height: float | None = None
    dietary_restrictions: str | None = None
    seasonal_hints_enabled: bool | None = None
    nutrient_goals: dict | None = None
    waist_cm: float | None = None
    body_fat_pct: float | None = None


class RecoverUsernameIn(BaseModel):
    email: EmailStr
    password: str


class RecoverUsernameOut(BaseModel):
    email: str
    username: str | None
    full_name: str | None
