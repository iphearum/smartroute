"""Persisted map-copilot chat sessions."""

from __future__ import annotations

import uuid

from tortoise import fields, models


class AssistantSession(models.Model):
    id = fields.CharField(max_length=36, pk=True, default=lambda: str(uuid.uuid4()))
    owner_key = fields.CharField(max_length=128, index=True)
    title = fields.CharField(max_length=160, default="New chat")
    messages = fields.JSONField(default=list, source_field="messages_json")
    expires_at = fields.DatetimeField()
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "assistant_sessions"
        indexes = (("owner_key", "updated_at"), ("owner_key", "expires_at"))
