from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import Meal
from app.schemas.auth import UserRegister, UserLogin, TokenResponse, TokenRefresh, UserResponse, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])

# Default meals created for new users
DEFAULT_MEALS = [
    {"name": "Завтрак", "icon": "🌅", "sort_order": 0},
    {"name": "Обед", "icon": "☀️", "sort_order": 1},
    {"name": "Ужин", "icon": "🌙", "sort_order": 2},
    {"name": "Перекус", "icon": "🍎", "sort_order": 3},
]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    # Check existing email
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Check existing username if provided
    if data.username:
        u_exists = await db.execute(select(User).where(User.username == data.username))
        if u_exists.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    # Create user
    try:
        user = User(
            email=data.email,
            username=data.username,
            hashed_password=hash_password(data.password),
            full_name=data.full_name,
        )
        db.add(user)
        await db.flush()

        # Create default meals
        for meal_data in DEFAULT_MEALS:
            db.add(Meal(user_id=user.id, is_default=True, **meal_data))

        await db.flush()
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    # Accept email or username in the same field
    if "@" in data.login:
        query = select(User).where(User.email == data.login)
    else:
        query = select(User).where(User.username == data.login)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: TokenRefresh, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.full_name is not None:
        current_user.full_name = data.full_name
    if data.daily_calorie_goal is not None:
        current_user.daily_calorie_goal = data.daily_calorie_goal
    if data.daily_protein_goal is not None:
        current_user.daily_protein_goal = data.daily_protein_goal
    if data.daily_fat_goal is not None:
        current_user.daily_fat_goal = data.daily_fat_goal
    if data.daily_carb_goal is not None:
        current_user.daily_carb_goal = data.daily_carb_goal
    if data.current_weight is not None:
        current_user.current_weight = data.current_weight
    if data.target_weight is not None:
        current_user.target_weight = data.target_weight
    if data.height is not None:
        current_user.height = data.height
    if data.username is not None:
        new_username = data.username.strip() or None
        if new_username and new_username != current_user.username:
            taken = await db.execute(select(User).where(User.username == new_username, User.id != current_user.id))
            if taken.scalar_one_or_none():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
        current_user.username = new_username
    await db.commit()
    await db.refresh(current_user)
    return current_user
