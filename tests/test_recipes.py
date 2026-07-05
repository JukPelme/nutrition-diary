"""Saved recipes: create (with macro computation) / list / get / delete + auth."""
import pytest


async def _make_product(client, name="Рис варёный", cal=130, p=2.7, f=0.3, c=28):
    r = await client.post("/api/v1/products", json={
        "name": name, "calories": cal, "protein": p, "fat": f, "carbohydrates": c,
    })
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


async def test_create_recipe_computes_macros(auth_client):
    client, _, _ = auth_client
    pid = await _make_product(client, cal=100, p=10, f=5, c=20)
    r = await client.post("/api/v1/recipes", json={
        "name": "Тестовое блюдо",
        "total_weight_g": 200,
        "servings": 2,
        "ingredients": [
            {"product_id": pid, "product_name": "Рис варёный", "amount_g": 100},
        ],
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Тестовое блюдо"
    # 100 g of a 100 kcal/100g product -> 100 kcal total
    assert round(body["macros_total"]["calories"]) == 100


async def test_list_and_get_recipe(auth_client):
    client, _, _ = auth_client
    pid = await _make_product(client)
    rid = (await client.post("/api/v1/recipes", json={
        "name": "Плов", "total_weight_g": 500, "servings": 4,
        "ingredients": [{"product_id": pid, "product_name": "Рис варёный", "amount_g": 300}],
    })).json()["id"]

    lst = await client.get("/api/v1/recipes")
    assert lst.status_code == 200, lst.text
    assert any(x["id"] == rid for x in lst.json())

    one = await client.get(f"/api/v1/recipes/{rid}")
    assert one.status_code == 200, one.text
    assert one.json()["name"] == "Плов"


async def test_get_missing_recipe_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    assert (await client.get(f"/api/v1/recipes/{miss}")).status_code == 404


async def test_delete_recipe(auth_client):
    client, _, _ = auth_client
    pid = await _make_product(client)
    rid = (await client.post("/api/v1/recipes", json={
        "name": "Удаляемое", "total_weight_g": 100, "servings": 1,
        "ingredients": [{"product_id": pid, "product_name": "Рис варёный", "amount_g": 50}],
    })).json()["id"]
    assert (await client.delete(f"/api/v1/recipes/{rid}")).status_code == 204
    assert (await client.get(f"/api/v1/recipes/{rid}")).status_code == 404


async def test_delete_missing_recipe_404(auth_client):
    client, _, _ = auth_client
    miss = "00000000-0000-0000-0000-000000000000"
    assert (await client.delete(f"/api/v1/recipes/{miss}")).status_code == 404


async def test_create_recipe_requires_ingredients(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/recipes", json={
        "name": "Пустое", "total_weight_g": 100, "servings": 1, "ingredients": [],
    })
    assert r.status_code == 422  # min_length=1 on ingredients


async def test_recipes_requires_auth(client):
    assert (await client.get("/api/v1/recipes")).status_code in (401, 403)
