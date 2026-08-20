"""Streaming map copilot transport with server-owned map tools."""
from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from openai import OpenAI
from config.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["assistant"])
client = OpenAI(api_key=settings.ai_api_key or "local-dev-key", base_url=settings.ai_base_url, timeout=settings.ai_timeout) if settings.ai_base_url else None

TOOLS = [
    {"type": "function", "function": {"name": "search_places", "description": "Find places in the SmartRoute map.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "plot_route", "description": "Plot a route when the user has provided known places and coordinates.", "parameters": {"type": "object", "properties": {"stops": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "latitude": {"type": "number"}, "longitude": {"type": "number"}}, "required": ["name", "latitude", "longitude"], "additionalProperties": False}}, "mode": {"type": "string", "enum": ["car", "motorbike", "combined", "bike", "walk"]}}, "required": ["stops"], "additionalProperties": False}}},
]

SYSTEM = """You are SmartRoute's map copilot. Be concise and helpful. Use search_places when the user asks to find a place. Use plot_route only when coordinates are known; never invent coordinates. After a tool result, explain the result in one short sentence. Do not expose tool names or JSON to the user."""
STREAM_CHUNK_CHARS = 4
STREAM_CHUNK_DELAY = 0.018

async def _search(websocket: WebSocket, query: str) -> list[dict]:
    store = getattr(websocket.app.state, "map_store", None)
    region = getattr(websocket.app.state, "map_region", None)
    if not store or not region:
        return []
    return [{**place, "node_id": None, "source": "custom_place"} for place in await store.search_places(*region, query, 8)]

def _stream_in_thread(messages: list[dict[str, Any]], output: queue.Queue) -> None:
    try:
        if client is None:
            output.put(("error", "AI assistant is not configured yet."))
            return
        stream = client.chat.completions.create(model=settings.ai_model, messages=messages, temperature=0.2, tools=TOOLS, tool_choice="auto", stream=True)
        for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue
            delta = choice.delta
            output.put(("delta", delta.content or "", [call.model_dump() for call in (delta.tool_calls or [])], choice.finish_reason))
    except Exception as exc:
        output.put(("error", str(exc)))
    finally:
        output.put(("end", None))

async def _stream_turn(websocket: WebSocket, messages: list[dict[str, Any]], message_id: str) -> tuple[str, dict | None]:
    output: queue.Queue = queue.Queue()
    threading.Thread(target=_stream_in_thread, args=(messages, output), daemon=True).start()
    text = ""
    calls: dict[int, dict[str, str]] = {}
    while True:
        item = await asyncio.to_thread(output.get)
        kind = item[0]
        if kind == "end":
            break
        if kind == "error":
            raise RuntimeError(item[1])
        _, delta, tool_deltas, _finish = item
        if delta:
            for offset in range(0, len(delta), STREAM_CHUNK_CHARS):
                piece = delta[offset : offset + STREAM_CHUNK_CHARS]
                text += piece
                await websocket.send_json({"type": "assistant.delta", "id": message_id, "data": {"text": piece}})
                await asyncio.sleep(STREAM_CHUNK_DELAY)
        for tool_delta in tool_deltas:
            index = int(tool_delta.get("index", 0))
            call = calls.setdefault(index, {"id": "", "name": "", "arguments": ""})
            call["id"] += tool_delta.get("id") or ""
            function = tool_delta.get("function") or {}
            call["name"] += function.get("name") or ""
            call["arguments"] += function.get("arguments") or ""
    action = None
    if calls:
        tool_call_messages = [{"id": call["id"], "type": "function", "function": {"name": call["name"], "arguments": call["arguments"]}} for call in calls.values()]
        messages.append({"role": "assistant", "content": text or None, "tool_calls": tool_call_messages})
        for call in calls.values():
            try:
                args = json.loads(call["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}
            if call["name"] == "search_places":
                query = str(args.get("query", ""))[:200]
                results = await _search(websocket, query)
                action = {"type": "search", "query": query, "results": results}
                result = {"results": results}
            elif call["name"] == "plot_route":
                stops = args.get("stops", [])
                action = {"type": "route", "stops": stops, "mode": args.get("mode")}
                result = {"accepted": True, "stops": stops}
            else:
                result = {"error": "Unsupported map tool"}
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result)})
        await websocket.send_json({"type": "assistant.status", "id": message_id, "data": {"text": "Updating the map…"}})
        follow_up, follow_action = await _stream_turn_no_tools(websocket, messages, message_id)
        text = follow_up or text
        action = action or follow_action
    return text, action

async def _stream_turn_no_tools(websocket: WebSocket, messages: list[dict[str, Any]], message_id: str) -> tuple[str, dict | None]:
    output: queue.Queue = queue.Queue()
    def produce() -> None:
        try:
            stream = client.chat.completions.create(model=settings.ai_model, messages=messages, temperature=0.2, stream=True) if client else None
            if stream:
                for chunk in stream:
                    choice = chunk.choices[0] if chunk.choices else None
                    if choice and choice.delta.content:
                        output.put(("delta", choice.delta.content))
        except Exception as exc:
            output.put(("error", str(exc)))
        finally:
            output.put(("end", None))
    threading.Thread(target=produce, daemon=True).start()
    text = ""
    while True:
        kind, value = await asyncio.to_thread(output.get)
        if kind == "end": break
        if kind == "error": raise RuntimeError(value)
        for offset in range(0, len(value), STREAM_CHUNK_CHARS):
            piece = value[offset : offset + STREAM_CHUNK_CHARS]
            text += piece
            await websocket.send_json({"type": "assistant.delta", "id": message_id, "data": {"text": piece}})
            await asyncio.sleep(STREAM_CHUNK_DELAY)
    return text, None

@router.websocket("/ws/assistant")
async def assistant_socket(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "connection.ready", "occurredAt": datetime.now(timezone.utc).isoformat()})
    history: list[dict[str, Any]] = []
    try:
        while True:
            frame = await websocket.receive_json()
            if frame.get("type") == "chat.history":
                incoming = frame.get("messages", [])
                if isinstance(incoming, list):
                    history = [
                        {"role": item["role"], "content": str(item["text"])[:4000]}
                        for item in incoming[-16:]
                        if isinstance(item, dict)
                        and item.get("role") in {"user", "assistant"}
                        and isinstance(item.get("text"), str)
                        and item["text"].strip()
                    ]
                await websocket.send_json({"type": "history.ready", "count": len(history)})
                continue
            if frame.get("type") != "chat.message": continue
            text = str(frame.get("text", "")).strip()[:4000]
            if not text: continue
            message_id = str(frame.get("clientId", "assistant-message"))
            await websocket.send_json({"type": "assistant.start", "id": message_id})
            messages = [{"role": "system", "content": SYSTEM}, *history[-8:], {"role": "user", "content": text}]
            try:
                reply, action = await _stream_turn(websocket, messages, message_id)
            except Exception as exc:
                logger.warning("AI stream failed: %s", exc)
                reply, action = "The map copilot is temporarily unavailable. You can still use search and routing directly.", None
            history.extend([{"role": "user", "content": text}, {"role": "assistant", "content": reply}])
            await websocket.send_json({"type": "assistant.done", "id": message_id, "data": {"message": reply, "action": action}})
    except WebSocketDisconnect:
        return
