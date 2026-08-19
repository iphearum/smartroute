"""Validation schemas for auth endpoints (Laravel's Form Requests)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResource(BaseModel):
    """Public shape of a user. Never carries `password_hash`."""

    id: int
    email: str
    display_name: str | None
    created_at: datetime
