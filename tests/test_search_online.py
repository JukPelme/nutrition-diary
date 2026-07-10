"""Explicit online product lookup (OpenFoodFacts) for items not in our catalog."""
from uuid import uuid4


async def test_search_online_requires_min_length(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/products/search-online", params={"q": "a"})
    assert r.status_code == 422


async def test_search_online_requires_auth(client):
    r = await client.get("/api/v1/products/search-online", params={"q": "творог"})
    assert r.status_code in (401, 403)


async def test_search_online_returns_and_saves(auth_client, monkeypatch):
    from app.services import barcode_service

    async def fake_off(query, limit=20):
        return [{
            "id": uuid4(), "name": "Творог Тест 5%", "brand": "TestBrand",
            "barcode": "9990000000001", "category": "dairy",
            "source": "openfoodfacts", "source_id": "9990000000001",
            "serving_size": 100.0, "serving_unit": "g",
            "calories": 121.0, "protein": 17.0, "fat": 5.0, "carbohydrates": 1.8,
            "fiber": None, "sugar": 1.8, "vitamins": None, "minerals": None,
            "image_url": None, "is_verified": False,
        }]

    monkeypatch.setattr(barcode_service, "search_off", fake_off)
    client, _, _ = auth_client

    r = await client.get("/api/v1/products/search-online", params={"q": "творог тест"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert any(p["name"] == "Творог Тест 5%" and p["source"] == "openfoodfacts" for p in body)

    # saved locally -> now findable via the normal search
    r2 = await client.get("/api/v1/products", params={"q": "Творог Тест", "barcode": "9990000000001"})
    assert any(p["barcode"] == "9990000000001" for p in r2.json())
