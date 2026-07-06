"""Security response headers (clickjacking / MIME-sniff / CSP)."""


async def test_security_headers_present(client):
    r = await client.get("/health")
    assert r.status_code == 200
    h = r.headers
    assert h.get("x-frame-options") == "DENY"
    assert h.get("x-content-type-options") == "nosniff"
    assert "content-security-policy" in h
    assert "frame-ancestors 'none'" in h["content-security-policy"]
