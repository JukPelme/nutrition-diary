"""Regression tests for the security quick-wins PR.

Covers: docs disabled in prod mode, constant-time unknown-user login,
account lockout, demo-account lockout exemption, and TOTP failures counting
toward lockout (previously a wrong 6-digit code could be brute-forced freely).
"""
import pyotp


async def test_docs_disabled_when_not_debug(client):
    # conftest sets DEBUG=false → interactive docs must be off in production mode
    assert (await client.get("/docs")).status_code == 404
    assert (await client.get("/redoc")).status_code == 404
    assert (await client.get("/openapi.json")).status_code == 404


async def test_unknown_user_login_is_401(client):
    r = await client.post("/api/v1/auth/login",
                          json={"login": "nobody@nowhere.tld", "password": "whatever123"})
    assert r.status_code == 401


async def test_normal_user_locked_after_5_fails(client):
    email = "lockme@example.com"
    reg = await client.post("/api/v1/auth/register",
                            json={"email": email, "password": "Right12345!", "full_name": "Lock"})
    assert reg.status_code in (200, 201), reg.text
    for _ in range(5):
        await client.post("/api/v1/auth/login", json={"login": email, "password": "Wrong9999!"})
    # even the correct password is now refused with 423 locked
    r = await client.post("/api/v1/auth/login", json={"login": email, "password": "Right12345!"})
    assert r.status_code == 423, r.text


async def test_demo_account_not_locked(client):
    # published demo creds must survive brute-force attempts (no lockout)
    email = "demo@example.com"
    reg = await client.post("/api/v1/auth/register",
                            json={"email": email, "password": "Demo12345!", "full_name": "Demo"})
    assert reg.status_code in (200, 201), reg.text
    for _ in range(6):
        await client.post("/api/v1/auth/login", json={"login": email, "password": "Wrong9999!"})
    r = await client.post("/api/v1/auth/login", json={"login": email, "password": "Demo12345!"})
    assert r.status_code == 200, r.text


async def test_wrong_totp_counts_toward_lockout(client):
    email = "totp@example.com"
    pw = "Totp12345!"
    reg = await client.post("/api/v1/auth/register",
                            json={"email": email, "password": pw, "full_name": "T"})
    assert reg.status_code in (200, 201), reg.text
    client.headers["Authorization"] = f"Bearer {reg.json()['access_token']}"

    setup = await client.post("/api/v1/auth/2fa/setup")
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    verify = await client.post("/api/v1/auth/2fa/verify", json={"code": pyotp.TOTP(secret).now()})
    assert verify.status_code == 200, verify.text

    wrong = "000000" if pyotp.TOTP(secret).now() != "000000" else "111111"
    for _ in range(5):
        r = await client.post("/api/v1/auth/login",
                              json={"login": email, "password": pw, "totp_code": wrong})
        assert r.status_code == 401, r.text
    # lockout now applies even with a correct password + correct TOTP
    r = await client.post("/api/v1/auth/login",
                          json={"login": email, "password": pw, "totp_code": pyotp.TOTP(secret).now()})
    assert r.status_code == 423, r.text
