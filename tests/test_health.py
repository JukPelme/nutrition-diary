"""Body composition: BMI, WHtR, FFMI."""


async def test_body_composition_bmi_only(auth_client):
    client, _, _ = auth_client
    await client.patch("/api/v1/auth/me", json={"height": 180, "current_weight": 80})
    r = await client.get("/api/v1/health/body-composition")
    assert r.status_code == 200, r.text
    bc = r.json()
    assert bc["available"] is True
    assert bc["primary_metric"] == "bmi"
    assert round(bc["bmi"]["value"]) == 25  # 80 / 1.8^2 = 24.7 -> 24.7
    assert bc["whtr"] is None


async def test_body_composition_full(auth_client):
    client, _, _ = auth_client
    await client.patch("/api/v1/auth/me", json={
        "height": 180, "current_weight": 80, "waist_cm": 85,
        "body_fat_pct": 18, "sex": "male", "activity_level": "high",
    })
    r = await client.get("/api/v1/health/body-composition")
    assert r.status_code == 200, r.text
    bc = r.json()
    assert bc["primary_metric"] == "whtr"          # waist present -> WHtR preferred
    assert bc["whtr"] is not None
    assert abs(bc["whtr"]["value"] - (85 / 180)) < 0.01
    assert bc["ffmi"] is not None                  # body fat present -> FFMI
    assert bc["body_fat"]["pct"] == 18


async def test_body_composition_unavailable_without_body(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/health/body-composition")
    assert r.status_code == 200, r.text
    assert r.json()["available"] is False
