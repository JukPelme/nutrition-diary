"""Share links are DB-backed (were in-memory: lost on restart / 404 across workers)."""
from datetime import date

DAY = "2026-07-05"


async def test_share_and_view_day(auth_client):
    client, _, _ = auth_client
    # need at least one entry to share
    await client.post("/api/v1/diary", json={
        "entry_date": DAY, "product_name": "Овсянка", "serving_amount": 150,
        "calories": 220, "protein": 8, "fat": 4, "carbohydrates": 38,
    })
    r = await client.post("/api/v1/share/day", params={"entry_date": DAY})
    assert r.status_code == 200, r.text
    sid = r.json()["share_id"]
    assert sid

    # public view — no auth header needed, but the same client works too
    v = await client.get(f"/api/v1/share/view/{sid}")
    assert v.status_code == 200, v.text
    body = v.json()
    assert body["date"] == DAY
    assert any("Овсянка" in i["name"] for meal in body["meals"].values() for i in meal)


async def test_share_empty_day_404(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/share/day", params={"entry_date": "2019-01-01"})
    assert r.status_code == 404


async def test_view_missing_share_404(client):
    r = await client.get("/api/v1/share/view/deadbeef")
    assert r.status_code == 404


async def test_shared_link_visible_to_unauthenticated(client, auth_client):
    # created by an authed user, then fetched by a client with NO auth header
    ac, _, _ = auth_client
    await ac.post("/api/v1/diary", json={
        "entry_date": DAY, "product_name": "Яблоко", "serving_amount": 100,
        "calories": 52, "protein": 0, "fat": 0, "carbohydrates": 14,
    })
    sid = (await ac.post("/api/v1/share/day", params={"entry_date": DAY})).json()["share_id"]
    # `client` fixture has no Authorization header
    v = await client.get(f"/api/v1/share/view/{sid}")
    assert v.status_code == 200, v.text


async def test_share_id_is_unguessable(auth_client):
    client, _, _ = auth_client
    await client.post("/api/v1/diary", json={
        "entry_date": DAY, "product_name": "Овсянка", "serving_amount": 100,
        "calories": 200, "protein": 5, "fat": 3, "carbohydrates": 30,
    })
    ids = set()
    for _ in range(3):
        sid = (await client.post("/api/v1/share/day", params={"entry_date": DAY})).json()["share_id"]
        ids.add(sid)
        assert len(sid) >= 16, f"share_id too short ({len(sid)}): {sid}"
    assert len(ids) == 3  # all distinct
