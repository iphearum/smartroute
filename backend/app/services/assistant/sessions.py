"""Storage boundary for short-lived assistant chat sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.assistant import AssistantSession

SESSION_TTL = timedelta(days=30)
MAX_MESSAGES = 48
MAX_MESSAGE_TEXT = 4000


def normalize_messages(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value[-MAX_MESSAGES:]:
        if not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}:
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            result.append({"role": item["role"], "text": text[:MAX_MESSAGE_TEXT]})
    return result


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def purge_expired() -> None:
    await AssistantSession.filter(expires_at__lt=_now()).delete()


async def list_sessions(owner_key: str) -> list[AssistantSession]:
    await purge_expired()
    return await AssistantSession.filter(owner_key=owner_key).order_by("-updated_at").limit(50)


async def create_session(owner_key: str, title: str, messages: Any) -> AssistantSession:
    now = _now()
    return await AssistantSession.create(
        owner_key=owner_key[:128],
        title=(title.strip() or "New chat")[:160],
        messages=normalize_messages(messages),
        expires_at=now + SESSION_TTL,
    )


async def save_session(session: AssistantSession, title: str, messages: Any) -> AssistantSession:
    session.title = (title.strip() or "New chat")[:160]
    session.messages = normalize_messages(messages)
    session.expires_at = _now() + SESSION_TTL
    await session.save()
    return session
