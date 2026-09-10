from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException
import jwt
import pytest

from app.dependencies import auth as auth_dep


def test_get_current_user_verifies_es256_via_jwks(monkeypatch):
    signing_key = SimpleNamespace(key="public-key")
    jwks_client = MagicMock()
    jwks_client.get_signing_key_from_jwt.return_value = signing_key
    monkeypatch.setattr(auth_dep, "get_jwks_client", lambda: jwks_client)

    def fake_decode(token, key, algorithms, audience):
        assert token == "fake.token"
        assert key == "public-key"
        assert algorithms == ["ES256"]
        assert audience == "authenticated"
        return {"sub": "user-1", "email": "a@b.com"}

    monkeypatch.setattr(auth_dep.jwt, "decode", fake_decode)
    credentials = SimpleNamespace(credentials="fake.token")
    result = auth_dep.get_current_user(credentials)
    assert result == {
        "user_id": "user-1",
        "email": "a@b.com",
        "access_token": "fake.token",
    }
    jwks_client.get_signing_key_from_jwt.assert_called_once_with("fake.token")


def test_get_current_user_rejects_invalid_jwt(monkeypatch):
    jwks_client = MagicMock()
    jwks_client.get_signing_key_from_jwt.side_effect = jwt.InvalidTokenError("bad token")
    monkeypatch.setattr(auth_dep, "get_jwks_client", lambda: jwks_client)
    credentials = SimpleNamespace(credentials="bad.token")
    with pytest.raises(HTTPException) as exc:
        auth_dep.get_current_user(credentials)
    assert exc.value.status_code == 401
