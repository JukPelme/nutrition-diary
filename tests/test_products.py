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


async def test_create_product_strips_html_in_name(auth_client):
    # stored-XSS guard: product names are shown to other users
    client, _, _ = auth_client
    r = await client.post("/api/v1/products", json={
        "name": "<img src=x onerror=alert(1)>Плов", "calories": 100,
    })
    assert r.status_code in (200, 201), r.text
    name = r.json()["name"]
    assert "<" not in name and ">" not in name, f"HTML not stripped: {name}"
    assert "Плов" in name
async def _make_verified(name: str, **kw):
    """Insert a product with is_verified=True (not settable via the API)."""
    from app.db.session import async_session
    from app.models.product import Product
    async with async_session() as s:
        p = Product(name=name, is_verified=True, calories=kw.get("calories", 100),
                    protein=kw.get("protein", 5), fat=kw.get("fat", 3),
                    carbohydrates=kw.get("carbohydrates", 10))
        s.add(p)
        await s.commit()


async def test_search_exact_match_beats_verified(auth_client):
    """Regression: an exact/prefix name match must rank above a merely
    is_verified product that only matches as a loose substring.
    (Bug: 'Творог Серышевский' buried under verified 'Обезжиренный творог'.)"""
    client, _, _ = auth_client
    # Verified generic that contains the word 'творог' as a substring.
    await _make_verified("Обезжиренный творог 0%")
    # User's own product — not verified, but the query is its prefix.
    await client.post("/api/v1/products", json={"name": "Творог Серышевский", "calories": 157})

    r = await client.get("/api/v1/products", params={"q": "творог"})
    assert r.status_code == 200, r.text
    names = [p["name"] for p in r.json()]
    assert "Творог Серышевский" in names and "Обезжиренный творог 0%" in names, names
    # Prefix match (relevance 2) must come before the verified substring (relevance 1).
    assert names.index("Творог Серышевский") < names.index("Обезжиренный творог 0%"), names


async def test_search_exact_name_ranks_first(auth_client):
    """An exact name match wins even over a verified prefix match."""
    client, _, _ = auth_client
    await _make_verified("Молоко ультрапастеризованное 3.2%")
    await client.post("/api/v1/products", json={"name": "Молоко", "calories": 60})

    r = await client.get("/api/v1/products", params={"q": "молоко"})
    assert r.status_code == 200, r.text
    names = [p["name"] for p in r.json()]
    assert names and names[0] == "Молоко", names
