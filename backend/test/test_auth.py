import asyncio

import pytest
from tortoise.exceptions import IntegrityError

from app.support.security import (
    create_session_token,
    decode_session_token,
    hash_password,
    verify_password,
)
from app.services.user_service import UserService
from app.services.map_service import MapService


def test_create_user_hashes_password_and_normalizes_email(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        users = UserService()
        user = await users.create_user(
            email="Test@Example.com ", password="longenough1", display_name=" Nop "
        )
        assert user.email == "test@example.com"
        assert user.password_hash != "longenough1"
        assert user.display_name == "Nop"
        await store.close()

    asyncio.run(scenario())


def test_create_user_rejects_short_password(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        users = UserService()
        with pytest.raises(ValueError):
            await users.create_user(email="short@example.com", password="short")
        await store.close()

    asyncio.run(scenario())


def test_create_user_duplicate_email_raises_integrity_error(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        users = UserService()
        await users.create_user(email="dupe@example.com", password="longenough1")
        with pytest.raises(IntegrityError):
            await users.create_user(email="dupe@example.com", password="anotherpass1")
        await store.close()

    asyncio.run(scenario())


def test_get_user_not_found_raises_key_error(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        users = UserService()
        with pytest.raises(KeyError):
            await users.get_user_row_with_hash("nobody@example.com")
        with pytest.raises(KeyError):
            await users.get_user_public(999)
        await store.close()

    asyncio.run(scenario())


def test_verify_password_roundtrip():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed)
    assert not verify_password("wrong password", hashed)


def test_session_token_roundtrip_and_expiry():
    token = create_session_token(42, "person@example.com")
    claims = decode_session_token(token)
    assert claims is not None
    assert claims["sub"] == 42
    assert claims["email"] == "person@example.com"

    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone

    from config.settings import settings

    past = datetime.now(timezone.utc) - timedelta(days=1)
    expired_token = pyjwt.encode(
        {"sub": "42", "email": "person@example.com", "iat": past - timedelta(days=1), "exp": past},
        settings.app_secret_key,
        algorithm="HS256",
    )
    assert decode_session_token(expired_token) is None
    assert decode_session_token("not-a-real-token") is None
