"""Water tracker v2: add / today / history / delete / goal + validation + auth."""
import pytest


async def test_add_water_and_today(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/water", json={"amount_ml": 250, "drink_type": "water"})
    assert r.status_code == 201, r.text
    assert r.json()["amount_ml"] == 250
    assert r.json()["drink_type"] == "water"

    t = await client.get("/api/v1/water/today")
    assert t.status_code == 200, t.text


@pytest.mark.parametrize("amount", [9, 5001, 0, -100])
async def test_add_water_amount_out_of_range_rejected(auth_client, amount):
    client, _, _ = auth_client
    r = await client.post("/api/v1/water", json={"amount_ml": amount})
    assert r.status_code == 422, r.text


async def test_add_water_invalid_drink_type_rejected(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/water", json={"amount_ml": 200, "drink_type": "beer"})
    assert r.status_code == 422, r.text


@pytest.mark.parametrize("drink", ["water", "tea", "coffee", "juice", "milk", "other"])
async def test_add_water_valid_drink_types(auth_client, drink):
    client, _, _ = auth_client
    r = await client.post("/api/v1/water", json={"amount_ml": 200, "drink_type": drink})
    assert r.status_code == 201, r.text


async def test_delete_water(auth_client):
    client, _, _ = auth_client
    eid = (await client.post("/api/v1/water", json={"amount_ml": 300})).json()["id"]
    d = await client.delete(f"/api/v1/water/{eid}")
    assert d.status_code == 204, d.text


async def test_delete_missing_water_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    d = await client.delete(f"/api/v1/water/{miss}")
    assert d.status_code == 404


async def test_get_goal_default(auth_client):
    client, _, _ = auth_client
    g = await client.get("/api/v1/water/goal")
    assert g.status_code == 200, g.text
    assert g.json()["daily_water_goal_ml"] > 0
    assert "is_auto" in g.json()


async def test_set_goal_override(auth_client):
    client, _, _ = auth_client
    u = await client.patch("/api/v1/water/goal", json={"daily_water_goal_ml": 2500})
    assert u.status_code == 200, u.text
    assert u.json()["daily_water_goal_ml"] == 2500
    assert u.json()["is_auto"] is False


async def test_set_goal_out_of_range_rejected(auth_client):
    client, _, _ = auth_client
    r = await client.patch("/api/v1/water/goal", json={"daily_water_goal_ml": 50})
    assert r.status_code == 422


async def test_water_requires_auth(client):
    r = await client.post("/api/v1/water", json={"amount_ml": 200})
    assert r.status_code in (401, 403)
