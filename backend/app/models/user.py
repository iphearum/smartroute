"""Registered account holders."""

from __future__ import annotations

from tortoise import fields, models


class User(models.Model):
    """A registered account holder."""

    id = fields.BigIntField(pk=True)
    email = fields.CharField(max_length=255, unique=True)
    password_hash = fields.CharField(max_length=255)
    display_name = fields.CharField(max_length=120, null=True)
    is_active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "users"
