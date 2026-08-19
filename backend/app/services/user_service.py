"""User account service (was `services/user_store.py`).

Operates on the shared Tortoise registry initialized at startup -- it owns
no connection of its own.
"""

from __future__ import annotations

from app.models.user import User
from app.services.base_service import BaseService
from app.support.security import hash_password, validate_password


def normalize_email(email: str) -> str:
    return email.strip().lower()


class UserService(BaseService[User]):
    model = User

    async def create_user(self, *, email: str, password: str,
                          display_name: str | None = None) -> User:
        validate_password(password)
        return await self.create(
            email=normalize_email(email),
            password_hash=hash_password(password),
            display_name=display_name.strip() if display_name else None,
        )

    async def get_user_row_with_hash(self, email: str) -> dict:
        rows = await self.values(
            "id", "email", "password_hash", "display_name", "is_active", "created_at",
            email=normalize_email(email),
        )
        if not rows:
            raise KeyError("User not found")
        return rows[0]

    async def get_user_public(self, user_id: int) -> dict:
        rows = await self.values(
            "id", "email", "display_name", "created_at", id=user_id, is_active=True,
        )
        if not rows:
            raise KeyError("User not found")
        return rows[0]
