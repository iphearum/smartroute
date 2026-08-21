"""Protocol helpers for the map assistant message boundary.

This module owns model-output normalization and bounded user-input shaping.
It deliberately has no FastAPI or WebSocket dependencies so both HTTP tests
and the streaming transport can exercise the same rules.
"""
from __future__ import annotations

import json
import re
from typing import Any

PSEUDO_TOOL_PATTERN = re.compile(
    r"<(?:tool_call|function|tool[a-z_]*)\b.*?</(?:tool_call|function|tool[a-z_]*)\s*>",
    re.IGNORECASE | re.DOTALL,
)
PSEUDO_TOOL_NAMES = {
    "places": "search_places",
    "search": "search_places",
    "route": "plot_route",
    "point": "add_map_point",
    "focus": "focus_coordinate",
    "reset": "reset_map_view",
    "clear": "clear_route_points",
}


class ThinkingParser:
    """Split an explicit, short thinking summary from streamed answer text.

    The model is instructed to use this channel for a concise summary only;
    provider-native private reasoning fields are never forwarded by the stream
    adapter.
    """

    OPEN = "<think>"
    CLOSE = "</think>"

    def __init__(self) -> None:
        self.in_thinking = False
        self.pending = ""

    def feed(self, text: str) -> list[tuple[str, str]]:
        self.pending += text
        events: list[tuple[str, str]] = []
        while self.pending:
            if not self.in_thinking:
                start = self.pending.lower().find(self.OPEN)
                if start < 0:
                    safe_length = max(0, len(self.pending) - len(self.OPEN))
                    if safe_length:
                        events.append(("answer", self.pending[:safe_length]))
                        self.pending = self.pending[safe_length:]
                    break
                before = self.pending[:start]
                if before:
                    events.append(("answer", before))
                self.pending = self.pending[start + len(self.OPEN):]
                self.in_thinking = True
            else:
                end = self.pending.lower().find(self.CLOSE)
                if end < 0:
                    safe_length = max(0, len(self.pending) - len(self.CLOSE))
                    if safe_length:
                        events.append(("reasoning", self.pending[:safe_length]))
                        self.pending = self.pending[safe_length:]
                    break
                thought = self.pending[:end]
                if thought:
                    events.append(("reasoning", thought))
                self.pending = self.pending[end + len(self.CLOSE):]
                self.in_thinking = False
        return events

    def finish(self) -> list[tuple[str, str]]:
        if not self.pending:
            return []
        event_type = "reasoning" if self.in_thinking else "answer"
        remaining = self.pending
        self.pending = ""
        return [(event_type, remaining)]


def has_pseudo_tool_start(text: str) -> bool:
    return bool(re.search(r"<(?:tool_call|function|tool[a-z_]*)\b", text, re.IGNORECASE))


def has_pseudo_tool_end(text: str) -> bool:
    return bool(
        re.search(r"</(?:tool_call|function|tool[a-z_]*)\s*>", text, re.IGNORECASE)
    )


def _parameter_arguments(text: str) -> dict[str, Any]:
    arguments: dict[str, Any] = {}
    for parameter in re.finditer(
        r"<parameter[^>]*>(.*?)</parameter>", text, re.IGNORECASE | re.DOTALL
    ):
        attributes = parameter.group(0).split(">", 1)[0]
        key_match = re.search(
            r"(?:name|key|parameter)\s*=\s*[\"']?([\w-]+)",
            attributes,
            re.IGNORECASE,
        )
        if not key_match:
            continue
        value = parameter.group(1).strip()
        try:
            arguments[key_match.group(1)] = json.loads(value)
        except json.JSONDecodeError:
            arguments[key_match.group(1)] = value.strip("\"'")
    return arguments


def _pseudo_tool_call(text: str, message_id: str) -> dict[str, str] | None:
    """Parse shorthand model markup into the typed tool-call envelope."""
    opening = re.search(r"<tool([a-z_]*)\b[^>]*>", text, re.IGNORECASE)
    if not opening:
        return None
    name = PSEUDO_TOOL_NAMES.get(opening.group(1).lower())
    if not name:
        return None

    arguments = _parameter_arguments(text)
    if not arguments and name == "search_places":
        query = re.search(r"query\s*[:=]\s*[\"']?([^<\"'\n]+)", text, re.IGNORECASE)
        if query:
            arguments["query"] = query.group(1).strip()
    if not arguments:
        return None
    return {
        "id": f"pseudo-{message_id}",
        "name": name,
        "arguments": json.dumps(arguments),
    }


def _visible_stream_text(text: str) -> str:
    """Remove pseudo-tool protocol from text that is shown to users."""
    cleaned = PSEUDO_TOOL_PATTERN.sub("", text)
    cleaned = re.sub(
        r"</?(?:tool_call|function|tool[a-z_]*|parameter)(?:\s+[^>]*)?>",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def _user_content(text: str, attachments: Any) -> str | list[dict[str, Any]]:
    """Build a bounded OpenAI-compatible text/vision user message."""
    if not isinstance(attachments, list):
        return text
    parts: list[dict[str, Any]] = [
        {"type": "text", "text": text or "Please inspect the attached files."}
    ]
    text_files: list[str] = []
    for item in attachments[:5]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "attachment"))[:160]
        mime = str(item.get("type", ""))[:100].lower()
        data_url = item.get("dataUrl")
        if (
            mime.startswith("image/")
            and isinstance(data_url, str)
            and data_url.startswith("data:image/")
            and len(data_url) <= 7_000_000
        ):
            parts.append({"type": "image_url", "image_url": {"url": data_url}})
        elif isinstance(item.get("text"), str):
            text_files.append(f"--- {name} ---\n{item['text'][:64_000]}")
        else:
            text_files.append(
                f"--- {name} ({mime or 'unknown type'}) ---\n"
                "[File attached in the chat; content is not parsed]"
            )
    if text_files:
        parts[0]["text"] += "\n\n" + "\n\n".join(text_files)
    return parts if len(parts) > 1 else parts[0]["text"]
