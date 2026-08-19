"""Auth endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.http.controllers.auth_controller import AuthController
from app.http.requests.auth_requests import LoginRequest, SignupRequest, UserResource

auth = APIRouter(prefix="/auth", tags=["auth"])
auth_controller = AuthController()


@auth.post("/signup", status_code=201, response_model=UserResource)
async def signup(response: Response, payload: SignupRequest):
    return await auth_controller.signup(response, payload)


@auth.post("/login", response_model=UserResource)
async def login(response: Response, payload: LoginRequest):
    return await auth_controller.login(response, payload)


@auth.post("/logout")
async def logout(response: Response):
    return await auth_controller.logout(response)


@auth.get("/me", response_model=UserResource)
async def me(request: Request):
    return await auth_controller.me(request)
