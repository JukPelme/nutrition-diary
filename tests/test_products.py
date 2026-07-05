"""Products: create (regression for the 'create kicks me out' bug)."""


async def test_create_product(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/products", json={
        "name": "Тестовый продукт", "category": "Готовые блюда",
        "calories": 100, "protein": 5, "fat": 3, "carbohydrates": 12,
    })
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["id"]
    assert body["name"] == "Тестовый продукт"
    assert body["calories"] == 100


async def test_create_product_requires_auth(client):
    r = await client.post("/api/v1/products", json={"name": "x", "calories": 1})
    assert r.status_code in (401, 403)


async def test_search_products(auth_client):
    client, _, _ = auth_client
    await client.post("/api/v1/products", json={"name": "Уникальный Огурец", "calories": 15})
    r = await client.get("/api/v1/products", params={"q": "Огурец"})
    assert r.status_code == 200, r.text
