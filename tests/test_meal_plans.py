"""Meal plans: non-AI paths (generate needs a key -> 503) + current/list/delete + auth.

Generation itself calls Claude and is not exercised in CI (no ANTHROPIC_API_KEY);
we assert it degrades cleanly to 503 instead of erroring.
"""
import pytest


async def test_generate_without_api_key_returns_503(auth_client):
    client, _, _ = auth_client
    # CI sets no ANTHROPIC_API_KEY -> endpoint must refuse cleanly, not 500
    r = await client.post("/api/v1/nutrition/meal-plan/generate", json={"days": 3, "lang": "ru"})
    assert r.status_code == 503, r.text


async def test_current_plan_none_when_empty(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/nutrition/meal-plan/current")
    assert r.status_code == 200, r.text
    assert r.json()["plan"] is None


async def test_list_plans_empty(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/nutrition/meal-plan/list")
    assert r.status_code == 200, r.text
    assert r.json() == []


async def test_delete_missing_plan_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    r = await client.delete(f"/api/v1/nutrition/meal-plan/{miss}")
    assert r.status_code == 404


async def test_generate_invalid_days_rejected(auth_client):
    client, _, _ = auth_client
    # days out of 1..14 range -> validation error before the key check
    r = await client.post("/api/v1/nutrition/meal-plan/generate", json={"days": 30})
    assert r.status_code == 422


async def test_meal_plans_requires_auth(client):
    r = await client.get("/api/v1/nutrition/meal-plan/current")
    assert r.status_code in (401, 403)


async def test_get_plan_by_id_returns_full_plan(auth_client):
    # Seed a plan straight into the DB (generation needs Claude), then fetch it.
    from uuid import UUID, uuid4
    from datetime import date
    from app.db.session import async_session
    from app.models.meal_plan import MealPlan

    client, _, _ = auth_client
    me = (await client.get("/api/v1/auth/me")).json()
    pid = uuid4()
    async with async_session() as s:
        s.add(MealPlan(
            id=pid, user_id=UUID(me["id"]),
            start_date=date(2020, 1, 1), end_date=date(2020, 1, 3),
            lang="ru", model_used="claude-sonnet-4-6",
            plan_json={"days": [{"date": "2020-01-01", "meals": []}]}, notes=None,
        ))
        await s.commit()

    r = await client.get(f"/api/v1/nutrition/meal-plan/{pid}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(pid)
    assert body["plan"]["days"][0]["date"] == "2020-01-01"


async def test_get_plan_by_id_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    assert (await client.get(f"/api/v1/nutrition/meal-plan/{miss}")).status_code == 404


async def test_get_plan_requires_auth(client):
    miss = "00000000-0000-0000-0000-000000000000"
    r = await client.get(f"/api/v1/nutrition/meal-plan/{miss}")
    assert r.status_code in (401, 403)
