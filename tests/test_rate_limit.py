"""Per-user rate limiting on expensive AI endpoints (caps Claude/Deepgram spend)."""


async def test_ai_endpoint_rate_limited_per_user(auth_client):
    client, _, _ = auth_client
    # meal-plan generate is capped at 10/hour/user. Calls 1-10 fall through to
    # 503 (no API key in CI) but still consume the bucket; the 11th is refused
    # by the limit dependency with 429 before the handler runs.
    codes = []
    for _ in range(11):
        r = await client.post("/api/v1/nutrition/meal-plan/generate", json={"days": 3})
        codes.append(r.status_code)
    assert codes[-1] == 429, f"expected 429 on 11th call, got {codes}"
    assert codes[0] != 429, "first call must not be rate-limited"


async def test_rate_limit_is_per_user(client):
    # two separate users each get their own bucket — one hitting the limit
    # must not affect the other
    async def _mk():
        import uuid
        em = f"rl_{uuid.uuid4().hex[:8]}@example.com"
        reg = await client.post("/api/v1/auth/register", json={"email": em, "password": "Test12345!", "full_name": "RL"})
        return reg.json()["access_token"]

    tok_a = await _mk()
    # exhaust user A (11 calls)
    for _ in range(11):
        await client.post("/api/v1/nutrition/meal-plan/generate", json={"days": 3},
                          headers={"Authorization": f"Bearer {tok_a}"})
    # user B's first call must still be allowed (not 429)
    tok_b = await _mk()
    r = await client.post("/api/v1/nutrition/meal-plan/generate", json={"days": 3},
                          headers={"Authorization": f"Bearer {tok_b}"})
    assert r.status_code != 429, "user B wrongly rate-limited by user A's usage"
