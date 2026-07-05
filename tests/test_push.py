"""Web Push: VAPID public key + private key format (regression for the 500)."""
import base64


async def test_push_public_key(client):
    r = await client.get("/api/v1/push/key")
    assert r.status_code == 200, r.text
    key = r.json()["public_key"]
    # VAPID P-256 public key: 65 raw bytes -> 87 base64url chars, starts with 'B'
    assert len(key) == 87
    assert key.startswith("B")


def test_pem_to_der_b64_is_parseable():
    """Regression: py_vapid 2.x needs base64url(DER); ensure our converter
    produces something load_der_private_key accepts."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    from app.api.v1.endpoints.push import _pem_to_der_b64

    priv = ec.generate_private_key(ec.SECP256R1())
    pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    b64 = _pem_to_der_b64(pem)
    padded = b64 + "=" * (-len(b64) % 4)
    der = base64.urlsafe_b64decode(padded)
    key = serialization.load_der_private_key(der, password=None)  # must not raise
    assert key is not None


async def test_push_test_requires_auth(client):
    r = await client.post("/api/v1/push/test")
    assert r.status_code in (401, 403)
