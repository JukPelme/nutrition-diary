from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.core.rate_limit import check_rate_limit
from app.models.security import LoginEvent
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token, decode_token
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.diary import Meal
from app.schemas.auth import UserRegister, UserLogin, TokenResponse, TokenRefresh, UserResponse, UserUpdate, RecoverUsernameIn, RecoverUsernameOut

router = APIRouter(prefix="/auth", tags=["auth"])

# Default meals created for new users
DEFAULT_MEALS = [
    {"name": "Завтрак", "icon": "🌅", "sort_order": 0},
    {"name": "Обед", "icon": "☀️", "sort_order": 1},
    {"name": "Ужин", "icon": "🌙", "sort_order": 2},
    {"name": "Перекус", "icon": "🍎", "sort_order": 3},
]


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    if not await check_rate_limit(f"reg:ip:{ip}", max_calls=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many registrations from this IP, try later")
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


MAX_FAIL = 5
LOCK_MINUTES = 15


def _client_ip(req: Request) -> str:
    fwd = req.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return req.client.host if req.client else "unknown"


async def _log_login(db: AsyncSession, *, user_id, identifier: str, ip: str, ua: str, status: str):
    db.add(LoginEvent(id=uuid4(), user_id=user_id, identifier=identifier[:255], ip=ip[:45], user_agent=(ua or "")[:500], status=status))


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    ua = request.headers.get("user-agent", "")

    # Rate limit: 10 attempts per IP per minute
    if not await check_rate_limit(f"login:ip:{ip}", max_calls=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many attempts, try again in a minute")
    # Rate limit per identifier: 8 per 5 min (slows username enumeration)
    if not await check_rate_limit(f"login:id:{data.login}", max_calls=8, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many attempts for this account")

    if "@" in data.login:
        query = select(User).where(User.email == data.login)
    else:
        query = select(User).where(User.username == data.login)
    user = (await db.execute(query)).scalar_one_or_none()

    # Account lockout
    if user and user.locked_until and user.locked_until > datetime.now(timezone.utc):
        await _log_login(db, user_id=user.id, identifier=data.login, ip=ip, ua=ua, status="locked")
        await db.commit()
        raise HTTPException(status_code=423, detail=f"Account temporarily locked, try later")

    if not user or not verify_password(data.password, user.hashed_password):
        if user:
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= MAX_FAIL:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)
        await _log_login(db, user_id=user.id if user else None, identifier=data.login, ip=ip, ua=ua, status="failed")
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    # 2FA gate
    if user.totp_enabled and user.totp_secret:
        import pyotp
        if not data.totp_code or not pyotp.TOTP(user.totp_secret).verify(data.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail="totp_required")
    # Successful login — reset counter, clear lockout
    user.failed_login_count = 0
    user.locked_until = None
    await _log_login(db, user_id=user.id, identifier=data.login, ip=ip, ua=ua, status="success")
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/audit", summary="Recent login events for current user")
async def login_audit(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import desc
    rows = (await db.execute(
        select(LoginEvent).where(LoginEvent.user_id == current_user.id).order_by(desc(LoginEvent.created_at)).limit(min(limit, 100))
    )).scalars().all()
    return [
        {"created_at": r.created_at.isoformat(), "status": r.status, "ip": r.ip, "user_agent": r.user_agent}
        for r in rows
    ]


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
    if data.birth_year is not None:
        current_user.birth_year = data.birth_year
    if data.sex is not None:
        current_user.sex = data.sex or None
    if data.activity_level is not None:
        current_user.activity_level = data.activity_level or None
    if data.goal_type is not None:
        current_user.goal_type = data.goal_type or None
    if data.preferred_language is not None:
        lang = data.preferred_language.strip() or None
        if lang and lang not in {"ru", "en", "ja"}:
            raise HTTPException(status_code=400, detail="Unsupported language")
        current_user.preferred_language = lang
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


@router.post("/recover-username", response_model=RecoverUsernameOut)
async def recover_username(data: RecoverUsernameIn, request: Request, db: AsyncSession = Depends(get_db)):
    if not await check_rate_limit(f"recover:ip:{_client_ip(request)}", max_calls=5, window_seconds=300):
        raise HTTPException(status_code=429, detail="Too many attempts")
    """Return the username for a known email + password — to help users
    who registered before the username field was wired into the UI."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return RecoverUsernameOut(email=user.email, username=user.username, full_name=user.full_name)



from pydantic import BaseModel as _BM


class TotpVerifyIn(_BM):
    code: str


class TotpSetupOut(_BM):
    secret: str
    uri: str
    qr_svg: str


@router.post("/2fa/setup", response_model=TotpSetupOut)
async def totp_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate (or regenerate) a TOTP secret. Not enabled until /verify."""
    import pyotp
    import qrcode
    import qrcode.image.svg
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    current_user.totp_enabled = False
    await db.commit()
    issuer = "Nutrition Diary"
    label = current_user.email or current_user.username or str(current_user.id)
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
    import io
    buf = io.BytesIO(); img.save(buf)
    svg = buf.getvalue().decode("utf-8")
    return TotpSetupOut(secret=secret, uri=uri, qr_svg=svg)


@router.post("/2fa/verify")
async def totp_verify(
    data: TotpVerifyIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import pyotp
    if not current_user.totp_secret:
        raise HTTPException(400, "Setup not started")
    if not pyotp.TOTP(current_user.totp_secret).verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    current_user.totp_enabled = True
    await db.commit()
    return {"enabled": True}


@router.post("/2fa/disable")
async def totp_disable(
    data: TotpVerifyIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import pyotp
    if not current_user.totp_enabled or not current_user.totp_secret:
        return {"enabled": False}
    if not pyotp.TOTP(current_user.totp_secret).verify(data.code, valid_window=1):
        raise HTTPException(400, "Invalid code")
    current_user.totp_enabled = False
    current_user.totp_secret = None
    await db.commit()
    return {"enabled": False}
