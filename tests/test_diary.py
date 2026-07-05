"""Diary CRUD: create / read-by-date / update / delete + ownership + auth."""
import pytest

DAY = "2026-07-05"


def _entry(**over):
    base = {
        "entry_date": DAY, "product_name": "Овсянка",
        "serving_amount": 150, "calories": 220,
        "protein": 8, "fat": 4, "carbohydrates": 38,
    }
    base.update(over)
    return base


async def test_create_and_get_by_date(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry())
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert r.json()["product_name"] == "Овсянка"

    g = await client.get("/api/v1/diary", params={"entry_date": DAY})
    assert g.status_code == 200, g.text
    assert any(e["id"] == eid for e in g.json())


async def test_get_other_date_is_empty(auth_client):
    client, _, _ = auth_client
    await client.post("/api/v1/diary", json=_entry())
    g = await client.get("/api/v1/diary", params={"entry_date": "2020-01-01"})
    assert g.status_code == 200
    assert g.json() == []


async def test_daily_summary(auth_client):
    client, _, _ = auth_client
    await client.post("/api/v1/diary", json=_entry(calories=200))
    await client.post("/api/v1/diary", json=_entry(calories=300))
    s = await client.get("/api/v1/diary/summary", params={"entry_date": DAY})
    assert s.status_code == 200, s.text


async def test_update_entry(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry())
    eid = r.json()["id"]
    u = await client.patch(f"/api/v1/diary/{eid}", json={"serving_amount": 300, "calories": 440})
    assert u.status_code == 200, u.text
    assert u.json()["serving_amount"] == 300
    assert u.json()["calories"] == 440


async def test_delete_entry(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry())
    eid = r.json()["id"]
    d = await client.delete(f"/api/v1/diary/{eid}")
    assert d.status_code == 204, d.text
    g = await client.get("/api/v1/diary", params={"entry_date": DAY})
    assert all(e["id"] != eid for e in g.json())


async def test_update_missing_returns_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    u = await client.patch(f"/api/v1/diary/{miss}", json={"calories": 1})
    assert u.status_code == 404


async def test_delete_missing_returns_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    d = await client.delete(f"/api/v1/diary/{miss}")
    assert d.status_code == 404


async def test_other_user_cannot_touch_entry(client):
    # user A creates an entry; user B must not update/delete it
    a = await client.post("/api/v1/auth/register", json={
        "email": "diary_a@example.com", "password": "Test12345!", "full_name": "A"})
    tok_a = a.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {tok_a}"
    eid = (await client.post("/api/v1/diary", json=_entry())).json()["id"]

    b = await client.post("/api/v1/auth/register", json={
        "email": "diary_b@example.com", "password": "Test12345!", "full_name": "B"})
    tok_b = b.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {tok_b}"
    assert (await client.patch(f"/api/v1/diary/{eid}", json={"calories": 9})).status_code == 404
    assert (await client.delete(f"/api/v1/diary/{eid}")).status_code == 404


async def test_diary_requires_auth(client):
    r = await client.get("/api/v1/diary", params={"entry_date": DAY})
    assert r.status_code in (401, 403)
