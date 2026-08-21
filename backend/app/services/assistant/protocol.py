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
    """Split a thinking summary from streamed answer text.

    Models that lack a provider-native reasoning channel are instructed to
    wrap a short planning summary in ``<think>`` tags. The tags are always
    stripped from the answer, whether or not thinking mode is on, so protocol
    markup never reaches the chat bubble.
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


INTERNAL_TOOL_LABELS = {
    "search_places": "place search",
    "search_web": "web search",
    "plot_route": "route planning",
    "add_map_point": "map pins",
    "focus_coordinate": "map focus",
    "reset_map_view": "map reset",
    "clear_route_points": "route clearing",
    "get_current_location": "location lookup",
}
TOOL_TOKEN_PATTERN = re.compile(
    r"\b(" + "|".join(INTERNAL_TOOL_LABELS) + r")\b(?:\s*\(\s*\))?",
    re.IGNORECASE,
)
INTERNAL_PHRASE_PATTERN = re.compile(
    r"system (?:prompt|message|instruction)"
    r"|developer (?:prompt|message|instruction)"
    r"|tool[ _](?:call|schema|definition|name)"
    r"|function[ _](?:call|schema|signature)"
    r"|json (?:schema|payload|argument|blob)"
    r"|tool_choice|</?think>|</?tool|chain[- ]of[- ]thought"
    r"|my (?:instructions|guidelines) (?:say|state)"
    # Plumbing talk about tools in general. Deliberately narrow: it must read
    # as tool *usage*, so a genuine query like "tool rental shop" survives.
    r"|\btools?\s+(?:use|usage|call|invocation|needed|required|available|access)\b"
    r"|\b(?:use|using|invoke|invoking|call|calling|need|needs|require|requires)"
    r"\s+(?:a|an|the|any|some|no)?\s*tools?\b"
    r"|\bno\s+tools?\b",
    re.IGNORECASE,
)
# A sentence closes on terminal punctuation that is followed by whitespace, or
# on a newline. A trailing "." with nothing after it stays buffered because the
# next streamed token may continue it (e.g. an abbreviation or a decimal).
SENTENCE_END_PATTERN = re.compile(r".*?(?:[.!?]+(?=\s)|\n)", re.DOTALL)


def _redact_reasoning_sentence(sentence: str) -> str:
    """Strip internal plumbing from one sentence of model reasoning.

    Reasoning is shown to end users, so it must not name tools, quote the
    system prompt, or expose the tool-call protocol. A sentence that merely
    mentions one capability is rewritten in plain language; one that
    enumerates several is dropped, since it is describing the toolbox rather
    than the request.
    """
    if not sentence.strip():
        return ""
    if len(TOOL_TOKEN_PATTERN.findall(sentence)) >= 2:
        return ""
    cleaned = TOOL_TOKEN_PATTERN.sub(
        lambda match: INTERNAL_TOOL_LABELS[match.group(1).lower()], sentence
    )
    if INTERNAL_PHRASE_PATTERN.search(cleaned):
        return ""
    return cleaned


REASONING_MODES = ("off", "auto", "high")
# Requests whose wording implies multi-step work. Kept deliberately small: a
# false positive only costs latency, while a false negative costs answer
# quality on exactly the requests that need care.
REASONING_KEYWORDS = (
    "debug",
    "analyz",
    "compare",
    "why",
    "plan",
    "step by step",
    "step-by-step",
    "architect",
    "optimi",
    "reason",
    "explain",
    "troubleshoot",
    "fastest",
    "cheapest",
    "best route",
    "trade-off",
    "tradeoff",
    "pros and cons",
)


def reasoning_mode(value: Any) -> str:
    """Normalize the client's requested reasoning mode, defaulting to auto."""
    candidate = str(value or "").strip().lower()
    return candidate if candidate in REASONING_MODES else "auto"


def _message_text(message: Any) -> str:
    """Read the text of a message whose content may be multimodal parts."""
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            str(part.get("text", ""))
            for part in content
            if isinstance(part, dict) and part.get("type") == "text"
        )
    return ""


def should_reason(messages: list[dict[str, Any]]) -> bool:
    """Decide whether the latest user turn is worth spending reasoning on."""
    latest = next(
        (message for message in reversed(messages) if message.get("role") == "user"),
        None,
    )
    text = _message_text(latest).lower()
    if not text:
        return False
    if any(keyword in text for keyword in REASONING_KEYWORDS):
        return True
    # Long or multi-part requests tend to need planning even without a keyword.
    return len(text) > 240 or text.count("?") > 1


def resolve_reasoning(mode: str, messages: list[dict[str, Any]]) -> bool:
    """Map a reasoning mode plus the current turn onto a thinking decision."""
    if mode == "off":
        return False
    if mode == "high":
        return True
    return should_reason(messages)


class ReasoningRedactor:
    """Buffer streamed reasoning into sentences so it can be sanitized.

    Redaction cannot run token by token: "search" and "_places" arrive as
    separate deltas, and a rule that only sees one of them cannot tell what it
    is looking at. Text is therefore held until a sentence completes, checked
    as a whole, then released.
    """

    def __init__(self) -> None:
        self.pending = ""

    def feed(self, text: str) -> list[str]:
        self.pending += text
        released: list[str] = []
        while True:
            match = SENTENCE_END_PATTERN.match(self.pending)
            if not match:
                break
            sentence = match.group(0)
            self.pending = self.pending[match.end():]
            cleaned = _redact_reasoning_sentence(sentence)
            if cleaned:
                released.append(cleaned)
        return released

    def finish(self) -> list[str]:
        remaining, self.pending = self.pending, ""
        cleaned = _redact_reasoning_sentence(remaining)
        return [cleaned] if cleaned else []


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
