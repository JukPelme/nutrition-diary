"""Lightweight cache for Claude responses + usage tracking.

Helpers:
  - get_cached(db, key) -> dict | None
  - set_cached(db, key, endpoint, response, ttl_hours=24)
  - log_usage(db, user, endpoint, model, input_tokens, output_tokens)
  - call_claude_cached(db, user, endpoint, key, model, system, messages, max_tokens, ttl_hours=24)
"""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.core.config import settings
from app.models.user import User
from app.models.ai_log import AIUsageLog, AICache


# Claude pricing per 1M tokens (approx, USD)
PRICING = {
    "claude-haiku-4-5-20251001": (1.0, 5.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-opus-4-7": (15.0, 75.0),
}


def make_key(endpoint: str, payload: dict | str) -> str:
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False) if isinstance(payload, dict) else str(payload)
    h = hashlib.sha256((endpoint + "|" + raw).encode("utf-8")).hexdigest()[:96]
    return h


async def get_cached(db: AsyncSession, key: str) -> dict | None:
    row = (await db.execute(
        select(AICache).where(AICache.cache_key == key, AICache.expires_at > datetime.utcnow())
    )).scalar_one_or_none()
    return row.response_json if row else None


async def set_cached(db: AsyncSession, key: str, endpoint: str, response: dict, ttl_hours: int = 24):
    # Clean up expired in background (best-effort, no transaction guarantees)
    try:
        await db.execute(delete(AICache).where(AICache.cache_key == key))
    except Exception:
        pass
    db.add(AICache(
        id=uuid4(), cache_key=key, endpoint=endpoint, response_json=response,
        expires_at=datetime.utcnow() + timedelta(hours=ttl_hours),
    ))
    await db.commit()


async def log_usage(db: AsyncSession, user: User | None, endpoint: str, model: str,
                    input_tokens: int, output_tokens: int):
    in_rate, out_rate = PRICING.get(model, (3.0, 15.0))
    cost = (input_tokens / 1_000_000.0) * in_rate + (output_tokens / 1_000_000.0) * out_rate
    db.add(AIUsageLog(
        id=uuid4(),
        user_id=user.id if user else None,
        endpoint=endpoint, model=model,
        input_tokens=input_tokens, output_tokens=output_tokens,
        cost_usd=cost,
    ))
    await db.commit()


async def call_claude(db: AsyncSession, user: User | None, endpoint: str, model: str,
                      system: str, messages: list, max_tokens: int = 1000,
                      cache_key: str | None = None, ttl_hours: int = 24) -> str | None:
    """Call Claude, log usage, optionally cache. Returns text content or None."""
    if cache_key:
        cached = await get_cached(db, cache_key)
        if cached and "text" in cached:
            return cached["text"]

    if not settings.anthropic_api_key:
        return None

    async with httpx.AsyncClient(timeout=45) as cli:
        r = await cli.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key,
                     "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": model, "max_tokens": max_tokens, "system": system, "messages": messages},
        )
        if r.status_code >= 400:
            return None
        j = r.json()

    try:
        text = j["content"][0]["text"]
        usage = j.get("usage") or {}
        await log_usage(db, user, endpoint, model,
                        int(usage.get("input_tokens", 0)),
                        int(usage.get("output_tokens", 0)))
        if cache_key:
            await set_cached(db, cache_key, endpoint, {"text": text}, ttl_hours)
        return text
    except Exception:
        return None
