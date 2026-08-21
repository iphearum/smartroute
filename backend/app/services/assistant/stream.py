"""Streaming model transport and browser tool-call handshake."""
from __future__ import annotations

import asyncio
import json
import queue
import threading
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from openai import OpenAI

from app.services.assistant.tools import TOOLS
from app.services.assistant.protocol import (
    ThinkingParser,
    _pseudo_tool_call,
    _visible_stream_text,
    has_pseudo_tool_end,
    has_pseudo_tool_start,
)
from config.settings import settings

SYSTEM = """You are PsarAI's map copilot. Be concise and helpful. Use search_places for places on the Smart map. Use search_web for current facts, news, policies, statistics, or information the user asks you to verify on the internet. Use plot_route only when coordinates are known; never invent coordinates. After a tool result, explain the result in one short sentence. Do not expose tool names or JSON to the user."""
LANGUAGE_INSTRUCTIONS = {
    "en": "Reply in clear, concise English.",
    "km": "Reply in natural, concise Khmer (ភាសាខ្មែរ). Keep place names, coordinates, and tool arguments accurate. Use English only when a proper name or technical value has no useful Khmer translation.",
}
THINKING_INSTRUCTION = (
    "Use extra internal reasoning for complex, multi-step requests and tool decisions. "
    "Before the answer, emit only a brief 1-3 sentence planning summary inside "
    "<think> and </think> tags. Never reveal hidden reasoning: do not include "
    "private chain-of-thought, hidden deliberation, or token-by-token reasoning "
    "in that summary. Return a concise answer."
)


def system_prompt(language: str = "en", thinking: bool = False) -> str:
    """Build the model contract without allowing an arbitrary prompt override."""
    selected = language if language in LANGUAGE_INSTRUCTIONS else "en"
    instruction = THINKING_INSTRUCTION if thinking else ""
    return f"{SYSTEM} {LANGUAGE_INSTRUCTIONS[selected]} {instruction}".strip()
STREAM_CHUNK_CHARS = 4
STREAM_CHUNK_DELAY = 0.018
MAX_REASONING_SUMMARY_CHARS = 1600
TOOL_ACTIVITY_LABELS = {
    "search_places": "Searching places",
    "search_web": "Searching the web",
    "plot_route": "Planning route",
    "add_map_point": "Adding a map point",
    "focus_coordinate": "Focusing the map",
    "reset_map_view": "Resetting the map view",
    "clear_route_points": "Clearing route points",
    "get_current_location": "Requesting current location",
}
client = (
    OpenAI(
        api_key=settings.ai_api_key or "local-dev-key",
        base_url=settings.ai_base_url,
        timeout=settings.ai_timeout,
    )
    if settings.ai_base_url
    else None
)


def _stream_in_thread(messages: list[dict[str, Any]], output: queue.Queue) -> None:
    try:
        if client is None:
            output.put(("error", "AI assistant is not configured yet."))
            return
        stream = client.chat.completions.create(
            model=settings.ai_model,
            messages=messages,
            temperature=0.2,
            tools=TOOLS,
            tool_choice="auto",
            stream=True,
        )
        for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage:
                output.put(("usage", usage.model_dump(), [], None))
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            delta = choice.delta
            output.put(
                (
                    "delta",
                    delta.content or "",
                    [call.model_dump() for call in (delta.tool_calls or [])],
                    choice.finish_reason,
                )
            )
    except Exception as exc:
        output.put(("error", str(exc)))
    finally:
        output.put(("end", None))


async def _receive_tool_result(websocket: WebSocket, call_id: str) -> dict[str, Any]:
    """Wait for the browser to execute one tool through the HTTP bridge."""
    while True:
        frame = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        if frame.get("type") != "assistant.tool_result" or frame.get("id") != call_id:
            continue
        data = frame.get("data")
        return data if isinstance(data, dict) else {"error": "Invalid tool result"}


async def stream_turn(
    websocket: WebSocket,
    messages: list[dict[str, Any]],
    message_id: str,
    thinking: bool = False,
) -> tuple[str, dict | None]:
    """Stream one model turn and recursively handle follow-up tool rounds."""
    output: queue.Queue = queue.Queue()
    threading.Thread(target=_stream_in_thread, args=(messages, output), daemon=True).start()
    text = ""
    visible_text = ""
    pending_text = ""
    calls: dict[int, dict[str, str]] = {}
    thinking_parser = ThinkingParser()
    reasoning_chars = 0

    async def emit_reasoning(piece: str) -> None:
        nonlocal reasoning_chars
        if not thinking or not piece.strip() or reasoning_chars >= MAX_REASONING_SUMMARY_CHARS:
            return
        remaining = MAX_REASONING_SUMMARY_CHARS - reasoning_chars
        summary_piece = piece[:remaining]
        reasoning_chars += len(summary_piece)
        await websocket.send_json(
            {
                "type": "assistant.reasoning_delta",
                "id": message_id,
                "data": {"text": summary_piece},
            }
        )

    async def emit_answer(piece: str) -> None:
        nonlocal text, pending_text, visible_text
        if not piece:
            return
        text += piece
        pending_text += piece
        # Hold pseudo-tool markup until its closing tag is complete. This
        # prevents protocol fragments from reaching the chat bubble.
        if not has_pseudo_tool_start(pending_text):
            visible_text += pending_text
            pending_text = ""
        elif has_pseudo_tool_end(pending_text):
            visible_text += _visible_stream_text(pending_text)
            pending_text = ""
        for offset in range(0, len(visible_text), STREAM_CHUNK_CHARS):
            piece = visible_text[offset : offset + STREAM_CHUNK_CHARS]
            await websocket.send_json(
                {"type": "assistant.delta", "id": message_id, "data": {"text": piece}}
            )
            await asyncio.sleep(STREAM_CHUNK_DELAY)
        visible_text = ""

    while True:
        item = await asyncio.to_thread(output.get)
        kind = item[0]
        if kind == "end":
            break
        if kind == "error":
            raise RuntimeError(item[1])
        if kind == "usage":
            await websocket.send_json({"type": "assistant.usage", "data": item[1]})
            continue
        _, delta, tool_deltas, _finish = item
        for event_type, piece in thinking_parser.feed(delta or ""):
            if event_type == "reasoning":
                await emit_reasoning(piece)
            else:
                await emit_answer(piece)
        for tool_delta in tool_deltas:
            index = int(tool_delta.get("index", 0))
            call = calls.setdefault(index, {"id": "", "name": "", "arguments": ""})
            call["id"] += tool_delta.get("id") or ""
            function = tool_delta.get("function") or {}
            call["name"] += function.get("name") or ""
            call["arguments"] += function.get("arguments") or ""

    for event_type, piece in thinking_parser.finish():
        if event_type == "reasoning":
            await emit_reasoning(piece)
        else:
            await emit_answer(piece)

    action = None
    pseudo_call = _pseudo_tool_call(text, message_id) if not calls else None
    if pseudo_call:
        calls[0] = pseudo_call
        text = ""
    if not calls:
        # A malformed or unfinished pseudo-tool must not be exposed if the
        # model stopped immediately after emitting its opening tag.
        return _visible_stream_text(text), action

    tool_call_messages = [
        {
            "id": call["id"],
            "type": "function",
            "function": {"name": call["name"], "arguments": call["arguments"]},
        }
        for call in calls.values()
    ]
    messages.append({"role": "assistant", "content": text or None, "tool_calls": tool_call_messages})
    for call in calls.values():
        try:
            args = json.loads(call["arguments"] or "{}")
        except json.JSONDecodeError:
            args = {}
        label = TOOL_ACTIVITY_LABELS.get(call["name"], "Using map tool")
        detail = None
        if call["name"] in {"search_places", "search_web"} and isinstance(args.get("query"), str):
            detail = f'"{args["query"][:200]}"'
        await websocket.send_json(
            {
                "type": "assistant.activity",
                "id": message_id,
                "data": {
                    "kind": "tool",
                    "label": label,
                    "detail": detail,
                },
            }
        )
        await websocket.send_json(
            {
                "type": "assistant.tool_call",
                "id": message_id,
                "data": {"toolCallId": call["id"], "name": call["name"], "arguments": args},
            }
        )
        result = await _receive_tool_result(websocket, call["id"])
        if isinstance(result.get("action"), dict):
            action = result["action"]
        messages.append(
            {
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(jsonable_encoder(result), default=str),
            }
        )
    await websocket.send_json(
        {
            "type": "assistant.activity",
            "id": message_id,
            "data": {
                "kind": "tool",
                "label": "Updating the map…",
            },
        }
    )
    follow_up, follow_action = await stream_turn(
        websocket, messages, message_id, thinking=thinking
    )
    return follow_up or text, action or follow_action
