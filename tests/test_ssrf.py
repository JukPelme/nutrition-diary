"""SSRF guard on POST /recipes/import-url — must refuse internal/non-public URLs.

Validation runs before the ANTHROPIC_API_KEY check, so these assert 400
(blocked) rather than 503 even when no key is configured in CI.
"""
import pytest


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8000/api/v1/admin/overview",  # loopback -> internal app
    "http://localhost/secret",                       # resolves to loopback
    "http://169.254.169.254/latest/meta-data/",      # cloud metadata (link-local)
    "http://10.0.0.5/internal",                      # private range
    "http://[::1]:8000/x",                            # IPv6 loopback
])
async def test_import_url_blocks_internal(auth_client, url):
    client, _, _ = auth_client
    r = await client.post("/api/v1/recipes/import-url", json={"url": url, "lang": "ru"})
    assert r.status_code == 400, f"{url} -> {r.status_code}: {r.text}"


async def test_import_url_rejects_non_http_scheme(auth_client):
    client, _, _ = auth_client
    r = await client.post("/api/v1/recipes/import-url", json={"url": "ftp://example.com/x", "lang": "ru"})
    assert r.status_code == 400, r.text


async def test_import_url_requires_auth(client):
    r = await client.post("/api/v1/recipes/import-url", json={"url": "http://127.0.0.1/x", "lang": "ru"})
    assert r.status_code in (401, 403)
