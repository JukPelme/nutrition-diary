"""Auth: register, login, /me, and the refresh-token flow (the 30-min logout bug)."""
import pytest


async def test_register_returns_tokens(client):
    r = await client.post("/api/v1/auth/register", json={
        "email": "reg1@example.com", "password": "Test12345!", "full_name": "Reg One",
    })
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("access_token")
    assert data.get("refresh_token"), "register must return a refresh_token"


async def test_register_duplicate_email_is_clean(client):
    body = {"email": "dup@example.com", "password": "Test12345!"}
    first = await client.post("/api/v1/auth/register", json=body)
    assert first.status_code in (200, 201), first.text
    second = await client.post("/api/v1/auth/register", json=body)
    assert second.status_code == 409
    # must not leak internal DB details
    assert "Traceback" not in second.text


async def test_login_and_me(client):
    email = "login@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "Test12345!"})
    r = await client.post("/api/v1/auth/login", json={"login": email, "password": "Test12345!"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["email"] == email
    assert "is_superuser" in body  # exposed for admin panel


async def test_wrong_password_rejected(client):
    email = "wrongpw@example.com"
    await client.post("/api/v1/auth/register", json={"email": email, "password": "Test12345!"})
    r = await client.post("/api/v1/auth/login", json={"login": email, "password": "nope"})
    assert r.status_code in (401, 400)


async def test_refresh_token_flow(client):
    """Regression: refresh must mint a new working access token
    (frontend now relies on this instead of logging the user out)."""
    email = "refresh@example.com"
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Test12345!"})
    refresh = reg.json()["refresh_token"]
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200, r.text
    new_access = r.json().get("access_token")
    assert new_access
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert me.status_code == 200, me.text


async def test_refresh_rejects_garbage(client):
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert r.status_code == 401


async def test_me_requires_auth(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code in (401, 403)
