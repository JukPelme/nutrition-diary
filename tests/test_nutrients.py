"""Daily nutrient breakdown — data coverage (missing != zero)."""

DAY = "2026-07-08"


async def _add(client, name, grams, minerals=None):
    p = await client.post("/api/v1/products", json={
        "name": name, "calories": 100, "protein": 5, "fat": 3, "carbohydrates": 10,
        "minerals": minerals,
    })
    assert p.status_code in (200, 201), p.text
    pid = p.json()["id"]
    e = await client.post("/api/v1/diary", json={
        "entry_date": DAY, "product_id": pid, "product_name": name,
        "serving_amount": grams, "calories": 100, "protein": 5, "fat": 3, "carbohydrates": 10,
        "add_to_water": False,
    })
    assert e.status_code in (200, 201), e.text


async def test_nutrient_coverage_reported(auth_client):
    client, _, _ = auth_client
    # One product WITH calcium data, one WITHOUT any micronutrients.
    await _add(client, "Сыр с кальцием", 100, minerals={"calcium": 700})
    await _add(client, "Ручной продукт без микро", 100, minerals=None)

    r = await client.get("/api/v1/nutrients/daily", params={"entry_date": DAY})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["products_count"] == 2
    assert body["products_with_micro"] == 1  # only the cheese carried micros

    ca = body["nutrients"]["minerals"]["calcium"]
    assert ca["amount"] == 700
    assert ca["covered"] == 1 and ca["total_products"] == 2
    assert ca["complete"] is False  # data from 1 of 2 foods -> not confident


async def test_nutrient_complete_when_all_have_data(auth_client):
    client, _, _ = auth_client
    await _add(client, "Молоко с кальцием A", 100, minerals={"calcium": 120})
    await _add(client, "Молоко с кальцием B", 100, minerals={"calcium": 100})

    r = await client.get("/api/v1/nutrients/daily", params={"entry_date": DAY})
    ca = r.json()["nutrients"]["minerals"]["calcium"]
    assert ca["covered"] == 2 and ca["total_products"] == 2
    assert ca["complete"] is True
