"""Web Push notifications with VAPID.
VAPID keypair is generated once on first request and stored in app_config table.
"""
import base64
import json
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.push import PushSubscription, AppConfig

router = APIRouter(prefix="/push", tags=["push"])


async def _get_or_create_vapid(db: AsyncSession) -> dict:
    rows = (await db.execute(select(AppConfig).where(AppConfig.key.in_(("vapid_private", "vapid_public_b64"))))).scalars().all()
    by_key = {r.key: r.value for r in rows}
    if "vapid_private" in by_key and "vapid_public_b64" in by_key:
        return by_key

    # Generate via cryptography (already in deps via python-jose)
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization

    priv = ec.generate_private_key(ec.SECP256R1())
    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    pub = priv.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    pub_b64 = base64.urlsafe_b64encode(pub).rstrip(b"=").decode("utf-8")

    db.add(AppConfig(key="vapid_private", value=priv_pem))
    db.add(AppConfig(key="vapid_public_b64", value=pub_b64))
    await db.commit()
    return {"vapid_private": priv_pem, "vapid_public_b64": pub_b64}


@router.get("/key")
async def get_public_key(db: AsyncSession = Depends(get_db)):
    keys = await _get_or_create_vapid(db)
    return {"public_key": keys["vapid_public_b64"]}


class SubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.post("/subscribe", status_code=201)
async def subscribe(
    data: SubscribeIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = (await db.execute(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))).scalar_one_or_none()
    if existing:
        existing.user_id = user.id
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        existing.user_agent = (request.headers.get("user-agent") or "")[:500]
    else:
        db.add(PushSubscription(
            id=uuid4(), user_id=user.id,
            endpoint=data.endpoint, p256dh=data.p256dh, auth=data.auth,
            user_agent=(request.headers.get("user-agent") or "")[:500],
        ))
    await db.commit()
    return {"ok": True}


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
async def unsubscribe(
    data: UnsubscribeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        PushSubscription.__table__.delete()
        .where(PushSubscription.endpoint == data.endpoint, PushSubscription.user_id == user.id)
    )
    await db.commit()
    return {"ok": True}


@router.post("/test")
async def send_test(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a test push to all of this user's subscriptions."""
    from pywebpush import webpush, WebPushException
    keys = await _get_or_create_vapid(db)
    subs = (await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    if not subs:
        raise HTTPException(400, "No push subscriptions — enable push first")

    payload = json.dumps({"title": "Nutrition Diary", "body": "Web Push работает", "icon": "/static/icon-192.png"})
    sent, failed = 0, 0
    dead_ids = []
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=payload,
                vapid_private_key=keys["vapid_private"],
                vapid_claims={"sub": "mailto:admin@nutrition-diary.app"},
            )
            sent += 1
        except WebPushException as e:
            failed += 1
            # 410/404 — subscription expired
            if hasattr(e, "response") and e.response is not None and e.response.status_code in (404, 410):
                dead_ids.append(s.id)
    if dead_ids:
        await db.execute(PushSubscription.__table__.delete().where(PushSubscription.id.in_(dead_ids)))
        await db.commit()
    return {"sent": sent, "failed": failed, "removed_dead": len(dead_ids)}


@router.post("/reminders/send-due")
async def send_reminders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a context-aware Claude-crafted reminder.
    Triggered by client cron (e.g. on app open) or external scheduler.
    Skips users who already logged 'enough' today (calorie goal >= 70%).
    """
    from datetime import date, timedelta
    from sqlalchemy import func
    from app.models.diary import DiaryEntry
    from app.core.config import settings
    import httpx
    from pywebpush import webpush, WebPushException

    today = date.today()
    total_cal = (await db.execute(
        select(func.coalesce(func.sum(DiaryEntry.calories), 0))
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today)
    )).scalar() or 0
    goal_cal = user.daily_calorie_goal or 2000
    if total_cal >= 0.7 * goal_cal:
        return {"skipped": "enough_logged", "today_kcal": int(total_cal), "goal": goal_cal}

    subs = (await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    if not subs:
        return {"skipped": "no_subscriptions"}

    msg = "Не забудь записать сегодняшние приёмы пищи 🍽"
    if settings.anthropic_api_key and total_cal < 100:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 80,
                        "system": "You write a single short (max 90 chars) friendly nudge in Russian to encourage user to log food. No emojis except 🍽.",
                        "messages": [{"role": "user", "content": f"Сегодня пользователь записал {int(total_cal)} ккал из {goal_cal}. Сейчас {today.strftime('%H')}. Напомни кратко записать еду."}],
                    },
                )
                if r.status_code < 400:
                    msg = r.json()["content"][0]["text"].strip()[:140]
        except Exception:
            pass

    keys = await _get_or_create_vapid(db)
    payload = json.dumps({"title": "Дневник питания", "body": msg, "icon": "/static/icon-192.png"})
    sent, failed, dead_ids = 0, 0, []
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=payload,
                vapid_private_key=keys["vapid_private"],
                vapid_claims={"sub": "mailto:admin@nutrition-diary.app"},
            )
            sent += 1
        except WebPushException as e:
            failed += 1
            if hasattr(e, "response") and e.response is not None and e.response.status_code in (404, 410):
                dead_ids.append(s.id)
    if dead_ids:
        await db.execute(PushSubscription.__table__.delete().where(PushSubscription.id.in_(dead_ids)))
        await db.commit()
    return {"sent": sent, "failed": failed, "removed_dead": len(dead_ids), "message": msg}


@router.post("/reminders/streak-warning")
async def streak_warning(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """If user has a streak >= 3 and hasn't logged today and < 6h remain, send a warning push.
    Client triggers this once a day in evening hours.
    """
    from datetime import datetime as _dt, date as _d, time as _t, timedelta as _td
    from sqlalchemy import func
    from app.models.diary import DiaryEntry
    from app.services.gamification import _all_entry_dates, _streak_lengths

    today = _d.today()
    dates = await _all_entry_dates(db, user.id)
    cur, _ = _streak_lengths(dates, today)

    today_count = (await db.execute(
        select(func.count(DiaryEntry.id))
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today)
    )).scalar() or 0

    if today_count > 0 or cur < 3:
        return {"skipped": "no_warning_needed", "current_streak": cur, "today_count": today_count}

    now = _dt.now()
    hours_left = 24 - now.hour
    if hours_left > 6:
        return {"skipped": "too_early", "hours_left": hours_left}

    subs = (await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    if not subs:
        return {"skipped": "no_subscriptions"}

    from pywebpush import webpush, WebPushException
    keys = await _get_or_create_vapid(db)
    msg = f"🔥 Твой стрик {cur} дн. сломается через {hours_left} ч. Запиши хоть один приём пищи!"
    payload = json.dumps({"title": "Не теряй стрик", "body": msg, "icon": "/static/icon-192.png"})
    sent, failed, dead = 0, 0, []
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=payload,
                vapid_private_key=keys["vapid_private"],
                vapid_claims={"sub": "mailto:admin@nutrition-diary.app"},
            )
            sent += 1
        except WebPushException as e:
            failed += 1
            if hasattr(e, "response") and e.response is not None and e.response.status_code in (404, 410):
                dead.append(s.id)
    if dead:
        await db.execute(PushSubscription.__table__.delete().where(PushSubscription.id.in_(dead)))
        await db.commit()
    return {"sent": sent, "failed": failed, "current_streak": cur, "hours_left": hours_left}


@router.post("/reminders/meal-time")
async def meal_time_reminder(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Detect user's typical meal-time pattern (from last 14 days), and if a usual
    meal slot has passed for >30 min without a log today — send a nudge.
    Client triggers this every 30-60 min in foreground or via push scheduler.
    """
    from datetime import datetime as _dt, date as _d, timedelta as _td
    from sqlalchemy import func, distinct, extract
    from app.models.diary import DiaryEntry

    today = _d.today()
    since = today - _td(days=14)

    # Average meal hour per meal_id over last 14 days
    rows = (await db.execute(
        select(
            DiaryEntry.meal_id,
            func.avg(extract('hour', DiaryEntry.created_at)),
        )
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date >= since)
        .group_by(DiaryEntry.meal_id)
    )).all()
    if not rows:
        return {"skipped": "no_history"}

    # Meals logged today
    today_meals = {r[0] for r in (await db.execute(
        select(distinct(DiaryEntry.meal_id))
        .where(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == today)
    )).all()}

    now_h = _dt.now().hour
    overdue = []
    for meal_id, avg_h in rows:
        if not avg_h or meal_id in today_meals:
            continue
        avg_h = float(avg_h)
        # 30 min past typical slot
        if now_h >= avg_h + 0.5:
            overdue.append((meal_id, avg_h))

    if not overdue:
        return {"skipped": "no_overdue_meals"}

    overdue.sort(key=lambda x: x[1])
    next_overdue = overdue[0]

    subs = (await db.execute(select(PushSubscription).where(PushSubscription.user_id == user.id))).scalars().all()
    if not subs:
        return {"skipped": "no_subscriptions", "overdue_count": len(overdue)}

    from app.models.diary import Meal
    meal = (await db.execute(select(Meal).where(Meal.id == next_overdue[0]))).scalar_one_or_none()
    meal_name = meal.name if meal else "приём пищи"
    msg = f"Обычно у тебя {meal_name} около {int(next_overdue[1])}:00. Не забыл записать?"

    from pywebpush import webpush, WebPushException
    keys = await _get_or_create_vapid(db)
    payload = json.dumps({"title": "Напоминание", "body": msg, "icon": "/static/icon-192.png"})
    sent, dead = 0, []
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=payload,
                vapid_private_key=keys["vapid_private"],
                vapid_claims={"sub": "mailto:admin@nutrition-diary.app"},
            )
            sent += 1
        except WebPushException as e:
            if hasattr(e, "response") and e.response is not None and e.response.status_code in (404, 410):
                dead.append(s.id)
    if dead:
        await db.execute(PushSubscription.__table__.delete().where(PushSubscription.id.in_(dead)))
        await db.commit()
    return {"sent": sent, "meal": meal_name, "typical_hour": int(next_overdue[1])}
