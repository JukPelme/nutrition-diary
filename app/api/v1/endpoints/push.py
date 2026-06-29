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
