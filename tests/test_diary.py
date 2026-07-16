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


# ---- Auto-log drinks to water intake ----

async def _water_total(client):
    r = await client.get("/api/v1/water/today")
    assert r.status_code == 200, r.text
    return r.json()["total_ml"], r.json()["entries"]


async def test_drink_auto_added_to_water(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry(product_name="Молоко 3.2%", serving_amount=250))
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["water_added_ml"] == 250, body
    assert body["water_entry_id"], body
    total, entries = await _water_total(client)
    assert total == 250
    assert any(e["drink_type"] == "milk" and "Из еды" in (e["notes"] or "") for e in entries), entries


async def test_solid_food_not_added_to_water(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry(product_name="Творог 9%", serving_amount=200))
    assert r.json()["water_added_ml"] == 0
    total, _ = await _water_total(client)
    assert total == 0


async def test_milk_chocolate_excluded(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry(product_name="Молочный шоколад", serving_amount=100))
    assert r.json()["water_added_ml"] == 0


async def test_add_to_water_can_be_disabled(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry(product_name="Сок яблочный", serving_amount=200, add_to_water=False))
    assert r.json()["water_added_ml"] == 0
    total, _ = await _water_total(client)
    assert total == 0


async def test_deleting_food_removes_linked_water(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/diary", json=_entry(product_name="Кефир 1%", serving_amount=300))
    entry_id = r.json()["id"]
    total, _ = await _water_total(client)
    assert total == 300
    d = await client.delete(f"/api/v1/diary/{entry_id}")
    assert d.status_code == 204, d.text
    total, _ = await _water_total(client)
    assert total == 0


# ---- Recent history (browse past days, for the History view) ----
async def test_recent_groups_days_desc(auth_client):
    client, _, _ = auth_client
    await client.post("/api/v1/diary", json=_entry(entry_date="2026-07-10", calories=200))
    await client.post("/api/v1/diary", json=_entry(entry_date="2026-07-12", calories=300))
    await client.post("/api/v1/diary", json=_entry(entry_date="2026-07-12", calories=100))

    r = await client.get("/api/v1/diary/recent", params={"days": 14})
    assert r.status_code == 200, r.text
    days = r.json()
    assert [d["date"] for d in days] == ["2026-07-12", "2026-07-10"]  # newest first
    assert days[0]["total_calories"] == 400
    assert days[0]["entries_count"] == 2

    flat = [e for m in days[0]["meals"] for e in m["entries"]]
    assert len(flat) == 2
    assert all("product_id" in e and "serving_amount" in e for e in flat)


async def test_recent_limit_caps_days(auth_client):
    client, _, _ = auth_client
    for d in ("2026-06-01", "2026-06-02", "2026-06-03"):
        await client.post("/api/v1/diary", json=_entry(entry_date=d))
    r = await client.get("/api/v1/diary/recent", params={"days": 2})
    assert r.status_code == 200, r.text
    days = r.json()
    assert [d["date"] for d in days] == ["2026-06-03", "2026-06-02"]


async def test_recent_empty_for_new_user(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/diary/recent")
    assert r.status_code == 200
    assert r.json() == []


async def test_recent_requires_auth(client):
    r = await client.get("/api/v1/diary/recent")
    assert r.status_code in (401, 403)
