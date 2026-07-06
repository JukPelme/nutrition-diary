"""Regression tests for confirmed security fixes.

- Data export must not leak password hash / 2FA secret.
- Bot endpoints must reject the insecure default token outright (was a live
  auth bypass letting anyone read/write any user by email).
"""
import io
import json
import zipfile


async def test_export_excludes_secrets(auth_client):
    client, _, _ = auth_client
    r = await client.get("/api/v1/account/export")
    assert r.status_code == 200, r.text
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    user_json = zf.read("user.json").decode("utf-8")
    data = json.loads(user_json)
    # user.json is a list of one row
    row = data[0] if isinstance(data, list) else data
    assert "hashed_password" not in row, "password hash leaked in export!"
    assert "totp_secret" not in row, "2FA secret leaked in export!"
    # sanity: harmless fields still present
    assert "email" in row


async def test_bot_summary_rejects_default_token(client):
    # test env leaves BOT_TOKEN at the insecure default -> must be refused
    r = await client.get(
        "/api/v1/bot/summary",
        params={"email": "anyone@example.com"},
        headers={"X-Bot-Token": "change-me-bot-token"},
    )
    assert r.status_code == 503, r.text


async def test_bot_add_food_rejects_default_token(client):
    r = await client.post(
        "/api/v1/bot/add-food",
        headers={"X-Bot-Token": "change-me-bot-token"},
        json={"user_email": "anyone@example.com", "product_name": "x"},
    )
    assert r.status_code == 503, r.text

