"""Security primitives: password validation/hashing and session tokens.

Named `security` rather than `auth` so it does not read as a sibling of the
auth *controller* or auth *routes* -- this module holds no request handling,
only the primitives those layers call.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from config.settings import settings

_ALGORITHM = "HS256"


def validate_password(raw: str) -> None:
    if len(raw.strip()) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(raw) > 128:
        raise ValueError("Password must be at most 128 characters long")


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_session_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + timedelta(days=settings.session_ttl_days),
    }
    return jwt.encode(payload, settings.app_secret_key, algorithm=_ALGORITHM)


def decode_session_token(token: str) -> dict | None:
    try:
        claims = jwt.decode(token, settings.app_secret_key, algorithms=[_ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    try:
        claims["sub"] = int(claims["sub"])
    except (KeyError, TypeError, ValueError):
        return None
    return claims
