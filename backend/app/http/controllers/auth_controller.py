"""Signup, login, logout, and session lookup."""

from __future__ import annotations

from fastapi import HTTPException, Request, Response
from tortoise.exceptions import IntegrityError

from app.http.controllers.base_controller import BaseController
from app.http.requests.auth_requests import LoginRequest, SignupRequest, UserResource
from app.services.auth.user_service import UserService
from app.support.security import create_session_token, decode_session_token, verify_password
from config.settings import settings


class AuthController(BaseController[UserService]):
    service_class = UserService
    conflict_message = "An account with this email already exists"

    def _set_session_cookie(self, response: Response, user_id: int, email: str) -> None:
        response.set_cookie(
            key=settings.session_cookie_name,
            value=create_session_token(user_id, email),
            httponly=True,
            secure=settings.session_cookie_secure,
            samesite="lax",
            max_age=settings.session_ttl_days * 24 * 60 * 60,
            path="/",
        )

    @staticmethod
    def current_user_id(request: Request) -> int | None:
        token = request.cookies.get(settings.session_cookie_name)
        if not token:
            return None
        claims = decode_session_token(token)
        return claims["sub"] if claims else None

    async def signup(self, response: Response, payload: SignupRequest) -> UserResource:
        try:
            user = await self.service.create_user(
                email=payload.email,
                password=payload.password,
                display_name=payload.display_name,
            )
        except (ValueError, IntegrityError) as exc:
            raise self.error(exc) from exc
        self._set_session_cookie(response, user.id, user.email)
        return UserResource(
            id=user.id, email=user.email,
            display_name=user.display_name, created_at=user.created_at,
        )

    async def login(self, response: Response, payload: LoginRequest) -> UserResource:
        # One opaque error for both "no such account" and "wrong password":
        # distinguishing them would let an attacker enumerate registered
        # email addresses.
        invalid = HTTPException(status_code=401, detail="Invalid email or password")
        try:
            row = await self.service.get_user_row_with_hash(payload.email)
        except KeyError as exc:
            raise invalid from exc
        if not row["is_active"] or not verify_password(payload.password, row["password_hash"]):
            raise invalid
        self._set_session_cookie(response, row["id"], row["email"])
        return UserResource(
            id=row["id"], email=row["email"],
            display_name=row["display_name"], created_at=row["created_at"],
        )

    async def logout(self, response: Response) -> dict:
        response.delete_cookie(key=settings.session_cookie_name, path="/")
        return {"ok": True}

    async def me(self, request: Request) -> UserResource:
        unauthenticated = HTTPException(status_code=401, detail="Not authenticated")
        user_id = self.current_user_id(request)
        if user_id is None:
            raise unauthenticated
        try:
            return UserResource(**await self.service.get_user_public(user_id))
        except KeyError as exc:
            # A valid token for a deleted/deactivated account is still just
            # "not authenticated" -- 404 would confirm the account existed.
            raise unauthenticated from exc
