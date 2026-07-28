"""Meals endpoint + regression for dropping lazy='selectin' on Meal.entries.

Meal.entries is now lazy='raise' (was 'selectin', which pulled a user's entire
diary history on every GET /meals). Serializing meals must not touch that
relationship, even when the user already has diary entries.
"""


async def test_list_meals_returns_defaults(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/meals")
    assert r.status_code == 200, r.text
    meals = r.json()
    assert len(meals) >= 3  # register seeds default meals
    assert all("id" in m and "name" in m for m in meals)
    # MealResponse must not expose the entries relationship
    assert all("entries" not in m for m in meals)


async def test_list_meals_with_entries_does_not_lazy_load(auth_client):
    client, _, _ = auth_client
    meal_id = (await client.get("/api/v1/meals")).json()[0]["id"]

    r = await client.post("/api/v1/diary", json={
        "entry_date": "2026-07-20", "meal_id": meal_id,
        "product_name": "Тест", "serving_amount": 100, "calories": 100,
    })
    assert r.status_code == 201, r.text

    # With an entry present, listing meals must still succeed (no MissingGreenlet
    # / lazy-load error from the raise-relationship).
    r2 = await client.get("/api/v1/meals")
    assert r2.status_code == 200, r2.text

    # History groups entries by meal — exercises the same relationship path.
    rec = await client.get("/api/v1/diary/recent")
    assert rec.status_code == 200, rec.text
    assert any(d["date"] == "2026-07-20" for d in rec.json())
