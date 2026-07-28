"""log_ai_response: writes a usage row (fixes the always-$0 admin panel) and
never raises (best-effort — a logging failure must not break an AI feature)."""
from sqlalchemy import select

from app.services.ai_cache import log_ai_response
from app.db.session import async_session
from app.models.ai_log import AIUsageLog


async def test_log_ai_response_writes_row(auth_client):
    client, _, _ = auth_client
    uid = (await client.get("/api/v1/auth/me")).json()["id"]

    await log_ai_response(uid, "unit_test_ep", "claude-haiku-4-5-20251001",
                          {"usage": {"input_tokens": 1000, "output_tokens": 500}})

    async with async_session() as s:
        rows = (await s.execute(
            select(AIUsageLog).where(AIUsageLog.endpoint == "unit_test_ep")
        )).scalars().all()
    assert len(rows) == 1
    r = rows[0]
    assert r.input_tokens == 1000 and r.output_tokens == 500
    # haiku pricing (1.0, 5.0)/1M → 0.001 + 0.0025
    assert abs(r.cost_usd - 0.0035) < 1e-9


async def test_log_ai_response_is_best_effort():
    # malformed inputs must be swallowed, never raised
    await log_ai_response(None, "x", "unknown-model", None)
    await log_ai_response(None, "x", "claude-haiku-4-5-20251001", {"usage": "not-a-dict"})
    await log_ai_response("not-a-uuid", "x", "claude-haiku-4-5-20251001",
                          {"usage": {"input_tokens": 1, "output_tokens": 1}})
